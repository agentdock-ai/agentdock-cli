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
  {
    id: "deepseek/deepseek-v4-flash-0731",
    label: "DeepSeek V4 Flash",
    description: "fast DeepSeek model for general tasks",
  },
  {
    id: "deepseek/deepseek-v4-pro-0813",
    label: "DeepSeek V4 Pro",
    description: "advanced DeepSeek model for reasoning and coding",
  },
  {
    id: "minimax/minimax-m3",
    label: "MiniMax M3",
    description: "general-purpose MiniMax model",
  },
  {
    id: "minimax/minimax-m2.7",
    label: "MiniMax M2.7",
    description: "efficient MiniMax model for everyday tasks",
  },
  {
    id: "z-ai/glm-5.3",
    label: "GLM 5.3",
    description: "general-purpose GLM model for reasoning and coding",
  },
  {
    id: "moonshotai/kimi-k3",
    label: "Kimi K3",
    description: "Moonshot model for long-context tasks",
  },
  {
    id: "qwen/qwen3.8-27b",
    label: "Qwen 3.8 27B",
    description: "Qwen model for general-purpose reasoning",
  },
];

export const defaultModelId = modelCatalog[0].id;
