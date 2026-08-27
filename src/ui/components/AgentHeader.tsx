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
    <Box
      width="100%"
      flexDirection="column"
      marginBottom={1}
      paddingX={2}
      paddingY={1}
      borderStyle="round"
      borderColor={palette.muted}
    >
      <Box flexDirection="row">
        <Text color={palette.accent} bold>{logo}</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Box>
            <Text bold color={palette.text}>Agent</Text>
            <Text bold color={palette.text}>Dock</Text>
            <Text color={palette.muted}>  v0.1.0</Text>
          </Box>
          <Text color={palette.muted}>agent terminal</Text>
          <Box marginTop={1} flexDirection="column">
            <Box>
              <Text color={palette.accent} bold>MODEL </Text>
              <Text color={palette.text}>{model}</Text>
            </Box>
            <Box>
              <Text color={palette.accent} bold>DIR   </Text>
              <Text color={palette.text}>{compactPath(workspace)}</Text>
            </Box>
            <Box>
              <Text color={palette.accent} bold>MODE  </Text>
              <Text color={mode === "approve_all" ? palette.accent : palette.success} bold>
                {mode === "approve_all" ? "Approve All" : "Normal"}
              </Text>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

const logo = "   /\\\n  /  \\\n / /\\ \\\n/_/  \\_\\\n\\______/";
