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

test("SessionCodec migrates string messages and legacy tool records", () => {
  const timestamp = new Date().toISOString();
  const session = {
    version: 1,
    id: "session-legacy",
    workspaceRoot: "/tmp/workspace",
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            toolCallId: "call-1",
            name: "read_file",
            input: { path: "README.md" },
          },
        ],
      },
      {
        role: "tool",
        content: "",
        toolResults: [
          {
            toolCallId: "call-1",
            name: "read_file",
            input: { path: "README.md" },
            output: "contents",
          },
        ],
      },
    ],
    runs: [],
  };

  const decoded = new SessionCodec().decode(
    JSON.stringify(session),
    "session-legacy",
  );
  assert.deepEqual(decoded.messages[0].content, [
    { type: "text", text: "hello" },
  ]);
  assert.equal(decoded.messages[1].content[0].type, "tool-call");
  assert.equal(decoded.messages[2].content[0].type, "tool-result");
});

test("SystemPromptLoader loads a non-empty prompt", async () => {
  const prompt = await new SystemPromptLoader().load();
  assert.match(prompt, /You are AgentDock/);
});
