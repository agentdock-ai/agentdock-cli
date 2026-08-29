import { readdir } from "node:fs/promises";
import path from "node:path";
import { MAX_WORKSPACE_FILES } from "./workspace-policy.js";

export type WorkspaceTreeNode =
  | { name: string; path: string; type: "file" }
  | { name: string; path: string; type: "directory"; children: WorkspaceTreeNode[] };

export interface WorkspaceFileTree {
  root: ".";
  entries: WorkspaceTreeNode[];
  fileCount: number;
  directoryCount: number;
}

export class WorkspaceTreeBuilder {
  constructor(private readonly workspaceRoot: string) {}

  async build(): Promise<WorkspaceFileTree> {
    const state = { fileCount: 0, directoryCount: 0 };
    const entries = await this.readDirectory(this.workspaceRoot, "", state);
    return {
      root: ".",
      entries,
      fileCount: state.fileCount,
      directoryCount: state.directoryCount,
    };
  }

  filePaths(tree: WorkspaceFileTree): string[] {
    return tree.entries.flatMap((entry) => this.collectFiles(entry));
  }

  private async readDirectory(
    directoryPath: string,
    prefix: string,
    state: { fileCount: number; directoryCount: number },
  ): Promise<WorkspaceTreeNode[]> {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    entries.sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1;
      return left.name.localeCompare(right.name);
    });

    const nodes: WorkspaceTreeNode[] = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;

      const relativePath = path.join(prefix, entry.name);
      if (entry.isDirectory()) {
        state.directoryCount += 1;
        nodes.push({
          name: entry.name,
          path: relativePath,
          type: "directory",
          children: await this.readDirectory(path.join(directoryPath, entry.name), relativePath, state),
        });
        continue;
      }

      state.fileCount += 1;
      if (state.fileCount > MAX_WORKSPACE_FILES) {
        throw new Error(`Workspace contains more than ${MAX_WORKSPACE_FILES} files`);
      }
      nodes.push({ name: entry.name, path: relativePath, type: "file" });
    }
    return nodes;
  }

  private collectFiles(entry: WorkspaceTreeNode): string[] {
    return entry.type === "file"
      ? [entry.path]
      : entry.children.flatMap((child) => this.collectFiles(child));
  }
}
