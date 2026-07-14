/**
 * 我的申请状态筛选 chip（横向滚动）。
 *
 * 全部 / 待审核 / 已发布 / 已拒绝 / 已撤回 / 发布失败
 * 状态值与 useMyApprovals.STATUS_FILTERS 对齐。
 */
import { STATUS_FILTERS, STATUS_LABELS } from '@skillhub/hooks/useMyApprovals';
import styles from './mine.module.css';

interface Props {
  value: string;
  onChange: (next: string) => void;
}

export default function StatusFilterChips({ value, onChange }: Props) {
  return (
    <div className={styles.chipsScroller} role="tablist" aria-label="申请状态筛选">
      {STATUS_FILTERS.map((s) => {
        const label = s === '' ? '全部' : STATUS_LABELS[s] ?? s;
        const active = value === s;
        return (
          <button
            key={s || 'all'}
            type="button"
            role="tab"
            aria-selected={active}
            className={`${styles.chip} ${active ? styles.chipActive : ''}`}
            onClick={() => onChange(s)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
