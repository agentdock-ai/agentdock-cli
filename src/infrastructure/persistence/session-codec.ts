import type {
  AgentRunStatus,
  Message,
  ToolApprovalRequest,
  ToolApprovalResponse,
  ToolCallRecord,
  ToolResultRecord,
} from "agentdock";
import type { CliRun, CliSession } from "../../domain/sessions/session-types.js";

const runStatuses = new Set<string>([
  "running",
  "waiting_for_approval",
  "completed",
  "failed",
  "cancelled",
]);

interface MessageMetadata {
  id?: string;
  active?: boolean;
  compacted?: boolean;
}

export class SessionCodec {
  decode(content: string, expectedId: string): CliSession {
    let value: unknown;
    try {
      value = JSON.parse(content);
    } catch {
      throw new Error(`Invalid session JSON: ${expectedId}`);
    }

    if (!isRecord(value) || value.version !== 1 || value.id !== expectedId) {
      throw new Error(`Invalid session file: ${expectedId}`);
    }
    if (value.mode !== undefined && value.mode !== "normal" && value.mode !== "approve_all") {
      throw new Error(`Invalid session mode: ${expectedId}`);
    }
    if (value.latestRunId !== undefined && typeof value.latestRunId !== "string") {
      throw new Error(`Invalid latestRunId: ${expectedId}`);
    }

    const messages = this.readMessages(value.messages, "messages", expectedId);
    return {
      version: 1,
      id: expectedId,
      workspaceRoot: this.requiredString(value.workspaceRoot, "workspaceRoot", expectedId),
      createdAt: this.requiredTimestamp(value.createdAt, "createdAt", expectedId),
      updatedAt: this.requiredTimestamp(value.updatedAt, "updatedAt", expectedId),
      messages,
      runs: this.readRuns(value.runs, messages, expectedId),
      mode: value.mode ?? "normal",
      ...(value.latestRunId ? { latestRunId: value.latestRunId } : {}),
    };
  }

  encode(session: CliSession): string {
    return `${JSON.stringify(session, null, 2)}\n`;
  }

  private readRuns(value: unknown, sessionMessages: Message[], sessionId: string): CliRun[] {
    if (!Array.isArray(value)) throw new Error(`Invalid runs: ${sessionId}`);
    return value.map((candidate, index) => {
      if (!isRecord(candidate)) throw new Error(`Invalid run ${index}: ${sessionId}`);
      const id = this.requiredString(candidate.id, "id", sessionId);
      const startedAt = this.requiredTimestamp(candidate.startedAt, "startedAt", sessionId);
      const status = candidate.status;
      if (!isAgentRunStatus(status)) {
        throw new Error(`Invalid run status: ${sessionId}`);
      }
      const updatedAt = candidate.updatedAt === undefined
        ? candidate.completedAt === undefined
          ? startedAt
          : this.requiredTimestamp(candidate.completedAt, "completedAt", sessionId)
        : this.requiredTimestamp(candidate.updatedAt, "updatedAt", sessionId);
      const completedAt = candidate.completedAt === undefined
        ? undefined
        : this.requiredTimestamp(candidate.completedAt, "completedAt", sessionId);
      const stepsCompleted = candidate.stepsCompleted === undefined ? 0 : candidate.stepsCompleted;
      if (typeof stepsCompleted !== "number" || !Number.isInteger(stepsCompleted) || stepsCompleted < 0) {
        throw new Error(`Invalid run stepsCompleted: ${sessionId}`);
      }
      if (candidate.error !== undefined && typeof candidate.error !== "string") {
        throw new Error(`Invalid run error: ${sessionId}`);
      }

      return {
        id,
        startedAt,
        updatedAt,
        status,
        messages: candidate.messages === undefined
          ? structuredClone(sessionMessages)
          : this.readMessages(candidate.messages, `run ${id} messages`, sessionId),
        pendingApprovals: candidate.pendingApprovals === undefined
          ? []
          : this.readApprovalRequests(candidate.pendingApprovals, sessionId),
        stepsCompleted,
        ...(completedAt ? { completedAt } : {}),
        ...(candidate.error ? { error: candidate.error } : {}),
      };
    });
  }

  private readMessages(value: unknown, field: string, sessionId: string): Message[] {
    if (!Array.isArray(value)) throw new Error(`Invalid ${field}: ${sessionId}`);
    return value.map((candidate, index) => this.readMessage(candidate, `${field}[${index}]`, sessionId));
  }

  private readMessage(value: unknown, field: string, sessionId: string): Message {
    if (!isRecord(value) || typeof value.role !== "string" || typeof value.content !== "string") {
      throw new Error(`Invalid message at ${field}: ${sessionId}`);
    }
    const metadata = this.readMetadata(value, field, sessionId);
    if (value.role === "user" || value.role === "system") {
      return { role: value.role, content: value.content, ...metadata };
    }
    if (value.role === "assistant") {
      const toolCalls = value.toolCalls === undefined ? undefined : this.readToolCalls(value.toolCalls, sessionId);
      const approvalRequests = value.approvalRequests === undefined
        ? undefined
        : this.readApprovalRequests(value.approvalRequests, sessionId);
      return {
        role: "assistant",
        content: value.content,
        ...metadata,
        ...(toolCalls ? { toolCalls } : {}),
        ...(approvalRequests ? { approvalRequests } : {}),
      };
    }
    if (value.role === "tool") {
      const toolResults = this.readToolResults(value.toolResults, sessionId);
      const approvalResponses = value.approvalResponses === undefined
        ? undefined
        : this.readApprovalResponses(value.approvalResponses, sessionId);
      return {
        role: "tool",
        content: value.content,
        toolResults,
        ...metadata,
        ...(approvalResponses ? { approvalResponses } : {}),
      };
    }
    throw new Error(`Invalid message role at ${field}: ${sessionId}`);
  }

  private readMetadata(value: Record<string, unknown>, field: string, sessionId: string): MessageMetadata {
    for (const key of ["id", "active", "compacted"] as const) {
      const item = value[key];
      const expectedType = key === "id" ? "string" : "boolean";
      if (item !== undefined && typeof item !== expectedType) {
        throw new Error(`Invalid message ${key} at ${field}: ${sessionId}`);
      }
    }
    return {
      ...(typeof value.id === "string" ? { id: value.id } : {}),
      ...(typeof value.active === "boolean" ? { active: value.active } : {}),
      ...(typeof value.compacted === "boolean" ? { compacted: value.compacted } : {}),
    };
  }

  private readToolCalls(value: unknown, sessionId: string): ToolCallRecord[] {
    if (!Array.isArray(value)) throw new Error(`Invalid tool calls: ${sessionId}`);
    return value.map((candidate) => this.readToolCall(candidate, sessionId));
  }

  private readToolCall(value: unknown, sessionId: string): ToolCallRecord {
    if (!isRecord(value) || typeof value.toolCallId !== "string" || typeof value.name !== "string") {
      throw new Error(`Invalid tool call: ${sessionId}`);
    }
    return { toolCallId: value.toolCallId, name: value.name, input: value.input };
  }

  private readToolResults(value: unknown, sessionId: string): ToolResultRecord[] {
    if (!Array.isArray(value)) throw new Error(`Invalid tool results: ${sessionId}`);
    return value.map((candidate) => {
      if (!isRecord(candidate) || typeof candidate.toolCallId !== "string" || typeof candidate.name !== "string") {
        throw new Error(`Invalid tool result: ${sessionId}`);
      }
      if (candidate.isError !== undefined && typeof candidate.isError !== "boolean") {
        throw new Error(`Invalid tool result error flag: ${sessionId}`);
      }
      return {
        toolCallId: candidate.toolCallId,
        name: candidate.name,
        input: candidate.input,
        output: candidate.output,
        ...(typeof candidate.isError === "boolean" ? { isError: candidate.isError } : {}),
      };
    });
  }

  private readApprovalRequests(value: unknown, sessionId: string): ToolApprovalRequest[] {
    if (!Array.isArray(value)) throw new Error(`Invalid approval requests: ${sessionId}`);
    return value.map((candidate) => {
      if (!isRecord(candidate) || typeof candidate.approvalId !== "string") {
        throw new Error(`Invalid approval request: ${sessionId}`);
      }
      return { approvalId: candidate.approvalId, toolCall: this.readToolCall(candidate.toolCall, sessionId) };
    });
  }

  private readApprovalResponses(value: unknown, sessionId: string): ToolApprovalResponse[] {
    if (!Array.isArray(value)) throw new Error(`Invalid approval responses: ${sessionId}`);
    return value.map((candidate) => {
      if (!isRecord(candidate) || typeof candidate.approvalId !== "string" || typeof candidate.approved !== "boolean") {
        throw new Error(`Invalid approval response: ${sessionId}`);
      }
      if (candidate.reason !== undefined && typeof candidate.reason !== "string") {
        throw new Error(`Invalid approval response reason: ${sessionId}`);
      }
      return {
        approvalId: candidate.approvalId,
        approved: candidate.approved,
        ...(typeof candidate.reason === "string" ? { reason: candidate.reason } : {}),
        toolCall: this.readToolCall(candidate.toolCall, sessionId),
      };
    });
  }

  private requiredString(value: unknown, field: string, sessionId: string): string {
    if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid ${field}: ${sessionId}`);
    return value;
  }

  private requiredTimestamp(value: unknown, field: string, sessionId: string): string {
    const timestamp = this.requiredString(value, field, sessionId);
    if (!Number.isFinite(Date.parse(timestamp))) throw new Error(`Invalid ${field}: ${sessionId}`);
    return timestamp;
  }
}

function isAgentRunStatus(value: unknown): value is AgentRunStatus {
  return typeof value === "string" && runStatuses.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
