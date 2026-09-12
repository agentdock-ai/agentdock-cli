import assert from "node:assert/strict";
import { test } from "node:test";
import { ChatEventController } from "../dist/ui/controllers/chat-event-controller.js";

const baseEvent = {
  protocolVersion: 1,
  eventId: "event-1",
  runId: "run-1",
  sessionId: "session-1",
  logicalSequence: 1,
  phaseId: "phase-1",
  sequence: 1,
  timestamp: new Date().toISOString(),
};

test("ChatEventController renders canonical text parts and tool approval interrupts", () => {
  const controller = new ChatEventController();
  let messages = [];
  let approvals = [];
  let streamedText = "";
  const callbacks = {
    appendText: (text) => { streamedText += text; },
    updateMessages: (update) => { messages = update(messages); },
    updateToolActivity: () => {},
    updateApprovals: (update) => { approvals = update(approvals); },
  };

  controller.handle({
    ...baseEvent,
    type: "message.part.delta",
    part: { type: "text", text: "hello" },
    messageId: "message-1",
  }, "assistant-1", callbacks);
  controller.handle({
    ...baseEvent,
    eventId: "event-2",
    sequence: 2,
    logicalSequence: 2,
    type: "interrupt.required",
    interrupt: {
      kind: "tool-approval",
      interruptId: "interrupt-1",
      prompt: "Approve the tool?",
      actions: [{ id: "call-1", name: "write_file", input: { path: "a.txt" } }],
    },
  }, "assistant-1", callbacks);

  assert.equal(streamedText, "hello");
  assert.deepEqual(approvals, [{
    approvalId: "call-1",
    toolCall: { toolCallId: "call-1", name: "write_file", input: { path: "a.txt" } },
  }]);
  assert.equal(messages[0].toolState, "approval_required");
});
