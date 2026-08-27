import React from "react";
import { Box, Text } from "ink";
import { palette } from "../theme.js";
import type { ChatMessage, ToolCallState } from "../types.js";

export function Message({
  message,
}: {
  message: ChatMessage;
}): React.ReactElement {
  if (message.role === "user") {
    return (
      <Box
        width="100%"
        marginTop={1}
        paddingX={2}
        paddingY={1}
        backgroundColor={palette.surface}
      >
        <Text color={palette.text}>› </Text>
        <Text color={palette.text}>{message.content}</Text>
      </Box>
    );
  }

  if (message.toolCallId && message.toolName && message.toolState) {
    return <ToolCallMessage message={message} />;
  }

  const color = message.role === "assistant" ? palette.text : palette.error;

  if (message.content == "") {
    return <></>;
  }

  if (message.role === "assistant") {
    return <MarkdownMessage content={message.content} color={color} />;
  }

  return (
    <Box marginTop={1} paddingX={1}>
      <Text color={color} bold>
        •
      </Text>
      <Text color={color}>&nbsp;{message.content}</Text>
    </Box>
  );
}

function MarkdownMessage({ content, color }: { content: string; color: string }): React.ReactElement {
  const blocks = parseMarkdown(content);

  return (
    <Box flexDirection="column" marginTop={1} paddingX={1}>
      {blocks.map((block, index) => (
        <MarkdownBlock key={`${block.type}-${index}`} block={block} color={color} first={index === 0} />
      ))}
    </Box>
  );
}

function MarkdownBlock({
  block,
  color,
  first,
}: {
  block: MarkdownBlockData;
  color: string;
  first: boolean;
}): React.ReactElement {
  if (block.type === "code") {
    return (
      <Box flexDirection="column" marginTop={first ? 0 : 1} marginLeft={2}>
        {block.language && <Text color={palette.muted}>{block.language}</Text>}
        {block.lines.map((line, index) => (
          <Text key={index} color={palette.muted} backgroundColor={palette.surface}>{`  ${line || " "}`}</Text>
        ))}
      </Box>
    );
  }

  if (block.type === "heading") {
    return (
      <Box marginTop={first ? 0 : 1} marginLeft={first ? 0 : 2}>
        {first && <Text color={color} bold>• </Text>}
        <Text color={palette.accent} bold>{renderInline(block.text, palette.accent)}</Text>
      </Box>
    );
  }

  if (block.type === "list") {
    return (
      <Box flexDirection="column" marginTop={first ? 0 : 1} marginLeft={first ? 0 : 2}>
        {block.items.map((item, index) => (
          <Text key={index} color={color}>
            {item.marker} {renderInline(item.text, color)}
          </Text>
        ))}
      </Box>
    );
  }

  if (block.type === "quote") {
    return (
      <Box marginTop={first ? 0 : 1} marginLeft={first ? 0 : 2}>
        {first && <Text color={color} bold>• </Text>}
        <Text color={palette.muted}>│ {renderInline(block.text, palette.muted)}</Text>
      </Box>
    );
  }

  if (block.type === "rule") {
    return (
      <Box marginTop={first ? 0 : 1}>
        <Text color={palette.muted}>{first ? "• ──────────" : "──────────"}</Text>
      </Box>
    );
  }

  return (
    <Box marginTop={first ? 0 : 1} marginLeft={first ? 0 : 2}>
      {first && <Text color={color} bold>• </Text>}
      <Text color={color}>{renderInline(block.text, color)}</Text>
    </Box>
  );
}

type MarkdownBlockData =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string; level: number }
  | { type: "quote"; text: string }
  | { type: "rule" }
  | { type: "code"; language: string; lines: string[] }
  | { type: "list"; items: Array<{ marker: string; text: string }> };

function parseMarkdown(content: string): MarkdownBlockData[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlockData[] = [];
  let paragraph: string[] = [];
  let list: Array<{ marker: string; text: string }> = [];
  let code: string[] | null = null;
  let codeLanguage = "";

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ type: "list", items: list });
      list = [];
    }
  };

  for (const line of lines) {
    const fence = /^\s*```\s*([^`]*)\s*$/.exec(line);
    if (fence) {
      flushParagraph();
      flushList();
      if (code === null) {
        code = [];
        codeLanguage = fence[1]?.trim() ?? "";
      } else {
        blocks.push({ type: "code", language: codeLanguage, lines: code });
        code = null;
        codeLanguage = "";
      }
      continue;
    }

    if (code !== null) {
      code.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }

    if (/^\s*(?:\*\s*){3,}$/.test(line) || /^\s*(?:-\s*){3,}$/.test(line) || /^\s*_{3,}\s*$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ type: "rule" });
      continue;
    }

    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
    const ordered = /^\s*(\d+)[.)]\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      list.push({ marker: ordered ? `${ordered[1]}.` : "•", text: (ordered ? ordered[2] : unordered?.[1]) ?? "" });
      continue;
    }

    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push({ type: "quote", text: quote[1] });
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  if (code !== null) blocks.push({ type: "code", language: codeLanguage, lines: code });
  flushParagraph();
  flushList();
  return blocks;
}

function renderInline(value: string, color: string): React.ReactNode[] {
  const token = /(\*\*|__)(.+?)\1|(`[^`\n]+`)|\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(~~)(.+?)\7|(?<!\w)(\*|_)([^*_\n]+)\8/.exec(value);
  if (!token || token.index === undefined) return [value];

  const before = value.slice(0, token.index);
  const after = value.slice(token.index + token[0].length);
  let rendered: React.ReactNode;

  if (token[1]) {
    rendered = <Text bold>{renderInline(token[2], color)}</Text>;
  } else if (token[3]) {
    rendered = <Text color={palette.accent} backgroundColor={palette.surface}>{token[3].slice(1, -1)}</Text>;
  } else if (token[4]) {
    rendered = (
      <Text underline color={color}>
        {token[4]}
      </Text>
    );
  } else if (token[6]) {
    rendered = <Text strikethrough color={palette.muted}>{renderInline(token[7], palette.muted)}</Text>;
  } else {
    rendered = <Text italic>{renderInline(token[9], color)}</Text>;
  }

  return [
    ...(before ? renderInline(before, color) : []),
    <React.Fragment key={`${token.index}-${token[0]}`}>{rendered}</React.Fragment>,
    ...(after ? renderInline(after, color) : []),
  ];
}

function ToolCallMessage({ message }: { message: ChatMessage }): React.ReactElement {
  const state = message.toolState as ToolCallState;
  const stateIcon = state === "complete"
    ? "✓"
    : state === "error"
      ? "!"
      : state === "approval_required"
        ? "?"
        : "•";
  const stateLabel = state === "running"
    ? "working"
    : state === "complete"
      ? "done"
      : state === "approval_required"
        ? "approval"
        : "error";
  const stateColor = state === "complete"
    ? palette.success
    : state === "error"
      ? palette.error
      : state === "approval_required"
        ? palette.accent
        : palette.working;

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
          {`└ ${toolSummary(message)}`}
        </Text>
      </Box>
    </Box>
  );
}

function toolSummary(message: ChatMessage): string {
  if (message.toolError) return `error: ${compactToolValue(message.toolError, 140)}`;

  const input = summarizeToolValue(message.toolInput);
  if (message.toolOutput === undefined) return input;
  const inputKeys = isRecord(message.toolInput)
    ? new Set(Object.keys(message.toolInput))
    : new Set<string>();
  const output = summarizeToolValue(message.toolOutput, inputKeys);
  return output === "no details" ? input : `${input}  ·  ${output}`;
}

function summarizeToolValue(value: unknown, omittedKeys = new Set<string>()): string {
  if (value === null || value === undefined) return "no details";
  if (typeof value === "string") return compactToolValue(value, 140);

  if (typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries
      .filter(([key]) => !omittedKeys.has(key))
      .slice(0, 4)
      .map(([key, entry]) => `${key}: ${summarizeToolEntry(key, entry)}`)
      .join("  ·  ");
  }

  return compactToolValue(value, 140);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summarizeToolEntry(key: string, value: unknown): string {
  if ((key === "content" || key === "oldText" || key === "newText") && typeof value === "string") {
    if (key === "content") return `${value.length} chars`;
    return compactToolValue(JSON.stringify(value), 64);
  }
  return compactToolValue(value, 72);
}

function compactToolValue(value: unknown, maxLength = 140): string {
  let formatted: string;
  if (typeof value === "string") formatted = value;
  else {
    try {
      formatted = JSON.stringify(value, null, 2) ?? String(value);
    } catch {
      formatted = String(value);
    }
  }

  formatted = formatted.replace(/\s+/g, " ").trim();
  return formatted.length > maxLength
    ? `${formatted.slice(0, maxLength)}…`
    : formatted;
}
