import React from 'react';
import styles from './TabBar.module.css';

export interface TabItem<K extends string = string> {
  key: K;
  label: string;
  /** 可选 badge 数字（用于「待审批」红点等场景）。 */
  badge?: number;
  /** 可选禁用态。 */
  disabled?: boolean;
}

export interface TabBarProps<K extends string = string> {
  items: ReadonlyArray<TabItem<K>>;
  activeKey: K;
  onChange: (key: K) => void;
  /** 自定义类名，叠加到根元素上（用于 Modal 内复用嵌入态时调整 margin）。 */
  className?: string;
}

/**
 * 通用页面级 Tab 切换条。底部浅 1px 分隔线 + 选中态主色下划线，
 * 与现有 admin tabBar 视觉一致；保留 keyboard 可达性（Enter/空格触发）。
 */
export function TabBar<K extends string = string>(props: TabBarProps<K>): React.ReactElement {
  const { items, activeKey, onChange, className } = props;
  return (
    <div className={`${styles.tabBar} ${className ?? ''}`} role="tablist">
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            aria-disabled={item.disabled || undefined}
            disabled={item.disabled}
            className={`${styles.tab} ${active ? styles.tabActive : ''}`}
            onClick={() => {
              if (item.disabled || active) return;
              onChange(item.key);
            }}
          >
            <span>{item.label}</span>
            {typeof item.badge === 'number' && item.badge > 0 && (
              <span className={styles.badge} aria-label={`${item.badge} 项`}>{item.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default TabBar;
