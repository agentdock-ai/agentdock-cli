import { loadEnvFile } from "node:process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { render } from "ink";
import type { AgentRunResult } from "agentdock";
import { executePrompt, resumeApproval, type ApprovalInput } from "./agent.js";
import type { AgentRunControlUpdate } from "./app-types.js";
import { CliAgentStore } from "./agent-store.js";
import { createLogger } from "./logging/logger.js";
import { SessionStore } from "./session-store.js";
import { resolveModelId } from "./model-catalog.js";
import { ChatApp } from "./ui/components/ChatApp.js";
import type {
  AgentEventUpdate,
  ApprovalSubmit,
  PromptResult,
  SubmitPrompt,
} from "./ui/types.js";

try {
  loadEnvFile();
} catch {
  // Shell environment variables remain supported when .env is absent.
}

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.sandbox");
const store = new SessionStore(path.resolve(process.cwd(), "sessions"));
const logger = createLogger().child({ module: "main" });
let modelId = resolveModelId(process.env.OPENROUTER_MODEL);

async function runCli(): Promise<void> {
  await mkdir(workspace, { recursive: true });
  logger.info({ workspace }, "agentdock-cli starting");
  let session = await store.create(workspace);
  await store.save(session);
  logger.info({ sessionId: session.id }, "session created");
  const createAgentStore = () => new CliAgentStore(store, session.id, workspace);

  const runPrompt: SubmitPrompt = async (
    prompt: string,
    onEvent: AgentEventUpdate,
    onRunControl: AgentRunControlUpdate,
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
      return completed(`Started session ${session.id}`, true, "normal");
    }

    const { result } = await executePrompt(session, prompt, {
      modelId,
      mode: session.mode,
      store: createAgentStore(),
      onEvent,
      onRunControl,
      logger,
    });
    session = await store.load(session.id);
    return toPromptResult(result);
  };

  const approveRun: ApprovalSubmit = async (request, decisions, onEvent, onRunControl) => {
    const approval: ApprovalInput = {
      runId: findRunId(session, request.approvalId),
      approvals: decisions.map((decision) => ({
        approvalId: decision.approvalId,
        approved: decision.approved,
        reason: decision.approved ? "Approved in AgentDock CLI" : "Denied in AgentDock CLI",
      })),
    };
    const { result } = await resumeApproval(session, approval, {
      modelId,
      mode: session.mode,
      store: createAgentStore(),
      onEvent,
      onRunControl,
      logger,
    });
    session = await store.load(session.id);
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
      onClear={async () => {
        session.messages = [];
        await store.save(session);
      }}
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

function toPromptResult(result: AgentRunResult): PromptResult {
  if (result.status === "running") {
    throw new Error(`Agent run did not reach a terminal state: ${result.runId}`);
  }

  return {
    content: result.content,
    runId: result.runId,
    status: result.status,
    approvalRequests: result.approvalRequests,
  };
}

function completed(
  content: string,
  resetConversation = false,
  mode?: "normal" | "approve_all",
): PromptResult {
  return {
    content,
    runId: "",
    status: "completed",
    approvalRequests: [],
    ...(resetConversation ? { resetConversation: true } : {}),
    ...(mode ? { mode } : {}),
  };
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
