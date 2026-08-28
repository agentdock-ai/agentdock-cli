import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isValidSessionId } from "../../domain/sessions/session-id.js";
import type { CliSession, SessionSummary } from "../../domain/sessions/session-types.js";
import { SessionCodec } from "./session-codec.js";

export class SessionStore {
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly codec = new SessionCodec();

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
        preview: sessionPreview(session),
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
    return this.codec.decode(content, id);
  }

  private async write(session: CliSession): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const target = this.filePath(session.id);
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;

    try {
      await writeFile(temporary, this.codec.encode(session), "utf8");
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

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function sessionPreview(session: CliSession): string {
  const message = [...session.messages]
    .reverse()
    .find((candidate) =>
      (candidate.role === "user" || candidate.role === "assistant") && candidate.content.trim(),
    );
  if (!message) return "Empty session";

  const preview = message.content.replace(/\s+/g, " ").trim();
  return preview.length > 96 ? `${preview.slice(0, 93)}...` : preview;
}
