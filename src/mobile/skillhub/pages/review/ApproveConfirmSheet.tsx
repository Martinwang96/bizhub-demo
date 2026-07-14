/**
 * 通过审批二次确认 Bottom Sheet。
 *
 * 与撤回 Sheet 不同，通过审批不需要选择原因，仅做"明确点击 Confirm"的二次确认，
 * 防止误操作。展示当前条目的 skillId / mode / 评论摘要供再次核对。
 */
import MobileBottomSheet from '../../../shared/MobileBottomSheet';
import styles from './review.module.css';

interface Props {
  open: boolean;
  loading: boolean;
  skillId?: string;
  mode?: string;
  comment?: string;
  onClose: () => void;
  onConfirm: () => void;
}

const MODE_LABEL: Record<string, string> = {
  create: '新建',
  update: '更新',
};

export default function ApproveConfirmSheet({
  open,
  loading,
  skillId,
  mode,
  comment,
  onClose,
  onConfirm,
}: Props) {
  return (
    <MobileBottomSheet
      open={open}
      title="确认通过"
      onClose={onClose}
      footer={
        <div className={styles.approveSheetFooter}>
          <button
            type="button"
            className={styles.sheetConfirmBtn}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? '提交中…' : '确认通过'}
          </button>
          <button
            type="button"
            className={styles.sheetCancelBtn}
            disabled={loading}
            onClick={onClose}
          >
            取消
          </button>
        </div>
      }
    >
      <div className={styles.approveSheetBody}>
        <p className={styles.approveSheetDesc}>
          确认通过后将把该提交合入技能库，操作不可撤销。请再次确认条目信息。
        </p>
        <div className={styles.approveSheetMeta}>
          {skillId && (
            <div className={styles.approveSheetMetaRow}>
              <span className={styles.approveSheetMetaKey}>技能</span>
              <span className={styles.approveSheetMetaVal} title={skillId}>{skillId}</span>
            </div>
          )}
          {mode && (
            <div className={styles.approveSheetMetaRow}>
              <span className={styles.approveSheetMetaKey}>类型</span>
              <span className={styles.approveSheetMetaVal}>{MODE_LABEL[mode] ?? mode}</span>
            </div>
          )}
          {comment && comment.trim() !== '' && (
            <div className={styles.approveSheetMetaRow}>
              <span className={styles.approveSheetMetaKey}>评论</span>
              <span className={styles.approveSheetMetaVal} title={comment}>
                {comment}
              </span>
            </div>
          )}
        </div>
      </div>
    </MobileBottomSheet>
  );
}
