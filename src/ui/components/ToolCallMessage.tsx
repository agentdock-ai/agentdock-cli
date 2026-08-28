import React from "react";
import { Box, Text } from "ink";
import { palette } from "../theme.js";
import type { ChatMessage } from "../types.js";
import { ToolSummaryFormatter } from "../formatting/tool-summary.js";

const formatter = new ToolSummaryFormatter();

export function ToolCallMessage({ message }: { message: ChatMessage }): React.ReactElement {
  const state = message.toolState;
  if (!state) return <></>;
  const stateIcon = state === "complete" ? "✓" : state === "error" ? "!" : state === "approval_required" ? "?" : "•";
  const stateLabel = state === "running" ? "working" : state === "complete" ? "done" : state === "approval_required" ? "approval" : "error";
  const stateColor = state === "complete" ? palette.success : state === "error" ? palette.error : state === "approval_required" ? palette.accent : palette.working;

  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={2}>
      <Box>
        <Text color={stateColor} bold>{stateIcon} </Text>
        <Text color={palette.text} bold wrap="truncate">{message.toolName}</Text>
        <Text color={palette.muted}>  ·  </Text>
        <Text color={stateColor} bold>{stateLabel}</Text>
      </Box>
      <Box paddingLeft={2}>
        <Text color={message.toolError ? palette.error : palette.muted} wrap="truncate">
          {`└ ${formatter.format(message)}`}
        </Text>
      </Box>
    </Box>
  );
}
