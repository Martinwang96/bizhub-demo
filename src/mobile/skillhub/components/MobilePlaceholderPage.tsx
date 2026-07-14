import styles from './MobilePlaceholderPage.module.css';

interface Props {
  title: string;
  description?: string;
}

/**
 * Skill Hub 移动端"敬请期待"占位页。
 * 用于 Approve / Skills / History 三个底 Tab 的初始落点；后续逐个替换为完整页面。
 */
export default function MobilePlaceholderPage({ title, description = '该功能正在适配移动端，敬请期待。' }: Props) {
  return (
    <main className={styles.main} aria-label={title}>
      <div className={styles.illustration} aria-hidden="true">
        <svg viewBox="0 0 96 96" width="96" height="96" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="14" y="20" width="68" height="56" rx="10" />
          <line x1="14" y1="34" x2="82" y2="34" />
          <circle cx="48" cy="56" r="10" />
          <line x1="22" y1="26" x2="28" y2="26" />
          <line x1="32" y1="26" x2="38" y2="26" />
        </svg>
      </div>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.desc}>{description}</p>
    </main>
  );
}
