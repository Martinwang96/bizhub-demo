/** StatsControls — 数据统计两个 Tab 共用的分段控件与格式化工具。 */
import styles from './StatsPage.module.css';

export function fmtInt(n: number): string {
  return (n || 0).toLocaleString('zh-CN');
}

export function fmtTime(ts?: number): string {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString('zh-CN');
}

/** 毫秒友好格式：>=1000ms 显示秒，否则毫秒。 */
export function fmtMs(ms?: number): string {
  const v = ms || 0;
  if (v >= 1000) return `${(v / 1000).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} s`;
  return `${Math.round(v).toLocaleString('zh-CN')} ms`;
}

/** 始终以秒展示：千分位 + 最多 2 位小数。 */
export function fmtSec(ms?: number): string {
  const s = (ms || 0) / 1000;
  return `${s.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} s`;
}

export interface SegmentProps<T extends string | number> {
  label: string;
  value: T;
  options: ReadonlyArray<{ key: T; label: string }>;
  onChange: (v: T) => void;
}

export function Segment<T extends string | number>(props: SegmentProps<T>) {
  return (
    <div className={styles.toolGroup}>
      <span className={styles.toolLabel}>{props.label}</span>
      <div className={styles.segment} role="tablist" aria-label={props.label}>
        {props.options.map((o) => {
          const active = o.key === props.value;
          return (
            <button
              key={String(o.key)}
              type="button"
              role="tab"
              aria-selected={active}
              className={`${styles.segmentBtn} ${active ? styles.segmentBtnActive : ''}`}
              onClick={() => !active && props.onChange(o.key)}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const BUCKET_OPTIONS = [
  { key: 'day' as const, label: '天' },
  { key: 'week' as const, label: '周' },
  { key: 'month' as const, label: '月' },
];

/**
 * 兼容性导出：原「近 7/30/90/全部」chip 选项。
 * 已被 `StatsToolbar`（DateRangePicker + QUICK_RANGE_OPTIONS）取代，
 * 当前 admin 内三个 Tab 不再使用；保留导出仅为防止外部引用回归（如有）。
 */
export const RANGE_OPTIONS = [
  { key: 7, label: '近 7 天' },
  { key: 30, label: '近 30 天' },
  { key: 90, label: '近 90 天' },
  { key: 0, label: '全部' },
];
