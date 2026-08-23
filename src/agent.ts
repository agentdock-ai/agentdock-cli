import {
  resumeStreamAgent,
  streamAgent,
  type AgentContext,
  type AgentHooks,
  type AgentRunResult,
  type AgentRunStore,
  type RunAgentOptions,
} from "agentdock";
import { createToolRegistryFor } from "./tools.js";
import type { AppLogger } from "./logging/logger.js";
import type { CliSession } from "./session-types.js";
import type { TextUpdate, ToolUpdate } from "./ui/types.js";

export interface PromptOptions {
  mode: CliSession["mode"];
  modelId?: string;
  logger: AppLogger;
  runStore: AgentRunStore;
  onToolCall?: (tool: { name: string; input: unknown }) => void;
  onToolResult?: (tool: { name: string; error?: string }) => void;
  onText?: TextUpdate;
}

export interface ApprovalInput {
  runId: string;
  approvalId: string;
  approved: boolean;
  reason?: string;
}

export async function executePrompt(
  session: CliSession,
  prompt: string,
  options: PromptOptions,
): Promise<{ result: AgentRunResult }> {
  return executeStream(session, prompt, options);
}

export async function resumeApproval(
  session: CliSession,
  approval: ApprovalInput,
  options: PromptOptions,
): Promise<{ result: AgentRunResult }> {
  return executeStream(session, "", options, approval);
}

async function executeStream(
  session: CliSession,
  prompt: string,
  options: PromptOptions,
  approval?: ApprovalInput,
): Promise<{ result: AgentRunResult }> {
  const logger = options.logger.child({ module: "agent" });
  const hooks: AgentHooks = {
    onToolCall: (tool) => {
      logger.debug({ toolName: tool.name }, "tool started");
    },
    onToolResult: (tool) => {
      logger.debug({ toolName: tool.name, error: tool.error }, "tool completed");
    },
  };
  const context: AgentContext = {
    userId: "cli-user",
    organizationId: "cli-organization",
  };
  const agentOptions: RunAgentOptions = {
    messages: session.messages,
    registry: createToolRegistryFor({
      workspaceRoot: session.workspaceRoot,
    }),
    hooks,
    modelId: options.modelId,
    permissionMode: options.mode,
    runStore: options.runStore,
    ...(options.mode === "normal"
      ? {
          permissionPolicy: {
            check: () => ({ type: "approval_required" as const }),
          },
        }
      : {}),
  };
  const promptStartedAt = Date.now();
  let chunkCount = 0;
  let textLength = 0;

  logger.info(
    { promptLength: prompt.length, modelId: options.modelId, mode: options.mode },
    approval ? "agent approval resume started" : "agent prompt started",
  );

  try {
    const response = approval
      ? await resumeStreamAgent(approval, context, agentOptions)
      : await streamAgent(prompt, context, agentOptions);

    for await (const event of response.stream) {
      const part = event as { type?: string; text?: string; toolName?: string; error?: unknown };
      if (part.type === "text-delta" && typeof part.text === "string") {
        chunkCount += 1;
        textLength += part.text.length;
        options.onText?.(part.text);
      } else if (part.type === "tool-call" && part.toolName) {
        options.onToolCall?.({ name: part.toolName, input: (event as { input?: unknown }).input });
      } else if (part.type === "tool-result" && part.toolName) {
        options.onToolResult?.({ name: part.toolName });
      } else if (part.type === "tool-error" && part.toolName) {
        options.onToolResult?.({
          name: part.toolName,
          error: String(part.error ?? "Tool execution failed"),
        });
      }
    }

    const result = await response.result;
    logger.info(
      {
        durationMs: Date.now() - promptStartedAt,
        chunkCount,
        textLength,
        toolCallCount: result.toolCalls.length,
        status: result.status,
      },
      "agent prompt completed",
    );
    return { result };
  } catch (error) {
    logger.error(
      { err: error, durationMs: Date.now() - promptStartedAt },
      "agent prompt failed",
    );
    throw error;
  }
}
