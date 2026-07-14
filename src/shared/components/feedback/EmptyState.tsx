import type { ReactNode } from 'react';
import styles from '../common.module.css';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyMark}>∅</div>
      <div className={styles.emptyTitle}>{title}</div>
      {description && <p className={styles.emptyDesc}>{description}</p>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  );
}
