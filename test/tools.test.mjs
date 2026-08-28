import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createToolRegistryFor } from "../dist/tools.js";

test("workspace tools hide and protect AgentDock state", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentdock-cli-tools-"));
  await mkdir(path.join(workspace, ".agentdock"));
  await writeFile(path.join(workspace, ".agentdock", "secret.json"), "secret", "utf8");
  await writeFile(path.join(workspace, "visible.txt"), "visible", "utf8");

  const registry = createToolRegistryFor({ workspaceRoot: workspace });
  const readFile = registry.get("read_file");
  const listFiles = registry.get("list_files");
  assert.ok(readFile);
  assert.ok(listFiles);

  await assert.rejects(
    readFile.execute({ input: { path: ".agentdock/secret.json" }, ctx: {} }),
    /protected workspace path/i,
  );
  const result = await listFiles.execute({ input: {}, ctx: {} });
  assert.deepEqual(result, { files: ["visible.txt"] });
});
