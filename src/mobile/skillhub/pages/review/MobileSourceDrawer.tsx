/**
 * 移动端 · 原文查看抽屉（审批 staging + 已注册技能 通用）。
 *
 * 数据复用 PC 端 SkillMdViewer 同一对接口（`{base}/files` + `{base}/files/raw`），
 * 支持两种数据源：
 *   - { kind: 'approval', requestId, skillId?, mode? } → /skill-hub/api/skills/approvals/{requestId}
 *   - { kind: 'skill', skill }                       → /skill-hub/api/skills/{owner}/{slug}
 *
 * UI 改为 MobileRightDrawer + 横向 chip 文件切换 + 单一纯文本展示，
 * 兼顾窄屏可读性，避免 marked/DOMPurify 在移动端的额外重量。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MobileRightDrawer from '../../../shared/MobileRightDrawer';
import {
  approvalApiBasePath,
  skillApiBasePathFromSkill,
  type SkillItem,
} from '@skillhub/apiAdapters';
import { getJson } from '@shared/api/httpClient';
import styles from './review.module.css';

interface FileEntry {
  path: string;
  size?: number;
  role?: string;
}

export type MobileSourceDrawerSource =
  | { kind: 'approval'; requestId: string; skillId?: string; mode?: string }
  | {
      kind: 'skill';
      skill: Pick<SkillItem, 'skillId' | 'owner' | 'slug'>;
    };

interface ResolvedSource {
  base: string;
  title: string;
  meta?: string;
  /** useEffect 稳定依赖 key：避免对象引用每帧变化导致重置。 */
  key: string;
}

function resolveSource(src: MobileSourceDrawerSource | null): ResolvedSource | null {
  if (!src) return null;
  if (src.kind === 'approval') {
    return {
      base: approvalApiBasePath(src.requestId),
      title: src.skillId ?? src.requestId,
      meta:
        src.mode === 'update'
          ? '更新'
          : src.mode === 'create'
            ? '新建'
            : src.mode,
      key: `approval:${src.requestId}`,
    };
  }
  const owner = src.skill.owner ?? '_';
  return {
    base: skillApiBasePathFromSkill(src.skill),
    title: src.skill.skillId,
    key: `skill:${owner}/${src.skill.slug}`,
  };
}

interface Props {
  open: boolean;
  source: MobileSourceDrawerSource | null;
  onClose: () => void;
}

function getErrorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export default function MobileSourceDrawer({ open, source, onClose }: Props) {
  const resolved = useMemo(() => resolveSource(source), [source]);
  const sourceKey = resolved?.key ?? '';
  const base = resolved?.base ?? '';

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [current, setCurrent] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingRaw, setLoadingRaw] = useState(false);
  const [filesError, setFilesError] = useState('');
  const [contentError, setContentError] = useState('');

  // 实例级缓存：同一 source 内重复点 chip 不重复请求
  const cacheRef = useRef<Map<string, string>>(new Map());

  // open / source 切换 → 重置并拉文件列表
  useEffect(() => {
    if (!open || !sourceKey || !base) {
      setFiles([]);
      setCurrent('');
      setContent('');
      setFilesError('');
      setContentError('');
      cacheRef.current = new Map();
      return;
    }
    let cancelled = false;
    cacheRef.current = new Map();
    setFiles([]);
    setCurrent('');
    setContent('');
    setFilesError('');
    setContentError('');
    setLoadingFiles(true);

    getJson<{ files?: FileEntry[] }>(`${base}/files`)
      .then((env) => {
        if (cancelled) return;
        if (!env.success) {
          setFilesError(env.error ?? '文件列表加载失败');
          return;
        }
        const list = Array.isArray(env.data?.files) ? env.data!.files! : [];
        setFiles(list);
        if (list.length > 0) {
          const skillMd = list.find((f) => f.path === 'SKILL.md');
          setCurrent((skillMd ?? list[0]).path);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setFilesError(getErrorMessage(e, '文件列表加载失败'));
      })
      .finally(() => {
        if (!cancelled) setLoadingFiles(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, sourceKey, base]);

  // current 切换 → 命中缓存或拉原文
  useEffect(() => {
    if (!open || !sourceKey || !base || !current) {
      setContent('');
      setContentError('');
      return;
    }
    const cached = cacheRef.current.get(current);
    if (cached !== undefined) {
      setContent(cached);
      setContentError('');
      return;
    }

    let cancelled = false;
    setContent('');
    setContentError('');
    setLoadingRaw(true);

    fetch(`${base}/files/raw?path=${encodeURIComponent(current)}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (cancelled) return;
        cacheRef.current.set(current, text);
        setContent(text);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setContentError(getErrorMessage(e, '原文加载失败'));
      })
      .finally(() => {
        if (!cancelled) setLoadingRaw(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, sourceKey, base, current]);

  const handleSelect = useCallback((p: string) => setCurrent(p), []);

  const drawerTitle = `原文 · ${resolved?.title ?? ''}`;

  return (
    <MobileRightDrawer
      open={open}
      title={drawerTitle}
      meta={resolved?.meta}
      onClose={onClose}
    >
      <div className={styles.sourceLayout}>
        {loadingFiles ? (
          <div className={styles.sourceLoading}>加载文件列表…</div>
        ) : filesError ? (
          <div className={styles.sourceError}>{filesError}</div>
        ) : files.length === 0 ? (
          <div className={styles.sourceEmpty}>该提交不包含可查看的文件。</div>
        ) : (
          <>
            <div className={styles.sourceFiles} role="tablist" aria-label="文件列表">
              {files.map((f) => {
                const display = f.path === 'SKILL.md' ? 'SKILL.md' : f.path.replace(/^references\//, '');
                const active = current === f.path;
                return (
                  <button
                    key={f.path}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`${styles.sourceFileChip} ${active ? styles.sourceFileChipActive : ''}`}
                    onClick={() => handleSelect(f.path)}
                    title={f.path}
                  >
                    {display}
                  </button>
                );
              })}
            </div>
            <div className={styles.sourceContent}>
              {loadingRaw ? (
                <div className={styles.sourceLoading}>加载原文…</div>
              ) : contentError ? (
                <div className={styles.sourceError}>{contentError}</div>
              ) : !current ? (
                <div className={styles.sourceEmpty}>请选择一个文件。</div>
              ) : (
                <pre className={styles.sourcePre}>{content}</pre>
              )}
            </div>
          </>
        )}
      </div>
    </MobileRightDrawer>
  );
}
