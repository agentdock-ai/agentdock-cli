import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isValidSessionId } from "./session-id.js";
import type { CliSession, SessionSummary } from "./session-types.js";

export class SessionStore {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly directory: string) {}

  create(workspaceRoot: string): CliSession {
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
    await this.waitForPending(id);
    return this.read(id);
  }

  async loadOrNull(id: string): Promise<CliSession | null> {
    try {
      return await this.load(id);
    } catch (error) {
      if (isFileNotFound(error)) return null;
      throw error;
    }
  }

  save(session: CliSession): Promise<void> {
    const snapshot = structuredClone(session);
    return this.enqueue(session.id, async () => {
      snapshot.updatedAt = new Date().toISOString();
      await this.write(snapshot);
    });
  }

  update<T>(
    id: string,
    updater: (session: CliSession) => T | Promise<T>,
  ): Promise<T> {
    return this.enqueue(id, async () => {
      const session = await this.read(id);
      const result = await updater(session);
      session.updatedAt = new Date().toISOString();
      await this.write(session);
      return result;
    });
  }

  async list(): Promise<SessionSummary[]> {
    await mkdir(this.directory, { recursive: true });
    const entries = await readdir(this.directory, { withFileTypes: true });
    const summaries: SessionSummary[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const session = await this.load(entry.name.slice(0, -5));
      summaries.push({
        id: session.id,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messages.length,
        runCount: session.runs.length,
      });
    }
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  filePath(id: string): string {
    if (!isValidSessionId(id)) throw new Error("Invalid session id");
    return path.join(this.directory, `${id}.json`);
  }

  private async read(id: string): Promise<CliSession> {
    const content = await readFile(this.filePath(id), "utf8");
    let value: unknown;
    try {
      value = JSON.parse(content);
    } catch {
      throw new Error(`Invalid session JSON: ${id}`);
    }

    if (!isRecord(value) || value.version !== 1 || value.id !== id) {
      throw new Error(`Invalid session file: ${id}`);
    }
    if (
      typeof value.workspaceRoot !== "string" ||
      typeof value.createdAt !== "string" ||
      typeof value.updatedAt !== "string" ||
      !Array.isArray(value.messages) ||
      !Array.isArray(value.runs)
    ) {
      throw new Error(`Invalid session shape: ${id}`);
    }
    if (value.mode !== undefined && value.mode !== "normal" && value.mode !== "approve_all") {
      throw new Error(`Invalid session mode: ${id}`);
    }

    const session = value as unknown as CliSession;
    session.mode ??= "normal";
    for (const run of session.runs) {
      if (!isRecord(run)) throw new Error(`Invalid run in session: ${id}`);
      run.messages ??= session.messages;
      run.pendingApprovals ??= [];
      run.stepsCompleted ??= 0;
      run.updatedAt ??= run.completedAt ?? run.startedAt;
    }
    return session;
  }

  private async write(session: CliSession): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const target = this.filePath(session.id);
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;

    try {
      await writeFile(temporary, `${JSON.stringify(session, null, 2)}\n`, "utf8");
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  private async waitForPending(id: string): Promise<void> {
    await this.queues.get(id)?.catch(() => undefined);
  }

  private enqueue<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const queued = previous.catch(() => undefined).then(operation);
    this.queues.set(id, queued);
    queued.then(
      () => this.clearQueue(id, queued),
      () => this.clearQueue(id, queued),
    );
    return queued;
  }

  private clearQueue(id: string, queued: Promise<unknown>): void {
    if (this.queues.get(id) === queued) this.queues.delete(id);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFileNotFound(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}
