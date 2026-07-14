import type { ReactNode } from 'react';
import styles from '../common.module.css';

export interface SectionCardProps {
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
