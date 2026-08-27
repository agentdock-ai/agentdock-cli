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
    const session = await this.sessions.load(this.sessionId);
    const run = session.runs.find((candidate) => candidate.id === runId);
    return run ? toAgentRun(run, session) : null;
  }

  async save(record: AgentRunRecord): Promise<void> {
    const session = await this.sessions.load(this.sessionId);
    const existingIndex = session.runs.findIndex((run) => run.id === record.runId);
    const cliRun = fromAgentRun(record);
    if (existingIndex >= 0) session.runs[existingIndex] = cliRun;
    else session.runs.push(cliRun);
    await this.sessions.save(session);
  }

  async update(runId: string, update: Partial<AgentRunRecord>): Promise<void> {
    const session = await this.sessions.load(this.sessionId);
    const index = session.runs.findIndex((run) => run.id === runId);
    if (index < 0) throw new Error(`CLI run not found: ${runId}`);
    const current = toAgentRun(session.runs[index], session);
    session.runs[index] = fromAgentRun({ ...current, ...update, runId });
    await this.sessions.save(session);
  }

  async transition(
    runId: string,
    expectedStatus: AgentRunStatus | AgentRunStatus[],
    update: Partial<AgentRunRecord>,
  ): Promise<boolean> {
    const session = await this.sessions.load(this.sessionId);
    const index = session.runs.findIndex((run) => run.id === runId);
    if (index < 0) return false;

    const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
    const run = session.runs[index];
    if (!expected.includes(run.status)) return false;

    const current = toAgentRun(run, session);
    session.runs[index] = fromAgentRun({ ...current, ...update, runId });
    await this.sessions.save(session);
    return true;
  }

  async claimApprovals(
    runId: string,
    decisions: ToolApprovalDecision[],
  ): Promise<AgentRunApprovalClaim | null> {
    const session = await this.sessions.load(this.sessionId);
    const index = session.runs.findIndex((run) => run.id === runId);
    if (index < 0) return null;

    const run = session.runs[index];
    const pendingApprovals = run.pendingApprovals ?? [];
    if (
      run.status !== "waiting_for_approval"
      || pendingApprovals.length === 0
      || pendingApprovals.length !== decisions.length
    ) {
      return null;
    }

    const decisionIds = new Set(decisions.map((decision) => decision.approvalId));
    if (decisionIds.size !== decisions.length || !pendingApprovals.every((approval) => decisionIds.has(approval.approvalId))) {
      return null;
    }

    const approvals = structuredClone(pendingApprovals);
    run.status = "running";
    run.pendingApprovals = [];
    run.completedAt = undefined;
    await this.sessions.save(session);

    return {
      record: toAgentRun(run, session),
      approvals,
    };
  }
}

function toAgentRun(run: CliRun, session: { messages: AgentRunRecord["messages"] }): AgentRunRecord {
  return {
    runId: run.id,
    status: run.status,
    messages: run.messages ?? session.messages,
    pendingApprovals: run.pendingApprovals ?? [],
    stepsCompleted: run.stepsCompleted ?? 0,
    createdAt: Date.parse(run.startedAt),
    updatedAt: Date.parse(run.completedAt ?? run.startedAt),
    ...(run.error ? { error: run.error } : {}),
  };
}

function fromAgentRun(record: AgentRunRecord): CliRun {
  return {
    id: record.runId,
    prompt: "",
    startedAt: new Date(record.createdAt).toISOString(),
    completedAt: ["completed", "failed", "cancelled"].includes(record.status)
      ? new Date(record.updatedAt).toISOString()
      : undefined,
    status: record.status,
    messages: record.messages,
    pendingApprovals: record.pendingApprovals,
    stepsCompleted: record.stepsCompleted,
    toolCalls: [],
    toolResults: [],
    toolErrors: [],
    ...(record.error ? { error: record.error } : {}),
  };
}
