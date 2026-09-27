import path from "node:path";
import { mkdirSync } from "node:fs";
import { render } from "ink";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import type { ContentPart } from "@agentdock-ai/contracts";
import {
  AgentRunner,
  type ApprovalInput,
  type CliAgentRunResult,
} from "./agent-runner.js";
import { CommandDispatcher } from "./command-dispatcher.js";
import { ProviderController } from "./provider-controller.js";
import { SessionController } from "./session-controller.js";
import {
  createLogger,
  type AppLogger,
} from "../infrastructure/logging/logger.js";
import { SessionStore } from "../infrastructure/persistence/session-store.js";
import { ChatApp } from "../ui/components/ChatApp.js";
import type { CliOptions } from "../config/cli-options.js";
import type { CliSession } from "../domain/sessions/session-types.js";
import type { AgentRunControlUpdate } from "./contracts/app-types.js";
import type {
  AgentEventUpdate,
  ApprovalSubmit,
  PromptResult,
  SubmitPrompt,
} from "../ui/types.js";

export class CliApplication {
  private readonly defaultWorkspace: string;
  private readonly store: SessionStore;
  private readonly logger: AppLogger;
  private readonly sessions: SessionController;
  private readonly providers: ProviderController;
  private readonly agentRunner: AgentRunner;
  private readonly commands: CommandDispatcher;
  private readonly checkpointer: SqliteSaver;

  constructor(environment: NodeJS.ProcessEnv = process.env) {
    this.defaultWorkspace = path.resolve(
      environment.AGENTDOCK_WORKSPACE?.trim() || process.cwd(),
    );
    const agentdockDirectory = path.resolve(
      this.defaultWorkspace,
      ".agentdock",
    );
    mkdirSync(agentdockDirectory, { recursive: true });
    this.store = new SessionStore(
      path.resolve(this.defaultWorkspace, ".agentdock", "sessions"),
    );
    this.logger = createLogger().child({ module: "main" });
    this.sessions = new SessionController(this.store, this.defaultWorkspace);
    this.providers = new ProviderController(undefined, environment);
    this.checkpointer = SqliteSaver.fromConnString(
      path.resolve(agentdockDirectory, "checkpoints.sqlite"),
    );
    this.agentRunner = new AgentRunner(this.checkpointer);
    this.commands = new CommandDispatcher(this.sessions, this.providers);
  }

  async run(options: Extract<CliOptions, { command: "run" }>): Promise<void> {
    let session: CliSession | undefined;

    try {
      await this.agentRunner.initialize();
      session = await this.sessions.initialize(options.resumeSessionId);
      this.logger.info(
        { sessionId: session.id, workspace: session.workspaceRoot },
        "agentdock-cli starting",
      );
      this.logger.info(
        { sessionId: session.id },
        options.resumeSessionId ? "session resumed" : "session created",
      );

      const instance = render(
        <ChatApp
          workspace={session.workspaceRoot}
          provider={this.providers.current.provider}
          model={this.providers.current.modelId}
          onChangeModel={(model) => {
            this.providers.setModel(model);
          }}
          mode={session.mode}
          initialHistory={session.messages}
          initialApprovals={this.sessions.pendingApprovals()}
          onClear={() => this.sessions.clearMessages()}
          onToggleMode={(mode) => this.sessions.setMode(mode)}
          onSubmit={this.submitPrompt}
          onApproval={this.approveRun}
        />,
      );
      await instance.waitUntilExit();
    } finally {
      await this.agentRunner.close();
      this.checkpointer.db.close();
      if (session) {
        const latest = await this.sessions.refresh();
        this.logger.info({ sessionId: latest.id }, "agentdock-cli stopped");
        console.log(`\nSession saved: ${latest.id}`);
        console.log("Resume with:");
        console.log(`  yarn dev --resume ${latest.id}`);
        console.log(`  agentdock --resume ${latest.id}`);
      }
    }
  }

  private readonly submitPrompt: SubmitPrompt = async (
    prompt: string,
    onEvent: AgentEventUpdate,
    onRunControl: AgentRunControlUpdate,
  ): Promise<PromptResult | null> => {
    this.logger.debug(
      {
        command: prompt.startsWith("/") ? prompt : undefined,
        promptLength: prompt.length,
      },
      "input received",
    );
    const commandResult = await this.commands.dispatch(prompt);
    if (commandResult) return commandResult;

    const { result } = await this.agentRunner.executePrompt(
      this.sessions.current,
      prompt,
      {
        mode: this.sessions.current.mode,
        providerSettings: this.providers.current,
        onEvent,
        onRunControl,
        logger: this.logger,
      },
    );
    await this.sessions.recordRun(result);
    return this.toPromptResult(result);
  };

  private readonly approveRun: ApprovalSubmit = async (
    request,
    decisions,
    onEvent,
    onRunControl,
  ): Promise<PromptResult> => {
    const approval: ApprovalInput = {
      runId: this.sessions.findRunId(request.approvalId),
      approvals: decisions.map((decision) => ({
        approvalId: decision.approvalId,
        approved: decision.approved,
        ...(!decision.approved ? { reason: "Denied in AgentDock CLI" } : {}),
      })),
    };
    const { result } = await this.agentRunner.resumeApproval(
      this.sessions.current,
      approval,
      {
        mode: this.sessions.current.mode,
        providerSettings: this.providers.current,
        onEvent,
        onRunControl,
        logger: this.logger,
      },
    );
    await this.sessions.recordRun(result);
    return this.toPromptResult(result);
  };

  private toPromptResult(result: CliAgentRunResult): PromptResult {
    return {
      content: textContent(result.content),
      runId: result.runId,
      status: result.status,
      approvalRequests: result.approvalRequests,
    };
  }
}

function textContent(parts: readonly ContentPart[]): string {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}
