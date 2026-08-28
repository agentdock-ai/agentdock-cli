import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { type AgentEvent, type Message as AgentMessage, type ToolApprovalDecision, type ToolApprovalRequest } from "agentdock";
import { AgentHeader } from "./AgentHeader.js";
import { ApprovalPrompt } from "./ApprovalPrompt.js";
import { ChatInput } from "./ChatInput.js";
import { Message } from "./Message.js";
import type { AgentRunControl } from "../../application/contracts/app-types.js";
import type { CliProvider } from "../../infrastructure/providers/provider-settings.js";
import type { ApprovalSubmit, ChatMessage, PromptResult, SubmitPrompt, ToolActivity } from "../types.js";
import { toChatHistory } from "../session-history.js";
import { Spinner } from "./Spinner.js";
import { ChatRequestController } from "../controllers/chat-request-controller.js";
import { ChatEventController } from "../controllers/chat-event-controller.js";
import { modelOptionsFor } from "../slash-commands.js";
import { modelCatalog } from "../../domain/models/model-catalog.js";

interface ChatAppProps {
  workspace: string;
  provider: CliProvider;
  model: string;
  onChangeModel: (model: string) => void | Promise<void>;
  mode: "normal" | "approve_all";
  onToggleMode: (mode: "normal" | "approve_all") => void | Promise<void>;
  onClear: () => void | Promise<void>;
  onSubmit: SubmitPrompt;
  onApproval: ApprovalSubmit;
  initialHistory?: AgentMessage[];
  initialApprovals?: ToolApprovalRequest[];
}

export function ChatApp({
  workspace,
  provider,
  model,
  onChangeModel,
  mode,
  onToggleMode,
  onClear,
  onSubmit,
  onApproval,
  initialHistory = [],
  initialApprovals = [],
}: ChatAppProps): React.ReactElement {
  const { exit } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>(() => toChatHistory(initialHistory));
  const [toolActivity, setToolActivity] = useState<ToolActivity[]>([]);
  const [busy, setBusy] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<ToolApprovalRequest[]>(initialApprovals);
  const [approvalDecisions, setApprovalDecisions] = useState<ToolApprovalDecision[]>([]);
  const [activeMode, setActiveMode] = useState(mode);
  const [activeProvider, setActiveProvider] = useState(provider);
  const [activeModel, setActiveModel] = useState(model);
  const [activeWorkspace, setActiveWorkspace] = useState(workspace);
  const [modelOptions, setModelOptions] = useState(() => modelOptionsFor(modelCatalog));
  const [runControl, setRunControl] = useState<AgentRunControl | null>(null);
  const [stopRequested, setStopRequested] = useState(false);
  const pendingApproval = pendingApprovals[0] ?? null;
  const eventController = useMemo(() => new ChatEventController(), []);
  const requestController = useMemo(
    () => new ChatRequestController(onSubmit, onApproval),
    [onApproval, onSubmit],
  );

  useEffect(() => {
    setActiveMode(mode);
  }, [mode]);

  useEffect(() => {
    setActiveModel(model);
  }, [model]);

  useEffect(() => {
    setActiveWorkspace(workspace);
  }, [workspace]);

  const selectModel = useCallback((nextModel: string) => {
    setActiveModel(nextModel);
    void onChangeModel(nextModel);
  }, [onChangeModel]);

  useInput((_, key) => {
    if (key.escape && busy && runControl && !stopRequested) {
      setStopRequested(true);
      void runControl.stop().catch(() => {
        setStopRequested(false);
      });
      return;
    }
    if (key.tab && key.shift && !busy && !pendingApproval) {
      const nextMode = activeMode === "normal" ? "approve_all" : "normal";
      setActiveMode(nextMode);
      void onToggleMode(nextMode);
    }
  });

  const updateAssistant = useCallback((id: string, content: string) => {
    setMessages((current) =>
      current.map((message) => (message.id === id ? { ...message, content } : message)),
    );
  }, []);

  const applyResult = useCallback((assistantId: string, streamedContent: string, response: PromptResult | null) => {
    const finalContent = response?.content || streamedContent;
    if (response?.mode) setActiveMode(response.mode);
    if (response?.provider) setActiveProvider(response.provider);
    if (response?.modelId) setActiveModel(response.modelId);
    if (response?.modelOptions) setModelOptions(modelOptionsFor(response.modelOptions));
    if (response?.workspaceRoot) setActiveWorkspace(response.workspaceRoot);
    if (response?.resetConversation) {
      const history = response.history ? toChatHistory(response.history) : [];
      const resumedMessages = [...history];
      if (finalContent) resumedMessages.push({ id: assistantId, role: "assistant", content: finalContent });
      setMessages(resumedMessages);
      setPendingApprovals(response.approvalRequests);
      setApprovalDecisions([]);
      return;
    }

    if (finalContent) updateAssistant(assistantId, finalContent);
    else if (!response?.approvalRequests.length) {
      setMessages((current) => current.filter((message) => message.id !== assistantId));
    }

    setPendingApprovals(response?.approvalRequests ?? []);
    setApprovalDecisions([]);
  }, [updateAssistant]);

  const handleAgentEvent = useCallback((event: AgentEvent, assistantId: string): void => {
    eventController.handle(event, assistantId, {
      updateMessages: setMessages,
      updateToolActivity: setToolActivity,
      updateApprovals: setPendingApprovals,
    });
  }, [eventController]);

  const submit = useCallback(async (prompt: string) => {
    if (busy || pendingApproval) return;
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: prompt }]);

    if (prompt === "/exit" || prompt === "/quit") {
      exit();
      return;
    }
    if (prompt === "/clear") {
      try {
        await onClear();
        setMessages([]);
      } catch (error) {
        setMessages([{ id: crypto.randomUUID(), role: "system", content: error instanceof Error ? error.message : String(error) }]);
      }
      return;
    }

    const assistantId = crypto.randomUUID();
    setMessages((current) => [...current, { id: assistantId, role: "assistant", content: "" }]);
    setRunControl(null);
    setStopRequested(false);
    setBusy(true);
    setToolActivity([]);

    try {
      const { response, streamedContent } = await requestController.submit(prompt, {
        onEvent: (event) => handleAgentEvent(event, assistantId),
        onRunControl: setRunControl,
        onText: (content) => updateAssistant(assistantId, content),
      });
      applyResult(assistantId, streamedContent, response);
    } catch (error) {
      setMessages((current) => current.map((message) => message.id === assistantId
        ? { ...message, role: "system", content: error instanceof Error ? error.message : String(error) }
        : message));
    } finally {
      setRunControl(null);
      setStopRequested(false);
      setBusy(false);
      setToolActivity([]);
    }
  }, [applyResult, busy, exit, handleAgentEvent, onClear, pendingApproval, requestController, updateAssistant]);

  const decideApproval = useCallback(async (approved: boolean) => {
    if (!pendingApproval || busy) return;
    const request = pendingApproval;
    const assistantId = [...messages].reverse().find((message) => message.role === "assistant")?.id;
    if (!assistantId) return;

    const decisions = [...approvalDecisions, { approvalId: request.approvalId, approved }];
    const remainingApprovals = pendingApprovals.slice(1);
    if (remainingApprovals.length > 0) {
      setPendingApprovals(remainingApprovals);
      setApprovalDecisions(decisions);
      return;
    }

    setPendingApprovals([]);
    setApprovalDecisions([]);
    setRunControl(null);
    setStopRequested(false);
    setBusy(true);
    setToolActivity([]);

    try {
      const { response, streamedContent } = await requestController.approve(request, decisions, {
        onEvent: (event) => handleAgentEvent(event, assistantId),
        onRunControl: setRunControl,
        onText: (content) => updateAssistant(assistantId, content),
      });
      applyResult(assistantId, streamedContent, response);
    } catch (error) {
      setMessages((current) => current.map((message) => message.id === assistantId
        ? { ...message, role: "system", content: error instanceof Error ? error.message : String(error) }
        : message));
    } finally {
      setRunControl(null);
      setStopRequested(false);
      setBusy(false);
      setToolActivity([]);
    }
  }, [approvalDecisions, applyResult, busy, handleAgentEvent, messages, pendingApproval, pendingApprovals, requestController, updateAssistant]);

  return (
    <>
      <AgentHeader provider={activeProvider} workspace={activeWorkspace} model={activeModel} mode={activeMode} />
      <Box flexDirection="column">
        {messages.map((message) => <Message key={message.id} message={message} />)}
      </Box>
      {pendingApproval && !busy && <ApprovalPrompt request={pendingApproval} onDecision={decideApproval} />}
      <Box flexDirection="column" marginTop={1}>
        {busy && <Spinner toolActivity={toolActivity} />}
        <ChatInput
          disabled={busy || Boolean(pendingApproval)}
          selectedModel={activeModel}
          onSelectModel={selectModel}
          modelOptions={modelOptions}
          onSubmit={submit}
        />
        <Box paddingX={2}>
          <TextMode mode={activeMode} />
        </Box>
      </Box>
    </>
  );
}

function TextMode({ mode }: { mode: "normal" | "approve_all" }): React.ReactElement {
  return (
    <Text color="gray">
      Mode: {mode === "approve_all" ? "Approve All" : "Normal"} · Shift+Tab to switch
    </Text>
  );
}
