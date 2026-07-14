/**
 * UploadTab — 上传 / 发布 Tab
 * 迁移自 skill-hub.html #tab-upload
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { Me } from '@shared/types/user';
import { getJson, postForm, postJson, del } from '@shared/api/httpClient';
import {
  normalizeSkillsResponse,
  type SkillItem,
} from '../apiAdapters';
import {
  getHttpErrorMessage,
  normalizeUploadResponse,
  type ValidationResultView,
} from '../uploadHelpers';
import { EmptyState, Notice, SectionCard, SelectInput } from '@shared/components';
import styles from '@shared/components/common.module.css';

interface Props {
  me: Me | null;
}

type ToastTone = 'success' | 'error' | 'info' | 'warning';

// 上传包体上限（与后端 SKILL_HUB_MAX_PACKAGE_SIZE 默认 8MB 对齐）
const MAX_ZIP_BYTES = 8 * 1024 * 1024;

function UploadTab({}: Props) {
  const [uploadMode, setUploadMode] = useState<'create' | 'update'>('create');
  const [owner, setOwner] = useState('');
  const [slug, setSlug] = useState('');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [skillOptions, setSkillOptions] = useState<SkillItem[]>([]);
  const [validationResult, setValidationResult] = useState<ValidationResultView | null>(null);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState('');
  const [toast, setToast] = useState<{ type: ToastTone; msg: string } | null>(null);

  const zipInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (uploadMode !== 'update') return;
    void getJson<unknown>('/skill-hub/api/skills').then((env) => {
      if (env.success) setSkillOptions(normalizeSkillsResponse(env.data));
    }).catch(() => {});
  }, [uploadMode]);

  const showToast = useCallback((msg: string, type: ToastTone = 'info') => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handlePickZip = useCallback(() => {
    zipInputRef.current?.click();
  }, []);

  const handleZipChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!file) return;
    const isZip = file.name.toLowerCase().endsWith('.zip')
      || file.type === 'application/zip'
      || file.type === 'application/x-zip-compressed';
    if (!isZip) { showToast('请选择 .zip 压缩包', 'error'); return; }
    if (file.size > MAX_ZIP_BYTES) {
      showToast(`压缩包超过 ${(MAX_ZIP_BYTES / 1024 / 1024).toFixed(0)} MB`, 'error');
      return;
    }
    setZipFile(file);
  }, [showToast]);

  const handleUpload = useCallback(async () => {
    if (!zipFile) { showToast('请先选择 zip 压缩包', 'error'); return; }
    if (!slug.trim()) { showToast('请填写 Skill Slug', 'error'); return; }

    setUploading(true);
    setValidationResult(null);
    setPublishMsg('');

    try {
      const form = new FormData();
      form.append('file', zipFile);
      form.append('mode', uploadMode);
      if (owner.trim()) form.append('owner', owner.trim());
      form.append('skill_slug', slug.trim());

      const env = await postForm<unknown>('/skill-hub/api/skills/upload', form);
      if (env.success && env.data) {
        setValidationResult(normalizeUploadResponse(env.data));
        showToast('上传成功，请查看校验结果', 'success');
      } else {
        showToast(env.error ?? '上传失败', 'error');
      }
    } catch (e) {
      showToast(getHttpErrorMessage(e, '上传失败'), 'error');
    } finally {
      setUploading(false);
    }
  }, [zipFile, slug, owner, uploadMode, showToast]);

  const handleSubmitPublish = useCallback(async () => {
    if (!validationResult?.stagingId) return;
    setPublishing(true);
    try {
      const env = await postJson<{ requestId?: string; request_id?: string }>(
        '/skill-hub/api/skills/publish',
        { job_id: validationResult.stagingId },
      );
      if (env.success) {
        setPublishMsg(`已提交审批，申请 ID: ${env.data?.requestId ?? env.data?.request_id ?? ''}`);
        setValidationResult(null);
        showToast('提交成功', 'success');
      } else {
        showToast(env.error ?? '提交失败', 'error');
      }
    } catch (e) {
      showToast(getHttpErrorMessage(e, '提交失败'), 'error');
    } finally {
      setPublishing(false);
    }
  }, [validationResult, showToast]);

  const handleCancelStaging = useCallback(async () => {
    if (!validationResult?.stagingId) return;
    try {
      await del(`/skill-hub/api/skills/staging/${encodeURIComponent(validationResult.stagingId)}`);
      setValidationResult(null);
      showToast('已取消暂存', 'info');
    } catch (e) {
      showToast(getHttpErrorMessage(e, '取消暂存失败'), 'error');
    }
  }, [validationResult, showToast]);

  const toastClass = toast?.type === 'success'
    ? styles.toastSuccess
    : toast?.type === 'error'
      ? styles.toastError
      : toast?.type === 'warning'
        ? styles.toastWarn
        : styles.toastInfo;

  return (
    <>
      {toast && (
        <div className={styles.toastRoot} role="status" aria-live="polite">
          <div className={`${styles.toast} ${toastClass}`}>{toast.msg}</div>
        </div>
      )}

      <SectionCard
        eyebrow="Step 1"
        title="上传技能包"
        description="把整个 skill 目录（含 SKILL.md、references/、可选 scripts/）压缩为 zip 后上传，先暂存并校验，通过后再提交审批。"
      >
        <div className={styles.formGrid}>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="upload-mode">操作类型</label>
            <SelectInput
              id="upload-mode"
              surface="solid"
              value={uploadMode}
              onChange={(next) => setUploadMode(next as 'create' | 'update')}
              allowInput={false}
              clearable={false}
              options={[
                { value: 'create', label: 'create（新建）' },
                { value: 'update', label: 'update（变更现有）' },
              ]}
            />
          </div>

          {uploadMode === 'update' && skillOptions.length > 0 && (
            <div className={styles.formRow}>
              <label className={styles.formLabel} htmlFor="skill-picker">选择现有 Skill</label>
              <SelectInput
                id="skill-picker"
                value={owner ? `${owner}/${slug}` : slug}
                onChange={(next) => {
                  const picked = skillOptions.find((item) => item.skillId === next);
                  if (picked) {
                    setOwner(picked.owner ?? '');
                    setSlug(picked.slug);
                  }
                }}
                options={[{ value: '', label: '请选择' }, ...skillOptions.map((item) => ({ value: item.skillId, label: item.skillId }))]}
              />
            </div>
          )}

          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="skill-owner">Owner</label>
            <div className={styles.fieldStack}>
              <input
                id="skill-owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="例如 finance / resource"
              />
              <span className={styles.fieldHint}>留空表示平铺 skill；填写后会进入对应 owner 命名空间。</span>
            </div>
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="skill-slug">Skill Slug</label>
            <input
              id="skill-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="kebab-case，例如 income-pnl-analysis"
            />
          </div>

          <div className={styles.formRow}>
            <span className={styles.formLabel}>技能压缩包</span>
            <div className={styles.fieldStack}>
              <div className={styles.uploadActions}>
                <button type="button" className={styles.btn} onClick={handlePickZip}>
                  选择 zip 压缩包
                </button>
                <span className={styles.fieldHint}>
                  zip 顶层须为 <code>{slug.trim() || '<slug>'}/</code> 目录，内含 <code>SKILL.md</code>
                  （必需）、<code>references/</code>、可选 <code>scripts/</code>（脚本不限语言/后缀，建议含 shebang 首行如 <code>#!/usr/bin/env python3</code>）。整包 ≤ 8 MB
                </span>
                <input
                  ref={zipInputRef}
                  type="file"
                  accept=".zip,application/zip"
                  hidden
                  onChange={handleZipChange}
                />
              </div>

              <div className={styles.dropZone}>
                {!zipFile ? (
                  <EmptyState title="尚未选择压缩包" description="把 SKILL.md / references/ / scripts/ 放在以 slug 命名的目录下整体压缩为 zip 再上传。" />
                ) : (
                  <div className={styles.fileList}>
                    <div className={styles.fileItem}>
                      <span className={`${styles.tag} ${styles.tagSuccess}`}>ZIP</span>
                      <span className={styles.fileName}>{zipFile.name}</span>
                      <span className={styles.tableMeta}>{(zipFile.size / 1024).toFixed(1)} KB</span>
                      <button type="button" aria-label="移除压缩包" onClick={() => setZipFile(null)} className={styles.iconButton}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <Notice tone="warning" title="scripts/ 将在运行时被沙箱执行">
                若包含 scripts/，发布后这些脚本可被 AI 调用并在沙箱中执行（无网络、无密钥、有资源/超时限制）。请确保脚本来源可信，审批人会逐一核验。
              </Notice>
            </div>
          </div>

          <div className={styles.formRow}>
            <span className={styles.formLabel} />
            <div className={styles.uploadActions}>
              <button type="button" className={styles.btn} onClick={() => void handleUpload()} disabled={uploading}>
                {uploading ? '上传校验中' : '开始上传 + 校验'}
              </button>
              <span className={styles.fieldHint}>不会直接发布，校验结果会先显示在下一步。</span>
            </div>
          </div>
        </div>
      </SectionCard>

      {validationResult && (
        <SectionCard
          eyebrow="Step 2"
          title="校验结果"
          description="确认 Skill ID、问题列表与差异后提交审批。"
          meta={<span className={`${styles.tag} ${validationResult.status === 'ok' ? styles.tagSuccess : validationResult.status === 'error' ? styles.tagDanger : styles.tagWarn}`}>{validationResult.status}</span>}
        >
          <div className={styles.formGrid}>
            <div className={styles.formRow}>
              <span className={styles.formLabel}>Skill ID</span>
              <div className={styles.codeText}>{validationResult.skillId || '—'}</div>
            </div>

            {validationResult.issues.length === 0 ? (
              <Notice tone="success" title="校验通过">未发现阻塞问题，可以提交审批。</Notice>
            ) : (
              <div className={styles.issueList}>
                {validationResult.issues.map((issue, i) => (
                  <div key={`${issue.message}-${i}`} className={styles.issueItem}>
                    <span className={`${styles.tag} ${issue.level === 'error' ? styles.tagDanger : issue.level === 'warning' ? styles.tagWarn : styles.tagPrimary}`}>{issue.level}</span>
                    <span>{issue.message}</span>
                    {issue.code && <span className={styles.tableMeta}>{issue.code}</span>}
                  </div>
                ))}
              </div>
            )}

            {validationResult.scripts && validationResult.scripts.length > 0 && (
              <div className={styles.formRow}>
                <span className={styles.formLabel}>脚本（scripts/）</span>
                <div className={styles.fieldStack}>
                  <div className={styles.fileList}>
                    {validationResult.scripts.map((f) => (
                      <div key={f.path} className={styles.fileItem}>
                        <span className={`${styles.tag} ${styles.tagWarn}`}>script</span>
                        <span className={styles.fileName}>{f.path}</span>
                        <span className={styles.tableMeta}>{(f.size / 1024).toFixed(1)} KB</span>
                      </div>
                    ))}
                  </div>
                  <span className={styles.fieldHint}>
                    这些脚本随包发布后可被 AI 在沙箱中执行，请确认内容无误后再提交审批。
                  </span>
                </div>
              </div>
            )}

            {validationResult.diff && (
              <pre className={styles.codeBlock}>{validationResult.diff}</pre>
            )}

            <div className={styles.actionRow}>
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => void handleCancelStaging()}>
                取消此暂存
              </button>
              <button
                type="button"
                className={styles.btn}
                onClick={() => void handleSubmitPublish()}
                disabled={publishing || validationResult.status === 'error'}
              >
                {publishing ? '提交中' : '提交审批'}
              </button>
            </div>
          </div>
        </SectionCard>
      )}

      {publishMsg && (
        <SectionCard eyebrow="Submitted" title="已提交审批">
          <Notice tone="success">{publishMsg}</Notice>
        </SectionCard>
      )}
    </>
  );
}

export default memo(UploadTab);
