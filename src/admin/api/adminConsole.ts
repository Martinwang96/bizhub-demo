import { getJson } from '@shared/api/httpClient';

export interface AdminMe {
  loginName: string;
  adminConsoleRole: string;
  bizHubRole: string;
  skillHubRoles: string[];
  readonly: boolean;
}

export interface SessionItem {
  sessionId: string;
  user: string;
  title: string;
  messageCount: number;
  toolCallCount?: number;
  createdAt: number;
  updatedAt: number;
  riskTags?: string[];
}

export interface SessionStatsBucket {
  users: number;
  sessions: number;
  messages: number;
  since?: number;
  until?: number;
}

export interface SessionStats {
  total: SessionStatsBucket;
  today: SessionStatsBucket;
  yesterday: SessionStatsBucket;
  generatedAt?: number;
}

export interface LogEntry {
  level: string;
  message: string;
  module?: string;
}

export interface AlertItem {
  level: 'critical' | 'warning' | 'info' | string;
  title: string;
  count: number;
  suggestion?: string;
}

export interface AlertSnapshot {
  generatedAt: number;
  alerts: AlertItem[];
  count: number;
}

export function fetchAdminMe() {
  return getJson<AdminMe>('/admin/api/console/me');
}

export function fetchSessions(params: {
  user?: string;
  session_id?: string;
  keyword?: string;
  since?: number;
  until?: number;
  cursor?: number;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  if (params.user) qs.set('user', params.user);
  if (params.session_id) qs.set('session_id', params.session_id);
  if (params.keyword) qs.set('keyword', params.keyword);
  if (params.since) qs.set('since', String(params.since));
  if (params.until) qs.set('until', String(params.until));
  if (params.cursor) qs.set('cursor', String(params.cursor));
  if (params.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return getJson<{ items: SessionItem[]; total: number; cursor: number }>(
    `/admin/api/console/sessions${q ? '?' + q : ''}`,
  );
}

export function fetchSessionStats() {
  return getJson<SessionStats>('/admin/api/console/sessions/stats');
}

export function fetchSessionDetail(sessionId: string) {
  return getJson<unknown>(`/admin/api/console/sessions/${encodeURIComponent(sessionId)}`);
}

export interface SessionsExportFilters {
  user?: string;
  session_id?: string;
  keyword?: string;
  since?: number; // 秒级时间戳
  until?: number;
}

/**
 * 拼接会话导出下载链接（GET /admin/api/console/sessions/export）。
 * 浏览器原生下载，cookie 自动携带满足后端 admin 鉴权。
 */
export function buildSessionsExportUrl(params: SessionsExportFilters): string {
  const qs = new URLSearchParams();
  if (params.user) qs.set('user', params.user);
  if (params.session_id) qs.set('session_id', params.session_id);
  if (params.keyword) qs.set('keyword', params.keyword);
  if (params.since) qs.set('since', String(params.since));
  if (params.until) qs.set('until', String(params.until));
  const q = qs.toString();
  return `/admin/api/console/sessions/export${q ? '?' + q : ''}`;
}

export function fetchLogs(params: {
  source?: string;
  level?: string;
  keyword?: string;
  cursor?: number;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  if (params.source) qs.set('source', params.source);
  if (params.level) qs.set('level', params.level);
  if (params.keyword) qs.set('keyword', params.keyword);
  if (params.cursor) qs.set('cursor', String(params.cursor));
  if (params.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return getJson<{ items: LogEntry[]; total: number }>(
    `/admin/api/console/ops/logs${q ? '?' + q : ''}`,
  );
}

export function fetchAlerts() {
  return getJson<AlertSnapshot>('/admin/api/console/ops/alerts');
}

export function fetchOpsSummary() {
  return getJson<Record<string, unknown>>('/admin/api/console/ops/summary');
}

export function fetchHealth() {
  return getJson<Record<string, unknown>>('/api/health');
}

export function fetchMetrics() {
  return getJson<Record<string, unknown>>('/api/metrics');
}
