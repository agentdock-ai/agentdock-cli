import type { Tool, ToolExecuteInput } from "agentdock";
import type { WorkspaceFileService } from "./workspace-file-service.js";

export abstract class WorkspaceTool implements Tool {
  readonly execute: (input: ToolExecuteInput) => Promise<unknown>;

  constructor(protected readonly files: WorkspaceFileService) {
    this.execute = (input) => this.run(input);
  }

  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: Record<string, unknown>;
  readonly requiresApproval?: boolean;

  protected abstract run(input: ToolExecuteInput): Promise<unknown>;

  protected requiredString(input: Record<string, unknown>, name: string, allowEmpty = false): string {
    const value = input[name];
    if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
      throw new Error(`${name} must be a${allowEmpty ? "" : " non-empty"} string`);
    }
    return value;
  }
}

export class ReadFileTool extends WorkspaceTool {
  readonly name = "read_file";
  readonly description = "Read a UTF-8 text file inside the workspace.";
  readonly parameters = {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
  };

  protected run({ input }: ToolExecuteInput): Promise<unknown> {
    return this.files.read(this.requiredString(input, "path"));
  }
}

export class ListFilesTool extends WorkspaceTool {
  readonly name = "list_files";
  readonly description = "List files inside the workspace, excluding dependencies and git metadata.";
  readonly parameters = { type: "object", properties: {}, required: [] };

  protected run(): Promise<unknown> {
    return this.files.list();
  }
}

export class SearchFilesTool extends WorkspaceTool {
  readonly name = "search_files";
  readonly description = "Search text files in the workspace for a literal query.";
  readonly parameters = {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  };

  protected run({ input }: ToolExecuteInput): Promise<unknown> {
    return this.files.search(this.requiredString(input, "query"));
  }
}

export class WriteFileTool extends WorkspaceTool {
  readonly name = "write_file";
  readonly description = "Create or replace a UTF-8 text file.";
  readonly requiresApproval = true;
  readonly parameters = {
    type: "object",
    properties: { path: { type: "string" }, content: { type: "string" } },
    required: ["path", "content"],
  };

  protected run({ input }: ToolExecuteInput): Promise<unknown> {
    return this.files.write(
      this.requiredString(input, "path"),
      this.requiredString(input, "content", true),
    );
  }
}

export class UpdateFileTool extends WorkspaceTool {
  readonly name = "update_file";
  readonly description = "Replace an exact text fragment in a UTF-8 file.";
  readonly requiresApproval = true;
  readonly parameters = {
    type: "object",
    properties: {
      path: { type: "string" },
      oldText: { type: "string" },
      newText: { type: "string" },
    },
    required: ["path", "oldText", "newText"],
  };

  protected run({ input }: ToolExecuteInput): Promise<unknown> {
    return this.files.update(
      this.requiredString(input, "path"),
      this.requiredString(input, "oldText"),
      this.requiredString(input, "newText", true),
    );
  }
}
