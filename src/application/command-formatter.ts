import type { ModelDefinition } from "../domain/models/model-catalog.js";
import type { ProviderSettings } from "../infrastructure/providers/provider-settings.js";
import type { SessionSummary } from "../domain/sessions/session-types.js";

export class CommandFormatter {
  providerSettings(settings: ProviderSettings): string {
    return [
      "Provider settings:",
      `- provider: ${settings.provider}`,
      `- model: ${settings.modelId}`,
      `- OpenRouter API key: ${settings.openrouterApiKey ? "configured" : "not configured"}`,
      `- Ollama URL: ${settings.ollamaBaseUrl}`,
      `- Ollama API key: ${settings.ollamaApiKey ? "configured" : "not configured"}`,
      "",
      "Change provider with /provider openrouter or /provider ollama.",
      "Set credentials and URLs with OPENROUTER_API_KEY, OLLAMA_API_KEY, and OLLAMA_BASE_URL.",
    ].join("\n");
  }

  modelList(settings: ProviderSettings, models: readonly ModelDefinition[]): string {
    if (models.length === 0) return `No ${settings.provider} models found.`;
    return [
      `${settings.provider} models:`,
      ...models.map((model) => `- ${model.id} — ${model.description}`),
      "",
      "Use /model <model-id> to select a model.",
    ].join("\n");
  }

  sessionList(sessions: readonly SessionSummary[], currentSessionId: string): string {
    if (sessions.length === 0) return "No saved sessions found.";
    return [
      "Saved sessions:",
      ...sessions.map((session) => {
        const current = session.id === currentSessionId ? " (current)" : "";
        return [
          `- ${session.id}${current}  updated ${session.updatedAt}  messages=${session.messageCount}  runs=${session.runCount}`,
          `  ↳ ${session.preview}`,
        ].join("\n");
      }),
      "",
      "Use /resume <session-id> to switch sessions.",
    ].join("\n");
  }

  error(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
