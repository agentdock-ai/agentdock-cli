import path from "node:path";
import { lstat, realpath } from "node:fs/promises";

export async function resolveWorkspacePath(
  workspaceRoot: string,
  input: string,
  blockedDirectories: ReadonlySet<string> = new Set(),
): Promise<string> {
  const root = await realpath(workspaceRoot);
  const resolved = path.resolve(root, input);
  assertInside(root, resolved, input);
  assertNotBlocked(root, resolved, input, blockedDirectories);

  let currentPath = resolved;
  while (currentPath !== root) {
    try {
      const stats = await lstat(currentPath);
      if (stats.isSymbolicLink()) {
        throw new Error(`Symbolic links are not allowed in workspace paths: ${input}`);
      }
    } catch (error) {
      if (!isFileNotFound(error)) throw error;
      currentPath = path.dirname(currentPath);
      continue;
    }
    currentPath = path.dirname(currentPath);
  }

  return resolved;
}

function assertNotBlocked(
  root: string,
  resolved: string,
  input: string,
  blockedDirectories: ReadonlySet<string>,
): void {
  const segments = path.relative(root, resolved).split(path.sep);
  if (segments.some((segment) => blockedDirectories.has(segment))) {
    throw new Error(`Protected workspace path: ${input}`);
  }
}

function assertInside(root: string, resolved: string, input: string): void {
  const relative = path.relative(root, resolved);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Path is outside the workspace: ${input}`);
  }
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
