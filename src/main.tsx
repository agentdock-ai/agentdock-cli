import { loadEnvFile } from "node:process";
import path from "node:path";
import { render } from "ink";
import React from "react";
import { executePrompt, resumeApproval, type ApprovalInput } from "./agent.js";
import { CliAgentRunStore } from "./agent-run-store.js";
import { createLogger } from "./logging/logger.js";
import { SessionStore } from "./session-store.js";
import { resolveModelId } from "./model-catalog.js";
import { ChatApp } from "./ui/components/ChatApp.js";
import type { ApprovalSubmit, PromptResult, SubmitPrompt, TextUpdate, ToolUpdate } from "./ui/types.js";

try {
  loadEnvFile();
} catch {
  // Shell environment variables remain supported when .env is absent.
}

const workspace = path.resolve(process.cwd(), "../agentdock");
const store = new SessionStore(path.resolve(process.cwd(), "sessions"));
const logger = createLogger().child({ module: "main" });
let modelId = resolveModelId(process.env.OPENROUTER_MODEL);

async function runCli(): Promise<void> {
  logger.info({ workspace }, "agentdock-cli starting");
  let session = await store.create(workspace);
  await store.save(session);
  logger.info({ sessionId: session.id }, "session created");

  const runPrompt: SubmitPrompt = async (
    prompt: string,
    onToolUpdate: ToolUpdate,
    onText: TextUpdate,
  ): Promise<PromptResult | null> => {
    logger.debug({ command: prompt.startsWith("/") ? prompt : undefined, promptLength: prompt.length }, "input received");
    if (prompt === "/help") return completed("/help  /mode  /runs  /inspect  /new  /tools  /clear  /exit");
    if (prompt === "/tools") return completed("read_file, list_files, search_files, write_file, update_file");
    if (prompt === "/inspect") return completed(JSON.stringify(session, null, 2));
    if (prompt === "/runs") return completed(JSON.stringify(session.runs, null, 2));
    if (prompt.startsWith("/mode ")) {
      const value = prompt.slice("/mode ".length).trim();
      if (value !== "normal" && value !== "approve-all") return completed("Usage: /mode normal|approve-all");
      session.mode = value === "approve-all" ? "approve_all" : "normal";
      await store.save(session);
      return completed(`Mode switched to ${session.mode === "approve_all" ? "Approve All" : "Normal"}`);
    }
    if (prompt === "/new") {
      session = await store.create(workspace);
      await store.save(session);
      logger.info({ sessionId: session.id }, "session created from command");
      return completed(`Started session ${session.id}`);
    }

    const runStore = new CliAgentRunStore(store, session.id);
    const { result } = await executePrompt(session, prompt, {
      modelId,
      mode: session.mode,
      runStore,
      onToolCall: (tool) => onToolUpdate({ name: tool.name, state: "running" }),
      onToolResult: (tool) => onToolUpdate({ name: tool.name, state: tool.error ? "error" : "complete" }),
      onText,
      logger,
    });
    session = await store.load(session.id);
    session.messages = result.messages;
    await store.save(session);
    return toPromptResult(result);
  };

  const approveRun: ApprovalSubmit = async (request, approved, onToolUpdate, onText) => {
    const runStore = new CliAgentRunStore(store, session.id);
    const approval: ApprovalInput = {
      runId: findRunId(session, request.approvalId),
      approvalId: request.approvalId,
      approved,
      reason: approved ? "Approved in AgentDock CLI" : "Denied in AgentDock CLI",
    };
    const { result } = await resumeApproval(session, approval, {
      modelId,
      mode: session.mode,
      runStore,
      onToolCall: (tool) => onToolUpdate({ name: tool.name, state: "running" }),
      onToolResult: (tool) => onToolUpdate({ name: tool.name, state: tool.error ? "error" : "complete" }),
      onText,
      logger,
    });
    session = await store.load(session.id);
    session.messages = result.messages;
    await store.save(session);
    return toPromptResult(result);
  };

  const instance = render(
    <ChatApp
      workspace={workspace}
      model={modelId}
      onChangeModel={(nextModel) => {
        modelId = nextModel;
      }}
      mode={session.mode}
      onToggleMode={async (mode) => {
        session.mode = mode;
        await store.save(session);
      }}
      onSubmit={runPrompt}
      onApproval={approveRun}
    />,
  );

  await instance.waitUntilExit();
  await store.save(session);
  logger.info({ sessionId: session.id }, "agentdock-cli stopped");
}

function toPromptResult(result: { content: string; runId: string; status: PromptResult["status"]; approvalRequests: PromptResult["approvalRequests"] }): PromptResult {
  return {
    content: result.content,
    runId: result.runId,
    status: result.status,
    approvalRequests: result.approvalRequests,
  };
}

function completed(content: string): PromptResult {
  return { content, runId: "", status: "completed", approvalRequests: [] };
}

function findRunId(session: { runs: Array<{ id: string; pendingApprovals: Array<{ approvalId: string }> }> }, approvalId: string): string {
  const run = session.runs.find((candidate) => candidate.pendingApprovals.some((request) => request.approvalId === approvalId));
  if (!run) throw new Error(`Approval request not found: ${approvalId}`);
  return run.id;
}

runCli().catch((error: unknown) => {
  logger.error({ err: error }, "agentdock-cli failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
