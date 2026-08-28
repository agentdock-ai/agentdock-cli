import type {
  AgentRunStore,
  AgentSessionRecord,
  AgentSessionStore,
  AgentStore,
} from "agentdock";
import { CliAgentRunStore } from "./cli-agent-run-store.js";
import type { SessionStore } from "../persistence/session-store.js";
import type { CliSession } from "../../domain/sessions/session-types.js";

export class CliAgentStore implements AgentStore {
  readonly runs: AgentRunStore;
  readonly sessions: AgentSessionStore;

  constructor(
    storage: SessionStore,
    sessionId: string,
    workspaceRoot: string,
  ) {
    this.runs = new CliAgentRunStore(storage, sessionId);
    this.sessions = new CliAgentSessionStore(storage, sessionId, workspaceRoot);
  }
}

class CliAgentSessionStore implements AgentSessionStore {
  constructor(
    private readonly storage: SessionStore,
    private readonly sessionId: string,
    private readonly workspaceRoot: string,
  ) {}

  async get(sessionId: string): Promise<AgentSessionRecord | null> {
    if (sessionId !== this.sessionId) return null;
    const session = await this.storage.loadOrNull(sessionId);
    return session ? toAgentSession(session) : null;
  }

  async save(record: AgentSessionRecord): Promise<void> {
    assertSession(record.sessionId, this.sessionId);
    const existing = await this.storage.loadOrNull(record.sessionId);
    if (existing) throw new Error(`CLI session already exists: ${record.sessionId}`);
    await this.storage.save(fromAgentSession(record, this.workspaceRoot));
  }

  async update(sessionId: string, update: Partial<AgentSessionRecord>): Promise<void> {
    assertSession(sessionId, this.sessionId);
    await this.storage.update(sessionId, (session) => {
      if (update.sessionId !== undefined) assertSession(update.sessionId, sessionId);
      if (update.messages !== undefined) session.messages = structuredClone(update.messages);
      if (update.latestRunId !== undefined) session.latestRunId = update.latestRunId;
    });
  }
}

function toAgentSession(session: CliSession): AgentSessionRecord {
  return {
    sessionId: session.id,
    messages: structuredClone(session.messages),
    ...(session.latestRunId ? { latestRunId: session.latestRunId } : {}),
    createdAt: Date.parse(session.createdAt),
    updatedAt: Date.parse(session.updatedAt),
  };
}

function fromAgentSession(record: AgentSessionRecord, workspaceRoot: string): CliSession {
  const now = new Date(record.updatedAt).toISOString();
  return {
    version: 1,
    id: record.sessionId,
    workspaceRoot,
    createdAt: new Date(record.createdAt).toISOString(),
    updatedAt: now,
    messages: structuredClone(record.messages),
    runs: [],
    ...(record.latestRunId ? { latestRunId: record.latestRunId } : {}),
    mode: "normal",
  };
}

function assertSession(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(`CLI session identity is immutable: ${expected}`);
  }
}
