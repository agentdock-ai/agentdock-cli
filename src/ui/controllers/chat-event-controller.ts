import { AgentEventType, type AgentEvent, type ToolApprovalRequest } from "agentdock";
import type { ChatMessage, ToolActivity, ToolCallState } from "../types.js";

export interface ChatEventCallbacks {
  appendText?: (text: string) => void;
  updateMessages: (updater: (current: ChatMessage[]) => ChatMessage[]) => void;
  updateToolActivity: (updater: (current: ToolActivity[]) => ToolActivity[]) => void;
  updateApprovals: (updater: (current: ToolApprovalRequest[]) => ToolApprovalRequest[]) => void;
}

export class ChatEventController {
  handle(event: AgentEvent, assistantId: string, callbacks: ChatEventCallbacks): void {
    if (event.type === AgentEventType.TextDelta) {
      callbacks.appendText?.(event.text);
      return;
    }

    if (event.type === AgentEventType.ToolCalled) {
      callbacks.updateMessages((current) => this.upsertToolMessage(current, assistantId, {
        toolCallId: event.toolCall.toolCallId,
        toolName: event.toolCall.name,
        toolInput: event.toolCall.input,
        toolState: "running",
      }));
      callbacks.updateToolActivity((current) => this.setToolActivity(current, event.toolCall.name, "running"));
      return;
    }

    if (event.type === AgentEventType.ToolResult) {
      callbacks.updateMessages((current) => this.upsertToolMessage(current, assistantId, {
        toolCallId: event.result.toolCallId,
        toolName: event.result.name,
        toolInput: event.result.input,
        toolState: "complete",
        toolOutput: event.result.output,
      }));
      callbacks.updateToolActivity((current) => this.setToolActivity(current, event.result.name, "complete"));
      return;
    }

    if (event.type === AgentEventType.ToolError || event.type === AgentEventType.ToolOutputDenied) {
      callbacks.updateMessages((current) => this.upsertToolMessage(current, assistantId, {
        toolCallId: event.toolCall.toolCallId,
        toolName: event.toolCall.name,
        toolInput: event.toolCall.input,
        toolState: "error",
        toolError: event.type === AgentEventType.ToolError ? event.error.message : "Tool output denied",
      }));
      callbacks.updateToolActivity((current) => this.setToolActivity(current, event.toolCall.name, "error"));
      return;
    }

    if (event.type === AgentEventType.ApprovalRequired) {
      callbacks.updateMessages((current) => event.approvals.reduce(
        (messages, approval) => this.upsertToolMessage(messages, assistantId, {
          toolCallId: approval.toolCall.toolCallId,
          toolName: approval.toolCall.name,
          toolInput: approval.toolCall.input,
          toolState: "approval_required",
        }),
        current,
      ));
      callbacks.updateApprovals((current) => this.mergeApprovalRequests(current, event.approvals));
      return;
    }

    if (event.type === AgentEventType.ApprovalResolved) {
      callbacks.updateMessages((current) => event.approvals.reduce(
        (messages, approval) => this.upsertToolMessage(messages, assistantId, {
          toolCallId: approval.toolCall.toolCallId,
          toolName: approval.toolCall.name,
          toolInput: approval.toolCall.input,
          toolState: "running",
        }),
        current,
      ));
    }
  }

  private setToolActivity(current: ToolActivity[], name: string, state: ToolActivity["state"]): ToolActivity[] {
    return [...current.filter((item) => item.name !== name), { name, state }];
  }

  private mergeApprovalRequests(
    current: readonly ToolApprovalRequest[],
    incoming: readonly ToolApprovalRequest[],
  ): ToolApprovalRequest[] {
    const requests = new Map(current.map((request) => [request.approvalId, request]));
    for (const request of incoming) requests.set(request.approvalId, request);
    return Array.from(requests.values());
  }

  private upsertToolMessage(
    current: readonly ChatMessage[],
    assistantId: string,
    tool: {
      toolCallId: string;
      toolName: string;
      toolInput: unknown;
      toolState: ToolCallState;
      toolOutput?: unknown;
      toolError?: string;
    },
  ): ChatMessage[] {
    const existingIndex = current.findIndex((message) => message.toolCallId === tool.toolCallId);
    if (existingIndex >= 0) {
      return current.map((message, index) => index === existingIndex ? { ...message, ...tool } : message);
    }

    const message: ChatMessage = { id: `tool-${tool.toolCallId}`, role: "system", content: "", ...tool };
    const assistantIndex = current.findIndex((candidate) => candidate.id === assistantId);
    if (assistantIndex < 0) return [...current, message];
    return [...current.slice(0, assistantIndex), message, ...current.slice(assistantIndex)];
  }
}
