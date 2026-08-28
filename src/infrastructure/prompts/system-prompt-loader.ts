import { readFile } from "node:fs/promises";

const systemPromptUrl = new URL("../../../prompts/SYSTEM_PROMPT.md", import.meta.url);

export class SystemPromptLoader {
  private prompt: Promise<string> | null = null;

  load(): Promise<string> {
    this.prompt ??= readFile(systemPromptUrl, "utf8").then((prompt) => {
      const normalized = prompt.trim();
      if (!normalized) throw new Error("SYSTEM_PROMPT.md must not be empty");
      return normalized;
    });
    return this.prompt;
  }
}
