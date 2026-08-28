import type {
  AgentRunApprovalClaim,
  AgentRunRecord,
  AgentRunStore,
  AgentRunStatus,
  ToolApprovalDecision,
} from "agentdock";
import type { SessionStore } from "./session-store.js";
import type { CliRun } from "./session-types.js";

export class CliAgentRunStore implements AgentRunStore {
  constructor(
    private readonly sessions: SessionStore,
    private readonly sessionId: string,
  ) {}

  async get(runId: string): Promise<AgentRunRecord | null> {
    const session = await this.sessions.loadOrNull(this.sessionId);
    if (!session) return null;
    const run = session.runs.find((candidate) => candidate.id === runId);
    return run ? toAgentRun(run, session, this.sessionId) : null;
  }

  async save(record: AgentRunRecord): Promise<void> {
    assertSession(record.sessionId, this.sessionId);
    await this.sessions.update(this.sessionId, (session) => {
      if (session.runs.some((run) => run.id === record.runId)) {
        throw new Error(`CLI run already exists: ${record.runId}`);
      }
      session.runs.push(fromAgentRun(record));
    });
  }

  async update(runId: string, update: Partial<AgentRunRecord>): Promise<void> {
    await this.sessions.update(this.sessionId, (session) => {
      const index = session.runs.findIndex((run) => run.id === runId);
      if (index < 0) throw new Error(`CLI run not found: ${runId}`);
      const current = toAgentRun(session.runs[index], session, this.sessionId);
      assertUpdateIdentity(update, runId, this.sessionId);
      session.runs[index] = fromAgentRun({
        ...current,
        ...update,
        runId,
        updatedAt: Date.now(),
      });
    });
  }

  async transition(
    runId: string,
    expectedStatus: AgentRunStatus | AgentRunStatus[],
    update: Partial<AgentRunRecord>,
  ): Promise<boolean> {
    return this.sessions.update(this.sessionId, (session) => {
      const index = session.runs.findIndex((run) => run.id === runId);
      if (index < 0) return false;

      const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
      const run = session.runs[index];
      if (!expected.includes(run.status)) return false;

      const current = toAgentRun(run, session, this.sessionId);
      assertUpdateIdentity(update, runId, this.sessionId);
      session.runs[index] = fromAgentRun({
        ...current,
        ...update,
        runId,
        updatedAt: Date.now(),
      });
      return true;
    });
  }

  async claimApprovals(
    runId: string,
    decisions: ToolApprovalDecision[],
  ): Promise<AgentRunApprovalClaim | null> {
    return this.sessions.update(this.sessionId, (session) => {
      const index = session.runs.findIndex((run) => run.id === runId);
      if (index < 0) return null;

      const run = session.runs[index];
      const pendingApprovals = run.pendingApprovals ?? [];
      if (
        run.status !== "waiting_for_approval" ||
        !hasExactApprovalSet(pendingApprovals, decisions)
      ) {
        return null;
      }

      const approvals = structuredClone(pendingApprovals);
      run.status = "running";
      run.pendingApprovals = [];
      run.updatedAt = new Date().toISOString();
      run.completedAt = undefined;

      return { record: toAgentRun(run, session, this.sessionId), approvals };
    });
  }
}

function toAgentRun(
  run: CliRun,
  session: { messages: AgentRunRecord["messages"] },
  sessionId: string,
): AgentRunRecord {
  return {
    runId: run.id,
    sessionId,
    status: run.status,
    messages: structuredClone(run.messages ?? session.messages),
    pendingApprovals: structuredClone(run.pendingApprovals ?? []),
    stepsCompleted: run.stepsCompleted ?? 0,
    createdAt: Date.parse(run.startedAt),
    updatedAt: Date.parse(run.updatedAt ?? run.completedAt ?? run.startedAt),
    ...(run.error ? { error: run.error } : {}),
  };
}

function fromAgentRun(record: AgentRunRecord): CliRun {
  return {
    id: record.runId,
    startedAt: new Date(record.createdAt).toISOString(),
    updatedAt: new Date(record.updatedAt).toISOString(),
    completedAt: ["completed", "failed", "cancelled"].includes(record.status)
      ? new Date(record.updatedAt).toISOString()
      : undefined,
    status: record.status,
    messages: structuredClone(record.messages),
    pendingApprovals: structuredClone(record.pendingApprovals),
    stepsCompleted: record.stepsCompleted,
    ...(record.error ? { error: record.error } : {}),
  };
}

function assertSession(recordSessionId: string, sessionId: string): void {
  if (recordSessionId !== sessionId) {
    throw new Error(`CLI run does not belong to session: ${sessionId}`);
  }
}

function assertUpdateIdentity(
  update: Partial<AgentRunRecord>,
  runId: string,
  sessionId: string,
): void {
  if (update.runId !== undefined && update.runId !== runId) {
    throw new Error(`CLI run identity is immutable: ${runId}`);
  }
  if (update.sessionId !== undefined && update.sessionId !== sessionId) {
    throw new Error(`CLI run identity is immutable: ${runId}`);
  }
}

function hasExactApprovalSet(
  pendingApprovals: AgentRunRecord["pendingApprovals"],
  decisions: ToolApprovalDecision[],
): boolean {
  if (
    pendingApprovals.length === 0 ||
    pendingApprovals.length !== decisions.length ||
    !decisions.every(
      (decision) =>
        typeof decision.approvalId === "string" &&
        typeof decision.approved === "boolean",
    )
  ) {
    return false;
  }

  const decisionIds = new Set(decisions.map((decision) => decision.approvalId));
  return (
    decisionIds.size === decisions.length &&
    pendingApprovals.every((approval) => decisionIds.has(approval.approvalId))
  );
}
