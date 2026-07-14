/**
 * 申请页 · 底部 Sticky 操作条（视图层）。
 *
 * 状态切换：
 * - 未验证（validationResult 为空）：满宽「上传并验证」主按钮
 * - 已验证：左主「提交审核」+ 右 ghost「取消草稿」
 *
 * 危险动作（取消草稿）走 window.confirm 二次确认；这是移动端首版的最小干扰确认方式。
 * 提交时 status='error' 禁用，避免直接发布失败包。
 */
import type { UploadFlowApi } from '@skillhub/hooks/useUploadFlow';
import styles from './parts.module.css';

interface Props {
  flow: UploadFlowApi;
}

export default function StickyActionBar({ flow }: Props) {
  const { validationResult, uploading, publishing, upload, submitPublish, cancelStaging, zipFile, slug } = flow;

  const canUpload = !!zipFile && slug.trim().length > 0 && !uploading;
  const canSubmit = !!validationResult && validationResult.status !== 'error' && !publishing;

  const handleCancel = () => {
    if (window.confirm('确定要取消当前草稿吗？已上传的暂存内容将被清除。')) {
      void cancelStaging();
    }
  };

  return (
    <div className={styles.stickyBar} role="toolbar" aria-label="申请操作">
      {!validationResult ? (
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={!canUpload}
          onClick={() => void upload()}
        >
          {uploading ? '上传校验中…' : '上传并验证'}
        </button>
      ) : (
        <>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={!canSubmit}
            onClick={() => void submitPublish()}
          >
            {publishing ? '提交中…' : '提交审核'}
          </button>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={handleCancel}
            disabled={publishing}
          >
            取消草稿
          </button>
        </>
      )}
    </div>
  );
}
