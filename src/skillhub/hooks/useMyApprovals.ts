/**
 * useMyApprovals — Skill Hub 我的申请列表 + 撤回 业务流 hook。
 *
 * 抽自 PC 端 `tabs/MyTab.tsx`，移动端与 PC 端共用同一份状态机和接口语义。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getJson, postJson } from '@shared/api/httpClient';
import { normalizeApprovalItemsResponse, type ApprovalItem } from '../apiAdapters';

export const STATUS_LABELS: Record<string, string> = {
  'pending-review': '待审批',
  'published': '已发布',
  'rejected': '已拒绝',
  'withdrawn': '已撤回',
  'publish-failed': '发布失败',
};

export const STATUS_FILTERS = ['', 'pending-review', 'published', 'rejected', 'withdrawn', 'publish-failed'] as const;

export interface MyApprovalsApi {
  list: ApprovalItem[];
  filtered: ApprovalItem[];
  loading: boolean;
  error: string;
  filterStatus: string;
  setFilterStatus: (s: string) => void;
  reload: () => Promise<void>;
  /** 撤回指定申请；reason 不填则发空字符串 */
  withdraw: (requestId: string, reason: string) => Promise<void>;
  /** 每条申请的"撤回操作中"状态 */
  actionState: Record<string, boolean>;
}

export function useMyApprovals(): MyApprovalsApi {
  const [list, setList] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [actionState, setActionState] = useState<Record<string, boolean>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const env = await getJson<unknown>('/skill-hub/api/skills/approvals/my');
      if (env.success) {
        setList(normalizeApprovalItemsResponse(env.data));
      } else {
        setError(env.error ?? '申请记录加载失败');
      }
    } catch (e) {
      console.error('[useMyApprovals] reload failed', e);
      setError(e instanceof Error ? e.message : '申请记录加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const withdraw = useCallback(async (requestId: string, reason: string) => {
    setActionState((s) => ({ ...s, [requestId]: true }));
    setError('');
    try {
      const env = await postJson(
        `/skill-hub/api/skills/approvals/${encodeURIComponent(requestId)}/withdraw`,
        { reason },
      );
      if (!env.success) setError(env.error ?? '撤回失败');
      await reload();
    } catch (e) {
      console.error('[useMyApprovals] withdraw failed', e);
      setError(e instanceof Error ? e.message : '撤回失败');
    } finally {
      setActionState((s) => ({ ...s, [requestId]: false }));
    }
  }, [reload]);

  const filtered = useMemo(
    () => (filterStatus ? list.filter((r) => r.status === filterStatus) : list),
    [filterStatus, list],
  );

  return {
    list,
    filtered,
    loading,
    error,
    filterStatus,
    setFilterStatus,
    reload,
    withdraw,
    actionState,
  };
}
