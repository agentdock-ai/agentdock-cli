import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { SqliteCheckpoint } from "@agentdock-ai/checkpoint-sqlite";

test("SqliteCheckpoint initializes LangGraph's schema and is idempotent", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "agentdock-cli-checkpoint-"),
  );
  const checkpoint = new SqliteCheckpoint({
    path: path.join(directory, "checkpoints.sqlite"),
  });

  try {
    await checkpoint.initialize();
    await checkpoint.initialize();

    const tables = checkpoint.saver.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all()
      .map(({ name }) => name);

    assert.deepEqual(tables, ["checkpoints", "writes"]);
    await checkpoint.close();
    await checkpoint.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
