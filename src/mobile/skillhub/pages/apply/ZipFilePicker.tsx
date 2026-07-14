/**
 * 申请页 · 步骤 3：选择技能 zip 压缩包 + 已选文件回显。
 *
 * 与后端两阶段上传对齐：用户把整个 skill 目录（含 SKILL.md、references/、
 * 可选 scripts/）压缩为单个 .zip 上传，服务端解压 + 校验 + 暂存。
 * - 虚线大块：点击触发隐藏 file input（accept=.zip, 单选）
 * - 类型/大小校验由 useUploadFlow.selectZip 统一把关（非法时 toast）
 * - scripts/ 脚本语言无关、不限后缀，建议含 shebang 首行（如 #!/usr/bin/env python3），
 *   发布后可被 AI 在沙箱执行，需审批人核验
 */
import { useCallback, useRef } from 'react';
import type { UploadFlowApi } from '@skillhub/hooks/useUploadFlow';
import styles from './parts.module.css';

interface Props {
  flow: UploadFlowApi;
}

export default function ZipFilePicker({ flow }: Props) {
  const { zipFile, slug, selectZip, clearZip } = flow;
  const inputRef = useRef<HTMLInputElement>(null);

  const handlePick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    // 同名文件再次选择时也能触发 onChange
    e.target.value = '';
    if (file) selectZip(file);
  }, [selectZip]);

  const slugText = slug.trim() || '<slug>';

  return (
    <div className={styles.stepGroup}>
      <div className={styles.stepLabel}>STEP 3 · 技能压缩包</div>

      <div className={styles.stepBlock}>
        <button
          type="button"
          className={styles.dropZone}
          onClick={handlePick}
          aria-label="选择 zip 压缩包"
        >
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span className={styles.dropZoneText}>选择 zip 压缩包</span>
          <span className={styles.dropZoneHint}>
            zip 顶层须为 <code>{slugText}/</code> 目录，内含 SKILL.md（必需）、references/、
            可选 scripts/（脚本不限语言/后缀，建议含 shebang 首行）。整包 ≤ 8 MB
          </span>
        </button>

        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={handleChange}
        />

        {zipFile && (
          <ul className={styles.fileList} aria-label="已选压缩包">
            <li className={styles.fileItem}>
              <span
                className={`${styles.fileBadge} ${styles.fileBadgeSkill}`}
                aria-label="ZIP"
              >
                ZIP
              </span>
              <span className={styles.fileName}>{zipFile.name}</span>
              <span className={styles.fileSize}>{(zipFile.size / 1024).toFixed(1)} KB</span>
              <button
                type="button"
                className={styles.fileRemove}
                aria-label={`移除 ${zipFile.name}`}
                onClick={() => clearZip()}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="6" y1="18" x2="18" y2="6" />
                </svg>
              </button>
            </li>
          </ul>
        )}

        <p className={styles.scriptsWarn} role="note">
          若压缩包含 scripts/，发布后这些脚本可被 AI 调用并在沙箱中执行（无网络、无密钥、
          有资源/超时限制）。请确保脚本来源可信，审批人会逐一核验。
        </p>
      </div>
    </div>
  );
}
