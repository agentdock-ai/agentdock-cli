import type { ChatMessage } from "../types.js";

export class ToolSummaryFormatter {
  format(message: ChatMessage): string {
    if (message.toolError) return `error: ${this.compact(message.toolError, 140)}`;

    const input = this.summarize(message.toolInput);
    if (message.toolOutput === undefined) return input;
    const inputKeys = isRecord(message.toolInput)
      ? new Set(Object.keys(message.toolInput))
      : new Set<string>();
    const output = this.summarize(message.toolOutput, inputKeys);
    return output === "no details" ? input : `${input}  ·  ${output}`;
  }

  private summarize(value: unknown, omittedKeys = new Set<string>()): string {
    if (value === null || value === undefined) return "no details";
    if (typeof value === "string") return this.compact(value, 140);

    if (isRecord(value)) {
      return Object.entries(value)
        .filter(([key]) => !omittedKeys.has(key))
        .slice(0, 4)
        .map(([key, entry]) => `${key}: ${this.summarizeEntry(key, entry)}`)
        .join("  ·  ");
    }

    return this.compact(value, 140);
  }

  private summarizeEntry(key: string, value: unknown): string {
    if ((key === "content" || key === "oldText" || key === "newText") && typeof value === "string") {
      if (key === "content") return `${value.length} chars`;
      return this.compact(JSON.stringify(value), 64);
    }
    return this.compact(value, 72);
  }

  private compact(value: unknown, maxLength: number): string {
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
    return formatted.length > maxLength ? `${formatted.slice(0, maxLength)}…` : formatted;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
