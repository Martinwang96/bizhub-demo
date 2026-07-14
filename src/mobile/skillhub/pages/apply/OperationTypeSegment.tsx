/**
 * 申请页 · 步骤 1：操作类型（创建 / 更新）+ 现有 Skill 下拉。
 *
 * 选择「更新」时，下方显示「选择现有 Skill」下拉；选项数据由 useUploadFlow 自动加载。
 * 选中 Skill 会同步回填 owner / slug，避免用户手填。
 */
import type { UploadFlowApi } from '@skillhub/hooks/useUploadFlow';
import styles from './parts.module.css';

interface Props {
  flow: UploadFlowApi;
}

export default function OperationTypeSegment({ flow }: Props) {
  const { uploadMode, setUploadMode, skillOptions, owner, slug, setOwner, setSlug } = flow;
  const currentSkillId = owner ? `${owner}/${slug}` : slug;

  return (
    <div className={styles.stepGroup}>
      <div className={styles.stepLabel}>STEP 1 · 操作类型</div>

      <div className={styles.stepBlock}>
        <div className={styles.opTypeGroup} role="radiogroup" aria-label="操作类型">
          <button
            type="button"
            role="radio"
            aria-checked={uploadMode === 'create'}
            className={`${styles.opTypeBtn} ${uploadMode === 'create' ? styles.opTypeBtnActive : ''}`}
            onClick={() => setUploadMode('create')}
          >
            创建
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={uploadMode === 'update'}
            className={`${styles.opTypeBtn} ${uploadMode === 'update' ? styles.opTypeBtnActive : ''}`}
            onClick={() => setUploadMode('update')}
          >
            更新
          </button>
        </div>

        {uploadMode === 'update' && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel} htmlFor="mobile-skill-picker">
              选择现有 Skill
            </label>
            <select
              id="mobile-skill-picker"
              className={styles.select}
              value={currentSkillId}
              onChange={(e) => {
                const picked = skillOptions.find((item) => item.skillId === e.target.value);
                if (picked) {
                  setOwner(picked.owner ?? '');
                  setSlug(picked.slug);
                } else {
                  // 选中"请选择"占位时清空（避免误带历史值）
                  setOwner('');
                  setSlug('');
                }
              }}
            >
              <option value="">请选择</option>
              {skillOptions.map((item) => (
                <option key={item.skillId} value={item.skillId}>
                  {item.skillId}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
