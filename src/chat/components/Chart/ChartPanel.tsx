import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChartDataPatch, ChartKind, ChartPayload, ChartStyleOverrides } from '../../types/chart';
import { filterPayloadForChart, inferChartPlan } from '../../utils/chartInfer';
import { applyDataPatch } from '../../utils/applyDataPatch';
import {
  buildLegendItems,
  classifyDifferenceKeys,
  getMultiDimensionGroupItems,
  getMultiDimensionMetricItems,
  isDifferenceMetricKey,
  isMultiDimensionPlan,
  resolveMultiDimensionBarLineMetrics,
  resolveMultiDimensionGroups,
  resolveMultiDimensionMetrics,
} from '../../utils/chartOptions';
import { GestureSlideLeftAndRightIcon } from 'tdesign-icons-react';
import ChartToolbar from './ChartToolbar';
import EChartsRenderer from './EChartsRenderer';
import type { ColumnChartRole } from './ChartTableFallback';
import styles from './ChartPanel.module.css';

const KIND_LABELS: Record<ChartKind, string> = {
  bar: '柱状',
  line: '折线',
  barLine: '折柱混合',
  rateCompare: '差异对比',
  pie: '饼状',
  table: '表格',
};

interface Props {
  chart: ChartPayload;
  overrides?: ChartStyleOverrides;
  onChangeOverrides: (patch: Partial<ChartStyleOverrides>) => void;
  onClose: () => void;
  /** 切换到看板区（提供时头部展示「切换到报表」按钮）。 */
  onOpenReport?: () => void;
  onNavigate?: (direction: -1 | 1) => void;
  currentChartIndex?: number;
  totalCharts?: number;
}

export default function ChartPanel({
  chart,
  overrides = {},
  onChangeOverrides,
  onClose,
  onOpenReport,
  onNavigate,
  currentChartIndex,
  totalCharts,
}: Props) {
  // 1) 先把用户的"轻量数据微调（dataPatch）"应用到原始 payload；patch 为空时 applyDataPatch 走 fast path 不改引用。
  // 2) 再剔除"环比/同比/+x%/↑↓"等衍生行，得到作图链路 chartForPlan —— 保证图例/工具栏/图本身完全同源。
  const patchedChart = useMemo(() => applyDataPatch(chart, overrides.dataPatch), [chart, overrides.dataPatch]);
  const chartForPlan = useMemo(() => filterPayloadForChart(patchedChart), [patchedChart]);
  const plan = useMemo(() => inferChartPlan(chartForPlan), [chartForPlan]);
  const kind = overrides.kind ?? plan.kind;
  const showNav = !!onNavigate && totalCharts !== undefined && totalCharts > 1;
  const showLegend = overrides.showLegend !== false;
  const hiddenLegendKeys = useMemo(() => new Set(overrides.hiddenLegendKeys ?? []), [overrides.hiddenLegendKeys]);
  const isMultiDimension = isMultiDimensionPlan(plan);
  const multiMetricItems = useMemo(
    () => (isMultiDimension ? getMultiDimensionMetricItems(chartForPlan, plan) : []),
    [chartForPlan, isMultiDimension, plan],
  );
  const multiGroupItems = useMemo(
    () => (isMultiDimension ? getMultiDimensionGroupItems(chartForPlan, plan) : []),
    [chartForPlan, isMultiDimension, plan],
  );
  const selectedMetricKeys = isMultiDimension ? resolveMultiDimensionMetrics(chartForPlan, plan, overrides) : undefined;
  const selectedBarLineMetrics = isMultiDimension ? resolveMultiDimensionBarLineMetrics(chartForPlan, plan, overrides) : undefined;
  const selectedGroupValues = isMultiDimension ? resolveMultiDimensionGroups(chartForPlan, plan, overrides) : undefined;

  const legendItems = useMemo(
    () => buildLegendItems(chartForPlan, plan, overrides),
    [chartForPlan, plan, overrides],
  );

  /**
   * 工具栏 / 表格共享的"参与画图列"集合，按当前显示顺序排列。
   * 单一数据源驱动 ChartDataPatch.columnOrder：
   *   - 表格表头点 ← → → 写 columnOrder → applyDataPatch 重排 → 这里的 chartForPlan.columns 也会跟着变；
   *   - 工具栏 legend 点 ← → → 同样写 columnOrder → 双侧自动同步。
   * 维度列（plan.xKey）锁定，不在此列表内。
   */
  const reorderableColumns = useMemo(() => {
    const candidates = new Set<string>();
    if (plan.yKeys?.length) plan.yKeys.forEach((k) => candidates.add(k));
    if (plan.metricKeys?.length) plan.metricKeys.forEach((k) => candidates.add(k));
    if (plan.xKey) candidates.delete(plan.xKey);
    if (!candidates.size) return [];
    // 按 chartForPlan.columns 的当前左右顺序输出，使 ← → 边界判定与视觉一致
    return (chartForPlan.columns ?? []).filter((c) => candidates.has(c));
  }, [chartForPlan.columns, plan.xKey, plan.yKeys, plan.metricKeys]);

  /**
   * "当前参与作图的列集合" —— 供表格视图 ⋯ 菜单判断"加入图表 / 从图表移除"。
   *
   * 计算来源按 kind 分：
   * - barLine：有用户显式设置时看 selectedBarLineMetrics（union of bar + line）；没设置则看 plan.yKeys
   * - rateCompare：看 overrides.lineKeys（用户当前选择的对比列）∪ plan.yKeys 中的柱基准
   * - 多维表（isMultiDimension）：看 selectedMetricKeys
   * - 其它（bar / line / pie）：看 overrides.metricKeys ?? plan.yKeys
   *
   * 注意：此集合仅用于"UI 判断该列是否'已在图中'"，不参与实际渲染链路。
   */
  const chartingKeys = useMemo(() => {
    const out = new Set<string>();
    const effectiveKind = plan.kind;
    if (effectiveKind === 'barLine') {
      if (selectedBarLineMetrics) {
        selectedBarLineMetrics.barKeys.forEach((k) => out.add(k));
        selectedBarLineMetrics.lineKeys.forEach((k) => out.add(k));
      } else if (overrides.barMetricKeys || overrides.lineMetricKeys) {
        (overrides.barMetricKeys ?? []).forEach((k) => out.add(k));
        (overrides.lineMetricKeys ?? []).forEach((k) => out.add(k));
      } else {
        (plan.yKeys ?? []).forEach((k) => out.add(k));
      }
    } else if (effectiveKind === 'rateCompare') {
      const yKeys = plan.yKeys ?? [];
      const { barDifferenceKeys, arrowKeys } = classifyDifferenceKeys(
        yKeys,
        overrides.lineKeys,
        hiddenLegendKeys,
        overrides.rateCompareBarKeys,
        overrides.rateCompareValueMode,
      );
      const keepBarSet = new Set(barDifferenceKeys);
      const explicitArrowSet = new Set((overrides.lineKeys ?? []).filter((k) => yKeys.includes(k)));
      yKeys.forEach((k) => {
        if (hiddenLegendKeys.has(k)) return;
        if (isDifferenceMetricKey(k)) {
          if (keepBarSet.has(k)) out.add(k);
          return;
        }
        if (explicitArrowSet.has(k) && !keepBarSet.has(k)) return;
        out.add(k);
      });
      arrowKeys.slice(0, 1).forEach((k) => out.add(k));
    } else if (isMultiDimension) {
      (selectedMetricKeys ?? []).forEach((k) => out.add(k));
    } else {
      const keys = overrides.metricKeys?.length ? overrides.metricKeys : (plan.yKeys ?? []);
      keys.forEach((k) => out.add(k));
    }
    return Array.from(out);
  }, [plan.kind, plan.yKeys, selectedBarLineMetrics, overrides.barMetricKeys, overrides.lineMetricKeys, overrides.lineKeys, overrides.metricKeys, overrides.rateCompareBarKeys, overrides.rateCompareValueMode, hiddenLegendKeys, isMultiDimension, selectedMetricKeys]);

  /**
   * 表格列头 ⋯ 菜单调整列角色的统一入口。
   *
   * 按底层 plan.kind 分支把 role 语义翻译成对 overrides 的修改：
   * - barLine：写 barMetricKeys / lineMetricKeys（必须先从对方集合移除再加入本集合，保证"同一列只能出现在一侧"）
   * - rateCompare：
   *     role='line' = 设为当前对比列（单选覆盖 lineKeys: [col]）；
   *     role='remove' = 清空 lineKeys（让分支回退到 plan 默认对比列）。role='bar' 在此模式下不应被触发。
   * - bar / line / pie：
   *     'bar' / 'line' 都视作"加入 metricKeys"；
   *     'remove' 则从 metricKeys 里移除。注意 metricKeys 未显式设置时默认值是 plan.yKeys——
   *     移除一列时必须先把默认值物化为显式集合再做删除，否则修改不会生效。
   *
   * 此回调只动 ChartStyleOverrides，不改 dataPatch、不改 plan 本身——列头重命名/隐藏等原有路径保持不变。
   */
  const handleSetColumnRole = useCallback((col: string, role: ColumnChartRole) => {
    const baseKind = plan.kind;
    if (baseKind === 'barLine') {
      // 展开当前值：未显式设置时用 selectedBarLineMetrics 作为起点（这是工具栏和图用的真相）
      const currentBar = overrides.barMetricKeys ?? selectedBarLineMetrics?.barKeys ?? [];
      const currentLine = overrides.lineMetricKeys ?? selectedBarLineMetrics?.lineKeys ?? [];
      let nextBar = currentBar.filter((k) => k !== col);
      let nextLine = currentLine.filter((k) => k !== col);
      if (role === 'bar') nextBar = [...nextBar, col];
      else if (role === 'line') nextLine = [...nextLine, col];
      // role === 'remove' → 两边都已移除，不再加回
      if (!nextBar.length && !nextLine.length) return; // 保护：至少保留一列
      onChangeOverrides({ barMetricKeys: nextBar, lineMetricKeys: nextLine });
      return;
    }

    if (baseKind === 'rateCompare') {
      if (role === 'line') {
        // 单选覆盖：把此列设为当前对比列
        onChangeOverrides({ lineKeys: [col] });
        return;
      }
      if (role === 'remove') {
        // 清空用户选择，plan 默认对比列会重新出现；若该列就是 plan 默认的对比列，
        // 则等效"换成 plan 里的下一个候选差异列"——上游由 lineKeys 解析逻辑决定。
        // 这里用最简方式：lineKeys 置为空数组（而不是 undefined），从而明确触发"用户无选择"分支。
        onChangeOverrides({ lineKeys: [] });
        return;
      }
      return; // rateCompare 下 'bar' 角色不应被 UI 触发
    }

    if (isMultiDimension) {
      // 多维表：维度表格里的指标列表，role='remove' 从 metricKeys 去；其它角色视为"加入"
      const current = (selectedMetricKeys && selectedMetricKeys.length ? selectedMetricKeys : (plan.metricKeys ?? plan.yKeys ?? [])).slice();
      let next: string[];
      if (role === 'remove') {
        next = current.filter((k) => k !== col);
      } else {
        next = current.includes(col) ? current : [...current, col];
      }
      if (!next.length) return; // 保护：至少保留一列
      onChangeOverrides({ metricKeys: next, metricKey: next[0] });
      return;
    }

    // bar / line / pie
    // 如果用户从未写过 metricKeys，先把 plan.yKeys 物化为起点，否则 "移除" 操作会被"默认值"覆盖
    const currentKeys = overrides.metricKeys?.length ? overrides.metricKeys : (plan.yKeys ?? []);
    let nextKeys: string[];
    if (role === 'remove') {
      nextKeys = currentKeys.filter((k) => k !== col);
    } else {
      nextKeys = currentKeys.includes(col) ? currentKeys : [...currentKeys, col];
    }
    if (!nextKeys.length) return;
    onChangeOverrides({ metricKeys: nextKeys });
  }, [plan.kind, plan.metricKeys, plan.yKeys, overrides.barMetricKeys, overrides.lineMetricKeys, overrides.metricKeys, selectedBarLineMetrics, selectedMetricKeys, isMultiDimension, onChangeOverrides]);

  const toggleLegendItem = useCallback((key: string) => {
    const next = new Set(overrides.hiddenLegendKeys ?? []);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChangeOverrides({ hiddenLegendKeys: Array.from(next) });
  }, [onChangeOverrides, overrides.hiddenLegendKeys]);

  /**
   * 移动端工具栏：默认收起，点 header 上的"更多"按钮才弹出底部 sheet。
   * 桌面端一直常驻（直接渲染在 controls 里）。
   * 通过 matchMedia 监听 ≤900 宽度变化，一旦切回桌面就自动重置为关闭，避免残留状态。
   */
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(max-width: 900px)').matches;
  });
  const [toolsOpen, setToolsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 900px)');
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      if (!e.matches) setToolsOpen(false);
    };
    setIsMobile(mq.matches);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    // Safari < 14 fallback
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);

  // 切换 chart 时关闭 sheet，避免在新图表上残留
  useEffect(() => {
    setToolsOpen(false);
  }, [chart.id]);

  const toolbar = (
    <ChartToolbar
      value={overrides}
      currentKind={kind}
      lineMetricItems={isMultiDimension ? [] : legendItems.map(({ key, name }) => ({ key, name }))}
      metricItems={multiMetricItems}
      groupItems={multiGroupItems}
      selectedMetricKeys={selectedMetricKeys}
      selectedBarMetricKeys={selectedBarLineMetrics?.barKeys}
      selectedLineMetricKeys={selectedBarLineMetrics?.lineKeys}
      selectedGroupValues={selectedGroupValues}
      reorderableColumns={reorderableColumns}
      onChange={onChangeOverrides}
    />
  );

  return (
    <aside className={styles.panel} aria-label="图表区">
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <div className={styles.title}>{chart.title || '图表'}</div>
          <span className={styles.badge}>{KIND_LABELS[kind]}</span>
          {showNav && currentChartIndex !== undefined && (
            <span className={styles.chartPos}>
              {currentChartIndex + 1} / {totalCharts}
            </span>
          )}
        </div>
        <div className={styles.headerActions}>
          {onOpenReport && (
            <button
              type="button"
              className={styles.navBtn}
              onClick={onOpenReport}
              aria-label="切换到报表"
              title="切换到报表"
            >
              <GestureSlideLeftAndRightIcon
                fillColor={['transparent', 'transparent']}
                strokeColor={['currentColor', 'currentColor']}
                strokeWidth={2}
              />
            </button>
          )}
          {showNav && (
            <>
              <button
                type="button"
                className={styles.navBtn}
                onClick={() => onNavigate!(-1)}
                aria-label="上一个图表"
                title="上一个图表"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                className={styles.navBtn}
                onClick={() => onNavigate!(1)}
                aria-label="下一个图表"
                title="下一个图表"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </>
          )}
          {/* 移动端专属：更多按钮（拉起底部工具栏 sheet） */}
          {isMobile && (
            <button
              type="button"
              className={`${styles.navBtn} ${styles.moreBtn}`}
              onClick={() => setToolsOpen(true)}
              aria-label="更多设置"
              title="更多设置"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="5" cy="12" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="19" cy="12" r="1.6" />
              </svg>
            </button>
          )}
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="关闭图表" title="关闭图表">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </header>

      {/* 图表主体 */}
      <div className={styles.body}>
        <EChartsRenderer
          payload={chart}
          overrides={overrides}
          onChangeDataPatch={(next: ChartDataPatch) => onChangeOverrides({ dataPatch: next })}
          onCleanupOverrides={(cleanup) => onChangeOverrides(cleanup)}
          chartingKeys={chartingKeys}
          onSetColumnRole={handleSetColumnRole}
        />
      </div>

      {/* 控制区：
          - 桌面端：图例 + 完整工具栏（布局/样式/折线指标）
          - 移动端：仅图例；工具栏改由 header "更多" 按钮拉起底部 sheet */}
      <div className={styles.controls}>
        {showLegend && legendItems.length > 0 && (
          <div className={styles.legendRow} aria-label="图例">
            {legendItems.map((item) => {
              const inactive = hiddenLegendKeys.has(item.key);
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`${styles.legendItem} ${inactive ? styles.legendItemMuted : ''}`}
                  onClick={() => toggleLegendItem(item.key)}
                  aria-pressed={!inactive}
                  title={inactive ? `显示 ${item.name}` : `隐藏 ${item.name}`}
                >
                  <span className={styles.legendDot} style={{ background: item.color }} />
                  <span className={styles.legendLabel}>{item.name}</span>
                </button>
              );
            })}
          </div>
        )}
        {!isMobile && <div className={styles.editHint}>支持在“表格”样式中编辑</div>}
        {!isMobile && toolbar}
      </div>

      <footer className={styles.footer}>
        <span>来源：{chart.source || 'query_db'}</span>
        {chart.unit && <span>单位：{chart.unit}</span>}
        {chart.truncated && <span className={styles.chip}>已截断至 {chart.rowCount} 行</span>}
      </footer>

      {/* 移动端：底部弹起的工具栏 sheet */}
      {isMobile && toolsOpen && (
        <div className={styles.sheetMask} onClick={() => setToolsOpen(false)} role="presentation">
          <div
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-label="图表设置"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.sheetHeader}>
              <span className={styles.sheetTitle}>图表设置</span>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setToolsOpen(false)}
                aria-label="关闭设置"
                title="关闭设置"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className={styles.sheetBody}>{toolbar}</div>
          </div>
        </div>
      )}
    </aside>
  );
}
