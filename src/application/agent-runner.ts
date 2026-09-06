import {
  AgentDock,
  AgentEventType,
  type AgentContext,
  type AgentEvent,
  type AgentRunResult,
  type ToolApprovalDecision,
} from "agentdock";
import type { CheckpointAdapter } from "@agentdock/checkpoint";
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
  private initialization: Promise<void> | undefined;
  private closing: Promise<void> | undefined;
  private readonly activeAgents = new Set<AgentDock>();

  constructor(
    private readonly checkpoint: CheckpointAdapter,
    private readonly promptLoader = new SystemPromptLoader(),
    private readonly toolFactory = new WorkspaceToolFactory(),
    private readonly providerSettings = new ProviderSettingsService(),
  ) {}

  async initialize(): Promise<void> {
    this.assertOpen();
    if (this.initialization) return this.initialization;

    this.initialization = this.checkpoint
      .initialize()
      .catch((error: unknown) => {
        this.initialization = undefined;
        throw error;
      });
    return this.initialization;
  }

  close(): Promise<void> {
    if (this.lifecycle === "closed") return Promise.resolve();
    if (this.closing) return this.closing;

    this.lifecycle = "closing";
    this.closing = (this.initialization ?? Promise.resolve())
      .catch(() => undefined)
      .then(() =>
        Promise.allSettled(
          [...this.activeAgents].map((agent) => agent.close()),
        ),
      )
      .then(() => this.checkpoint.close())
      .finally(() => {
        this.lifecycle = "closed";
      });
    return this.closing;
  }

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
    await this.initialize();
    this.assertOpen();
    const logger = options.logger.child({ module: "agent" });
    const context: AgentContext = {
      userId: "cli-user",
      organizationId: "cli-organization",
    };
    const systemPrompt = await this.promptLoader.load();
    this.assertOpen();
    const agent = new AgentDock({
      model: this.providerSettings.createModel(options.providerSettings),
      registry: this.toolFactory.create(
        session.workspaceRoot,
        approval ? "normal" : options.mode,
      ),
      // AgentRunner owns the shared adapter because each request gets a fresh
      // AgentDock for its model and workspace-specific tool registry.
      checkpointer: this.checkpoint.saver,
      defaults: {
        systemPrompt,
        maxSteps: MAX_AGENT_STEPS,
      },
    });
    this.activeAgents.add(agent);
    const startedAt = Date.now();
    let textChunkCount = 0;
    let textLength = 0;
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
            { sessionId: session.id },
          )
        : await agent.stream(prompt, context, { sessionId: session.id });

      for await (const event of response.stream) {
        if (!runControlPublished) {
          runControlPublished = true;
          options.onRunControl?.({ stop: () => agent.stop(event.runId) });
        }
        options.onEvent?.(event);
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
      logger.error(
        { err: error, durationMs: Date.now() - startedAt },
        "agent prompt failed",
      );
      throw error;
    } finally {
      this.activeAgents.delete(agent);
    }
  }

  private assertOpen(): void {
    if (this.lifecycle !== "open") {
      throw new Error("AgentRunner is closed or closing.");
    }
  }
}
