import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './ReportViewer.module.css';

/** 传给 actions 渲染函数的上下文（把下载能力上抛，便于收进下拉菜单）。 */
export interface ReportViewerActionContext {
  onDownload: () => void;
}

interface Props {
  /** iframe 源 + 下载地址（同源，带 cookie）。 */
  src: string;
  /** 下载文件名。 */
  fileName?: string;
  /** 头部左侧额外操作（如切换到图表）。 */
  leadingActions?: ReactNode;
  /** 头部右侧额外操作（发布/编辑/分享/删除等）。 */
  actions?: ReactNode | ((ctx: ReportViewerActionContext) => ReactNode);
  /** 隐藏内置的下载按钮。 */
  hideDownload?: boolean;
  /** 关闭回调（提供时头部显示 ✕）。 */
  onClose?: () => void;
}

/**
 * 报表查看器：预览（iframe）+ 下载。
 * 对话内产物预览与已发布报表详情共用。
 */
export default function ReportViewer({ src, fileName = 'report.html', leadingActions, actions, hideDownload, onClose }: Props) {
  const cacheRef = useRef<string | null>(null);
  const [html, setHtml] = useState<string>('');
  const [failed, setFailed] = useState(false);

  const fetchHtml = useCallback(async (): Promise<string> => {
    if (cacheRef.current !== null) return cacheRef.current;
    const res = await fetch(src, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    cacheRef.current = text;
    return text;
  }, [src]);

  // 通过 fetch 拿到看板 HTML（fetch 被 demo mock 拦截，静态托管下也能工作），
  // 再用 srcDoc 渲染——避免 iframe src 直接请求 /api/... 在静态托管时 404。
  useEffect(() => {
    let cancelled = false;
    setHtml('');
    setFailed(false);
    cacheRef.current = null;
    fetchHtml()
      .then((h) => { if (!cancelled) setHtml(h); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [src, fetchHtml]);

  const handleDownload = useCallback(async () => {
    try {
      const text = await fetchHtml();
      const blob = new Blob([text], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // 兜底：直接新窗口打开
      window.open(src, '_blank');
    }
  }, [fetchHtml, fileName, src]);

  const renderedActions = typeof actions === 'function'
    ? actions({ onDownload: () => void handleDownload() })
    : actions;

  return (
    <div className={styles.viewer}>
      <div className={styles.toolbar}>
        <div className={styles.actions}>
          {leadingActions}
          {!hideDownload && (
            <button type="button" className={styles.iconBtn} onClick={() => void handleDownload()} title="下载 HTML" aria-label="下载">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          )}
          {renderedActions}
          {onClose && (
            <button type="button" className={styles.iconBtn} onClick={onClose} title="关闭" aria-label="关闭">✕</button>
          )}
        </div>
      </div>

      <div className={styles.body}>
        {failed ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#86909c', fontSize: 14 }}>
            看板加载失败，请稍后重试
          </div>
        ) : (
          <iframe
            className={styles.frame}
            srcDoc={html}
            sandbox="allow-scripts"
            title="报表预览"
          />
        )}
      </div>
    </div>
  );
}
