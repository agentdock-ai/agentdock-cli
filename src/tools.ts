import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createToolRegistry, type ToolRegistry } from "agentdock";
import { resolveWorkspacePath } from "./path-safety.js";

const MAX_FILE_BYTES = 256 * 1024;

interface ToolConfig {
  workspaceRoot: string;
}

async function filesUnder(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path.join(root, entry.name), relative));
    else files.push(relative);
  }
  return files;
}

export function createToolRegistryFor(config: ToolConfig): ToolRegistry {
  const registry = createToolRegistry();

  registry.register({
    name: "read_file",
    description: "Read a UTF-8 text file inside the workspace.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    execute: async ({ input }) => {
      const filePath = resolveWorkspacePath(config.workspaceRoot, String(input.path));
      const info = await stat(filePath);
      if (info.size > MAX_FILE_BYTES) throw new Error("File exceeds the read size limit");
      return { path: path.relative(config.workspaceRoot, filePath), content: await readFile(filePath, "utf8") };
    },
  });

  registry.register({
    name: "list_files",
    description: "List files inside the workspace, excluding dependencies and git metadata.",
    parameters: { type: "object", properties: {}, required: [] },
    execute: async () => ({ files: await filesUnder(config.workspaceRoot) }),
  });

  registry.register({
    name: "search_files",
    description: "Search text files in the workspace for a literal query.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    execute: async ({ input }) => {
      const query = String(input.query);
      const matches: string[] = [];
      for (const relative of await filesUnder(config.workspaceRoot)) {
        const filePath = resolveWorkspacePath(config.workspaceRoot, relative);
        const info = await stat(filePath);
        if (info.size > MAX_FILE_BYTES) continue;
        const content = await readFile(filePath, "utf8");
        if (content.includes(query)) matches.push(relative);
      }
      return { query, matches };
    },
  });

  registry.register({
    name: "write_file",
    description: "Create or replace a UTF-8 text file.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
    execute: async ({ input }) => {
      const filePath = resolveWorkspacePath(config.workspaceRoot, String(input.path));
      const content = String(input.content);
      if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) throw new Error("File exceeds the write size limit");
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf8");
      return { path: path.relative(config.workspaceRoot, filePath), bytes: Buffer.byteLength(content, "utf8") };
    },
  });

  registry.register({
    name: "update_file",
    description: "Replace an exact text fragment in a UTF-8 file.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, oldText: { type: "string" }, newText: { type: "string" } },
      required: ["path", "oldText", "newText"],
    },
    execute: async ({ input }) => {
      const filePath = resolveWorkspacePath(config.workspaceRoot, String(input.path));
      const content = await readFile(filePath, "utf8");
      const oldText = String(input.oldText);
      if (!oldText || !content.includes(oldText)) throw new Error("oldText was not found");
      const updated = content.replace(oldText, String(input.newText));
      await writeFile(filePath, updated, "utf8");
      return { path: path.relative(config.workspaceRoot, filePath), replacements: 1 };
    },
  });

  return registry;
}
