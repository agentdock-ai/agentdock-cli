import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { WorkspacePathResolver } from "./path-resolver.js";
import { MAX_FILE_BYTES } from "./workspace-policy.js";
import { WorkspaceTreeBuilder, type WorkspaceFileTree } from "./workspace-tree-builder.js";

export class WorkspaceFileService {
  private workspaceRootPath: Promise<string> | null = null;

  constructor(
    private readonly workspaceRoot: string,
    private readonly pathResolver = new WorkspacePathResolver(),
    private readonly treeBuilder = new WorkspaceTreeBuilder(workspaceRoot),
  ) {}

  async read(relativePath: string): Promise<{ path: string; content: string }> {
    const filePath = await this.resolve(relativePath);
    const info = await stat(filePath);
    this.assertSize(info.size);
    return {
      path: await this.relativePath(filePath),
      content: await readFile(filePath, "utf8"),
    };
  }

  async list(): Promise<WorkspaceFileTree> {
    return this.treeBuilder.build();
  }

  async search(query: string): Promise<{ query: string; matches: string[] }> {
    const matches: string[] = [];
    const tree = await this.treeBuilder.build();
    for (const relativePath of this.treeBuilder.filePaths(tree)) {
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
    return { path: await this.relativePath(filePath), bytes: Buffer.byteLength(content, "utf8") };
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
    return { path: await this.relativePath(filePath), replacements: 1 };
  }

  private async resolve(relativePath: string): Promise<string> {
    return this.pathResolver.resolve(this.workspaceRoot, relativePath);
  }

  private async relativePath(filePath: string): Promise<string> {
    this.workspaceRootPath ??= realpath(this.workspaceRoot);
    return path.relative(await this.workspaceRootPath, filePath);
  }

  private assertSize(bytes: number): void {
    if (bytes > MAX_FILE_BYTES) throw new Error("File exceeds the size limit");
  }

}
