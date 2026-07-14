import { memo, useState } from 'react';
import Markdown from '@shared/components/content/Markdown';
import styles from './ThinkingBlock.module.css';

interface Props {
  content: string;
  durationMs?: number;
  mode: 'done' | 'live';
  variant?: 'thinking' | 'reasoning';
}

function fmtMs(ms?: number): string {
  if (!ms) return '';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function ThinkingBlock({ content, durationMs, mode, variant = 'thinking' }: Props) {
  const [open, setOpen] = useState(mode === 'live');

  const label = variant === 'reasoning' ? '推理过程' : '思考过程';
  const dur = fmtMs(durationMs);

  return (
    <div className={`${styles.indicator} ${mode === 'live' ? styles.live : ''}`}>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setOpen((p) => !p)}
      >
        <span className={styles.icon}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </span>
        <span>
          {mode === 'live'
            ? `${label}中...`
            : open
              ? `收起${label}${dur ? ` (${dur})` : ''}`
              : `展示${label}${dur ? ` (${dur})` : ''}`}
        </span>
        <span className={`${styles.arrow} ${open ? styles.arrowOpen : ''}`}>▾</span>
      </button>
      <div className={`${styles.contentWrap} ${open ? styles.expanded : styles.collapsed}`}>
        <div className={`${styles.content} ${mode === 'live' ? styles.shimmer : ''}`}>
          {mode === 'live' ? (
            <span>{content}</span>
          ) : (
            <Markdown text={content} />
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(ThinkingBlock);
