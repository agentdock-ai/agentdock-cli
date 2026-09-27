import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

test("the CLI uses LangGraph's SQLite saver directly", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "agentdock-cli-checkpoint-"),
  );
  const checkpointer = SqliteSaver.fromConnString(
    path.join(directory, "checkpoints.sqlite"),
  );

  try {
    await checkpointer.setup();

    const tables = checkpointer.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all()
      .map(({ name }) => name);

    assert.deepEqual(tables, ["checkpoints", "writes"]);
  } finally {
    checkpointer.db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
