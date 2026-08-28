import type {
  AgentRunStatus,
  Message,
  ToolApprovalRequest,
} from "agentdock";

export interface CliRun {
  id: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  status: AgentRunStatus;
  messages: Message[];
  pendingApprovals: ToolApprovalRequest[];
  stepsCompleted: number;
  error?: string;
}

export interface CliSession {
  version: 1;
  id: string;
  workspaceRoot: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  runs: CliRun[];
  latestRunId?: string;
  mode: "normal" | "approve_all";
}

export interface SessionSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  runCount: number;
  preview: string;
}
