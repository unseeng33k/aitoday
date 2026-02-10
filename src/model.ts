export type EventSource = "chatgpt" | "claude" | "gemini";

export interface NormalizedEvent {
  source: EventSource;
  timestamp: string;
  topic: string;
  oneLineSummary: string;
  rawRef: string;
}

export interface TopicGroup {
  source: EventSource;
  topic: string;
  startedAt: string;
  entries: NormalizedEvent[];
  summary: string;
}
