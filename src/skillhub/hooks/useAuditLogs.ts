/**
 * useAuditLogs — Skill Hub 审计日志业务流。
 *
 * 抽自 PC 端 `tabs/AuditTab.tsx`，PC + 移动端共用一份状态机和接口语义。
 *
 * 暴露：
 *   logs                                所有日志
 *   actions                             后端给的可选 action 枚举
 *   filter / setFilter / patchFilter    过滤条件（skill_id / user / action / since / until）
 *   loading / error
 *   reload()                            手动刷新（依赖 filter 已通过 useEffect 自动刷）
 *   resetFilter()                       清空 filter（同时触发 reload）
 *   clearError()
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getJson } from '@shared/api/httpClient';
import { normalizeAuditResponse, type AuditLogItem } from '../apiAdapters';

export interface AuditFilter {
  skill_id: string;
  user: string;
  action: string;
  /** ISO date 'YYYY-MM-DD' */
  since: string;
  /** ISO date 'YYYY-MM-DD' */
  until: string;
}

export const EMPTY_AUDIT_FILTER: AuditFilter = {
  skill_id: '',
  user: '',
  action: '',
  since: '',
  until: '',
};

export interface AuditLogsApi {
  logs: AuditLogItem[];
  actions: string[];
  filter: AuditFilter;
  setFilter: (next: AuditFilter) => void;
  patchFilter: (patch: Partial<AuditFilter>) => void;
  resetFilter: () => void;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  clearError: () => void;
}

function toTs(value: string, end = false): string {
  if (!value) return '';
  const d = new Date(value + (end ? 'T23:59:59' : 'T00:00:00'));
  return Number.isNaN(d.getTime()) ? '' : String(Math.floor(d.getTime() / 1000));
}

export function useAuditLogs(): AuditLogsApi {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<AuditFilter>(EMPTY_AUDIT_FILTER);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    const qs = new URLSearchParams({ limit: '80' });
    if (filter.skill_id) qs.set('skill_id', filter.skill_id);
    if (filter.user) qs.set('user', filter.user);
    if (filter.action) qs.set('action', filter.action);
    const since = toTs(filter.since);
    const until = toTs(filter.until, true);
    if (since) qs.set('since', since);
    if (until) qs.set('until', until);
    try {
      const env = await getJson<Record<string, unknown>>(`/skill-hub/api/audit?${qs}`);
      if (env.success) {
        setLogs(normalizeAuditResponse(env.data));
        const rawActions = env.data?.actions;
        if (Array.isArray(rawActions)) {
          setActions(rawActions.filter((x): x is string => typeof x === 'string'));
        }
      } else {
        setError(env.error ?? '审计日志加载失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '审计日志加载失败');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const patchFilter = useCallback((patch: Partial<AuditFilter>) => {
    setFilter((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetFilter = useCallback(() => {
    setFilter(EMPTY_AUDIT_FILTER);
  }, []);

  const clearError = useCallback(() => setError(''), []);

  return useMemo(
    () => ({
      logs,
      actions,
      filter,
      setFilter,
      patchFilter,
      resetFilter,
      loading,
      error,
      reload,
      clearError,
    }),
    [logs, actions, filter, patchFilter, resetFilter, loading, error, reload, clearError],
  );
}
