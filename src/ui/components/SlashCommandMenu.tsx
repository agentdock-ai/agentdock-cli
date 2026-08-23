import React from "react";
import { Box, Text } from "ink";
import type { SlashCommandDefinition, SlashCommandOption, SlashMenuState } from "../slash-commands.js";
import { palette } from "../theme.js";

interface SlashCommandMenuProps {
  state: SlashMenuState;
  selectedIndex: number;
  selectedModel?: string;
}

const labelWidth = 24;

export function SlashCommandMenu({ state, selectedIndex, selectedModel }: SlashCommandMenuProps): React.ReactElement {
  if (state.kind === "commands") {
    return (
      <Box flexDirection="column" paddingX={4}>
        {state.matches.map((command, index) => (
          <CommandRow
            key={command.name}
            command={command}
            selected={index === selectedIndex}
          />
        ))}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={4}>
      <CommandRow command={state.command} selected={false} />
      <Box flexDirection="column" paddingLeft={2}>
        {state.matches.map((option, index) => (
          <OptionRow
            key={option.name}
            option={option}
            selected={index === selectedIndex}
            isCurrentModel={option.name === selectedModel}
          />
        ))}
      </Box>
    </Box>
  );
}

function CommandRow({ command, selected }: { command: SlashCommandDefinition; selected: boolean }): React.ReactElement {
  return (
    <Box>
      <Box width={labelWidth}>
        <Text color={selected ? palette.accent : palette.text} bold={selected}>
          {`/${command.name}`}
        </Text>
      </Box>
      <Text color={selected ? palette.accent : palette.muted} bold={selected}>
        {command.description}
      </Text>
    </Box>
  );
}

function OptionRow({
  option,
  selected,
  isCurrentModel,
}: {
  option: SlashCommandOption;
  selected: boolean;
  isCurrentModel: boolean;
}): React.ReactElement {
  return (
    <Box>
      <Box width={labelWidth}>
        <Text color={selected || isCurrentModel ? palette.accent : palette.text} bold={selected || isCurrentModel}>
          {isCurrentModel ? "● " : "  "}{option.label ?? option.name}
        </Text>
      </Box>
      <Text color={selected || isCurrentModel ? palette.accent : palette.muted} bold={selected || isCurrentModel}>
        {option.description}
      </Text>
    </Box>
  );
}
