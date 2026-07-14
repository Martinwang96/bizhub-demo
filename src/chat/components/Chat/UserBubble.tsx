import { memo } from 'react';
import styles from './UserBubble.module.css';

interface Props {
  content: string;
  time?: number;
}

function fmtTime(ts: number): string {
  const t = ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(t);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function UserBubble({ content, time }: Props) {
  return (
    <div className={styles.row}>
      <div className={styles.bubble}>
        {content}
        {time != null && <div className={styles.time}>{fmtTime(time)}</div>}
      </div>
    </div>
  );
}

export default memo(UserBubble);
