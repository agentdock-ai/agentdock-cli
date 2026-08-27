import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CliSession } from "./session-types.js";

export class SessionStore {
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(private readonly directory: string) {}

  async create(workspaceRoot: string): Promise<CliSession> {
    const now = new Date().toISOString();
    return {
      version: 1,
      id: randomUUID(),
      workspaceRoot,
      createdAt: now,
      updatedAt: now,
      messages: [],
      runs: [],
      mode: "normal",
    };
  }

  async load(id: string): Promise<CliSession> {
    const content = await readFile(this.filePath(id), "utf8");
    const session = JSON.parse(content) as CliSession;
    if (session.version !== 1 || session.id !== id) {
      throw new Error(`Invalid session file: ${id}`);
    }
    session.mode ??= "normal";
    for (const run of session.runs) {
      run.messages ??= session.messages;
      run.pendingApprovals ??= [];
      run.stepsCompleted ??= 0;
    }
    return session;
  }

  save(session: CliSession): Promise<void> {
    const operation = this.saveQueue.then(async () => {
      await mkdir(this.directory, { recursive: true });
      session.updatedAt = new Date().toISOString();
      const target = this.filePath(session.id);
      const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;

      try {
        await writeFile(temporary, `${JSON.stringify(session, null, 2)}\n`, "utf8");
        await rename(temporary, target);
      } finally {
        await rm(temporary, { force: true }).catch(() => undefined);
      }
    });

    // Keep the queue usable after a failed write while still returning the
    // original error to the caller that initiated it.
    this.saveQueue = operation.catch(() => undefined);
    return operation;
  }

  async list(): Promise<CliSession[]> {
    await mkdir(this.directory, { recursive: true });
    const entries = await readdir(this.directory, { withFileTypes: true });
    const sessions: CliSession[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        sessions.push(await this.load(entry.name.slice(0, -5)));
      } catch {
        // Ignore incomplete or invalid files when listing sessions.
      }
    }
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  filePath(id: string): string {
    if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("Invalid session id");
    return path.join(this.directory, `${id}.json`);
  }
}
