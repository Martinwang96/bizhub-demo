/**
 * 撤回申请 Action Sheet（基于通用 MobileBottomSheet）。
 *
 * 流程：
 * 1) 选择原因（修改文档 / 类别有误 / 其他原因）；选「其他原因」展开 textarea
 * 2) 底部「取消」+「确认撤回」二段；确认后再走二次 confirm（误触兜底）
 *
 * 提交后由父组件传入的 onConfirm 调用 useMyApprovals.withdraw；本组件仅收集原因文本。
 */
import { useEffect, useState } from 'react';
import MobileBottomSheet from '../../../shared/MobileBottomSheet';
import styles from './mine.module.css';

interface Props {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

const REASON_OPTIONS = [
  { id: 'doc', label: '修改文档' },
  { id: 'category', label: '类别有误' },
  { id: 'other', label: '其他原因' },
] as const;

type ReasonId = typeof REASON_OPTIONS[number]['id'];

export default function WithdrawSheet({ open, loading, onClose, onConfirm }: Props) {
  const [picked, setPicked] = useState<ReasonId | ''>('');
  const [customText, setCustomText] = useState('');

  // 关闭时重置选择，避免下一次打开时残留旧值
  useEffect(() => {
    if (!open) {
      setPicked('');
      setCustomText('');
    }
  }, [open]);

  const buildReason = (): string => {
    if (picked === 'other') return customText.trim();
    if (picked) return REASON_OPTIONS.find((o) => o.id === picked)?.label ?? '';
    return '';
  };

  const handleConfirm = () => {
    const reason = buildReason();
    if (!picked) {
      window.alert('请先选择撤回原因');
      return;
    }
    if (picked === 'other' && !reason) {
      window.alert('请填写撤回原因');
      return;
    }
    if (!window.confirm('确认要撤回该申请吗？此操作不可撤销。')) return;
    onConfirm(reason);
  };

  return (
    <MobileBottomSheet
      open={open}
      title="撤回申请"
      onClose={onClose}
      footer={
        <div className={styles.sheetFooter}>
          <button
            type="button"
            className={styles.sheetCancelBtn}
            onClick={onClose}
            disabled={loading}
          >
            取消
          </button>
          <button
            type="button"
            className={styles.sheetConfirmBtn}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? '撤回中…' : '确认撤回'}
          </button>
        </div>
      }
    >
      <div className={styles.reasonList} role="radiogroup" aria-label="撤回原因">
        {REASON_OPTIONS.map((opt) => (
          <label
            key={opt.id}
            className={`${styles.reasonItem} ${picked === opt.id ? styles.reasonItemActive : ''}`}
          >
            <input
              type="radio"
              name="withdraw-reason"
              value={opt.id}
              checked={picked === opt.id}
              onChange={() => setPicked(opt.id)}
              className={styles.reasonRadio}
            />
            <span className={styles.reasonLabel}>{opt.label}</span>
          </label>
        ))}
      </div>

      {picked === 'other' && (
        <textarea
          className={styles.reasonTextarea}
          placeholder="请填写撤回原因"
          rows={3}
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          maxLength={200}
        />
      )}
    </MobileBottomSheet>
  );
}
