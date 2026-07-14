import { getJson } from '@shared/api/httpClient';

// ── token 消耗 ────────────────────────────────────────────────────────────

export type StatsDimension = 'user' | 'session' | 'model';
export type StatsBucket = 'day' | 'week' | 'month';

export interface TokenSeriesPoint {
  bucket: string;
  key: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  callCount: number;
}

export interface TokenTableRow {
  key: string;
  /** session 维度下为所属 user_id，其余维度为空 */
  secondary: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  callCount: number;
  lastTime: number;
}

export interface TokenStats {
  dimension: StatsDimension;
  bucket: StatsBucket;
  buckets: string[];
  series: TokenSeriesPoint[];
  table: TokenTableRow[];
  totals: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    callCount: number;
  };
  generated_at: number;
}

export interface TokenStatsQuery {
  dimension: StatsDimension;
  bucket: StatsBucket;
  since?: number;
  until?: number;
  user?: string;
}

export function fetchTokenStats(q: TokenStatsQuery) {
  const params = new URLSearchParams({
    dimension: q.dimension,
    bucket: q.bucket,
  });
  if (q.since) params.set('since', String(q.since));
  if (q.until) params.set('until', String(q.until));
  if (q.user) params.set('user', q.user);
  return getJson<TokenStats>(`/admin/api/console/stats/token?${params.toString()}`);
}

// ── 查询耗时 ──────────────────────────────────────────────────────────────

export interface LatencySeriesPoint {
  bucket: string;
  avgMs: number;
  maxMs: number;
  minMs: number;
  count: number;
}

export interface LatencyRequestRow {
  user: string;
  sessionId: string;
  sessionTitle: string;
  durationMs: number;
  time: number;
  status: string;
}

export interface LatencyStats {
  bucket: StatsBucket;
  buckets: string[];
  series: LatencySeriesPoint[];
  extremes: {
    max: LatencyRequestRow | null;
    min: LatencyRequestRow | null;
  };
  table: LatencyRequestRow[];
  totals: {
    count: number;
    avgMs: number;
    maxMs: number;
    minMs: number;
  };
  generated_at: number;
}

export interface LatencyStatsQuery {
  bucket: StatsBucket;
  since?: number;
  until?: number;
  user?: string;
}

export function fetchLatencyStats(q: LatencyStatsQuery) {
  const params = new URLSearchParams({ bucket: q.bucket });
  if (q.since) params.set('since', String(q.since));
  if (q.until) params.set('until', String(q.until));
  if (q.user) params.set('user', q.user);
  return getJson<LatencyStats>(`/admin/api/console/stats/latency?${params.toString()}`);
}

// ── 活跃数据 ──────────────────────────────────────────────────────────────

export interface ActiveSeriesPoint {
  bucket: string;
  users: number;
  sessions: number;
  messages: number;
}

export interface ActiveStats {
  bucket: StatsBucket;
  buckets: string[];
  series: ActiveSeriesPoint[];
  totals: {
    users: number;
    sessions: number;
    messages: number;
  };
  generated_at: number;
}

export interface ActiveStatsQuery {
  bucket: StatsBucket;
  since?: number;
  until?: number;
  user?: string;
}

export function fetchActiveStats(q: ActiveStatsQuery) {
  const params = new URLSearchParams({ bucket: q.bucket });
  if (q.since) params.set('since', String(q.since));
  if (q.until) params.set('until', String(q.until));
  if (q.user) params.set('user', q.user);
  return getJson<ActiveStats>(`/admin/api/console/stats/active?${params.toString()}`);
}
