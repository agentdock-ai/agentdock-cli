import {
  AgentEventType,
  type AgentEvent,
  type ContentPart,
  type JsonObject,
  type Message,
  type ToolApprovalDecision,
  type ToolApprovalRequest,
} from "@agentdock-ai/contracts";
import { createAgent, humanInTheLoopMiddleware } from "langchain";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { serveAgent } from "@agentdock-ai/agentdock";
import { agentEventStateSchema } from "@agentdock-ai/agentdock";
import { SystemPromptLoader } from "../infrastructure/prompts/system-prompt-loader.js";
import { WorkspaceToolFactory } from "../infrastructure/workspace/workspace-tool-factory.js";
import type { AgentRunControlUpdate } from "./contracts/app-types.js";
import type { AppLogger } from "../infrastructure/logging/logger.js";
import {
  ProviderSettingsService,
  type ProviderSettings,
} from "../infrastructure/providers/provider-settings.js";
import type { CliSession } from "../domain/sessions/session-types.js";

const MAX_AGENT_STEPS = 30;

export interface CliAgentRunResult {
  runId: string;
  status: "waiting_for_approval" | "completed" | "failed" | "cancelled";
  content: ContentPart[];
  messages: Message[];
  approvalRequests: ToolApprovalRequest[];
  stepsCompleted: number;
  error?: string;
}

export interface PromptOptions {
  providerSettings: ProviderSettings;
  mode: CliSession["mode"];
  logger: AppLogger;
  onEvent?: (event: AgentEvent) => void;
  onRunControl?: AgentRunControlUpdate;
}

export interface ApprovalInput {
  runId: string;
  approvals: ToolApprovalDecision[];
}

export class AgentRunner {
  private lifecycle: "open" | "closing" | "closed" = "open";
  private closing: Promise<void> | undefined;
  private readonly activeRuns = new Set<AbortController>();

  constructor(
    private readonly checkpointer: BaseCheckpointSaver,
    private readonly promptLoader = new SystemPromptLoader(),
    private readonly toolFactory = new WorkspaceToolFactory(),
    private readonly providerSettings = new ProviderSettingsService(),
  ) {}

  async initialize(): Promise<void> {
    this.assertOpen();
  }

  close(): Promise<void> {
    if (this.lifecycle === "closed") return Promise.resolve();
    if (this.closing) return this.closing;
    this.lifecycle = "closing";
    for (const controller of this.activeRuns) {
      controller.abort(new Error("AgentRunner is closing."));
    }
    this.closing = Promise.resolve().then(() => {
      this.lifecycle = "closed";
    });
    return this.closing;
  }

  executePrompt(
    session: CliSession,
    prompt: string,
    options: PromptOptions,
  ): Promise<{ result: CliAgentRunResult }> {
    return this.executeStream(session, prompt, options);
  }

  resumeApproval(
    session: CliSession,
    approval: ApprovalInput,
    options: PromptOptions,
  ): Promise<{ result: CliAgentRunResult }> {
    return this.executeStream(session, "", options, approval);
  }

  private async executeStream(
    session: CliSession,
    prompt: string,
    options: PromptOptions,
    approval?: ApprovalInput,
  ): Promise<{ result: CliAgentRunResult }> {
    await this.initialize();
    this.assertOpen();
    const logger = options.logger.child({ module: "agent" });
    const systemPrompt = await this.promptLoader.load();
    this.assertOpen();
    const tools = this.toolFactory.create(session.workspaceRoot);
    const graph = createAgent({
      model: this.providerSettings.createModel(options.providerSettings),
      tools,
      stateSchema: agentEventStateSchema,
      systemPrompt,
      checkpointer: this.checkpointer,
      middleware:
        options.mode === "normal"
          ? [
              humanInTheLoopMiddleware({
                interruptOn: { write_file: true, update_file: true },
              }),
            ]
          : [],
    });
    const runtime = serveAgent(graph.graph, {
      recursionLimit: MAX_AGENT_STEPS,
    });
    const controller = new AbortController();
    this.activeRuns.add(controller);
    const startedAt = Date.now();
    const events: AgentEvent[] = [];
    let runControlPublished = false;

    logger.info(
      {
        promptLength: prompt.length,
        provider: options.providerSettings.provider,
        modelId: options.providerSettings.modelId,
        mode: options.mode,
      },
      approval ? "agent approval resume started" : "agent prompt started",
    );

    try {
      const run = approval
        ? {
            threadId: session.id,
            resume: { decisions: approval.approvals.map(toLangChainDecision) },
            signal: controller.signal,
          }
        : {
            threadId: session.id,
            input: { messages: [{ role: "user" as const, content: prompt }] },
            signal: controller.signal,
          };

      for await (const event of runtime.stream(run)) {
        if (!runControlPublished) {
          runControlPublished = true;
          options.onRunControl?.({
            stop: async () => {
              if (controller.signal.aborted) return false;
              controller.abort(new Error("Stopped by user."));
              return true;
            },
          });
        }
        events.push(event);
        options.onEvent?.(event);
      }

      const result = toRunResult(session, prompt, events, approval?.runId);
      logger.info(
        {
          durationMs: Date.now() - startedAt,
          toolCallCount: events.filter(
            (event) => event.type === AgentEventType.ToolCalled,
          ).length,
          status: result.status,
        },
        "agent prompt completed",
      );
      return { result };
    } catch (error) {
      logger.error(
        { err: error, durationMs: Date.now() - startedAt },
        "agent prompt failed",
      );
      throw error;
    } finally {
      this.activeRuns.delete(controller);
    }
  }

  private assertOpen(): void {
    if (this.lifecycle !== "open")
      throw new Error("AgentRunner is closed or closing.");
  }
}

function toRunResult(
  session: CliSession,
  prompt: string,
  events: readonly AgentEvent[],
  resumedRunId?: string,
): CliAgentRunResult {
  const runId =
    events.find((event) => event.type === AgentEventType.RunStarted)?.runId ??
    resumedRunId;
  if (!runId) throw new Error("Agent stream ended without a run identity.");
  let status: CliAgentRunResult["status"] = "completed";
  const approvalRequests: ToolApprovalRequest[] = [];
  let content = "";
  for (const event of events) {
    if (
      event.type === AgentEventType.MessagePartDelta &&
      event.part.type === "text"
    )
      content += event.part.text;
    if (event.type === AgentEventType.InterruptRequired) {
      status = "waiting_for_approval";
      if (event.interrupt.kind === "tool-approval") {
        for (const action of event.interrupt.actions) {
          approvalRequests.push({
            approvalId: action.id,
            toolCall: {
              toolCallId: action.toolCallId ?? action.id,
              name: action.name,
              input: isJsonObject(action.input) ? action.input : {},
            },
          });
        }
      }
    }
    if (event.type === AgentEventType.RunFailed) status = "failed";
    if (event.type === AgentEventType.RunCancelled) status = "cancelled";
  }
  const messages = structuredClone(session.messages);
  if (prompt)
    messages.push({ role: "user", content: [{ type: "text", text: prompt }] });
  if (content)
    messages.push({
      role: "assistant",
      content: [{ type: "text", text: content }],
    });
  return {
    runId,
    status,
    content: content ? [{ type: "text", text: content }] : [],
    messages,
    approvalRequests,
    stepsCompleted: events.filter(
      (event) => event.type === AgentEventType.ToolCalled,
    ).length,
    ...(status === "failed" ? { error: "Agent execution failed." } : {}),
  };
}

function toLangChainDecision(
  decision: ToolApprovalDecision,
): { type: "approve" } | { type: "reject"; message: string } {
  return decision.approved
    ? { type: "approve" }
    : {
        type: "reject",
        message: decision.reason ?? "Denied in AgentDock CLI.",
      };
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
