/**
 * SkillMdViewer — 技能原文查看器（弹窗版，对齐 v2 MdViewer）
 *
 * 设计目标：
 * - 居中模态弹窗（复用 shared Modal，bodyBleed 模式）
 * - 双栏：左侧文件列表（SKILL.md 置顶 + references 分组），右侧 Markdown/纯文本切换
 * - 单文件懒加载 + 实例级缓存（useRef Map）
 * - frontmatter 预处理：开头的 `---\n...\n---` 作为 ```yaml 代码块渲染
 * - 通过 marked + DOMPurify 安全渲染 Markdown
 *
 * 严格遵循 DESIGN.md：
 * - 主色 var(--primary)；不使用 ai-accent；不使用渐变与 backdrop-filter blur
 * - 间距/圆角/阴影/字号一律 token 化
 * - 断点 ≤900px 折叠为单列；Modal 自身 ≤640px 全屏
 */
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Modal, EmptyState, Notice, SkeletonStack } from '@shared/components';
import { getJson } from '@shared/api/httpClient';
import { approvalApiBasePath, skillApiBasePathFromSkill } from '../apiAdapters';
import { installMarkedSingleTildeFix } from '@shared/utils/markedSetup';
import commonStyles from '@shared/components/common.module.css';
import styles from './SkillMdViewer.module.css';

// 仅识别双波浪线删除线：避免数值区间（如 3%~8%）中的单个 ~ 被误判为删除线
installMarkedSingleTildeFix();

export interface ViewerSkill {
  skillId: string;
  owner?: string;
  slug: string;
}

/**
 * 数据源并集：
 * - skill：已注册技能，走 /api/skills/{owner}/{slug}/files(/raw)
 * - approval：待审批 staging 包，走 /api/skills/approvals/{requestId}/files(/raw)
 */
export type SkillMdViewerSource =
  | { kind: 'skill'; skill: ViewerSkill }
  | { kind: 'approval'; requestId: string; skillId?: string; mode?: string };

export interface SkillMdViewerProps {
  open: boolean;
  onClose: () => void;
  /** 优先使用；未提供时回退到 skill prop 以兼容旧调用。 */
  source?: SkillMdViewerSource | null;
  /** 旧接口：等价于 { kind:'skill', skill }。 */
  skill?: ViewerSkill | null;
}

interface ResolvedSource {
  base: string;
  title: string;
  /** useEffect 稳定依赖：避免对象引用变化频繁触发重置。 */
  key: string;
}

function resolveSource(props: SkillMdViewerProps): ResolvedSource | null {
  const src: SkillMdViewerSource | null =
    props.source ?? (props.skill ? { kind: 'skill', skill: props.skill } : null);
  if (!src) return null;
  if (src.kind === 'skill') {
    const { skill } = src;
    return {
      base: skillApiBasePathFromSkill(skill),
      title: skill.owner ? `技能原文 · ${skill.owner}/${skill.slug}` : `技能原文 · ${skill.slug}`,
      key: `skill:${skill.owner ?? '_'}/${skill.slug}`,
    };
  }
  const label = src.skillId ?? src.requestId;
  const suffix = src.mode ? ` (${src.mode})` : '';
  return {
    base: approvalApiBasePath(src.requestId),
    title: `提交原文 · ${label}${suffix}`,
    key: `approval:${src.requestId}`,
  };
}

interface FileEntry {
  path: string;
  size?: number;
  role?: string;
}

type Mode = 'md' | 'raw';

type LocalToast = { tone: 'success' | 'danger'; message: string } | null;

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * 把开头的 YAML frontmatter（--- ... ---）改写为 ```yaml 代码块，
 * 避免 marked 把 --- 解析为 thematicBreak 并吞掉中间内容。
 */
function preprocessFrontmatter(text: string): string {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return text;
  const fm = m[1];
  const body = text.slice(m[0].length);
  return `\`\`\`yaml\n${fm}\n\`\`\`\n\n${body}`;
}

function renderMarkdownHtml(text: string): string {
  const src = preprocessFrontmatter(text);
  const html = marked.parse(src, { gfm: true, breaks: false, async: false }) as string;
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel'] });
}

function formatSize(n: number | undefined): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '';
  if (n < 1024) return `${n}B`;
  return `${(n / 1024).toFixed(1)}K`;
}

function getErrorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

// ─── 组件 ───────────────────────────────────────────────────────────────────

function SkillMdViewerImpl(props: SkillMdViewerProps) {
  const { open, onClose } = props;
  const resolved = resolveSource(props);
  const sourceKey = resolved?.key ?? '';
  const base = resolved?.base ?? '';

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [current, setCurrent] = useState<string>('');
  const [mode, setMode] = useState<Mode>('md');
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingRaw, setLoadingRaw] = useState(false);
  const [filesError, setFilesError] = useState('');
  const [contentError, setContentError] = useState('');
  const [content, setContent] = useState<string>('');
  const [toast, setToast] = useState<LocalToast>(null);

  const cacheRef = useRef<Map<string, string>>(new Map());
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((tone: 'success' | 'danger', message: string) => {
    setToast({ tone, message });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  // 关闭时清理 toast 定时器
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  // open / source 切换 → 拉文件列表 + 重置缓存
  useEffect(() => {
    if (!open || !sourceKey || !base) {
      // 关闭时清空，避免下次打开闪现旧内容
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
    setMode('md');
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

  // 当前文件变化 → 命中缓存或加载原文
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

  // 文件分组
  const grouped = useMemo(() => {
    const skillMd = files.find((f) => f.path === 'SKILL.md');
    const refs = files.filter((f) => f.path !== 'SKILL.md');
    return { skillMd, refs };
  }, [files]);

  // Markdown HTML（仅 md 模式渲染，避免 raw 模式无谓计算）
  const mdHtml = useMemo(() => {
    if (mode !== 'md' || !content) return '';
    return renderMarkdownHtml(content);
  }, [mode, content]);

  // 复制原文
  const handleCopy = useCallback(async () => {
    if (!content) {
      showToast('danger', '内容尚未加载');
      return;
    }
    if (!navigator.clipboard) {
      showToast('danger', '复制失败：剪贴板不可用');
      return;
    }
    const result = await navigator.clipboard.writeText(content).then(
      () => true,
      (err: unknown) => {
        console.error('SkillMdViewer copy failed', err);
        return false;
      },
    );
    if (result) showToast('success', '已复制原文');
    else showToast('danger', '复制失败');
  }, [content, showToast]);

  if (!resolved) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={resolved.title}
      width={1080}
      bodyBleed
    >
      <div className={styles.body}>
        {/* ─── 左侧文件列表 ─── */}
        <nav className={styles.files} aria-label="技能文件列表">
          {loadingFiles ? (
            <div style={{ padding: 'var(--s-2)' } as CSSProperties}>
              <SkeletonStack rows={3} widths={[88, 72, 64]} />
            </div>
          ) : filesError ? (
            <div className={styles.filesError}>
              <Notice tone="danger" title="加载失败">{filesError}</Notice>
            </div>
          ) : files.length === 0 ? (
            <div className={styles.filesError}>
              <EmptyState title="空包" description="该技能不包含 md 文件。" />
            </div>
          ) : (
            <>
              {grouped.skillMd && (
                <>
                  <div className={styles.group}>主技能</div>
                  <button
                    type="button"
                    className={`${styles.item} ${current === grouped.skillMd.path ? styles.itemActive : ''}`}
                    onClick={() => setCurrent(grouped.skillMd!.path)}
                    aria-current={current === grouped.skillMd.path ? 'true' : undefined}
                  >
                    <span className={styles.itemPath}>SKILL.md</span>
                    <span className={styles.size}>{formatSize(grouped.skillMd.size)}</span>
                  </button>
                </>
              )}
              {grouped.refs.length > 0 && (
                <>
                  <div className={styles.group}>references（{grouped.refs.length}）</div>
                  {grouped.refs.map((f) => {
                    const display = f.path.replace(/^references\//, '');
                    const active = current === f.path;
                    return (
                      <button
                        key={f.path}
                        type="button"
                        className={`${styles.item} ${active ? styles.itemActive : ''}`}
                        onClick={() => setCurrent(f.path)}
                        title={f.path}
                        aria-current={active ? 'true' : undefined}
                      >
                        <span className={styles.itemPath}>{display}</span>
                        <span className={styles.size}>{formatSize(f.size)}</span>
                      </button>
                    );
                  })}
                </>
              )}
            </>
          )}
        </nav>

        {/* ─── 右侧 ─── */}
        <section className={styles.right}>
          <div className={styles.toolbar}>
            <span className={styles.path} title={current}>{current || '—'}</span>
            <div className={styles.modeSwitch} role="tablist" aria-label="渲染模式">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'md'}
                className={`${styles.modeBtn} ${mode === 'md' ? styles.modeBtnActive : ''}`}
                onClick={() => setMode('md')}
              >
                Markdown
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'raw'}
                className={`${styles.modeBtn} ${mode === 'raw' ? styles.modeBtnActive : ''}`}
                onClick={() => setMode('raw')}
              >
                纯文本
              </button>
            </div>
            <button
              type="button"
              className={`${commonStyles.btn} ${commonStyles.btnGhost} ${commonStyles.btnSm} ${styles.copyBtn}`}
              onClick={() => void handleCopy()}
              disabled={!content}
            >
              复制原文
            </button>
          </div>

          {loadingRaw ? (
            <div className={styles.contentSkeleton}>
              <SkeletonStack rows={6} widths={[92, 86, 78, 90, 74, 64]} />
            </div>
          ) : contentError ? (
            <div className={styles.content}>
              <EmptyState title="加载失败" description={contentError} />
            </div>
          ) : !current ? (
            <div className={styles.content}>
              <EmptyState title="未选择文件" description="请在左侧选择要查看的 md 文件。" />
            </div>
          ) : mode === 'md' ? (
            <div
              className={`${styles.content} ${styles.md}`}
              // 已经过 marked + DOMPurify 处理；保持与 shared/components/Markdown.tsx 同等约定。
              dangerouslySetInnerHTML={{ __html: mdHtml }}
            />
          ) : (
            <div className={styles.content}>
              <pre className={styles.raw}>{content || ''}</pre>
            </div>
          )}
        </section>
      </div>

      {/* 局部 toast（仅在弹窗内显示，避免污染全局） */}
      {toast && (
        <div className={styles.toastSlot} role="status" aria-live="polite">
          <div
            className={`${commonStyles.toast} ${
              toast.tone === 'success' ? commonStyles.toastSuccess : commonStyles.toastError
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default memo(SkillMdViewerImpl);
