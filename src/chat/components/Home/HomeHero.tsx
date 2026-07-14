import { memo } from 'react';
import styles from './HomeHero.module.css';

interface Props {
  loginName?: string;
}

function HomeHero({ loginName }: Props) {
  const name = loginName || '你';
  return (
    <div className={styles.wrap}>
      <div className={styles.markContainer} aria-hidden="true">
        <div className={styles.markBase}>
          <span className={styles.markRing} />
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="currentColor" fillOpacity="0.9" />
            <path d="M2 12L12 17L22 12M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      <h1 className={styles.headline}>{name}，有什么可以帮到你</h1>
    </div>
  );
}

export default memo(HomeHero);
