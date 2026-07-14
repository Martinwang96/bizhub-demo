import type { ReactNode } from 'react';
import styles from '../common.module.css';

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className={styles.tableWrap}>{children}</div>;
}
