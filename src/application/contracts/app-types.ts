export interface AgentRunControl {
  stop: () => Promise<boolean>;
}

export type AgentRunControlUpdate = (control: AgentRunControl) => void;
