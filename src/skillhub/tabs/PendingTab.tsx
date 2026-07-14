/**
 * PendingTab — 待我审批 Tab
 * 迁移自 skill-hub.html #tab-pending
 */
import { memo, useCallback, useEffect, useState } from 'react';
import type { Me } from '@shared/types/user';
import { getJson, postJson } from '@shared/api/httpClient';
import { normalizeApprovalItemsResponse, type ApprovalItem as ApprovalRequest } from '../apiAdapters';
import { CountPill, EmptyState, Notice, SectionCard, SkeletonStack } from '@shared/components';
import SkillMdViewer, { type SkillMdViewerSource } from '../components/SkillMdViewer';
import type { RegisterRefresh } from '../SkillHubApp';
import styles from '@shared/components/common.module.css';

interface Props {
  me: Me | null;
  onCountChange: (count: number) => void;
  onRegisterRefresh?: RegisterRefresh;
}

function PendingTab({ onCountChange, onRegisterRefresh }: Props) {
  const [list, setList] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionState, setActionState] = useState<Record<string, boolean>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [viewerSource, setViewerSource] = useState<SkillMdViewerSource | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const env = await getJson<unknown>('/skill-hub/api/skills/approvals/pending');
      if (env.success) {
        const nextList = normalizeApprovalItemsResponse(env.data);
        setList(nextList);
        onCountChange(nextList.length);
      } else {
        setError(env.error ?? '待审批请求加载失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '待审批请求加载失败');
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    onRegisterRefresh?.(load);
    return () => onRegisterRefresh?.(null);
  }, [onRegisterRefresh, load]);

  const handleAction = useCallback(async (requestId: string, action: 'approve' | 'reject') => {
    setActionState((s) => ({ ...s, [requestId]: true }));
    setError('');
    try {
      const body = action === 'reject' ? { reason: comments[requestId] ?? '' } : undefined;
      const env = await postJson(`/skill-hub/api/skills/approvals/${encodeURIComponent(requestId)}/${action}`, body);
      if (!env.success) setError(env.error ?? '审批操作失败');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '审批操作失败');
    } finally {
      setActionState((s) => ({ ...s, [requestId]: false }));
    }
  }, [comments, load]);

  return (
    <SectionCard
      eyebrow="Review"
      title="待我审批的请求"
      description="快速处理技能创建与更新申请，审批意见会进入审计链路。"
      meta={<CountPill>{list.length}</CountPill>}
    >
      {error && <Notice tone="danger" title="操作失败">{error}</Notice>}

      {loading ? (
        <SkeletonStack widths={[78, 92, 70]} />
      ) : error && list.length === 0 ? (
        <EmptyState
          title="无法加载待审批请求"
          description={error}
          action={<button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => void load()}>重试</button>}
        />
      ) : list.length === 0 ? (
        <EmptyState title="暂无待审批请求" description="新的发布申请会出现在这里，数量也会同步到顶部 Tab。" />
      ) : (
        <div className={styles.approvalList}>
          {list.map((r) => (
            <article key={r.requestId} className={styles.approvalItem}>
              <header className={styles.approvalHeader}>
                <div className={styles.approvalTitle}>
                  <code>{r.skillId}</code>
                  <span className={`${styles.tag} ${styles.tagPrimary}`}>{r.mode}</span>
                </div>
                <span className={styles.approvalMeta}>
                  {r.submitter} · {new Date(r.submittedAt * 1000).toLocaleString('zh-CN')}
                </span>
              </header>
              {r.comment && <Notice tone="info" title="备注">{r.comment}</Notice>}
              <div className={styles.inlineForm}>
                <textarea
                  className={styles.approvalComment}
                  aria-label={`审批意见 ${r.skillId}`}
                  placeholder="审批意见（可选）"
                  value={comments[r.requestId] ?? ''}
                  onChange={(e) => setComments((s) => ({ ...s, [r.requestId]: e.target.value }))}
                />
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnGhost}`}
                  aria-label={`查看原文 ${r.skillId}`}
                  onClick={() => setViewerSource({
                    kind: 'approval',
                    requestId: r.requestId,
                    skillId: r.skillId,
                    mode: r.mode,
                  })}
                >
                  原文
                </button>
                <button type="button" className={styles.btn} disabled={actionState[r.requestId]} onClick={() => void handleAction(r.requestId, 'approve')}>
                  {actionState[r.requestId] ? '处理中' : '批准'}
                </button>
                <button type="button" className={`${styles.btn} ${styles.btnDanger}`} disabled={actionState[r.requestId]} onClick={() => void handleAction(r.requestId, 'reject')}>
                  拒绝
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <SkillMdViewer
        open={viewerSource !== null}
        source={viewerSource}
        onClose={() => setViewerSource(null)}
      />
    </SectionCard>
  );
}

export default memo(PendingTab);
