import { ToolRegistry } from "@agentdock-ai/agentdock";
import { WorkspaceFileService } from "./workspace-file-service.js";
import {
  ListFilesTool,
  ReadFileTool,
  SearchFilesTool,
  UpdateFileTool,
  WriteFileTool,
} from "./workspace-tool.js";

export type WorkspaceToolMode = "normal" | "approve_all";

export class WorkspaceToolFactory {
  create(
    workspaceRoot: string,
    mode: WorkspaceToolMode = "normal",
  ): ToolRegistry {
    const files = new WorkspaceFileService(workspaceRoot);
    const registry = new ToolRegistry();
    registry.register(new ReadFileTool(files));
    registry.register(new ListFilesTool(files));
    registry.register(new SearchFilesTool(files));
    const requiresApproval = mode === "normal";
    registry.register(new WriteFileTool(files, requiresApproval));
    registry.register(new UpdateFileTool(files, requiresApproval));
    return registry;
  }
}
