import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { WorkspaceToolFactory } from "../dist/infrastructure/workspace/workspace-tool-factory.js";

test("workspace tools list and read the complete workspace tree", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentdock-cli-tools-"));
  await mkdir(path.join(workspace, ".agentdock"));
  await writeFile(path.join(workspace, ".agentdock", "secret.json"), "secret", "utf8");
  await mkdir(path.join(workspace, "docs", "guides"), { recursive: true });
  await writeFile(path.join(workspace, "docs", "README.md"), "docs", "utf8");
  await writeFile(path.join(workspace, "visible.txt"), "visible", "utf8");

  const registry = new WorkspaceToolFactory().create(workspace);
  const readFile = registry.get("read_file");
  const listFiles = registry.get("list_files");
  assert.ok(readFile);
  assert.ok(listFiles);

  assert.deepEqual(
    await readFile.execute({ input: { path: ".agentdock/secret.json" }, ctx: {} }),
    { path: ".agentdock/secret.json", content: "secret" },
  );
  const result = await listFiles.execute({ input: {}, ctx: {} });
  assert.deepEqual(result, {
    root: ".",
    entries: [
      {
        name: ".agentdock",
        path: ".agentdock",
        type: "directory",
        children: [{ name: "secret.json", path: ".agentdock/secret.json", type: "file" }],
      },
      {
        name: "docs",
        path: "docs",
        type: "directory",
        children: [
          { name: "guides", path: "docs/guides", type: "directory", children: [] },
          { name: "README.md", path: "docs/README.md", type: "file" },
        ],
      },
      { name: "visible.txt", path: "visible.txt", type: "file" },
    ],
    fileCount: 3,
    directoryCount: 3,
  });
});
