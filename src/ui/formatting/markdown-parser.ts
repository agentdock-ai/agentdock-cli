export type MarkdownBlockData =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string; level: number }
  | { type: "quote"; text: string }
  | { type: "rule" }
  | { type: "code"; language: string; lines: string[] }
  | { type: "list"; items: Array<{ marker: string; text: string }> }
  | {
    type: "table";
    headers: string[];
    alignments: TableAlignment[];
    rows: string[][];
  };

export type TableAlignment = "left" | "center" | "right";

export class MarkdownParser {
  parse(content: string): MarkdownBlockData[] {
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

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
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

      const table = this.readTable(lines, index);
      if (table) {
        flushParagraph();
        flushList();
        blocks.push(table.block);
        index = table.endIndex;
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

  private readTable(
    lines: string[],
    headerIndex: number,
  ): { block: Extract<MarkdownBlockData, { type: "table" }>; endIndex: number } | null {
    const headers = parseTableRow(lines[headerIndex] ?? "");
    const alignments = parseTableDivider(lines[headerIndex + 1] ?? "");
    if (!headers || !alignments || headers.length !== alignments.length) return null;

    const rows: string[][] = [];
    let endIndex = headerIndex + 1;
    for (let index = headerIndex + 2; index < lines.length; index += 1) {
      const row = parseTableRow(lines[index] ?? "");
      if (!row) break;
      rows.push(normalizeTableRow(row, headers.length));
      endIndex = index;
    }

    return {
      block: { type: "table", headers, alignments, rows },
      endIndex,
    };
  }
}

function parseTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return null;

  const cells: string[] = [];
  let cell = "";
  let hasSeparator = false;
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (character === "\\" && trimmed[index + 1] === "|") {
      cell += "|";
      index += 1;
      continue;
    }
    if (character === "|") {
      cells.push(cell.trim());
      cell = "";
      hasSeparator = true;
      continue;
    }
    cell += character;
  }
  cell = cell.trim();
  if (cell || !hasSeparator) cells.push(cell);

  if (cells[0] === "") cells.shift();
  if (cells.at(-1) === "") cells.pop();
  return cells.length > 0 ? cells : null;
}

function parseTableDivider(line: string): TableAlignment[] | null {
  const cells = parseTableRow(line);
  if (!cells || cells.length === 0) return null;

  const alignments: TableAlignment[] = [];
  for (const cell of cells) {
    if (!/^:?-+:?$/.test(cell)) return null;
    const startsWithColon = cell.startsWith(":");
    const endsWithColon = cell.endsWith(":");
    alignments.push(startsWithColon && endsWithColon
      ? "center"
      : endsWithColon
        ? "right"
        : "left");
  }
  return alignments;
}

function normalizeTableRow(row: string[], columnCount: number): string[] {
  return Array.from({ length: columnCount }, (_, index) => row[index] ?? "");
}
