import React from "react";
import { Box, Text } from "ink";
import { palette } from "../theme.js";
import type { ChatMessage } from "../types.js";
import { MarkdownMessage } from "./MarkdownMessage.js";
import { ToolCallMessage } from "./ToolCallMessage.js";

export function Message({ message }: { message: ChatMessage }): React.ReactElement {
  if (message.role === "user") {
    return (
      <Box width="100%" marginTop={1} paddingX={2} paddingY={1} backgroundColor={palette.surface}>
        <Text color={palette.text}>› </Text>
        <Text color={palette.text}>{message.content}</Text>
      </Box>
    );
  }

  if (message.toolCallId && message.toolName && message.toolState) {
    return <ToolCallMessage message={message} />;
  }
  if (!message.content) return <></>;

  const color = message.role === "assistant" ? palette.text : palette.error;
  if (message.role === "assistant") return <MarkdownMessage content={message.content} color={color} />;

  return (
    <Box marginTop={1} paddingX={1}>
      <Text color={color} bold>•</Text>
      <Text color={color}>&nbsp;{message.content}</Text>
    </Box>
  );
}
