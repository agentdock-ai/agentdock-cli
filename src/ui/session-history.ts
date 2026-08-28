import type { Message } from "agentdock";
import type { ChatMessage } from "./types.js";

export function toChatHistory(messages: readonly Message[]): ChatMessage[] {
  return messages.flatMap((message, index) => {
    if (message.role === "tool" || !message.content.trim()) return [];

    return [{
      id: `${message.id ?? "history"}-${index}`,
      role: message.role,
      content: message.content,
    }];
  });
}
