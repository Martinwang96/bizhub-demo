import styles from './MobileStatsTabs.module.css';

export type StatsTabKey = 'token' | 'latency' | 'active';

interface MobileStatsTabsProps {
  active: StatsTabKey;
  onChange: (key: StatsTabKey) => void;
}

const TABS: ReadonlyArray<{ key: StatsTabKey; label: string }> = [
  { key: 'token', label: 'Token 消耗' },
  { key: 'latency', label: '查询耗时' },
  { key: 'active', label: '活跃数据' },
];

/**
 * 移动端「数据统计」一级 Tab 切换（sticky 在 header 下方）。
 * 借鉴 dashboard 的 underline 样式（激活态：主色 + 下划线）。
 */
export default function MobileStatsTabs({ active, onChange }: MobileStatsTabsProps) {
  return (
    <nav className={styles.tabs} aria-label="统计维度切换" role="tablist">
      {TABS.map((t) => {
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
            onClick={() => !isActive && onChange(t.key)}
          >
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
