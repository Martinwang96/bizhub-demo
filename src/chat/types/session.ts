import type { ChartPayload } from './chart';

export type Role = 'user' | 'assistant';

export type Step =
  | { type: 'thinking'; content: string; durationMs?: number }
  | { type: 'reasoning_text'; content: string; durationMs?: number }
  | {
      type: 'tool';
      name: string;
      args?: Record<string, unknown>;
      output?: string;
      durationMs?: number;
      status?: 'done' | 'denied' | 'running';
    };

export interface Message {
  role: Role;
  content?: string;
  reasoning?: string;
  steps?: Step[];
  stepCount?: number;
  totalDurationMs?: number;
  status?: 'ok' | 'aborted' | 'error';
  time?: number; // unix 秒（兼容秒/毫秒：< 1e12 视为秒）
  charts?: ChartPayload[];
  /**
   * 改写标记：'detailed' | 'concise'。
   * 仅出现在「详细/简洁」追加的 user 消息上——后端记录改写指令以保留审计追溯，
   * 前端检测到该字段时跳过渲染该 user 气泡（不显示多余气泡），且该 user 不作为
   * 版本组分段点（其前后 assistant 属于同一版本组）。
   */
  _refine?: string;
}

export interface Session {
  sessionId: string;
  title?: string;
  messageCount?: number;
  createdAt: number; // unix seconds
  updatedAt: number; // unix seconds
  pinnedAt?: number; // 置顶时间戳（unix seconds）；0/缺省=未置顶，>0=「常用对话」
}

export interface TodoItem {
  status: 'done' | 'doing' | 'pending';
  content: string;
  result_summary?: string;
}

export interface TodoState {
  todos: TodoItem[];
  progress: string;
  all_done: boolean;
}
