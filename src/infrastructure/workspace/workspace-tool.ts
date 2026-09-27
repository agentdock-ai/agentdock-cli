import { tool } from "langchain";
import { z } from "zod";
import type { WorkspaceFileService } from "./workspace-file-service.js";

export function createWorkspaceTools(files: WorkspaceFileService) {
  return [
    tool(({ path }) => files.read(path), {
      name: "read_file",
      description: "Read a UTF-8 text file inside the workspace.",
      schema: z.object({ path: z.string().min(1) }),
    }),
    tool(() => files.list(), {
      name: "list_files",
      description:
        "Return the complete recursive file tree of the current workspace.",
      schema: z.object({}),
    }),
    tool(({ query }) => files.search(query), {
      name: "search_files",
      description: "Search text files in the workspace for a literal query.",
      schema: z.object({ query: z.string().min(1) }),
    }),
    tool(({ path, content }) => files.write(path, content), {
      name: "write_file",
      description: "Create or replace a UTF-8 text file.",
      schema: z.object({ path: z.string().min(1), content: z.string() }),
    }),
    tool(({ path, oldText, newText }) => files.update(path, oldText, newText), {
      name: "update_file",
      description: "Replace an exact text fragment in a UTF-8 file.",
      schema: z.object({
        path: z.string().min(1),
        oldText: z.string().min(1),
        newText: z.string(),
      }),
    }),
  ];
}
