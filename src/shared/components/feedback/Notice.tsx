import type { ReactNode } from 'react';
import styles from '../common.module.css';

export interface NoticeProps {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children: ReactNode;
}

export function Notice({ tone = 'info', title, children }: NoticeProps) {
  const toneClass = {
    info: styles.noticeInfo,
    success: styles.noticeSuccess,
    warning: styles.noticeWarning,
    danger: styles.noticeDanger,
  }[tone];

  return (
    <div className={`${styles.notice} ${toneClass}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {title && <strong>{title}</strong>}
      <span>{children}</span>
    </div>
  );
}
