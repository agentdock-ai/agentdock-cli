import { mkdir } from "node:fs/promises";
import type { AgentRunResult } from "agentdock";
import { SessionStore } from "../infrastructure/persistence/session-store.js";
import type { CliSession, SessionSummary } from "../domain/sessions/session-types.js";

export class SessionController {
  private activeSession: CliSession | null = null;

  constructor(
    private readonly store: SessionStore,
    private readonly defaultWorkspace: string,
  ) {}

  get current(): CliSession {
    if (!this.activeSession) throw new Error("CLI session has not been initialized");
    return this.activeSession;
  }

  async initialize(resumeSessionId?: string): Promise<CliSession> {
    this.activeSession = resumeSessionId
      ? await this.load(resumeSessionId)
      : this.store.create(this.defaultWorkspace);
    await mkdir(this.current.workspaceRoot, { recursive: true });
    if (!resumeSessionId) await this.store.save(this.current);
    return this.current;
  }

  async createNew(): Promise<CliSession> {
    this.activeSession = this.store.create(this.defaultWorkspace);
    await this.store.save(this.current);
    return this.current;
  }

  async resume(sessionId: string): Promise<CliSession> {
    this.activeSession = await this.load(sessionId);
    await mkdir(this.current.workspaceRoot, { recursive: true });
    return this.current;
  }

  async refresh(): Promise<CliSession> {
    this.activeSession = await this.store.load(this.current.id);
    return this.current;
  }

  async clearMessages(): Promise<void> {
    this.current.messages = [];
    await this.store.save(this.current);
  }

  async setMode(mode: CliSession["mode"]): Promise<void> {
    this.current.mode = mode;
    await this.store.save(this.current);
  }

  pendingApprovals(): AgentRunResult["approvalRequests"] {
    return this.current.runs
      .filter((run) => run.status === "waiting_for_approval")
      .flatMap((run) => run.pendingApprovals);
  }

  findRunId(approvalId: string): string {
    const run = this.current.runs.find((candidate) =>
      candidate.pendingApprovals.some((request) => request.approvalId === approvalId));
    if (!run) throw new Error(`Approval request not found: ${approvalId}`);
    return run.id;
  }

  async list(): Promise<SessionSummary[]> {
    return this.store.list();
  }

  private async load(sessionId: string): Promise<CliSession> {
    const session = await this.store.load(sessionId);
    if (session.workspaceRoot === this.defaultWorkspace) return session;
    await this.store.update(sessionId, (current) => {
      current.workspaceRoot = this.defaultWorkspace;
    });
    return this.store.load(sessionId);
  }
}
