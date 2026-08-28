import type { AgentRunResult, Message, ToolApprovalRequest } from "agentdock";
import type { ModelDefinition } from "../domain/models/model-catalog.js";
import type { CliProvider } from "../infrastructure/providers/provider-settings.js";

export interface CommandResult {
  content: string;
  runId: string;
  status: Extract<AgentRunResult["status"], "completed" | "waiting_for_approval" | "failed" | "cancelled">;
  approvalRequests: ToolApprovalRequest[];
  resetConversation?: boolean;
  mode?: "normal" | "approve_all";
  workspaceRoot?: string;
  history?: Message[];
  provider?: CliProvider;
  modelId?: string;
  modelOptions?: readonly ModelDefinition[];
}

export function completedCommand(content: string, options: Omit<CommandResult, "content" | "runId" | "status" | "approvalRequests"> & {
  approvalRequests?: ToolApprovalRequest[];
} = {}): CommandResult {
  return {
    content,
    runId: "",
    status: "completed",
    approvalRequests: [],
    ...options,
  };
}
