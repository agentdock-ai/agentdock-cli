import React from "react";
import { Box, Text } from "ink";
import { palette } from "../theme.js";

interface AgentHeaderProps {
  workspace: string;
  model: string;
  mode: "normal" | "approve_all";
}

function compactPath(value: string): string {
  const parts = value.split("/");
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : value;
}

export function AgentHeader({ workspace, model, mode }: AgentHeaderProps): React.ReactElement {
  return (
    <Box flexDirection="column" marginX={1} marginBottom={1} paddingX={2} paddingY={1} borderStyle="round" borderColor={palette.muted}>
      <Box>
        <Text color={palette.muted}>›_ </Text>
        <Text bold color={palette.text}>AgentDock</Text>
        <Text color={palette.muted}> (v0.1.0)</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={palette.muted}>model: </Text>
        <Text color={palette.text}>{model}</Text>
      </Box>
      <Box>
        <Text color={palette.muted}>directory: </Text>
        <Text color={palette.text}>{compactPath(workspace)}</Text>
      </Box>
      <Box>
        <Text color={palette.muted}>mode: </Text>
        <Text color={mode === "approve_all" ? palette.accent : palette.success}>
          {mode === "approve_all" ? "Approve All" : "Normal"}
        </Text>
      </Box>
    </Box>
  );
}
