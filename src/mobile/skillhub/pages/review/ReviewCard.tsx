/**
 * 单条审批卡片（移动端审批页）。
 *
 * 字段映射来自 ApprovalItem：skillId / submitter / mode / submittedAt / comment。
 * 评论草稿由父级 useApprovalReview.comments[requestId] 管理；输入框 focus 时展开高度。
 */
import type { ApprovalItem } from '@skillhub/apiAdapters';
import styles from './review.module.css';

interface Props {
  item: ApprovalItem;
  comment: string;
  acting: boolean;
  onCommentChange: (value: string) => void;
  onSource: () => void;
  onApprove: () => void;
  onReject: () => void;
}

const MODE_LABEL: Record<string, string> = {
  create: '新建',
  update: '更新',
};

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

export default function ReviewCard({
  item,
  comment,
  acting,
  onCommentChange,
  onSource,
  onApprove,
  onReject,
}: Props) {
  return (
    <article className={styles.card} aria-label={`审批 ${item.skillId}`}>
      <header className={styles.cardHead}>
        <div className={styles.cardHeadTop}>
          <code className={styles.skillId} title={item.skillId}>{item.skillId}</code>
          <span className={`${styles.modeBadge} ${modeBadgeClass(item.mode)}`}>
            {MODE_LABEL[item.mode] ?? item.mode}
          </span>
        </div>
        <div className={styles.cardMeta}>
          {item.submitter && <span>提交人：{item.submitter}</span>}
          <span>{formatTime(item.submittedAt)}</span>
        </div>
      </header>

      {item.comment && item.comment.trim() !== '' && (
        <div className={styles.remark}>
          <svg
            className={styles.remarkIcon}
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>{item.comment}</span>
        </div>
      )}

      <div>
        <label htmlFor={`comment-${item.requestId}`} className={styles.commentLabel}>
          审批评论（可选）
        </label>
        <textarea
          id={`comment-${item.requestId}`}
          className={styles.commentTextarea}
          rows={1}
          placeholder="点击输入审批评论"
          value={comment}
          onChange={(e) => onCommentChange(e.target.value)}
          disabled={acting}
        />
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnSource}`}
          onClick={onSource}
          disabled={acting}
        >
          原文
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnApprove}`}
          onClick={onApprove}
          disabled={acting}
        >
          {acting ? '处理中…' : '通过'}
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnReject}`}
          onClick={onReject}
          disabled={acting}
        >
          拒绝
        </button>
      </div>
    </article>
  );
}
