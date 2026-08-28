import assert from "node:assert/strict";
import { test } from "node:test";
import { cliUsage, parseCliOptions } from "../dist/cli-options.js";

test("parseCliOptions accepts normal and resume launches", () => {
  assert.deepEqual(parseCliOptions([]), { command: "run" });
  assert.deepEqual(parseCliOptions(["--resume", "abc-123"]), {
    command: "run",
    resumeSessionId: "abc-123",
  });
  assert.deepEqual(parseCliOptions(["--help"]), { command: "help" });
});

test("parseCliOptions rejects malformed arguments", () => {
  assert.throws(() => parseCliOptions(["--resume"]), /Usage/);
  assert.throws(() => parseCliOptions(["--resume", "../secret"]), /Usage/);
  assert.throws(() => parseCliOptions(["--unknown"]), /Usage/);
  assert.match(cliUsage, /agentdock --resume <session-id>/);
});
