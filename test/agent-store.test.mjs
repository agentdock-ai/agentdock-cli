import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CliAgentStore } from "../dist/infrastructure/agents/cli-agent-store.js";
import { SessionStore } from "../dist/infrastructure/persistence/session-store.js";

test("CliAgentStore preserves session linkage and atomically claims approvals", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agentdock-cli-store-"));
  const storage = new SessionStore(directory);
  const session = storage.create(directory);
  await storage.save(session);
  const store = new CliAgentStore(storage, session.id, directory);
  const now = Date.now();

  await store.runs.save({
    runId: "run-1",
    sessionId: session.id,
    status: "waiting_for_approval",
    messages: [],
    pendingApprovals: [{
      approvalId: "approval-1",
      toolCall: { toolCallId: "call-1", name: "write_file", input: { path: "a.txt" } },
    }],
    stepsCompleted: 0,
    createdAt: now,
    updatedAt: now,
  });

  const claims = await Promise.all(
    Array.from({ length: 5 }, () => store.runs.claimApprovals("run-1", [
      { approvalId: "approval-1", approved: true },
    ])),
  );

  assert.equal(claims.filter(Boolean).length, 1);
  const run = await store.runs.get("run-1");
  assert.equal(run.sessionId, session.id);
  assert.equal(run.status, "running");
});
