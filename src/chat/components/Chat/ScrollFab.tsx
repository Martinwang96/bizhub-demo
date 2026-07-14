import { memo } from 'react';
import styles from './ScrollFab.module.css';

interface Props {
  visible: boolean;
  onClick: () => void;
}

function ScrollFab({ visible, onClick }: Props) {
  return (
    <button
      type="button"
      className={`${styles.fab} ${visible ? styles.fabVisible : ''}`}
      onClick={onClick}
      title="查看最新消息"
      aria-label="查看最新消息"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12l7 7 7-7"/>
      </svg>
      <span>最新消息</span>
    </button>
  );
}

export default memo(ScrollFab);
