import assert from "node:assert/strict";
import { test } from "node:test";
import { ChatRequestController } from "../dist/ui/controllers/chat-request-controller.js";

test("ChatRequestController streams text from canonical content-part events", async () => {
  const request = new ChatRequestController(async (_prompt, onEvent) => {
    onEvent({
      protocolVersion: 1,
      eventId: "event-1",
      runId: "run-1",
      sessionId: "session-1",
      logicalSequence: 1,
      phaseId: "phase-1",
      sequence: 1,
      timestamp: new Date().toISOString(),
      type: "message.part.delta",
      messageId: "message-1",
      part: { type: "text", text: "hello" },
    });
    return null;
  }, async () => null);
  const textUpdates = [];

  const result = await request.submit("prompt", {
    onEvent: () => {},
    onRunControl: () => {},
    onText: (text) => textUpdates.push(text),
  });

  assert.deepEqual(textUpdates, ["hello"]);
  assert.equal(result.streamedContent, "hello");
});
