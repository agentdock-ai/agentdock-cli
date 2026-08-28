import type { AgentModelConfig } from "agentdock";
import { defaultModelId, type ModelDefinition, modelCatalog } from "./model-catalog.js";

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

export function loadProviderSettings(
  environment: NodeJS.ProcessEnv = process.env,
): ProviderSettings {
  const provider = parseProvider(environment.AGENTDOCK_PROVIDER);
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
    ollamaBaseUrl: normalizeBaseUrl(environment.OLLAMA_BASE_URL || defaultOllamaBaseUrl),
  };
}

export function parseProvider(value: string | undefined): CliProvider {
  const provider = value?.trim().toLowerCase() || "openrouter";
  if (isCliProvider(provider)) return provider;
  throw new Error(`Unsupported provider "${value}". Use openrouter or ollama.`);
}

export function isCliProvider(value: string): value is CliProvider {
  return supportedProviders.includes(value as CliProvider);
}

export function switchProvider(settings: ProviderSettings, provider: CliProvider): ProviderSettings {
  return {
    ...settings,
    provider,
    modelId: provider === "openrouter" ? defaultModelId : defaultOllamaModelId,
  };
}

export function toAgentModelConfig(settings: ProviderSettings): AgentModelConfig {
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

export async function listProviderModels(settings: ProviderSettings): Promise<ModelDefinition[]> {
  if (settings.provider === "openrouter") return [...modelCatalog];

  const response = await fetch(`${settings.ollamaBaseUrl}/api/tags`, {
    signal: AbortSignal.timeout(2_000),
  }).catch((error: unknown) => {
    throw new Error(`Could not connect to Ollama at ${settings.ollamaBaseUrl}: ${errorMessage(error)}`);
  });

  if (!response.ok) {
    throw new Error(`Ollama model listing failed with HTTP ${response.status}.`);
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.models)) {
    throw new Error("Ollama returned an invalid model list.");
  }

  return payload.models.flatMap((model): ModelDefinition[] => {
    if (!isRecord(model) || typeof model.name !== "string" || !model.name.trim()) return [];
    const name = model.name.trim();
    return [{ id: name, label: name, description: "local Ollama model" }];
  });
}

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  try {
    new URL(normalized);
  } catch {
    throw new Error(`Invalid OLLAMA_BASE_URL: ${value}`);
  }
  return normalized;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
