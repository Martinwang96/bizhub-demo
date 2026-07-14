import type { CSSProperties, ReactNode } from 'react';
import styles from './common.module.css';

interface SectionCardProps {
  title?: string;
  eyebrow?: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function SectionCard({ title, eyebrow, description, meta, actions, children }: SectionCardProps) {
  const hasHeader = Boolean(title || eyebrow || description || meta || actions);
  return (
    <section className={styles.card}>
      {hasHeader && (
        <header className={styles.sectionHeader}>
          <div className={styles.sectionIntro}>
            {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
            {(title || meta) && (
              <div className={styles.titleLine}>
                {title && <h2 className={styles.sectionTitle}>{title}</h2>}
                {meta}
              </div>
            )}
            {description && <p className={styles.sectionDesc}>{description}</p>}
          </div>
          {actions && <div className={styles.headActions}>{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

interface EmptyStateProps {
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

interface SkeletonStackProps {
  rows?: number;
  widths?: number[];
}

export function SkeletonStack({ rows = 4, widths }: SkeletonStackProps) {
  const values = widths ?? Array.from({ length: rows }, (_, i) => 92 - i * 9);
  return (
    <div className={styles.skeletonStack} aria-label="内容加载中">
      {values.map((width, index) => (
        <div
          key={`${width}-${index}`}
          className={styles.skeleton}
          style={{ '--w': `${width}%` } as CSSProperties}
        />
      ))}
    </div>
  );
}

interface NoticeProps {
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

export function CountPill({ children }: { children: ReactNode }) {
  return <span className={styles.countPill}>{children}</span>;
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className={styles.tableWrap}>{children}</div>;
}

// 重新导出共享 primitives，便于一处 import
export { Drawer } from './Drawer';
export type { DrawerProps } from './Drawer';
export { Modal } from './Modal';
export type { ModalProps } from './Modal';
export { TriCheckbox } from './TriCheckbox';
export type { TriState, TriCheckboxProps } from './TriCheckbox';
export { ToastProvider, useToast } from './Toast';
export type { ToastTone } from './Toast';
