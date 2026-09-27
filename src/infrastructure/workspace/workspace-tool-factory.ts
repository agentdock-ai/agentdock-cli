import { WorkspaceFileService } from "./workspace-file-service.js";
import { createWorkspaceTools } from "./workspace-tool.js";

export class WorkspaceToolFactory {
  create(workspaceRoot: string) {
    const files = new WorkspaceFileService(workspaceRoot);
    return createWorkspaceTools(files);
  }
}
