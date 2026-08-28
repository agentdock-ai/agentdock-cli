import React from "react";
import { Box, Text } from "ink";
import { palette } from "../theme.js";
import { MarkdownParser, type MarkdownBlockData } from "../formatting/markdown-parser.js";
import { MarkdownTable } from "./MarkdownTable.js";

const parser = new MarkdownParser();

export function MarkdownMessage({ content, color }: { content: string; color: string }): React.ReactElement {
  const blocks = parser.parse(content);
  return (
    <Box flexDirection="column" marginTop={1} paddingX={1}>
      {blocks.map((block, index) => (
        <MarkdownBlock key={`${block.type}-${index}`} block={block} color={color} first={index === 0} />
      ))}
    </Box>
  );
}

function MarkdownBlock({ block, color, first }: { block: MarkdownBlockData; color: string; first: boolean }): React.ReactElement {
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
          <Text key={index} color={color}>{item.marker} {renderInline(item.text, color)}</Text>
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
    return <Box marginTop={first ? 0 : 1}><Text color={palette.muted}>{first ? "• ──────────" : "──────────"}</Text></Box>;
  }

  if (block.type === "table") {
    return <MarkdownTable {...block} color={color} first={first} />;
  }

  return (
    <Box marginTop={first ? 0 : 1} marginLeft={first ? 0 : 2}>
      {first && <Text color={color} bold>• </Text>}
      <Text color={color}>{renderInline(block.text, color)}</Text>
    </Box>
  );
}

function renderInline(value: string, color: string): React.ReactNode[] {
  const token = /(\*\*|__)(.+?)\1|(`[^`\n]+`)|\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(~~)(.+?)\7|(?<!\w)(\*|_)([^*_\n]+)\8/.exec(value);
  if (!token || token.index === undefined) return [value];

  const before = value.slice(0, token.index);
  const after = value.slice(token.index + token[0].length);
  let rendered: React.ReactNode;
  if (token[1]) rendered = <Text bold>{renderInline(token[2], color)}</Text>;
  else if (token[3]) rendered = <Text color={palette.accent} backgroundColor={palette.surface}>{token[3].slice(1, -1)}</Text>;
  else if (token[4]) rendered = <Text underline color={color}>{token[4]}</Text>;
  else if (token[6]) rendered = <Text strikethrough color={palette.muted}>{renderInline(token[7], palette.muted)}</Text>;
  else rendered = <Text italic>{renderInline(token[9], color)}</Text>;

  return [
    ...(before ? renderInline(before, color) : []),
    <React.Fragment key={`${token.index}-${token[0]}`}>{rendered}</React.Fragment>,
    ...(after ? renderInline(after, color) : []),
  ];
}
