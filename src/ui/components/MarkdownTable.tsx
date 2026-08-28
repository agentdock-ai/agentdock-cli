import React from "react";
import { Box, Text } from "ink";
import { palette } from "../theme.js";
import type { TableAlignment } from "../formatting/markdown-parser.js";

interface MarkdownTableProps {
  headers: string[];
  alignments: TableAlignment[];
  rows: string[][];
  color: string;
  first: boolean;
}

export function MarkdownTable({ headers, alignments, rows, color, first }: MarkdownTableProps): React.ReactElement {
  const columnWidths = getColumnWidths(headers, rows);
  return (
    <Box flexDirection="column" marginTop={first ? 0 : 1} marginLeft={first ? 0 : 2}>
      <TableRow cells={headers} alignments={alignments} widths={columnWidths} color={color} bold />
      <Text color={palette.muted}>{createDivider(columnWidths)}</Text>
      {rows.map((row, index) => (
        <TableRow
          key={index}
          cells={row}
          alignments={alignments}
          widths={columnWidths}
          color={color}
        />
      ))}
    </Box>
  );
}

function TableRow({
  cells,
  alignments,
  widths,
  color,
  bold = false,
}: {
  cells: string[];
  alignments: TableAlignment[];
  widths: number[];
  color: string;
  bold?: boolean;
}): React.ReactElement {
  return (
    <Box flexDirection="row">
      <Text color={palette.muted}>│</Text>
      {cells.map((cell, index) => {
        const width = widths[index] ?? 0;
        const alignment = alignments[index] ?? "left";
        return (
          <React.Fragment key={index}>
            <Text color={color} bold={bold}>
              {renderInline(padCell(cell, width, alignment), color)}
            </Text>
            <Text color={palette.muted}>│</Text>
          </React.Fragment>
        );
      })}
    </Box>
  );
}

function getColumnWidths(headers: string[], rows: string[][]): number[] {
  const allRows = [headers, ...rows];
  return headers.map((_, columnIndex) => Math.max(
    1,
    ...allRows.map((row) => visibleLength(row[columnIndex] ?? "")),
  ));
}

function createDivider(widths: number[]): string {
  return `├${widths.map((width) => `─${"─".repeat(width)}─`).join("┼")}┤`;
}

function padCell(value: string, width: number, alignment: TableAlignment): string {
  const padding = Math.max(0, width - visibleLength(value));
  if (alignment === "right") return ` ${" ".repeat(padding)}${value} `;
  if (alignment === "center") {
    const left = Math.floor(padding / 2);
    return ` ${" ".repeat(left)}${value}${" ".repeat(padding - left)} `;
  }
  return ` ${value}${" ".repeat(padding)} `;
}

function visibleLength(value: string): number {
  return Array.from(value
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\[([^\]\n]+)\]\([^)]*\)/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/(?<!\w)(\*|_)([^*_\n]+)\1/g, "$2")).length;
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
