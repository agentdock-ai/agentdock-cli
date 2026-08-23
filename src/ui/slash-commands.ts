import { modelCatalog } from "../model-catalog.js";

export interface SlashCommandOption {
  name: string;
  description: string;
  label?: string;
}

export interface SlashCommandDefinition {
  name: string;
  description: string;
  options?: readonly SlashCommandOption[];
}

const modelOptions = modelCatalog.map((model) => ({
  name: model.id,
  label: model.label,
  description: model.description,
}));

export const slashCommands: readonly SlashCommandDefinition[] = [
  { name: "help", description: "show available commands" },
  { name: "clear", description: "clear the conversation" },
  { name: "exit", description: "exit AgentDock CLI" },
  { name: "quit", description: "exit AgentDock CLI" },
  {
    name: "mode",
    description: "choose how tool approvals are handled",
    options: [
      { name: "normal", description: "ask before potentially destructive tools" },
      { name: "approve-all", description: "automatically approve all tools" },
    ],
  },
  {
    name: "model",
    description: "select the model used by the agent",
    options: modelOptions,
  },
  {
    name: "models",
    description: "list and select available models",
    options: modelOptions,
  },
  { name: "new", description: "start a new session" },
  { name: "tools", description: "list the tools available to the agent" },
  { name: "runs", description: "list runs in the current session" },
  { name: "inspect", description: "inspect the current session state" },
];

export type SlashMenuState =
  | {
    kind: "commands";
    query: string;
    matches: readonly SlashCommandDefinition[];
  }
  | {
    kind: "options";
    query: string;
    command: SlashCommandDefinition;
    matches: readonly SlashCommandOption[];
  };

export function getSlashMenuState(value: string, cursorPosition: number): SlashMenuState | null {
  const beforeCursor = value.slice(0, cursorPosition);
  if (!beforeCursor.startsWith("/") || beforeCursor.includes("\n")) return null;

  const match = /^\/([^\s]*)(?:\s+(.*))?$/.exec(beforeCursor);
  if (!match) return null;

  const commandQuery = match[1] ?? "";
  const command = slashCommands.find((candidate) => candidate.name === commandQuery);
  const argumentQuery = match[2];

  if (argumentQuery === undefined && command?.options?.length && isModelCommand(command.name)) {
    return {
      kind: "options",
      query: "",
      command,
      matches: command.options,
    };
  }

  if (argumentQuery !== undefined) {
    if (!command?.options?.length) return null;
    return {
      kind: "options",
      query: argumentQuery,
      command,
      matches: command.options.filter((option) => option.name.startsWith(argumentQuery)),
    };
  }

  return {
    kind: "commands",
    query: commandQuery,
    matches: slashCommands.filter((candidate) => candidate.name.startsWith(commandQuery)),
  };
}

function isModelCommand(commandName: string): boolean {
  return commandName === "model" || commandName === "models";
}

export function slashMenuKey(state: SlashMenuState | null): string {
  if (!state) return "";
  return state.kind === "commands"
    ? `commands:${state.query}`
    : `options:${state.command.name}:${state.query}`;
}
