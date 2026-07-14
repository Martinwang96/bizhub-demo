/**
 * StatsToolbar — 数据统计三 Tab（活跃 / 耗时 / Token）共享的顶部紧凑工具条。
 *
 * 形态：单行 flex「粒度 · [维度] · 日期范围 · 日期快捷 · [用户筛选 + 筛选] · 刷新」。
 * 控件全部复用现有：`Segment`（粒度/维度）、`DateRangePicker`（mode 由 bucket 派生）、
 *   `SelectInput`（日期快捷）、原生 input + ghostBtn（用户筛选）。
 *
 * 行为约定：
 *   - bucket 切换 → 立刻清空 range / quick / submitted（避免 mode='week' 显示 day 值异常）；
 *     业务侧 useEffect 监听 submitted 即可，bucket 切换会触发空范围打接口（即时生效）。
 *   - 日期快捷选择 → applyQuickRange 填 range，并立刻 onSubmit（快捷快捷，符合预期）。
 *   - 日期范围/用户输入手改 → 仅本地 state，需点击「筛选」才 onSubmit；范围手改时 quick 自动清空。
 *   - 「刷新」永远调 onRefresh（沿用当前 submitted 重新拉数据）。
 *
 * 维度 / 用户筛选通过 props 注入差异；不传即不渲染对应控件。
 */
import { useEffect } from 'react';
import { DateRangePicker, SelectInput } from '@shared/components';
import { BUCKET_OPTIONS, Segment } from './StatsControls';
import { alignDateString, applyQuickRange, formatMonthValue, formatWeekValue, getQuickRangeOptions } from '../utils/dateRange';
import type { StatsBucket, StatsDimension } from '../api/stats';
import styles from './StatsPage.module.css';

export interface StatsRange {
  since: string;
  until: string;
}

export interface StatsToolbarProps {
  /** 时间粒度（天/周/月） */
  bucket: StatsBucket;
  onBucketChange: (b: StatsBucket) => void;

  /** 维度（仅 Token Tab 传） */
  dimension?: StatsDimension;
  onDimensionChange?: (d: StatsDimension) => void;
  dimensionOptions?: ReadonlyArray<{ key: StatsDimension; label: string }>;

  /** 日期范围（YYYY-MM-DD），手改时由 toolbar 通知业务方更新 */
  range: StatsRange;
  onRangeChange: (r: StatsRange) => void;

  /** 日期快捷 key（''/'today'/'yesterday'/'7d'/'30d'） */
  quick: string;
  onQuickChange: (q: string) => void;

  /** 是否渲染用户筛选输入（活跃 Tab 后端不支持，传 false 隐藏） */
  showUserFilter?: boolean;
  /** 用户筛选输入框（受控） */
  userInput?: string;
  onUserInputChange?: (v: string) => void;

  /** 「筛选」按钮：业务方应在此提交快照 */
  onSubmit: () => void;
  /** 「刷新」按钮：业务方应基于当前快照重新拉数据 */
  onRefresh: () => void;
}

export default function StatsToolbar(props: StatsToolbarProps) {
  const {
    bucket,
    onBucketChange,
    dimension,
    onDimensionChange,
    dimensionOptions,
    range,
    onRangeChange,
    quick,
    onQuickChange,
    showUserFilter = true,
    userInput,
    onUserInputChange,
    onSubmit,
    onRefresh,
  } = props;

  // bucket 变化时清空 range/quick；t-design DateRangePicker 在 mode 变更后不会自动转换已选值
  // （'2026-06-15' 在 mode='week' 下展示异常），主动 reset 最稳妥。
  useEffect(() => {
    onRangeChange({ since: '', until: '' });
    onQuickChange('');
    // 仅监听 bucket，不能把 onRangeChange/onQuickChange 加入依赖（避免循环）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket]);

  const dateRangeMode: 'week' | 'month' | undefined =
    bucket === 'week' ? 'week' : bucket === 'month' ? 'month' : undefined;

  const alignRange = (r: StatsRange): StatsRange => ({
    since: alignDateString(r.since || '', 'start', bucket),
    until: alignDateString(r.until || '', 'end', bucket),
  });

  const pickerValue = (() => {
    const r = alignRange(range);
    if (bucket === 'week') return [formatWeekValue(r.since), formatWeekValue(r.until)] as [string, string];
    if (bucket === 'month') return [formatMonthValue(r.since), formatMonthValue(r.until)] as [string, string];
    return [r.since, r.until] as [string, string];
  })();

  const handleQuick = (value: string) => {
    onQuickChange(value);
    onRangeChange(alignRange(applyQuickRange(value, bucket)));
    // 选择快捷即生效（与原 active tab 行为一致：用户预期"选完就看到结果"）
    // 用 microtask 让 state 先 flush 再 submit
    queueMicrotask(() => onSubmit());
  };

  const handleRangeChange = (value: [string, string]) => {
    const [since, until] = value;
    onRangeChange(alignRange({ since: since || '', until: until || '' }));
    if (quick) onQuickChange(''); // 手改范围时清空快捷标记
  };

  const handleUserKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') onSubmit();
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.toolGroup} style={{ flexWrap: 'wrap', gap: 'var(--s-4)' }}>
        <Segment label="粒度" value={bucket} options={BUCKET_OPTIONS} onChange={onBucketChange} />
        {dimension !== undefined && onDimensionChange && dimensionOptions && (
          <Segment label="维度" value={dimension} options={dimensionOptions} onChange={onDimensionChange} />
        )}
        <div className={styles.toolGroup}>
          <span className={styles.toolLabel}>日期</span>
          <div className={styles.dateRangeField}>
            <DateRangePicker
              value={pickerValue}
              onChange={handleRangeChange}
              mode={dateRangeMode}
              placeholder={['开始日期', '结束日期']}
            />
          </div>
        </div>
        <div className={styles.toolGroup}>
          <span className={styles.toolLabel}>快捷</span>
          <div className={styles.quickField}>
            <SelectInput
              value={quick}
              onChange={handleQuick}
              options={getQuickRangeOptions(bucket)}
              placeholder={(range.since || range.until) ? '日期已确定' : '常用范围'}
              allowInput={false}
            />
          </div>
        </div>
        {showUserFilter && (
          <div className={styles.toolGroup}>
            <span className={styles.toolLabel}>用户</span>
            <input
              className={styles.userInput}
              placeholder="按用户筛选…"
              value={userInput ?? ''}
              onChange={(e) => onUserInputChange?.(e.target.value)}
              onKeyDown={handleUserKeyDown}
              aria-label="按用户筛选"
            />
          </div>
        )}
      </div>
      <div className={styles.toolGroup}>
        <button type="button" className={styles.btnPrimary} onClick={onSubmit}>筛选</button>
        <button type="button" className={styles.btnGhost} onClick={onRefresh}>刷新</button>
      </div>
    </div>
  );
}
