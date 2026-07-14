/**
 * 申请页 · 新建提交段（视图层）。
 *
 * 组合三个步骤模块 + 校验结果面板 + 已提交回执；
 * 数据动作通过 useUploadFlow 统一调度（PC 与移动端共用同一状态机）。
 *
 * StickyActionBar 不在此渲染，由 MobileApplyPage 在 seg=new 时单独挂载，
 * 以便 toast / sticky / TabBar 三层 fixed 元素层级互不干扰。
 */
import type { UploadFlowApi } from '@skillhub/hooks/useUploadFlow';
import OperationTypeSegment from './OperationTypeSegment';
import SkillIdentityFields from './SkillIdentityFields';
import ZipFilePicker from './ZipFilePicker';
import ValidationResultPanel from './ValidationResultPanel';
import styles from './parts.module.css';

interface Props {
  flow: UploadFlowApi;
}

export default function NewSubmissionView({ flow }: Props) {
  const { validationResult, publishMsg } = flow;

  return (
    <section aria-label="新建提交" className={styles.newSection}>
      <OperationTypeSegment flow={flow} />
      <SkillIdentityFields flow={flow} />
      <ZipFilePicker flow={flow} />

      {validationResult ? (
        <ValidationResultPanel result={validationResult} />
      ) : (
        <div className={styles.preValidateHint} aria-hidden="true">
          完成上方信息后，点击底部「上传并验证」开始预校验。
        </div>
      )}

      {publishMsg && (
        <div className={styles.submittedNotice} role="status">
          {publishMsg}
        </div>
      )}
    </section>
  );
}
