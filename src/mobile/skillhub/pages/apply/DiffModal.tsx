/**
 * 全屏差异 Modal。
 *
 * - 半透明遮罩 + 顶部圆角 22px 卡片
 * - 内容为等宽字 <pre>，横向滚动；按行渲染并用 +/- 区分增删
 * - 关闭：点遮罩或顶部 × 按钮；遵循无障碍 dialog 角色
 *
 * 使用方：ValidationResultPanel 的「查看差异」入口；diff 文本来自 ValidationResultView.diff。
 */
import { useEffect } from 'react';
import styles from './parts.module.css';

interface Props {
  open: boolean;
  diff: string;
  onClose: () => void;
}

interface DiffLine {
  text: string;
  kind: 'add' | 'del' | 'meta' | 'context';
}

function classifyDiffLines(diff: string): DiffLine[] {
  return diff.split('\n').map((line) => {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@') || line.startsWith('diff ')) {
      return { text: line, kind: 'meta' };
    }
    if (line.startsWith('+')) return { text: line, kind: 'add' };
    if (line.startsWith('-')) return { text: line, kind: 'del' };
    return { text: line, kind: 'context' };
  });
}

export default function DiffModal({ open, diff, onClose }: Props) {
  // ESC 关闭 + 锁滚动
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const lines = classifyDiffLines(diff);

  return (
    <div
      className={styles.diffOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="差异详情"
      onClick={onClose}
    >
      <div className={styles.diffSheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.diffHeader}>
          <span className={styles.diffTitle}>差异详情</span>
          <button
            type="button"
            className={styles.diffClose}
            aria-label="关闭差异"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
        </div>
        <pre className={styles.diffPre}>
          {lines.map((l, i) => (
            <span
              key={i}
              className={
                l.kind === 'add'
                  ? styles.diffLineAdd
                  : l.kind === 'del'
                    ? styles.diffLineDel
                    : l.kind === 'meta'
                      ? styles.diffLineMeta
                      : styles.diffLineCtx
              }
            >
              {l.text || '\u00a0'}
              {'\n'}
            </span>
          ))}
        </pre>
      </div>
    </div>
  );
}
