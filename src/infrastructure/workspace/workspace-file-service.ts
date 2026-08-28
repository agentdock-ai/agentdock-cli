import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { WorkspacePathResolver } from "./path-resolver.js";

export const MAX_FILE_BYTES = 256 * 1024;
export const MAX_WORKSPACE_FILES = 10_000;
export const PROTECTED_DIRECTORIES = new Set([".agentdock", ".git", "node_modules"]);

export class WorkspaceFileService {
  constructor(
    private readonly workspaceRoot: string,
    private readonly pathResolver = new WorkspacePathResolver(),
  ) {}

  async read(relativePath: string): Promise<{ path: string; content: string }> {
    const filePath = await this.resolve(relativePath);
    const info = await stat(filePath);
    this.assertSize(info.size);
    return {
      path: path.relative(this.workspaceRoot, filePath),
      content: await readFile(filePath, "utf8"),
    };
  }

  async list(): Promise<{ files: string[] }> {
    return { files: await this.filesUnder(this.workspaceRoot) };
  }

  async search(query: string): Promise<{ query: string; matches: string[] }> {
    const matches: string[] = [];
    for (const relativePath of await this.filesUnder(this.workspaceRoot)) {
      const filePath = await this.resolve(relativePath);
      const info = await stat(filePath);
      if (info.size > MAX_FILE_BYTES) continue;
      if ((await readFile(filePath, "utf8")).includes(query)) matches.push(relativePath);
    }
    return { query, matches };
  }

  async write(relativePath: string, content: string): Promise<{ path: string; bytes: number }> {
    const filePath = await this.resolve(relativePath);
    this.assertSize(Buffer.byteLength(content, "utf8"));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
    return { path: path.relative(this.workspaceRoot, filePath), bytes: Buffer.byteLength(content, "utf8") };
  }

  async update(relativePath: string, oldText: string, newText: string): Promise<{ path: string; replacements: number }> {
    const filePath = await this.resolve(relativePath);
    const info = await stat(filePath);
    this.assertSize(info.size);
    const content = await readFile(filePath, "utf8");
    if (!oldText || !content.includes(oldText)) throw new Error("oldText was not found");
    const updated = content.replace(oldText, newText);
    this.assertSize(Buffer.byteLength(updated, "utf8"));
    await writeFile(filePath, updated, "utf8");
    return { path: path.relative(this.workspaceRoot, filePath), replacements: 1 };
  }

  private async resolve(relativePath: string): Promise<string> {
    return this.pathResolver.resolve(this.workspaceRoot, relativePath, PROTECTED_DIRECTORIES);
  }

  private assertSize(bytes: number): void {
    if (bytes > MAX_FILE_BYTES) throw new Error("File exceeds the size limit");
  }

  private async filesUnder(root: string, prefix = "", state = { count: 0 }): Promise<string[]> {
    const entries = await readdir(root, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      if (PROTECTED_DIRECTORIES.has(entry.name) || entry.isSymbolicLink()) continue;
      const relative = path.join(prefix, entry.name);
      if (entry.isDirectory()) files.push(...await this.filesUnder(path.join(root, entry.name), relative, state));
      else {
        state.count += 1;
        if (state.count > MAX_WORKSPACE_FILES) throw new Error(`Workspace contains more than ${MAX_WORKSPACE_FILES} files`);
        files.push(relative);
      }
    }
    return files;
  }
}
