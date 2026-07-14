/**
 * 单条申请卡片。
 *
 * 布局：
 * - 首行：Skill ID（等宽）+ 操作徽标（更新=primary-soft、新建=accent-soft）+ 提交时间（右侧灰）
 * - 中行：状态徽标（含 pending-review 的脉冲点）
 * - 底行：撤回按钮（仅 pending-review 显示，红描边）
 *
 * 撤回点击仅暴露 onWithdrawClick 给父组件（由父决定打开 WithdrawSheet）。
 */
import type { ApprovalItem } from '@skillhub/apiAdapters';
import { STATUS_LABELS } from '@skillhub/hooks/useMyApprovals';
import styles from './mine.module.css';

interface Props {
  item: ApprovalItem;
  withdrawing?: boolean;
  onWithdrawClick: (requestId: string) => void;
}

const MODE_LABEL: Record<string, string> = {
  create: '新建',
  update: '更新',
};

function statusBadgeClass(status: string): string {
  if (status === 'published') return styles.statusBadgePublished;
  if (status === 'pending-review') return styles.statusBadgePending;
  if (status === 'rejected' || status === 'publish-failed') return styles.statusBadgeFailed;
  if (status === 'withdrawn') return styles.statusBadgeWithdrawn;
  return styles.statusBadgeMuted;
}

function modeBadgeClass(mode: string): string {
  if (mode === 'update') return styles.modeBadgeUpdate;
  if (mode === 'create') return styles.modeBadgeCreate;
  return styles.modeBadgeMuted;
}

function formatTime(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return '—';
  return new Date(ts * 1000).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MyApprovalCard({ item, withdrawing, onWithdrawClick }: Props) {
  const isPending = item.status === 'pending-review';
  return (
    <article className={styles.card} aria-label={`申请 ${item.skillId}`}>
      <div className={styles.cardHead}>
        <code className={styles.skillId}>{item.skillId}</code>
        <span className={`${styles.modeBadge} ${modeBadgeClass(item.mode)}`}>
          {MODE_LABEL[item.mode] ?? item.mode}
        </span>
        <span className={styles.submittedAt}>{formatTime(item.submittedAt)}</span>
      </div>

      <div className={styles.cardMeta}>
        <span className={`${styles.statusBadge} ${statusBadgeClass(item.status)}`}>
          {isPending && <span className={styles.pulseDot} aria-hidden="true" />}
          {STATUS_LABELS[item.status] ?? item.status}
        </span>
        {item.submitter && (
          <span className={styles.submitter}>提交人：{item.submitter}</span>
        )}
      </div>

      {isPending && (
        <div className={styles.cardActions}>
          <button
            type="button"
            className={styles.withdrawBtn}
            disabled={withdrawing}
            onClick={() => onWithdrawClick(item.requestId)}
          >
            {withdrawing ? '撤回中…' : '撤回申请'}
          </button>
        </div>
      )}
    </article>
  );
}
