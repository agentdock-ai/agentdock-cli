import path from "node:path";
import { render } from "ink";
import type { AgentRunResult } from "agentdock";
import { AgentRunner, type ApprovalInput } from "./agent-runner.js";
import { CommandDispatcher } from "./command-dispatcher.js";
import { ProviderController } from "./provider-controller.js";
import { SessionController } from "./session-controller.js";
import { CliAgentStore } from "../infrastructure/agents/cli-agent-store.js";
import { createLogger, type AppLogger } from "../infrastructure/logging/logger.js";
import { SessionStore } from "../infrastructure/persistence/session-store.js";
import { ChatApp } from "../ui/components/ChatApp.js";
import type { CliOptions } from "../config/cli-options.js";
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

  constructor(environment: NodeJS.ProcessEnv = process.env) {
    this.defaultWorkspace = environment.AGENTDOCK_DEV === "true"
      ? path.resolve(process.cwd(), ".sandbox")
      : process.cwd();
    this.store = new SessionStore(path.resolve(this.defaultWorkspace, ".agentdock", "sessions"));
    this.logger = createLogger().child({ module: "main" });
    this.sessions = new SessionController(this.store, this.defaultWorkspace);
    this.providers = new ProviderController(undefined, environment);
    this.agentRunner = new AgentRunner();
    this.commands = new CommandDispatcher(this.sessions, this.providers);
  }

  async run(options: Extract<CliOptions, { command: "run" }>): Promise<void> {
    const session = await this.sessions.initialize(options.resumeSessionId);
    this.logger.info({ sessionId: session.id, workspace: session.workspaceRoot }, "agentdock-cli starting");
    this.logger.info(
      { sessionId: session.id },
      options.resumeSessionId ? "session resumed" : "session created",
    );

    const instance = render(
      <ChatApp
        workspace={session.workspaceRoot}
        provider={this.providers.current.provider}
        model={this.providers.current.modelId}
        onChangeModel={(model) => { this.providers.setModel(model); }}
        mode={session.mode}
        initialHistory={session.messages}
        initialApprovals={this.sessions.pendingApprovals()}
        onClear={() => this.sessions.clearMessages()}
        onToggleMode={(mode) => this.sessions.setMode(mode)}
        onSubmit={this.submitPrompt}
        onApproval={this.approveRun}
      />,
    );

    try {
      await instance.waitUntilExit();
    } finally {
      const latest = await this.sessions.refresh();
      this.logger.info({ sessionId: latest.id }, "agentdock-cli stopped");
      console.log(`\nSession saved: ${latest.id}`);
      console.log("Resume with:");
      console.log(`  yarn dev --resume ${latest.id}`);
      console.log(`  agentdock --resume ${latest.id}`);
    }
  }

  private readonly submitPrompt: SubmitPrompt = async (
    prompt: string,
    onEvent: AgentEventUpdate,
    onRunControl: AgentRunControlUpdate,
  ): Promise<PromptResult | null> => {
    this.logger.debug(
      { command: prompt.startsWith("/") ? prompt : undefined, promptLength: prompt.length },
      "input received",
    );
    const commandResult = await this.commands.dispatch(prompt);
    if (commandResult) return commandResult;

    const { result } = await this.agentRunner.executePrompt(this.sessions.current, prompt, {
      mode: this.sessions.current.mode,
      providerSettings: this.providers.current,
      store: this.createAgentStore(),
      onEvent,
      onRunControl,
      logger: this.logger,
    });
    await this.sessions.refresh();
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
        reason: decision.approved ? "Approved in AgentDock CLI" : "Denied in AgentDock CLI",
      })),
    };
    const { result } = await this.agentRunner.resumeApproval(this.sessions.current, approval, {
      mode: this.sessions.current.mode,
      providerSettings: this.providers.current,
      store: this.createAgentStore(),
      onEvent,
      onRunControl,
      logger: this.logger,
    });
    await this.sessions.refresh();
    return this.toPromptResult(result);
  };

  private createAgentStore(): CliAgentStore {
    const session = this.sessions.current;
    return new CliAgentStore(this.store, session.id, session.workspaceRoot);
  }

  private toPromptResult(result: AgentRunResult): PromptResult {
    if (result.status === "running") {
      throw new Error(`Agent run did not reach a terminal state: ${result.runId}`);
    }
    return {
      content: result.content,
      runId: result.runId,
      status: result.status,
      approvalRequests: result.approvalRequests,
    };
  }
}
