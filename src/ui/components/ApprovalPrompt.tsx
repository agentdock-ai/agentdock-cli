import React from "react";
import { Box, Text, useInput } from "ink";
import type { ToolApprovalRequest } from "agentdock";
import { palette } from "../theme.js";

export function ApprovalPrompt({
  request,
  onDecision,
}: {
  request: ToolApprovalRequest;
  onDecision: (approved: boolean) => void;
}): React.ReactElement {
  useInput((input) => {
    if (input === "1") onDecision(true);
    if (input === "0") onDecision(false);
  });

  return (
    <Box flexDirection="column" marginTop={1} paddingX={2} paddingY={1} borderStyle="round" borderColor={palette.accent}>
      <Text color={palette.accent} bold>Approval required</Text>
      <Text color={palette.text}>Tool: {request.toolCall.name}</Text>
      <Text color={palette.muted}>{JSON.stringify(request.toolCall.input, null, 2)}</Text>
      <Text color={palette.muted}>Press 1 to approve or 0 to deny.</Text>
    </Box>
  );
}
