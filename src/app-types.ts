export interface AgentRunControl {
  runId: string;
  stop: () => Promise<boolean>;
}

export type AgentRunControlUpdate = (control: AgentRunControl) => void;
