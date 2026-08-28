import { isValidSessionId } from "./session-id.js";

export type CliOptions =
  | { command: "run"; resumeSessionId?: string }
  | { command: "help" };

export function parseCliOptions(args: readonly string[]): CliOptions {
  if (args.length === 0) return { command: "run" };
  if (args.length === 1 && args[0] === "--help") return { command: "help" };

  if (args[0] !== "--resume" || args.length !== 2 || !isValidSessionId(args[1] ?? "")) {
    throw new Error("Usage: agentdock [--resume <session-id>]");
  }

  return { command: "run", resumeSessionId: args[1] };
}

export const cliUsage = [
  "Usage:",
  "  agentdock",
  "  agentdock --resume <session-id>",
  "",
  "Development:",
  "  yarn dev",
  "  yarn dev --resume <session-id>",
].join("\n");
