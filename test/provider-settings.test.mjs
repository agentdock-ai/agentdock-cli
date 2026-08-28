import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultOllamaBaseUrl,
  defaultOllamaModelId,
  listProviderModels,
  loadProviderSettings,
  toAgentModelConfig,
} from "../dist/infrastructure/providers/provider-settings.js";

test("provider settings use safe OpenRouter defaults", () => {
  const settings = loadProviderSettings({});

  assert.equal(settings.provider, "openrouter");
  assert.equal(settings.modelId, "google/gemini-2.5-flash");
  assert.equal(settings.ollamaBaseUrl, defaultOllamaBaseUrl);
  assert.deepEqual(toAgentModelConfig(settings), {
    provider: "openrouter",
    modelId: "google/gemini-2.5-flash",
  });
});

test("provider settings configure Ollama and list local models", async () => {
  const settings = loadProviderSettings({
    AGENTDOCK_PROVIDER: "ollama",
    OLLAMA_MODEL: "qwen2.5",
    OLLAMA_BASE_URL: "http://localhost:11434/",
  });

  assert.equal(settings.provider, "ollama");
  assert.equal(settings.modelId, "qwen2.5");
  assert.equal(settings.ollamaBaseUrl, "http://localhost:11434");
  assert.deepEqual(toAgentModelConfig(settings), {
    provider: "ollama",
    modelId: "qwen2.5",
    baseURL: "http://localhost:11434",
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(String(input), "http://localhost:11434/api/tags");
    return new Response(JSON.stringify({ models: [{ name: "qwen2.5" }, { name: "llama3.2" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    assert.deepEqual(await listProviderModels(settings), [
      { id: "qwen2.5", label: "qwen2.5", description: "local Ollama model" },
      { id: "llama3.2", label: "llama3.2", description: "local Ollama model" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider settings use the Ollama model default", () => {
  const settings = loadProviderSettings({ AGENTDOCK_PROVIDER: "ollama" });
  assert.equal(settings.modelId, defaultOllamaModelId);
});
