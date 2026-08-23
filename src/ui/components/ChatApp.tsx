import React, { useCallback, useEffect, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { ToolApprovalRequest } from "agentdock";
import { AgentHeader } from "./AgentHeader.js";
import { ApprovalPrompt } from "./ApprovalPrompt.js";
import { ChatInput } from "./ChatInput.js";
import { Message } from "./Message.js";
import type { ApprovalSubmit, ChatMessage, PromptResult, SubmitPrompt, ToolActivity } from "../types.js";
import { Spinner } from "./Spinner.js";

interface ChatAppProps {
  workspace: string;
  model: string;
  onChangeModel: (model: string) => void | Promise<void>;
  mode: "normal" | "approve_all";
  onToggleMode: (mode: "normal" | "approve_all") => void | Promise<void>;
  onSubmit: SubmitPrompt;
  onApproval: ApprovalSubmit;
}

export function ChatApp({
  workspace,
  model,
  onChangeModel,
  mode,
  onToggleMode,
  onSubmit,
  onApproval,
}: ChatAppProps): React.ReactElement {
  const { exit } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toolActivity, setToolActivity] = useState<ToolActivity[]>([]);
  const [busy, setBusy] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<ToolApprovalRequest | null>(null);
  const [activeMode, setActiveMode] = useState(mode);
  const [activeModel, setActiveModel] = useState(model);

  useEffect(() => {
    setActiveMode(mode);
  }, [mode]);

  useEffect(() => {
    setActiveModel(model);
  }, [model]);

  const selectModel = useCallback((nextModel: string) => {
    setActiveModel(nextModel);
    void onChangeModel(nextModel);
  }, [onChangeModel]);

  useInput((_, key) => {
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
    if (finalContent) updateAssistant(assistantId, finalContent);
    else if (!response?.approvalRequests.length) {
      setMessages((current) => current.filter((message) => message.id !== assistantId));
    }

    setPendingApproval(response?.approvalRequests[0] ?? null);
  }, [updateAssistant]);

  const submit = useCallback(async (prompt: string) => {
    if (busy || pendingApproval) return;
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: prompt }]);

    if (prompt === "/exit" || prompt === "/quit") {
      exit();
      return;
    }
    if (prompt === "/clear") {
      setMessages([]);
      return;
    }

    const assistantId = crypto.randomUUID();
    setMessages((current) => [...current, { id: assistantId, role: "assistant", content: "" }]);
    setBusy(true);
    setToolActivity([]);
    let streamedContent = "";

    try {
      const response = await onSubmit(
        prompt,
        (activity) => setToolActivity((current) => [
          ...current.filter((item) => item.name !== activity.name),
          activity,
        ]),
        (text) => {
          streamedContent += text;
          updateAssistant(assistantId, streamedContent);
        },
      );
      applyResult(assistantId, streamedContent, response);
    } catch (error) {
      setMessages((current) => current.map((message) => message.id === assistantId
        ? { ...message, role: "system", content: error instanceof Error ? error.message : String(error) }
        : message));
    } finally {
      setBusy(false);
      setToolActivity([]);
    }
  }, [applyResult, busy, exit, onSubmit, pendingApproval, updateAssistant]);

  const decideApproval = useCallback(async (approved: boolean) => {
    if (!pendingApproval || busy) return;
    const request = pendingApproval;
    const assistantId = [...messages].reverse().find((message) => message.role === "assistant")?.id;
    if (!assistantId) return;

    setPendingApproval(null);
    setBusy(true);
    setToolActivity([]);
    let streamedContent = "";

    try {
      const response = await onApproval(
        request,
        approved,
        (activity) => setToolActivity((current) => [
          ...current.filter((item) => item.name !== activity.name),
          activity,
        ]),
        (text) => {
          streamedContent += text;
          updateAssistant(assistantId, streamedContent);
        },
      );
      applyResult(assistantId, streamedContent, response);
    } catch (error) {
      setMessages((current) => current.map((message) => message.id === assistantId
        ? { ...message, role: "system", content: error instanceof Error ? error.message : String(error) }
        : message));
    } finally {
      setBusy(false);
      setToolActivity([]);
    }
  }, [applyResult, busy, messages, onApproval, pendingApproval, updateAssistant]);

  return (
    <>
      <AgentHeader workspace={workspace} model={activeModel} mode={activeMode} />
      <Box flexDirection="column">
        {messages.map((message) => <Message key={message.id} message={message} />)}
      </Box>
      {pendingApproval && !busy && <ApprovalPrompt request={pendingApproval} onDecision={decideApproval} />}
      <Box flexDirection="column" marginTop={1}>
        {busy && <Spinner busy={busy} toolActivity={toolActivity} />}
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
