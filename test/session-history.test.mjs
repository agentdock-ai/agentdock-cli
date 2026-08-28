import assert from "node:assert/strict";
import { test } from "node:test";
import { toChatHistory } from "../dist/ui/session-history.js";

test("toChatHistory keeps visible messages and skips tool messages", () => {
  assert.deepEqual(
    toChatHistory([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
      { role: "tool", content: "internal result", toolResults: [] },
      { role: "system", content: "notice" },
      { role: "assistant", content: "" },
    ]),
    [
      { id: "history-0", role: "user", content: "hello" },
      { id: "history-1", role: "assistant", content: "hi" },
      { id: "history-3", role: "system", content: "notice" },
    ],
  );
});
