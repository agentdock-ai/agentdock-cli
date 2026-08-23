import type {
  Message,
  ToolApprovalRequest,
  ToolCallRecord,
  ToolErrorRecord,
  ToolResultRecord,
} from "agentdock";

export interface CliRun {
  id: string;
  prompt: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "waiting_for_approval" | "completed" | "failed" | "cancelled";
  messages: Message[];
  pendingApprovals: ToolApprovalRequest[];
  stepsCompleted: number;
  content?: string;
  toolCalls: ToolCallRecord[];
  toolResults: ToolResultRecord[];
  toolErrors: ToolErrorRecord[];
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
  mode: "normal" | "approve_all";
}
