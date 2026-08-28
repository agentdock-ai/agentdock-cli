import {
  AgentDock,
  AgentEventType,
  AgentModelFactory,
  type AgentContext,
  type AgentEvent,
  type AgentHooks,
  type AgentRunResult,
  type AgentStore,
  type ToolApprovalDecision,
} from "agentdock";
import { SystemPromptLoader } from "../infrastructure/prompts/system-prompt-loader.js";
import { WorkspaceToolFactory } from "../infrastructure/workspace/workspace-tool-factory.js";
import type { AgentRunControlUpdate } from "./contracts/app-types.js";
import type { AppLogger } from "../infrastructure/logging/logger.js";
import { toAgentModelConfig, type ProviderSettings } from "../infrastructure/providers/provider-settings.js";
import type { CliSession } from "../domain/sessions/session-types.js";

const MAX_AGENT_STEPS = 30;

export interface PromptOptions {
  providerSettings: ProviderSettings;
  mode: CliSession["mode"];
  logger: AppLogger;
  store: AgentStore;
  onEvent?: (event: AgentEvent) => void;
  onRunControl?: AgentRunControlUpdate;
}

export interface ApprovalInput {
  runId: string;
  approvals: ToolApprovalDecision[];
}

export class AgentRunner {
  constructor(
    private readonly modelFactory = new AgentModelFactory(),
    private readonly promptLoader = new SystemPromptLoader(),
    private readonly toolFactory = new WorkspaceToolFactory(),
  ) {}

  async executePrompt(
    session: CliSession,
    prompt: string,
    options: PromptOptions,
  ): Promise<{ result: AgentRunResult }> {
    return this.executeStream(session, prompt, options);
  }

  async resumeApproval(
    session: CliSession,
    approval: ApprovalInput,
    options: PromptOptions,
  ): Promise<{ result: AgentRunResult }> {
    return this.executeStream(session, "", options, approval);
  }

  private async executeStream(
    session: CliSession,
    prompt: string,
    options: PromptOptions,
    approval?: ApprovalInput,
  ): Promise<{ result: AgentRunResult }> {
    const logger = options.logger.child({ module: "agent" });
    const systemPrompt = await this.promptLoader.load();
    const hooks: AgentHooks = {
      onToolCall: (tool) => logger.debug({ toolName: tool.name }, "tool started"),
      onToolResult: (tool) => logger.debug({ toolName: tool.name, error: tool.error }, "tool completed"),
    };
    const context: AgentContext = {
      userId: "cli-user",
      organizationId: "cli-organization",
    };
    const agent = new AgentDock({
      model: this.modelFactory.create(toAgentModelConfig(options.providerSettings)),
      registry: this.toolFactory.create(session.workspaceRoot),
      store: options.store,
    });
    const startedAt = Date.now();
    let textChunkCount = 0;
    let textLength = 0;
    let cancelledRunId: string | null = null;
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
      const response = approval
        ? await agent.resumeStream(
          { runId: approval.runId, approvals: approval.approvals },
          context,
          this.runOptions(session, options, systemPrompt, hooks),
        )
        : await agent.stream(
          prompt,
          context,
          this.runOptions(session, options, systemPrompt, hooks),
        );

      for await (const event of response.stream) {
        if (!runControlPublished) {
          runControlPublished = true;
          options.onRunControl?.({ stop: () => agent.stop(event.runId) });
        }
        options.onEvent?.(event);
        if (event.type === AgentEventType.RunCancelled) cancelledRunId = event.runId;
        if (event.type === AgentEventType.TextDelta) {
          textChunkCount += 1;
          textLength += event.text.length;
        }
      }

      const result = await response.result;
      logger.info(
        {
          durationMs: Date.now() - startedAt,
          chunkCount: textChunkCount,
          textLength,
          toolCallCount: result.toolCalls.length,
          status: result.status,
        },
        "agent prompt completed",
      );
      return { result };
    } catch (error) {
      if (cancelledRunId) return { result: await this.cancelledResult(cancelledRunId, session, options.store) };
      logger.error({ err: error, durationMs: Date.now() - startedAt }, "agent prompt failed");
      throw error;
    }
  }

  private runOptions(
    session: CliSession,
    options: PromptOptions,
    systemPrompt: string,
    hooks: AgentHooks,
  ) {
    return {
      sessionId: session.id,
      systemPrompt,
      permissionMode: options.mode,
      hooks,
      maxSteps: MAX_AGENT_STEPS,
    };
  }

  private async cancelledResult(
    runId: string,
    session: CliSession,
    store: AgentStore,
  ): Promise<AgentRunResult> {
    const run = await store.runs.get(runId);
    return {
      runId,
      sessionId: session.id,
      status: "cancelled",
      content: "",
      messages: run?.messages ?? session.messages,
      toolCalls: [],
      toolResults: [],
      toolErrors: [],
      approvalRequests: [],
      stepsCompleted: run?.stepsCompleted ?? 0,
    };
  }
}
