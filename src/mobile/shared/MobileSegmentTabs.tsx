/**
 * MobileSegmentTabs — 移动端通用分段切换器（pill 容器 + 主色激活态）。
 *
 * 替代历史上散落在 mobile/skillhub 三个目录的 ApplySegmentTabs / SkillsSegmentTabs /
 * HistorySegmentTabs（视觉与样式逐字节等价），以及作为 MobileStatsToolbar 内
 * 「粒度 / 维度」切换的统一渲染。
 *
 * 设计准则（DESIGN_SYSTEM.md / DESIGN.md）：
 *   - 容器：surface-2 底 + r-full 圆角；内边距与段间距走 --s-1（4px）
 *   - 单段：固定高 36px，fs-sm 字号 + weight 600
 *   - 默认态字色 muted；激活态切换为 card 底 + text 字色 + shadow-xs（轻浮起）
 *   - 角标：可选右上红点（apply 「我的申请」用），danger 色
 *   - 过渡走 --t-fast / --ease，并在 prefers-reduced-motion 下置零
 *
 * 不支持（保持最小职责）：水平滚动 / size 变体 / disabled / icon / 自定义文案颜色。
 */
import type { ReactNode } from 'react';
import styles from './MobileSegmentTabs.module.css';

export interface SegmentItem<V extends string> {
  /** 段的值（联合字面量类型，如 'new' | 'mine'） */
  value: V;
  /** 段的可见标签（多数为字符串，允许 ReactNode 容纳「文案 + 角标」组合） */
  label: ReactNode;
  /** 是否在右上角显示红点（apply 「我的申请」未读提示用） */
  dot?: boolean;
}

export interface MobileSegmentTabsProps<V extends string> {
  value: V;
  onChange: (next: V) => void;
  items: ReadonlyArray<SegmentItem<V>>;
  /** 无障碍标签：必填，传入「申请页分段」「数据粒度」等业务语义文案 */
  ariaLabel: string;
  className?: string;
}

export default function MobileSegmentTabs<V extends string>(props: MobileSegmentTabsProps<V>) {
  const { value, onChange, items, ariaLabel, className } = props;
  const cls = className ? `${styles.segTabs} ${className}` : styles.segTabs;
  const cols = `repeat(${items.length}, 1fr)`;

  return (
    <div
      className={cls}
      role="tablist"
      aria-label={ariaLabel}
      style={{ gridTemplateColumns: cols }}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={`${styles.segTab} ${active ? styles.segTabActive : ''}`}
            onClick={() => {
              if (!active) onChange(item.value);
            }}
          >
            <span>{item.label}</span>
            {item.dot && <span className={styles.segDot} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
