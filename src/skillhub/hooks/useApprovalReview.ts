/**
 * useApprovalReview — Skill Hub 审批 Tab 业务流。
 *
 * 抽自 PC 端 `tabs/PendingTab.tsx`，移动端与 PC 端共用同一份状态机和接口语义。
 *
 * 暴露：
 *   list / loading / error / count
 *   comments[requestId]: string         本地评论草稿（commit/reject 共用）
 *   actionState[requestId]: boolean     单条进行中标记
 *   reload()                            手动刷新
 *   setComment(requestId, text)         编辑评论
 *   approve(requestId)                  POST .../approve
 *   reject(requestId)                   POST .../reject  （body 取 comments[requestId]）
 *   clearError()
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getJson, postJson } from '@shared/api/httpClient';
import { normalizeApprovalItemsResponse, type ApprovalItem } from '../apiAdapters';

export interface ApprovalReviewApi {
  list: ApprovalItem[];
  count: number;
  loading: boolean;
  error: string;
  comments: Record<string, string>;
  actionState: Record<string, boolean>;
  reload: () => Promise<void>;
  setComment: (requestId: string, value: string) => void;
  approve: (requestId: string) => Promise<void>;
  reject: (requestId: string) => Promise<void>;
  clearError: () => void;
}

export function useApprovalReview(options?: { onCountChange?: (n: number) => void }): ApprovalReviewApi {
  const onCountChange = options?.onCountChange;

  const [list, setList] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [comments, setComments] = useState<Record<string, string>>({});
  const [actionState, setActionState] = useState<Record<string, boolean>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const env = await getJson<unknown>('/skill-hub/api/skills/approvals/pending');
      if (env.success) {
        const next = normalizeApprovalItemsResponse(env.data);
        setList(next);
        onCountChange?.(next.length);
      } else {
        setError(env.error ?? '待审批请求加载失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '待审批请求加载失败');
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setComment = useCallback((requestId: string, value: string) => {
    setComments((s) => ({ ...s, [requestId]: value }));
  }, []);

  const runAction = useCallback(
    async (requestId: string, action: 'approve' | 'reject') => {
      setActionState((s) => ({ ...s, [requestId]: true }));
      setError('');
      try {
        const body = action === 'reject' ? { reason: comments[requestId] ?? '' } : undefined;
        const env = await postJson(
          `/skill-hub/api/skills/approvals/${encodeURIComponent(requestId)}/${action}`,
          body,
        );
        if (!env.success) setError(env.error ?? '审批操作失败');
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : '审批操作失败');
      } finally {
        setActionState((s) => ({ ...s, [requestId]: false }));
      }
    },
    [comments, reload],
  );

  const approve = useCallback((id: string) => runAction(id, 'approve'), [runAction]);
  const reject = useCallback((id: string) => runAction(id, 'reject'), [runAction]);

  const clearError = useCallback(() => setError(''), []);

  const count = list.length;

  return useMemo(
    () => ({
      list,
      count,
      loading,
      error,
      comments,
      actionState,
      reload,
      setComment,
      approve,
      reject,
      clearError,
    }),
    [list, count, loading, error, comments, actionState, reload, setComment, approve, reject, clearError],
  );
}
