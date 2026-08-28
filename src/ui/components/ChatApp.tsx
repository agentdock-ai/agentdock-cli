import React, { useCallback, useEffect, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { AgentEventType, type AgentEvent, type Message as AgentMessage, type ToolApprovalDecision, type ToolApprovalRequest } from "agentdock";
import { AgentHeader } from "./AgentHeader.js";
import { ApprovalPrompt } from "./ApprovalPrompt.js";
import { ChatInput } from "./ChatInput.js";
import { Message } from "./Message.js";
import type { AgentRunControl } from "../../app-types.js";
import type { ApprovalSubmit, ChatMessage, PromptResult, SubmitPrompt, ToolActivity, ToolCallState } from "../types.js";
import { toChatHistory } from "../session-history.js";
import { Spinner } from "./Spinner.js";

interface ChatAppProps {
  workspace: string;
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
  const [activeModel, setActiveModel] = useState(model);
  const [activeWorkspace, setActiveWorkspace] = useState(workspace);
  const [runControl, setRunControl] = useState<AgentRunControl | null>(null);
  const [stopRequested, setStopRequested] = useState(false);
  const pendingApproval = pendingApprovals[0] ?? null;

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

  const handleAgentEvent = useCallback((
    event: AgentEvent,
    assistantId: string,
    appendText: (text: string) => void,
  ): void => {
    if (event.type === AgentEventType.TextDelta) {
      appendText(event.text);
      return;
    }

    if (event.type === AgentEventType.ToolCalled) {
      setMessages((current) => upsertToolMessage(current, assistantId, {
        toolCallId: event.toolCall.toolCallId,
        toolName: event.toolCall.name,
        toolInput: event.toolCall.input,
        toolState: "running",
      }));
      setToolActivity((current) => [
        ...current.filter((item) => item.name !== event.toolCall.name),
        { name: event.toolCall.name, state: "running" },
      ]);
      return;
    }

    if (event.type === AgentEventType.ToolResult) {
      setMessages((current) => upsertToolMessage(current, assistantId, {
        toolCallId: event.result.toolCallId,
        toolName: event.result.name,
        toolInput: event.result.input,
        toolState: "complete",
        toolOutput: event.result.output,
      }));
      setToolActivity((current) => [
        ...current.filter((item) => item.name !== event.result.name),
        { name: event.result.name, state: "complete" },
      ]);
      return;
    }

    if (event.type === AgentEventType.ToolError || event.type === AgentEventType.ToolOutputDenied) {
      setMessages((current) => upsertToolMessage(current, assistantId, {
        toolCallId: event.toolCall.toolCallId,
        toolName: event.toolCall.name,
        toolInput: event.toolCall.input,
        toolState: "error",
        toolError: event.type === AgentEventType.ToolError ? event.error.message : "Tool output denied",
      }));
      setToolActivity((current) => [
        ...current.filter((item) => item.name !== event.toolCall.name),
        { name: event.toolCall.name, state: "error" },
      ]);
      return;
    }

    if (event.type === AgentEventType.ApprovalRequired) {
      setMessages((current) => event.approvals.reduce(
        (messages, approval) => upsertToolMessage(messages, assistantId, {
          toolCallId: approval.toolCall.toolCallId,
          toolName: approval.toolCall.name,
          toolInput: approval.toolCall.input,
          toolState: "approval_required",
        }),
        current,
      ));
      setPendingApprovals((current) => mergeApprovalRequests(current, event.approvals));
      return;
    }

    if (event.type === AgentEventType.ApprovalResolved) {
      setMessages((current) => event.approvals.reduce(
        (messages, approval) => upsertToolMessage(messages, assistantId, {
          toolCallId: approval.toolCall.toolCallId,
          toolName: approval.toolCall.name,
          toolInput: approval.toolCall.input,
          toolState: "running",
        }),
        current,
      ));
    }
  }, []);

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
    let streamedContent = "";

    try {
      const response = await onSubmit(
        prompt,
        (event) => handleAgentEvent(event, assistantId, (text) => {
          streamedContent += text;
          updateAssistant(assistantId, streamedContent);
        }),
        setRunControl,
      );
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
  }, [applyResult, busy, exit, handleAgentEvent, onClear, onSubmit, pendingApproval, updateAssistant]);

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
    let streamedContent = "";

    try {
      const response = await onApproval(
        request,
        decisions,
        (event) => handleAgentEvent(event, assistantId, (text) => {
          streamedContent += text;
          updateAssistant(assistantId, streamedContent);
        }),
        setRunControl,
      );
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
  }, [approvalDecisions, applyResult, busy, handleAgentEvent, messages, onApproval, pendingApproval, pendingApprovals, updateAssistant]);

  return (
    <>
      <AgentHeader workspace={activeWorkspace} model={activeModel} mode={activeMode} />
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

function mergeApprovalRequests(
  current: readonly ToolApprovalRequest[],
  incoming: readonly ToolApprovalRequest[],
): ToolApprovalRequest[] {
  const requests = new Map(current.map((request) => [request.approvalId, request]));
  for (const request of incoming) requests.set(request.approvalId, request);
  return Array.from(requests.values());
}

function upsertToolMessage(
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

  const message: ChatMessage = {
    id: `tool-${tool.toolCallId}`,
    role: "system",
    content: "",
    ...tool,
  };
  const assistantIndex = current.findIndex((candidate) => candidate.id === assistantId);
  if (assistantIndex < 0) return [...current, message];
  return [...current.slice(0, assistantIndex), message, ...current.slice(assistantIndex)];
}
