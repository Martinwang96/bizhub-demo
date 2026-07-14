/**
 * 申请页 · 步骤 2：详细信息（Owner / Skill Slug）。
 *
 * - Owner 选填：留空走平铺 skill；填写后进入 owner 命名空间
 * - Skill Slug 必填：kebab-case
 */
import type { UploadFlowApi } from '@skillhub/hooks/useUploadFlow';
import styles from './parts.module.css';

interface Props {
  flow: UploadFlowApi;
}

export default function SkillIdentityFields({ flow }: Props) {
  const { owner, slug, setOwner, setSlug } = flow;

  return (
    <div className={styles.stepGroup}>
      <div className={styles.stepLabel}>STEP 2 · 详细信息</div>

      <div className={styles.stepBlock}>
        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel} htmlFor="mobile-skill-owner">
            所有者（选填）
          </label>
          <input
            id="mobile-skill-owner"
            className={styles.input}
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="例如 finance / resource"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          />
          <span className={styles.fieldHint}>
            留空表示平铺 skill；填写后进入对应 owner 命名空间。
          </span>
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel} htmlFor="mobile-skill-slug">
            技能标识 <span className={styles.required}>*</span>
          </label>
          <input
            id="mobile-skill-slug"
            className={styles.input}
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="kebab-case，如 income-pnl-analysis"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
          />
        </div>
      </div>
    </div>
  );
}
