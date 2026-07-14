/**
 * 版本回滚二次确认 Bottom Sheet。
 *
 * 这是不可撤销的破坏性操作（覆盖当前线上版本），所以与 ApproveConfirmSheet
 * 不同：主操作按钮使用 danger 色，并把目标版本号清晰展示在描述里。
 */
import MobileBottomSheet from '../../../shared/MobileBottomSheet';
import styles from './history.module.css';

interface Props {
  open: boolean;
  loading: boolean;
  /** 当前选中的 skillId，用于副文案展示 */
  skillId?: string | null;
  /** 目标版本号 */
  targetVersion?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

export default function RollbackConfirmSheet({
  open,
  loading,
  skillId,
  targetVersion,
  onClose,
  onConfirm,
}: Props) {
  return (
    <MobileBottomSheet
      open={open}
      title="确认回滚"
      onClose={onClose}
      footer={
        <div className={styles.rollbackFooter}>
          <button
            type="button"
            className={styles.rollbackConfirmBtn}
            disabled={loading || !targetVersion}
            onClick={onConfirm}
          >
            {loading ? '回滚中…' : `回滚到 ${targetVersion ?? ''}`}
          </button>
          <button
            type="button"
            className={styles.rollbackCancelBtn}
            disabled={loading}
            onClick={onClose}
          >
            取消
          </button>
        </div>
      }
    >
      <div className={styles.rollbackSheet}>
        <p className={styles.rollbackDesc}>
          您将把
          {skillId ? (
            <>
              {' '}
              <span className={styles.rollbackTarget}>{skillId}</span>{' '}
            </>
          ) : (
            ' '
          )}
          回滚到版本{' '}
          <span className={styles.rollbackTarget}>{targetVersion ?? ''}</span>。
          <br />
          此操作会覆盖当前线上版本，且不可撤销。
        </p>
      </div>
    </MobileBottomSheet>
  );
}
