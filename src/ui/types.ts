import type { ToolApprovalRequest } from "agentdock";

export type ToolState = "running" | "complete" | "error";

export interface ToolActivity {
  name: string;
  state: ToolState;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

export type ToolUpdate = (activity: ToolActivity) => void;
export type TextUpdate = (text: string) => void;

export interface PromptResult {
  content: string;
  runId: string;
  status: "completed" | "waiting_for_approval" | "failed" | "cancelled";
  approvalRequests: ToolApprovalRequest[];
}

export type SubmitPrompt = (
  prompt: string,
  onToolUpdate: ToolUpdate,
  onText: TextUpdate,
) => Promise<PromptResult | null>;

export type ApprovalSubmit = (
  request: ToolApprovalRequest,
  approved: boolean,
  onToolUpdate: ToolUpdate,
  onText: TextUpdate,
) => Promise<PromptResult>;
