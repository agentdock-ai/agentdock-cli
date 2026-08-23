import React, { useEffect, useRef, useState } from "react";
import { Box, measureElement, Text, useInput, useStdin, useStdout, type DOMElement } from "ink";
import { palette } from "../theme.js";

interface ChatInputProps {
  disabled: boolean;
  onSubmit: (value: string) => void;
}

const placeholder = "Ask to do anything";

export function ChatInput({ disabled, onSubmit }: ChatInputProps): React.ReactElement {
  const [value, setValue] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const [hasTerminalFocus, setHasTerminalFocus] = useState(true);
  const [hasInputFocus, setHasInputFocus] = useState(!disabled);
  const inputRef = useRef<DOMElement | null>(null);
  const valueRef = useRef(value);
  const disabledRef = useRef(disabled);
  const { stdin } = useStdin();
  const { stdout } = useStdout();
  const isFocused = !disabled && hasTerminalFocus && hasInputFocus;

  valueRef.current = value;
  disabledRef.current = disabled;

  useEffect(() => {
    if (disabled) setHasInputFocus(false);
    else setHasInputFocus(true);
  }, [disabled]);

  useEffect(() => {
    if (!stdout.isTTY || !stdin.isTTY) return;

    const mouseAndFocusTracking = "\u001B[?1000h\u001B[?1004h\u001B[?1006h";
    const stopMouseAndFocusTracking = "\u001B[?1006l\u001B[?1004l\u001B[?1000l";
    stdout.write(mouseAndFocusTracking);

    const handleTerminalData = (chunk: Buffer | string) => {
      const data = typeof chunk === "string" ? chunk : chunk.toString("utf8");

      if (data.includes("\u001B[I")) {
        setHasTerminalFocus(true);
        if (!disabledRef.current) setHasInputFocus(true);
      }
      if (data.includes("\u001B[O")) setHasTerminalFocus(false);

      const mouseEvent = /\u001B\[<(\d+);(\d+);(\d+)([mM])/.exec(data);
      if (!mouseEvent || mouseEvent[4] !== "M") return;

      const button = Number(mouseEvent[1]);
      if ((button & 3) !== 0) return;

      const metrics = inputRef.current ? measureElement(inputRef.current) : null;
      if (!metrics) return;

      const column = Number(mouseEvent[2]) - 1;
      const row = Number(mouseEvent[3]) - 1;
      const clickedInside = column >= metrics.x
        && column < metrics.x + metrics.width
        && row >= metrics.y
        && row < metrics.y + metrics.height;

      setHasInputFocus(clickedInside && !disabledRef.current);
      if (!clickedInside || disabledRef.current) return;

      const textColumn = Math.max(0, column - metrics.x - 4);
      const characters = Array.from(valueRef.current);
      let measuredColumn = 0;
      let nextPosition = 0;
      for (const character of characters) {
        if (textColumn <= measuredColumn) break;
        measuredColumn += character === "\n" ? 0 : 1;
        nextPosition += character.length;
      }
      setCursorPosition(nextPosition);
    };

    stdin.on("data", handleTerminalData);
    return () => {
      stdin.off("data", handleTerminalData);
      stdout.write(stopMouseAndFocusTracking);
    };
  }, [stdin, stdout]);

  useInput((input, key) => {
    if (disabled) return;
    if (isTerminalControlSequence(input)) return;
    if (key.tab) {
      if (!key.shift) setHasInputFocus(true);
      return;
    }
    if (!hasInputFocus || !hasTerminalFocus) return;

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
      setValue((current) => current.slice(0, cursorPosition - 1) + current.slice(cursorPosition));
      setCursorPosition(cursorPosition - 1);
      return;
    }
    if (key.delete) {
      setValue((current) => current.slice(0, cursorPosition) + current.slice(cursorPosition + 1));
      return;
    }
    if (!key.ctrl && !key.meta && input) {
      insertAtCursor(input, value, cursorPosition, setValue, setCursorPosition);
    }
  }, { isActive: !disabled });

  return (
    <Box ref={inputRef} width="100%" minHeight={3} paddingX={2} paddingY={1} backgroundColor={palette.surface}>
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
  );
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

function isTerminalControlSequence(input: string): boolean {
  const sequence = input.startsWith("\u001B") ? input.slice(1) : input;
  return sequence === "[I"
    || sequence === "[O"
    || /^\[<[0-9;]+[mM]$/.test(sequence);
}
