export interface ModelDefinition {
  id: string;
  label: string;
  description: string;
}

// Keep this list explicit: the harness requires a concrete OpenRouter model ID.
// Add new supported models here as they become available to the project.
export const modelCatalog: readonly ModelDefinition[] = [
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    description: "fast general-purpose model",
  },
  {
    id: "openai/gpt-4o-mini",
    label: "GPT-4o mini",
    description: "compact OpenAI model for everyday tasks",
  },
  {
    id: "anthropic/claude-3.5-sonnet",
    label: "Claude 3.5 Sonnet",
    description: "strong reasoning and coding model",
  },
  {
    id: "deepseek/deepseek-chat",
    label: "DeepSeek Chat",
    description: "efficient model for coding and analysis",
  },
];

export const defaultModelId = modelCatalog[0].id;

export function resolveModelId(configuredModelId: string | undefined): string {
  return configuredModelId?.trim() || defaultModelId;
}
