import { loadEnvFile } from "node:process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { render } from "ink";
import type { AgentRunResult } from "agentdock";
import { executePrompt, resumeApproval, type ApprovalInput } from "./agent.js";
import type { AgentRunControlUpdate } from "./app-types.js";
import { CliAgentStore } from "./agent-store.js";
import { cliUsage, parseCliOptions, type CliOptions } from "./cli-options.js";
import { createLogger } from "./logging/logger.js";
import { SessionStore } from "./session-store.js";
import { isValidSessionId } from "./session-id.js";
import type { CliSession, SessionSummary } from "./session-types.js";
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

const defaultWorkspace = process.env.AGENTDOCK_DEV === "true"
  ? path.resolve(process.cwd(), ".sandbox")
  : process.cwd();
const sessionDirectory = path.resolve(defaultWorkspace, ".agentdock", "sessions");
const store = new SessionStore(sessionDirectory);
const logger = createLogger().child({ module: "main" });
let modelId = resolveModelId(process.env.OPENROUTER_MODEL);

async function runCli(options: Extract<CliOptions, { command: "run" }>): Promise<void> {
  let session = options.resumeSessionId
    ? await loadSession(options.resumeSessionId)
    : store.create(defaultWorkspace);
  await mkdir(session.workspaceRoot, { recursive: true });
  if (!options.resumeSessionId) await store.save(session);
  logger.info({ sessionId: session.id, workspace: session.workspaceRoot }, "agentdock-cli starting");
  logger.info(
    { sessionId: session.id },
    options.resumeSessionId ? "session resumed" : "session created",
  );
  const createAgentStore = () => new CliAgentStore(store, session.id, session.workspaceRoot);

  const runPrompt: SubmitPrompt = async (
    prompt: string,
    onEvent: AgentEventUpdate,
    onRunControl: AgentRunControlUpdate,
  ): Promise<PromptResult | null> => {
    logger.debug({ command: prompt.startsWith("/") ? prompt : undefined, promptLength: prompt.length }, "input received");
    if (prompt === "/help") return completed("/help  /mode  /runs  /inspect  /new  /resume  /tools  /clear  /exit");
    if (prompt === "/tools") return completed("read_file, list_files, search_files, write_file, update_file");
    if (prompt === "/inspect") return completed(JSON.stringify(session, null, 2));
    if (prompt === "/runs") return completed(JSON.stringify(session.runs, null, 2));
    if (prompt === "/resume") return completed(formatSessionList(await store.list(), session.id));
    if (prompt.startsWith("/resume ")) {
      const resumeSessionId = prompt.slice("/resume ".length).trim();
      if (!isValidSessionId(resumeSessionId)) {
        return completed("Usage: /resume <session-id>");
      }
      const resumed = await loadSession(resumeSessionId);
      await mkdir(resumed.workspaceRoot, { recursive: true });
      session = resumed;
      logger.info({ sessionId: session.id }, "session resumed from command");
      return completed(
        `Resumed session ${session.id}`,
        true,
        session.mode,
        session.workspaceRoot,
        session.runs
          .filter((run) => run.status === "waiting_for_approval")
          .flatMap((run) => run.pendingApprovals),
        session.messages,
      );
    }
    if (prompt.startsWith("/mode ")) {
      const value = prompt.slice("/mode ".length).trim();
      if (value !== "normal" && value !== "approve-all") return completed("Usage: /mode normal|approve-all");
      session.mode = value === "approve-all" ? "approve_all" : "normal";
      await store.save(session);
      return completed(`Mode switched to ${session.mode === "approve_all" ? "Approve All" : "Normal"}`);
    }
    if (prompt === "/new") {
      session = store.create(defaultWorkspace);
      await store.save(session);
      logger.info({ sessionId: session.id }, "session created from command");
      return completed(`Started session ${session.id}`, true, "normal", session.workspaceRoot);
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
      workspace={session.workspaceRoot}
      model={modelId}
      onChangeModel={(nextModel) => {
        modelId = nextModel;
      }}
      mode={session.mode}
      initialHistory={session.messages}
      initialApprovals={pendingApprovals(session)}
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

  try {
    await instance.waitUntilExit();
  } finally {
    const latest = await store.loadOrNull(session.id);
    if (latest) session = latest;
    logger.info({ sessionId: session.id }, "agentdock-cli stopped");
    console.log(`\nSession saved: ${session.id}`);
    console.log("Resume with:");
    console.log(`  yarn dev --resume ${session.id}`);
    console.log(`  agentdock --resume ${session.id}`);
  }
}

async function loadSession(sessionId: string) {
  const session = await store.load(sessionId);
  if (session.workspaceRoot === defaultWorkspace) return session;

  await store.update(sessionId, (current) => {
    current.workspaceRoot = defaultWorkspace;
  });
  return store.load(sessionId);
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
  workspaceRoot?: string,
  approvalRequests: AgentRunResult["approvalRequests"] = [],
  history?: AgentRunResult["messages"],
): PromptResult {
  return {
    content,
    runId: "",
    status: "completed",
    approvalRequests,
    ...(resetConversation ? { resetConversation: true } : {}),
    ...(mode ? { mode } : {}),
    ...(workspaceRoot ? { workspaceRoot } : {}),
    ...(history ? { history } : {}),
  };
}

function formatSessionList(sessions: SessionSummary[], currentSessionId: string): string {
  if (sessions.length === 0) return "No saved sessions found.";

  return [
    "Saved sessions:",
    ...sessions.map((session) => {
      const current = session.id === currentSessionId ? " (current)" : "";
      return [
        `- ${session.id}${current}  updated ${session.updatedAt}  messages=${session.messageCount}  runs=${session.runCount}`,
        `  ↳ ${session.preview}`,
      ].join("\n");
    }),
    "",
    "Use /resume <session-id> to switch sessions.",
  ].join("\n");
}

function pendingApprovals(session: CliSession): AgentRunResult["approvalRequests"] {
  return session.runs
    .filter((run) => run.status === "waiting_for_approval")
    .flatMap((run) => run.pendingApprovals);
}

function findRunId(session: { runs: Array<{ id: string; pendingApprovals: Array<{ approvalId: string }> }> }, approvalId: string): string {
  const run = session.runs.find((candidate) => candidate.pendingApprovals.some((request) => request.approvalId === approvalId));
  if (!run) throw new Error(`Approval request not found: ${approvalId}`);
  return run.id;
}

async function main(): Promise<void> {
  try {
    const options = parseCliOptions(process.argv.slice(2));
    if (options.command === "help") {
      console.log(cliUsage);
      return;
    }
    await runCli(options);
  } catch (error: unknown) {
    logger.error({ err: error }, "agentdock-cli failed");
    console.error(error instanceof Error ? error.message : String(error));
    console.error(cliUsage);
    process.exitCode = 1;
  }
}

void main();
