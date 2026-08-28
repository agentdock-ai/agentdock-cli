import { isValidSessionId } from "../domain/sessions/session-id.js";
import { CommandFormatter } from "./command-formatter.js";
import { completedCommand, type CommandResult } from "./command-result.js";
import { ProviderController } from "./provider-controller.js";
import { SessionController } from "./session-controller.js";

export class CommandDispatcher {
  constructor(
    private readonly sessions: SessionController,
    private readonly providers: ProviderController,
    private readonly formatter = new CommandFormatter(),
  ) {}

  async dispatch(prompt: string): Promise<CommandResult | null> {
    if (prompt === "/help") return completedCommand("/help  /settings  /provider  /models  /model  /mode  /runs  /inspect  /new  /resume  /tools  /clear  /exit");
    if (prompt === "/tools") return completedCommand("read_file, list_files, search_files, write_file, update_file");
    if (prompt === "/inspect") return completedCommand(JSON.stringify(this.sessions.current, null, 2));
    if (prompt === "/runs") return completedCommand(JSON.stringify(this.sessions.current.runs, null, 2));
    if (prompt === "/resume") return completedCommand(this.formatter.sessionList(await this.sessions.list(), this.sessions.current.id));
    if (prompt === "/settings" || prompt === "/provider") return this.settingsResult();

    if (prompt.startsWith("/provider ")) {
      const provider = this.providers.parse(prompt.slice("/provider ".length));
      const settings = this.providers.switch(provider);
      return completedCommand(
        `Provider switched to ${settings.provider}. Model reset to ${settings.modelId}.`,
        { provider: settings.provider, modelId: settings.modelId },
      );
    }

    if (prompt === "/models") {
      try {
        const models = await this.providers.listModels();
        return completedCommand(this.formatter.modelList(this.providers.current, models), { modelOptions: models });
      } catch (error: unknown) {
        return completedCommand(this.formatter.error(error));
      }
    }

    if (prompt === "/model") {
      return completedCommand(`Current model: ${this.providers.current.modelId}\nUse /model <model-id> to change it.`);
    }

    if (prompt.startsWith("/model ")) {
      const modelId = prompt.slice("/model ".length).trim();
      if (!modelId) return completedCommand("Usage: /model <model-id>");
      this.providers.setModel(modelId);
      return completedCommand(`Model switched to ${modelId}.`, {
        provider: this.providers.current.provider,
        modelId,
      });
    }

    if (prompt.startsWith("/resume ")) {
      const sessionId = prompt.slice("/resume ".length).trim();
      if (!isValidSessionId(sessionId)) return completedCommand("Usage: /resume <session-id>");
      const session = await this.sessions.resume(sessionId);
      return completedCommand(`Resumed session ${session.id}`, {
        resetConversation: true,
        mode: session.mode,
        workspaceRoot: session.workspaceRoot,
        approvalRequests: this.sessions.pendingApprovals(),
        history: session.messages,
      });
    }

    if (prompt.startsWith("/mode ")) {
      const value = prompt.slice("/mode ".length).trim();
      if (value !== "normal" && value !== "approve-all") return completedCommand("Usage: /mode normal|approve-all");
      const mode = value === "approve-all" ? "approve_all" : "normal";
      await this.sessions.setMode(mode);
      return completedCommand(`Mode switched to ${mode === "approve_all" ? "Approve All" : "Normal"}`);
    }

    if (prompt === "/new") {
      const session = await this.sessions.createNew();
      return completedCommand(`Started session ${session.id}`, {
        resetConversation: true,
        mode: session.mode,
        workspaceRoot: session.workspaceRoot,
      });
    }

    return null;
  }

  private settingsResult(): CommandResult {
    const settings = this.providers.current;
    return completedCommand(this.formatter.providerSettings(settings), {
      provider: settings.provider,
      modelId: settings.modelId,
    });
  }
}
