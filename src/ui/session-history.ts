import type { Message, ContentPart } from "@agentdock-ai/agentdock";
import type { ChatMessage } from "./types.js";

export function toChatHistory(messages: readonly Message[]): ChatMessage[] {
  return messages.flatMap((message, index) => {
    const content = contentText(message.content);
    if (message.role === "tool" || !content.trim()) return [];

    return [
      {
        id: `${message.id ?? "history"}-${index}`,
        role: message.role,
        content,
      },
    ];
  });
}

function contentText(parts: readonly ContentPart[]): string {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}
