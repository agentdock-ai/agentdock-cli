import type { AgentEvent, ToolApprovalDecision, ToolApprovalRequest } from "agentdock";
import type { AgentRunControlUpdate } from "../../application/contracts/app-types.js";
import type { ApprovalSubmit, PromptResult, SubmitPrompt } from "../types.js";

export interface ChatRequestCallbacks {
  onEvent: (event: AgentEvent) => void;
  onRunControl: AgentRunControlUpdate;
  onText: (content: string) => void;
}

export class ChatRequestController {
  constructor(
    private readonly submitPrompt: SubmitPrompt,
    private readonly approveRequest: ApprovalSubmit,
  ) {}

  submit(prompt: string, callbacks: ChatRequestCallbacks): Promise<ChatRequestResult> {
    return this.run((onEvent, onRunControl) => this.submitPrompt(prompt, onEvent, onRunControl), callbacks);
  }

  approve(
    request: ToolApprovalRequest,
    decisions: ToolApprovalDecision[],
    callbacks: ChatRequestCallbacks,
  ): Promise<ChatRequestResult> {
    return this.run(
      (onEvent, onRunControl) => this.approveRequest(request, decisions, onEvent, onRunControl),
      callbacks,
    );
  }

  private async run(
    execute: RequestExecutor,
    callbacks: ChatRequestCallbacks,
  ): Promise<ChatRequestResult> {
    let streamedContent = "";
    const response = await execute(
      (event) => {
        callbacks.onEvent(event);
        if (event.type === "text.delta") {
          streamedContent += event.text;
          callbacks.onText(streamedContent);
        }
      },
      callbacks.onRunControl,
    );
    return { response, streamedContent };
  }
}

type RequestExecutor = (
  onEvent: (event: AgentEvent) => void,
  onRunControl: AgentRunControlUpdate,
) => Promise<PromptResult | null>;

export interface ChatRequestResult {
  response: PromptResult | null;
  streamedContent: string;
}
