import type { AgentModelConfig } from "agentdock";
import { defaultModelId, type ModelDefinition, modelCatalog } from "../../domain/models/model-catalog.js";

export const supportedProviders = ["openrouter", "ollama"] as const;
export type CliProvider = (typeof supportedProviders)[number];

export const defaultOllamaBaseUrl = "http://127.0.0.1:11434";
export const defaultOllamaModelId = "llama3.2";

export interface ProviderSettings {
  provider: CliProvider;
  modelId: string;
  openrouterApiKey?: string;
  ollamaApiKey?: string;
  ollamaBaseUrl: string;
}

export class ProviderSettingsService {
  load(environment: NodeJS.ProcessEnv = process.env): ProviderSettings {
    const provider = this.parse(environment.AGENTDOCK_PROVIDER);
    return {
      provider,
      modelId: provider === "openrouter"
        ? environment.OPENROUTER_MODEL?.trim() || defaultModelId
        : environment.OLLAMA_MODEL?.trim() || defaultOllamaModelId,
      ...(environment.OPENROUTER_API_KEY?.trim()
        ? { openrouterApiKey: environment.OPENROUTER_API_KEY.trim() }
        : {}),
      ...(environment.OLLAMA_API_KEY?.trim()
        ? { ollamaApiKey: environment.OLLAMA_API_KEY.trim() }
        : {}),
      ollamaBaseUrl: this.normalizeBaseUrl(environment.OLLAMA_BASE_URL || defaultOllamaBaseUrl),
    };
  }

  parse(value: string | undefined): CliProvider {
    const provider = value?.trim().toLowerCase() || "openrouter";
    if (this.isProvider(provider)) return provider;
    throw new Error(`Unsupported provider "${value}". Use openrouter or ollama.`);
  }

  isProvider(value: string): value is CliProvider {
    return supportedProviders.includes(value as CliProvider);
  }

  switch(settings: ProviderSettings, provider: CliProvider): ProviderSettings {
    return {
      ...settings,
      provider,
      modelId: provider === "openrouter" ? defaultModelId : defaultOllamaModelId,
    };
  }

  toAgentConfig(settings: ProviderSettings): AgentModelConfig {
    if (settings.provider === "openrouter") {
      return {
        provider: "openrouter",
        modelId: settings.modelId,
        ...(settings.openrouterApiKey ? { apiKey: settings.openrouterApiKey } : {}),
      };
    }

    return {
      provider: "ollama",
      modelId: settings.modelId,
      baseURL: settings.ollamaBaseUrl,
      ...(settings.ollamaApiKey ? { apiKey: settings.ollamaApiKey } : {}),
    };
  }

  async listModels(settings: ProviderSettings): Promise<ModelDefinition[]> {
    if (settings.provider === "openrouter") return [...modelCatalog];

    const response = await fetch(`${settings.ollamaBaseUrl}/api/tags`, {
      signal: AbortSignal.timeout(2_000),
    }).catch((error: unknown) => {
      throw new Error(`Could not connect to Ollama at ${settings.ollamaBaseUrl}: ${this.errorMessage(error)}`);
    });

    if (!response.ok) throw new Error(`Ollama model listing failed with HTTP ${response.status}.`);
    const payload: unknown = await response.json();
    if (!this.isRecord(payload) || !Array.isArray(payload.models)) {
      throw new Error("Ollama returned an invalid model list.");
    }

    return payload.models.flatMap((model): ModelDefinition[] => {
      if (!this.isRecord(model) || typeof model.name !== "string" || !model.name.trim()) return [];
      const name = model.name.trim();
      return [{ id: name, label: name, description: "local Ollama model" }];
    });
  }

  private normalizeBaseUrl(value: string): string {
    const normalized = value.trim().replace(/\/+$/, "");
    try {
      new URL(normalized);
    } catch {
      throw new Error(`Invalid OLLAMA_BASE_URL: ${value}`);
    }
    return normalized;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}

const defaultService = new ProviderSettingsService();

export function loadProviderSettings(environment: NodeJS.ProcessEnv = process.env): ProviderSettings {
  return defaultService.load(environment);
}

export function parseProvider(value: string | undefined): CliProvider {
  return defaultService.parse(value);
}

export function isCliProvider(value: string): value is CliProvider {
  return defaultService.isProvider(value);
}

export function switchProvider(settings: ProviderSettings, provider: CliProvider): ProviderSettings {
  return defaultService.switch(settings, provider);
}

export function toAgentModelConfig(settings: ProviderSettings): AgentModelConfig {
  return defaultService.toAgentConfig(settings);
}

export function listProviderModels(settings: ProviderSettings): Promise<ModelDefinition[]> {
  return defaultService.listModels(settings);
}
