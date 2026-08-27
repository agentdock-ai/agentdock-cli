import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { SlashCommandMenu } from "./SlashCommandMenu.js";
import { palette } from "../theme.js";
import { getSlashMenuState, slashMenuKey, type SlashMenuState } from "../slash-commands.js";

interface ChatInputProps {
  disabled: boolean;
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  onSubmit: (value: string) => void;
}

const placeholder = "Ask to do anything";

export function ChatInput({ disabled, selectedModel, onSelectModel, onSubmit }: ChatInputProps): React.ReactElement {
  const [value, setValue] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const [hasInputFocus, setHasInputFocus] = useState(!disabled);
  const isFocused = !disabled && hasInputFocus;
  const slashState = getSlashMenuState(value, cursorPosition);
  const slashStateKey = slashMenuKey(slashState);
  const [slashSelection, setSlashSelection] = useState(0);
  const slashMatches = slashState?.matches ?? [];
  const selectedSlashIndex = Math.min(slashSelection, Math.max(0, slashMatches.length - 1));
  const showSlashMenu = isFocused && slashState !== null && slashMatches.length > 0;

  useEffect(() => {
    setSlashSelection(0);
  }, [slashStateKey]);

  useEffect(() => {
    if (disabled) setHasInputFocus(false);
    else setHasInputFocus(true);
  }, [disabled]);

  useInput((input, key) => {
    if (disabled) return;
    if (key.tab) {
      if (!key.shift && showSlashMenu && slashState) {
        completeSlashSuggestion(slashState, selectedSlashIndex, value, cursorPosition, setValue, setCursorPosition);
        return;
      }
      if (!key.shift) setHasInputFocus(true);
      return;
    }
    if (!hasInputFocus) return;

    if (showSlashMenu && (key.upArrow || key.downArrow)) {
      setSlashSelection((current) => {
        const direction = key.downArrow ? 1 : -1;
        return (current + direction + slashMatches.length) % slashMatches.length;
      });
      return;
    }
    if (key.leftArrow) {
      setCursorPosition((current) => Math.max(0, current - 1));
      return;
    }
    if (key.rightArrow) {
      setCursorPosition((current) => Math.min(value.length, current + 1));
      return;
    }
    if (key.home) {
      setCursorPosition(0);
      return;
    }
    if (key.end) {
      setCursorPosition(value.length);
      return;
    }
    if (key.return) {
      if (!key.shift && showSlashMenu && slashState) {
        if (slashState.kind === "options" && isModelCommand(slashState.command.name)) {
          const selectedModelId = slashState.matches[selectedSlashIndex]?.name;
          if (selectedModelId) {
            onSelectModel(selectedModelId);
            setValue("");
            setCursorPosition(0);
            return;
          }
        }
        const completion = getSlashCompletion(slashState, selectedSlashIndex);
        if (completion && value.slice(0, cursorPosition) !== completion) {
          completeSlashSuggestion(slashState, selectedSlashIndex, value, cursorPosition, setValue, setCursorPosition);
          return;
        }
      }
      if (key.shift) {
        insertAtCursor("\n", value, cursorPosition, setValue, setCursorPosition);
        return;
      }
      const prompt = value.trim();
      if (!prompt) return;
      setValue("");
      setCursorPosition(0);
      onSubmit(prompt);
      return;
    }
    if (key.backspace) {
      if (cursorPosition === 0) return;
      if (key.meta || key.ctrl) {
        const nextPosition = previousWordBoundary(value, cursorPosition);
        setValue((current) => current.slice(0, nextPosition) + current.slice(cursorPosition));
        setCursorPosition(nextPosition);
        return;
      }
      setValue((current) => current.slice(0, cursorPosition - 1) + current.slice(cursorPosition));
      setCursorPosition(cursorPosition - 1);
      return;
    }
    if (key.delete) {
      if (key.meta || key.ctrl) {
        const nextPosition = nextWordBoundary(value, cursorPosition);
        setValue((current) => current.slice(0, cursorPosition) + current.slice(nextPosition));
        return;
      }
      setValue((current) => current.slice(0, cursorPosition) + current.slice(cursorPosition + 1));
      return;
    }
    if (!key.ctrl && !key.meta && input) {
      insertAtCursor(input, value, cursorPosition, setValue, setCursorPosition);
    }
  }, { isActive: !disabled });

  return (
    <Box flexDirection="column">
      <Box width="100%" minHeight={3} paddingX={2} paddingY={1} backgroundColor={palette.surface}>
        <Text color={palette.text}>› </Text>
        {value ? (
          <>
            <Text color={palette.text}>{value.slice(0, cursorPosition)}</Text>
            {isFocused ? (
              <Text backgroundColor="magenta" color="black">{value[cursorPosition] || " "}</Text>
            ) : null}
            <Text color={palette.text}>{isFocused ? value.slice(cursorPosition + 1) : value.slice(cursorPosition)}</Text>
          </>
        ) : (
          <>
            {isFocused ? (
              <>
                <Text backgroundColor="magenta" color="black">{placeholder[0]}</Text>
                <Text color={palette.muted}>{placeholder.slice(1)}</Text>
              </>
            ) : <Text color={palette.muted}>{placeholder}</Text>}
          </>
        )}
      </Box>
      {showSlashMenu && slashState && (
        <SlashCommandMenu
          state={slashState}
          selectedIndex={selectedSlashIndex}
          selectedModel={selectedModel}
        />
      )}
    </Box>
  );
}

function getSlashCompletion(state: SlashMenuState, selectedIndex: number): string | null {
  if (state.kind === "commands") {
    const command = state.matches[selectedIndex];
    if (!command) return null;
    return `/${command.name}${command.options?.length ? " " : ""}`;
  }

  const option = state.matches[selectedIndex];
  return option ? `/${state.command.name} ${option.name}` : null;
}

function isModelCommand(commandName: string): boolean {
  return commandName === "model" || commandName === "models";
}

function completeSlashSuggestion(
  state: SlashMenuState,
  selectedIndex: number,
  value: string,
  cursorPosition: number,
  setValue: React.Dispatch<React.SetStateAction<string>>,
  setCursorPosition: React.Dispatch<React.SetStateAction<number>>,
): void {
  const completion = getSlashCompletion(state, selectedIndex);
  if (!completion) return;
  setValue(`${completion}${value.slice(cursorPosition)}`);
  setCursorPosition(completion.length);
}

function insertAtCursor(
  input: string,
  value: string,
  cursorPosition: number,
  setValue: React.Dispatch<React.SetStateAction<string>>,
  setCursorPosition: React.Dispatch<React.SetStateAction<number>>,
): void {
  setValue(`${value.slice(0, cursorPosition)}${input}${value.slice(cursorPosition)}`);
  setCursorPosition(cursorPosition + input.length);
}

function previousWordBoundary(value: string, cursorPosition: number): number {
  let position = cursorPosition;
  while (position > 0 && /\s/.test(value[position - 1] ?? "")) position -= 1;
  while (position > 0 && !/\s/.test(value[position - 1] ?? "")) position -= 1;
  return position;
}

function nextWordBoundary(value: string, cursorPosition: number): number {
  let position = cursorPosition;
  while (position < value.length && /\s/.test(value[position] ?? "")) position += 1;
  while (position < value.length && !/\s/.test(value[position] ?? "")) position += 1;
  return position;
}
