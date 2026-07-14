/**
 * MobileStatsToolbar — 移动端「数据统计」三 Tab 共享筛选条。
 *
 * 与 PC `admin/pages/StatsToolbar` 行为 1:1 对齐：
 *   - bucket 切换 → 立刻清空 range / quick / submitted（避免 mode='week' 残留 day 值）
 *   - 日期快捷选择 → applyQuickRange + 微任务 onSubmit（“选完即看到结果”）
 *   - 日期范围/用户输入手改 → 仅本地 state，需点击「筛选」才打接口
 *   - 「刷新」沿用当前 submitted 重新拉数据
 *
 * 视觉/排布严格按 DESIGN.md 4px Grid + Forms & Inputs 准则：
 *   - 容器：`card / r-lg / shadow-xs`，padding 走 --s-4（≤640px 收紧到 --s-3）
 *   - 行内 gap = --s-2 (8px)；行间 gap = --s-3 (12px)
 *   - 输入：`r-sm` 圆角 + `line-strong` 描边；focus 用 `shadow-focus`
 *   - 主动作按钮 Primary（筛选）；次要按钮 Ghost（重置 / 刷新）
 *
 * 全部控件常驻可见、不折叠。五行布局：
 *   1) 粒度 segment + 维度 segment（仅 Token Tab）
 *   2) 开始 DatePicker — “至” — 结束 DatePicker（同行三段式）
 *   3) 快捷 SelectInput（独占一行）
 *   4) 检索 input（仅 showUserFilter=true 时渲染）
 *   5) 筛选 / 重置 / 刷新 三按钮等宽
 *
 * 日 / 周 / 月三种粒度统一走 TDesign 单日期 DatePicker（mode 跟 bucket），
 * 单 panel 形态天然适配竖屏，不再依赖 RangePicker 双月 panel hack。
 */
import { useEffect } from 'react';
import { DatePicker, SelectInput } from '@shared/components';
import { alignDateString, applyQuickRange, getQuickRangeOptions } from '../../../../admin/utils/dateRange';
import type { StatsBucket, StatsDimension } from '../../../../admin/api/stats';
import styles from './MobileStatsToolbar.module.css';

export interface StatsRange {
  since: string;
  until: string;
}

export interface MobileStatsToolbarProps {
  bucket: StatsBucket;
  onBucketChange: (b: StatsBucket) => void;

  /** 维度（仅 Token Tab 传） */
  dimension?: StatsDimension;
  onDimensionChange?: (d: StatsDimension) => void;
  dimensionOptions?: ReadonlyArray<{ key: StatsDimension; label: string }>;

  range: StatsRange;
  onRangeChange: (r: StatsRange) => void;

  quick: string;
  onQuickChange: (q: string) => void;

  /** 是否渲染检索输入（活跃/耗时/Token 现已统一支持） */
  showUserFilter?: boolean;
  userInput?: string;
  onUserInputChange?: (v: string) => void;
  /** 检索框 placeholder（不同维度可定制，如 "搜索用户…" / "搜索 Session…"） */
  userPlaceholder?: string;

  onSubmit: () => void;
  onRefresh: () => void;
}

const BUCKET_OPTIONS: ReadonlyArray<{ key: StatsBucket; label: string }> = [
  { key: 'day', label: '日' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
];

export default function MobileStatsToolbar(props: MobileStatsToolbarProps) {
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
    userPlaceholder = '按用户筛选…',
    onSubmit,
    onRefresh,
  } = props;

  // bucket 变化时清空 range/quick（与 PC StatsToolbar 一致）
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

  const handleQuick = (value: string) => {
    onQuickChange(value);
    onRangeChange(alignRange(applyQuickRange(value, bucket)));
    queueMicrotask(() => onSubmit());
  };

  const handleSinceChange = (since: string) => {
    onRangeChange(alignRange({ since: since || '', until: range.until }));
    if (quick) onQuickChange('');
  };

  const handleUntilChange = (until: string) => {
    onRangeChange(alignRange({ since: range.since, until: until || '' }));
    if (quick) onQuickChange('');
  };

  const handleUserKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') onSubmit();
  };

  const renderSegment = <V extends string>(
    label: string,
    value: V,
    options: ReadonlyArray<{ key: V; label: string }>,
    onChange: (v: V) => void,
  ) => {
    const idx = Math.max(0, options.findIndex((o) => o.key === value));
    return (
      <div className={styles.segGroup}>
        <span className={styles.segLabel}>{label}</span>
        <div
          className={styles.segment}
          role="group"
          aria-label={label}
          style={{
            ['--seg-count' as string]: options.length,
            ['--seg-index' as string]: idx,
          }}
        >
          <span className={styles.segmentThumb} aria-hidden="true" />
          {options.map((o) => {
            const active = o.key === value;
            return (
              <button
                key={o.key}
                type="button"
                className={`${styles.segmentBtn} ${active ? styles.segmentBtnActive : ''}`}
                aria-pressed={active}
                onClick={() => !active && onChange(o.key)}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <form
      className={styles.bar}
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      aria-label="数据统计筛选"
    >
      {/* 行 1：粒度 + 维度（Token） */}
      <div className={styles.row}>
        {renderSegment('粒度', bucket, BUCKET_OPTIONS, onBucketChange)}
        {dimension !== undefined && onDimensionChange && dimensionOptions
          ? renderSegment('维度', dimension, dimensionOptions, onDimensionChange)
          : null}
      </div>

      {/* 行 2：开始 — 至 — 结束（同行三段式，整行占满） */}
      <div className={styles.rowFull}>
        <div className={`${styles.field} ${styles.fieldFull}`}>
          <span className={styles.fieldLabel}>日期</span>
          <div className={styles.dateDualField}>
            <div className={styles.dateHalf}>
              <DatePicker
                value={range.since || ''}
                onChange={handleSinceChange}
                mode={dateRangeMode}
                placeholder="开始"
                allowInput={false}
              />
            </div>
            <span className={styles.dateSep} aria-hidden="true">至</span>
            <div className={styles.dateHalf}>
              <DatePicker
                value={range.until || ''}
                onChange={handleUntilChange}
                mode={dateRangeMode}
                placeholder="结束"
                allowInput={false}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 行 3：快捷（独占一行） */}
      <div className={styles.rowFull}>
        <div className={`${styles.field} ${styles.fieldFull}`}>
          <span className={styles.fieldLabel}>快捷</span>
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
      </div>

      {/* 行 4：检索（独占一行；showUserFilter=false 时不渲染） */}
      {showUserFilter && (
        <div className={styles.rowFull}>
          <div className={`${styles.field} ${styles.fieldFull}`}>
            <span className={styles.fieldLabel}>检索</span>
            <input
              type="search"
              className={styles.input}
              placeholder={userPlaceholder}
              value={userInput ?? ''}
              onChange={(e) => onUserInputChange?.(e.target.value)}
              onKeyDown={handleUserKeyDown}
              aria-label="检索"
            />
          </div>
        </div>
      )}

      {/* 行 5：筛选 / 重置 / 刷新（三按钮等宽，Primary 居左） */}
      <div className={styles.actionsRowEqual}>
        <button
          type="submit"
          className={`${styles.btn} ${styles.btnPrimary} ${styles.btnEqual}`}
        >
          筛选
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnGhost} ${styles.btnEqual}`}
          onClick={() => {
            onRangeChange({ since: '', until: '' });
            onQuickChange('');
            onUserInputChange?.('');
            queueMicrotask(() => onSubmit());
          }}
        >
          重置
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnGhost} ${styles.btnEqual}`}
          onClick={onRefresh}
          aria-label="刷新"
        >
          刷新
        </button>
      </div>
    </form>
  );
}
