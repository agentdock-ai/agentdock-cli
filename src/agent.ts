import {
  AgentDock,
  AgentEventType,
  createOpenRouterModel,
  type AgentContext,
  type AgentEvent,
  type AgentHooks,
  type AgentRunResult,
  type AgentRunStore,
  type ToolApprovalDecision,
} from "agentdock";
import { createToolRegistryFor } from "./tools.js";
import type { AppLogger } from "./logging/logger.js";
import type { CliSession } from "./session-types.js";
import type { AgentRunControlUpdate } from "./ui/types.js";

const MAX_AGENT_STEPS = 30;

export interface PromptOptions {
  modelId: string;
  mode: CliSession["mode"];
  logger: AppLogger;
  runStore: AgentRunStore;
  onEvent?: (event: AgentEvent) => void;
  onRunControl?: AgentRunControlUpdate;
}

export interface ApprovalInput {
  runId: string;
  approvals: ToolApprovalDecision[];
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
  const agent = new AgentDock({
    model: createOpenRouterModel({ modelId: options.modelId }),
    registry: createToolRegistryFor({ workspaceRoot: session.workspaceRoot }),
    runStore: options.runStore,
  });
  const promptStartedAt = Date.now();
  let textChunkCount = 0;
  let textLength = 0;
  let cancelledRunId: string | null = null;
  let runControlPublished = false;

  logger.info(
    { promptLength: prompt.length, modelId: options.modelId, mode: options.mode },
    approval ? "agent approval resume started" : "agent prompt started",
  );

  try {
    const response = approval
      ? await agent.resumeStream(
        {
          runId: approval.runId,
          approvals: approval.approvals,
        },
        context,
        { permissionMode: options.mode, hooks, maxSteps: MAX_AGENT_STEPS },
      )
      : await agent.stream(prompt, context, {
        messages: session.messages,
        permissionMode: options.mode,
        hooks,
        maxSteps: MAX_AGENT_STEPS,
      });

    for await (const event of response.stream) {
      if (!runControlPublished) {
        runControlPublished = true;
        options.onRunControl?.({
          runId: event.runId,
          stop: () => agent.stop(event.runId),
        });
      }
      options.onEvent?.(event);
      if (event.type === AgentEventType.RunCancelled) cancelledRunId = event.runId;
      if (event.type === AgentEventType.TextDelta) {
        textChunkCount += 1;
        textLength += event.text.length;
      }
    }

    const result = await response.result;
    logger.info(
      {
        durationMs: Date.now() - promptStartedAt,
        chunkCount: textChunkCount,
        textLength,
        toolCallCount: result.toolCalls.length,
        status: result.status,
      },
      "agent prompt completed",
    );
    return { result };
  } catch (error) {
    if (cancelledRunId) {
      const run = await options.runStore.get(cancelledRunId);
      return {
        result: {
          runId: cancelledRunId,
          status: "cancelled",
          content: "",
          messages: run?.messages ?? session.messages,
          toolCalls: [],
          toolResults: [],
          toolErrors: [],
          approvalRequests: [],
          stepsCompleted: run?.stepsCompleted ?? 0,
        },
      };
    }
    logger.error(
      { err: error, durationMs: Date.now() - promptStartedAt },
      "agent prompt failed",
    );
    throw error;
  }
}
