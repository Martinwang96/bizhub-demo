import type { ChartPayload } from './chart';

export type SseEventType = 'reasoning' | 'delta' | 'tool' | 'todo' | 'chart' | 'done' | 'error';

export interface ReasoningEvent {
  status: 'start' | 'delta' | 'end';
  text?: string;
}

export interface DeltaEvent {
  text: string;
}

export interface ToolEvent {
  name: string;
  status: 'running' | 'done' | 'denied';
  durationMs?: number;
  args?: Record<string, unknown>;
  output?: string;
}

export interface DoneEvent {
  title?: string;
  text?: string;
  truncated?: boolean;
  aborted?: boolean;
}

export interface ErrorEvent {
  error: string;
}

export interface ChartEvent {
  chart: ChartPayload;
}

export interface SseEvent {
  event: SseEventType;
  data: ReasoningEvent | DeltaEvent | ToolEvent | ChartEvent | DoneEvent | ErrorEvent | Record<string, unknown>;
}
