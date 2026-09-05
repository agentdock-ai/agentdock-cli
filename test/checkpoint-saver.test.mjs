import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { emptyCheckpoint } from "@langchain/langgraph-checkpoint";
import { FileCheckpointSaver } from "../dist/infrastructure/persistence/file-checkpoint-saver.js";

test("FileCheckpointSaver restores LangGraph checkpoints", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agentdock-cli-checkpoint-"));
  const filePath = path.join(directory, "checkpoints.json");
  const config = { configurable: { thread_id: "session-1", checkpoint_ns: "" } };
  const checkpoint = { ...emptyCheckpoint(), id: "checkpoint-1" };

  try {
    const saver = new FileCheckpointSaver(filePath);
    await saver.put(config, checkpoint, { source: "input", step: -1, parents: {} });

    const restored = new FileCheckpointSaver(filePath);
    const tuple = await restored.getTuple(config);
    assert.equal(tuple?.checkpoint.id, "checkpoint-1");
    assert.match(await readFile(filePath, "utf8"), /\"version\":1/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
