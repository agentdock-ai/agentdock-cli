import type { AgentEvent, Message, ToolApprovalDecision, ToolApprovalRequest } from "agentdock";
import type { AgentRunControlUpdate } from "../application/contracts/app-types.js";
import type { CliProvider } from "../infrastructure/providers/provider-settings.js";
import type { ModelDefinition } from "../domain/models/model-catalog.js";

export type ToolState = "running" | "complete" | "error";
export type ToolCallState = ToolState | "approval_required";

export interface ToolActivity {
  name: string;
  state: ToolState;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolInput?: unknown;
  toolState?: ToolCallState;
  toolOutput?: unknown;
  toolError?: string;
}

export type AgentEventUpdate = (event: AgentEvent) => void;

export interface PromptResult {
  content: string;
  runId: string;
  status: "completed" | "waiting_for_approval" | "failed" | "cancelled";
  approvalRequests: ToolApprovalRequest[];
  resetConversation?: boolean;
  mode?: "normal" | "approve_all";
  workspaceRoot?: string;
  history?: Message[];
  provider?: CliProvider;
  modelId?: string;
  modelOptions?: readonly ModelDefinition[];
}

export type SubmitPrompt = (
  prompt: string,
  onEvent: AgentEventUpdate,
  onRunControl: AgentRunControlUpdate,
) => Promise<PromptResult | null>;

export type ApprovalSubmit = (
  request: ToolApprovalRequest,
  decisions: ToolApprovalDecision[],
  onEvent: AgentEventUpdate,
  onRunControl: AgentRunControlUpdate,
) => Promise<PromptResult>;
