import assert from "node:assert/strict";
import { test } from "node:test";
import { SessionCodec } from "../dist/infrastructure/persistence/session-codec.js";
import { SystemPromptLoader } from "../dist/infrastructure/prompts/system-prompt-loader.js";

test("SessionCodec rejects malformed nested message data", () => {
  const timestamp = new Date().toISOString();
  const session = {
    version: 1,
    id: "session-1",
    workspaceRoot: "/tmp/workspace",
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [{ role: "assistant" }],
    runs: [],
  };

  assert.throws(
    () => new SessionCodec().decode(JSON.stringify(session), "session-1"),
    /Invalid message/,
  );
});

test("SystemPromptLoader loads a non-empty prompt", async () => {
  const prompt = await new SystemPromptLoader().load();
  assert.match(prompt, /You are AgentDock/);
});
