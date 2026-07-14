/**
 * Skill Hub 移动端 · 审批页（/approve）。
 *
 * 视图层：sticky 徽标条 + 卡片列表 + Approve 二次确认 Sheet + Source Drawer。
 * 业务流：直接消费 useApprovalReview（PC 端 PendingTab 同源 hook）。
 *
 * 数据接口（与 PC 完全一致，避免再写一份）：
 *   GET  /skill-hub/api/skills/approvals/pending
 *   POST /skill-hub/api/skills/approvals/{id}/approve
 *   POST /skill-hub/api/skills/approvals/{id}/reject  body: { reason }
 */
import { useMemo, useState } from 'react';
import type { Me } from '@shared/types/user';
import { useApprovalReview } from '@skillhub/hooks/useApprovalReview';
import MobilePageTitle from '../../components/MobilePageTitle';
import ReviewCard from './ReviewCard';
import ApproveConfirmSheet from './ApproveConfirmSheet';
import MobileSourceDrawer from './MobileSourceDrawer';
import styles from './review.module.css';

interface MobileReviewPageProps {
  me?: Me | null;
}

export default function MobileReviewPage({ me }: MobileReviewPageProps = {}) {
  const review = useApprovalReview();
  const { list, count, loading, error, comments, actionState, reload, setComment, approve, reject } = review;

  // 二次确认 sheet 状态：当前审批 requestId
  const [approveTarget, setApproveTarget] = useState<string | null>(null);
  // 原文抽屉状态
  const [sourceTarget, setSourceTarget] = useState<string | null>(null);

  const refreshedHint = useMemo(() => {
    if (loading) return '加载中…';
    return '刚刚刷新';
  }, [loading]);

  const targetItem = approveTarget
    ? list.find((i) => i.requestId === approveTarget) ?? null
    : null;
  const sourceItem = sourceTarget
    ? list.find((i) => i.requestId === sourceTarget) ?? null
    : null;

  const handleConfirmApprove = () => {
    if (!approveTarget) return;
    void (async () => {
      await approve(approveTarget);
      setApproveTarget(null);
    })();
  };

  const sheetLoading = approveTarget ? !!actionState[approveTarget] : false;

  return (
    <main className={styles.main} aria-label="审批列表">
      <MobilePageTitle
        title="审批"
        me={me}
        icon={
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2 4 6v6c0 5 3.5 9.4 8 10 4.5-.6 8-5 8-10V6l-8-4z" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
        }
      />
      <div className={styles.stickyBar}>
        <div className={styles.stickyLeft}>
          <span className={styles.countBadge}>待审批 {count}</span>
          <span className={styles.refreshLabel}>{refreshedHint}</span>
        </div>
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={() => void reload()}
          disabled={loading}
          aria-label="刷新审批列表"
          title="刷新"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
            <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
          </svg>
        </button>
      </div>

      {error && <div className={styles.errorNotice}>{error}</div>}

      {loading ? (
        <div className={styles.skeletonStack}>
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
        </div>
      ) : list.length === 0 ? (
        <div className={styles.emptyState}>
          <h3 className={styles.emptyTitle}>暂无待审批请求</h3>
          <p className={styles.emptyDesc}>
            所有提交均已处理。新提交会自动出现在这里，下拉或点击右上角刷新按钮可手动同步。
          </p>
        </div>
      ) : (
        <ul className={styles.cardList}>
          {list.map((item) => (
            <li key={item.requestId}>
              <ReviewCard
                item={item}
                comment={comments[item.requestId] ?? ''}
                acting={!!actionState[item.requestId]}
                onCommentChange={(v) => setComment(item.requestId, v)}
                onSource={() => setSourceTarget(item.requestId)}
                onApprove={() => setApproveTarget(item.requestId)}
                onReject={() => void reject(item.requestId)}
              />
            </li>
          ))}
        </ul>
      )}

      <ApproveConfirmSheet
        open={!!approveTarget}
        loading={sheetLoading}
        skillId={targetItem?.skillId}
        mode={targetItem?.mode}
        comment={approveTarget ? comments[approveTarget] : undefined}
        onClose={() => {
          if (!sheetLoading) setApproveTarget(null);
        }}
        onConfirm={handleConfirmApprove}
      />

      <MobileSourceDrawer
        open={!!sourceTarget}
        source={
          sourceTarget && sourceItem
            ? {
                kind: 'approval',
                requestId: sourceTarget,
                skillId: sourceItem.skillId,
                mode: sourceItem.mode,
              }
            : null
        }
        onClose={() => setSourceTarget(null)}
      />
    </main>
  );
}
