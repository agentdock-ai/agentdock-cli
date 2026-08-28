import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { SessionStore } from "../dist/infrastructure/persistence/session-store.js";

test("SessionStore lists resumable session summaries", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agentdock-cli-session-"));
  const store = new SessionStore(directory);
  const session = store.create(directory);
  await store.save(session);

  await store.update(session.id, (current) => {
    current.messages.push({ role: "user", content: "hello" });
  });

  const summaries = await store.list();
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].id, session.id);
  assert.equal(summaries[0].messageCount, 1);
  assert.equal(summaries[0].runCount, 0);
  assert.equal(summaries[0].preview, "hello");
  assert.notEqual(summaries[0].updatedAt, session.updatedAt);
});

test("SessionStore serializes concurrent session mutations", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agentdock-cli-session-"));
  const store = new SessionStore(directory);
  const session = store.create(directory);
  await store.save(session);

  await Promise.all([
    store.update(session.id, (current) => current.messages.push({ role: "user", content: "one" })),
    store.update(session.id, (current) => current.messages.push({ role: "user", content: "two" })),
  ]);

  const loaded = await store.load(session.id);
  assert.deepEqual(
    loaded.messages.map((message) => message.content).sort(),
    ["one", "two"],
  );
});
