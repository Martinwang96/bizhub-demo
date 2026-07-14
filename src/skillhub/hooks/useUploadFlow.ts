/**
 * useUploadFlow — Skill Hub 上传/校验/提交/取消 业务流 hook。
 *
 * 抽自 PC 端 `tabs/UploadTab.tsx`，移动端与 PC 端共用同一份状态机和接口语义，
 * 仅视图层各自实现，避免两端漂移。
 */
import { useCallback, useEffect, useState } from 'react';
import { getJson, postForm, postJson, del } from '@shared/api/httpClient';
import { normalizeSkillsResponse, type SkillItem } from '../apiAdapters';
import {
  getHttpErrorMessage,
  normalizeUploadResponse,
  type ValidationResultView,
} from '../uploadHelpers';

export type UploadMode = 'create' | 'update';
export type ToastTone = 'success' | 'error' | 'info' | 'warning';

// 上传包体上限（与后端 SKILL_HUB_MAX_PACKAGE_SIZE 默认 8MB 对齐）
const MAX_ZIP_BYTES = 8 * 1024 * 1024;

export interface ToastMsg {
  type: ToastTone;
  msg: string;
}

export interface UploadFlowState {
  uploadMode: UploadMode;
  owner: string;
  slug: string;
  zipFile: File | null;
  skillOptions: SkillItem[];
  validationResult: ValidationResultView | null;
  uploading: boolean;
  publishing: boolean;
  publishMsg: string;
  toast: ToastMsg | null;
}

export interface UploadFlowApi extends UploadFlowState {
  setUploadMode: (m: UploadMode) => void;
  setOwner: (v: string) => void;
  setSlug: (v: string) => void;
  /** 选择 zip 技能包（含类型/大小校验，非法时 toast 并忽略）；传 null 清除 */
  selectZip: (file: File | null) => void;
  /** 清除已选 zip */
  clearZip: () => void;
  /** 触发上传 + 后端校验，结果写入 validationResult */
  upload: () => Promise<void>;
  /** 提交审批 */
  submitPublish: () => Promise<void>;
  /** 取消当前 staging（仅当存在 stagingId 时） */
  cancelStaging: () => Promise<void>;
  /** 重置到初始状态（清空 toast 后立即再清也安全） */
  reset: () => void;
  /** 主动派发一个 toast（视图层在新错误/校验提示时复用） */
  showToast: (msg: string, type?: ToastTone) => void;
}

export function useUploadFlow(): UploadFlowApi {
  const [uploadMode, setUploadMode] = useState<UploadMode>('create');
  const [owner, setOwner] = useState('');
  const [slug, setSlug] = useState('');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [skillOptions, setSkillOptions] = useState<SkillItem[]>([]);
  const [validationResult, setValidationResult] = useState<ValidationResultView | null>(null);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState('');
  const [toast, setToast] = useState<ToastMsg | null>(null);

  // 切到 update 模式时拉取 skill 列表（已有列表则不重复拉）
  useEffect(() => {
    if (uploadMode !== 'update') return;
    void getJson<unknown>('/skill-hub/api/skills').then((env) => {
      if (env.success) setSkillOptions(normalizeSkillsResponse(env.data));
    }).catch((e) => {
      console.error('[useUploadFlow] load skills failed', e);
    });
  }, [uploadMode]);

  const showToast = useCallback((msg: string, type: ToastTone = 'info') => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const selectZip = useCallback((file: File | null) => {
    if (!file) { setZipFile(null); return; }
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

  const clearZip = useCallback(() => {
    setZipFile(null);
  }, []);

  const upload = useCallback(async () => {
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
      console.error('[useUploadFlow] upload failed', e);
      showToast(getHttpErrorMessage(e, '上传失败'), 'error');
    } finally {
      setUploading(false);
    }
  }, [zipFile, slug, owner, uploadMode, showToast]);

  const submitPublish = useCallback(async () => {
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
      console.error('[useUploadFlow] publish failed', e);
      showToast(getHttpErrorMessage(e, '提交失败'), 'error');
    } finally {
      setPublishing(false);
    }
  }, [validationResult, showToast]);

  const cancelStaging = useCallback(async () => {
    if (!validationResult?.stagingId) return;
    try {
      await del(`/skill-hub/api/skills/staging/${encodeURIComponent(validationResult.stagingId)}`);
      setValidationResult(null);
      showToast('已取消暂存', 'info');
    } catch (e) {
      console.error('[useUploadFlow] cancel staging failed', e);
      showToast(getHttpErrorMessage(e, '取消暂存失败'), 'error');
    }
  }, [validationResult, showToast]);

  const reset = useCallback(() => {
    setUploadMode('create');
    setOwner('');
    setSlug('');
    setZipFile(null);
    setValidationResult(null);
    setPublishMsg('');
    setToast(null);
  }, []);

  return {
    uploadMode,
    owner,
    slug,
    zipFile,
    skillOptions,
    validationResult,
    uploading,
    publishing,
    publishMsg,
    toast,
    setUploadMode,
    setOwner,
    setSlug,
    selectZip,
    clearZip,
    upload,
    submitPublish,
    cancelStaging,
    reset,
    showToast,
  };
}
