import { ToolRegistry } from "agentdock";
import { WorkspaceFileService } from "./workspace-file-service.js";
import {
  ListFilesTool,
  ReadFileTool,
  SearchFilesTool,
  UpdateFileTool,
  WriteFileTool,
} from "./workspace-tool.js";

export class WorkspaceToolFactory {
  create(workspaceRoot: string): ToolRegistry {
    const files = new WorkspaceFileService(workspaceRoot);
    const registry = new ToolRegistry();
    registry.register(new ReadFileTool(files));
    registry.register(new ListFilesTool(files));
    registry.register(new SearchFilesTool(files));
    registry.register(new WriteFileTool(files));
    registry.register(new UpdateFileTool(files));
    return registry;
  }
}
