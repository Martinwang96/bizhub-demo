import type { CSSProperties } from 'react';
import styles from '../common.module.css';

export interface SkeletonStackProps {
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
