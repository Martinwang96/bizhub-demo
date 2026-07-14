import type { ReactNode } from 'react';
import styles from '../common.module.css';

export function CountPill({ children }: { children: ReactNode }) {
  return <span className={styles.countPill}>{children}</span>;
}
