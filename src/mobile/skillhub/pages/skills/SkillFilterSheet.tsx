/**
 * 技能列表筛选 Bottom Sheet。
 *
 * 与 useSkillsList 的过滤状态解耦：
 *   - sheet 内部使用本地 state 编辑临时值
 *   - 点击"应用"才回写到 hook（避免抖动）
 *   - 点击"重置"清空
 */
import { useEffect, useState } from 'react';
import MobileBottomSheet from '../../../shared/MobileBottomSheet';
import { SKILL_STATUS_FILTERS } from '@skillhub/hooks/useSkillsList';
import styles from './skills.module.css';

interface Props {
  open: boolean;
  /** sheet 打开时的当前过滤值 */
  initialOwner: string;
  initialStatus: string;
  owners: string[];
  onClose: () => void;
  onApply: (next: { owner: string; status: string }) => void;
}

const STATUS_LABELS: Record<string, string> = {
  '': '全部',
  active: 'Active',
  degraded: 'Degraded',
  unavailable: 'Unavailable',
};

export default function SkillFilterSheet({
  open,
  initialOwner,
  initialStatus,
  owners,
  onClose,
  onApply,
}: Props) {
  const [owner, setOwner] = useState(initialOwner);
  const [status, setStatus] = useState(initialStatus);

  // sheet 重新打开时同步外部值
  useEffect(() => {
    if (open) {
      setOwner(initialOwner);
      setStatus(initialStatus);
    }
  }, [open, initialOwner, initialStatus]);

  const handleReset = () => {
    setOwner('');
    setStatus('');
  };

  const handleApply = () => {
    onApply({ owner, status });
  };

  return (
    <MobileBottomSheet
      open={open}
      onClose={onClose}
      title="筛选技能"
      footer={
        <div className={styles.filterFooter}>
          <button type="button" className={styles.sheetCancelBtn} onClick={handleReset}>
            重置
          </button>
          <button type="button" className={styles.sheetConfirmBtn} onClick={handleApply}>
            应用筛选
          </button>
        </div>
      }
    >
      <div className={styles.filterSheet}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>状态</span>
          <div className={styles.filterChips}>
            {SKILL_STATUS_FILTERS.map((s) => {
              const active = status === s;
              return (
                <button
                  key={s || 'all'}
                  type="button"
                  className={`${styles.filterChip} ${active ? styles.filterChipActive : ''}`}
                  onClick={() => setStatus(s)}
                  aria-pressed={active}
                >
                  {STATUS_LABELS[s] ?? s}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Owner</span>
          <div className={styles.filterChips}>
            <button
              type="button"
              className={`${styles.filterChip} ${owner === '' ? styles.filterChipActive : ''}`}
              onClick={() => setOwner('')}
              aria-pressed={owner === ''}
            >
              全部
            </button>
            {owners.map((o) => {
              const active = owner === o;
              return (
                <button
                  key={o}
                  type="button"
                  className={`${styles.filterChip} ${active ? styles.filterChipActive : ''}`}
                  onClick={() => setOwner(o)}
                  aria-pressed={active}
                >
                  {o}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </MobileBottomSheet>
  );
}
