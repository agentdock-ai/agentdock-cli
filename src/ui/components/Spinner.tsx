import { Box, Text } from "ink";
import { palette } from "../theme.js";
import React, { useEffect, useState } from "react";
import { ToolStatus } from "./ToolStatus.js";
import type { ToolActivity } from "../types.js";

const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner({
  busy,
  toolActivity,
}: {
  busy: boolean;
  toolActivity: ToolActivity[];
}): React.ReactElement {
  const [spinnerIndex, setSpinnerIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!busy) {
      setSpinnerIndex(0);
      setElapsedSeconds(0);
      return;
    }

    const startedAt = Date.now();
    const timer = setInterval(() => {
      setSpinnerIndex((current) => (current + 1) % spinnerFrames.length);
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 120);

    return () => clearInterval(timer);
  }, [busy]);

  return (
    <Box marginBottom={1} paddingX={1}>
      <Text color={palette.working} bold>
        {spinnerFrames[spinnerIndex]} Working ({elapsedSeconds}s) · Esc to Stop
      </Text>
      {toolActivity.length > 0 && (
        <Text color={palette.muted}>
          {" "}
          <ToolStatus activity={toolActivity[toolActivity.length - 1]} />
        </Text>
      )}
    </Box>
  );
}
