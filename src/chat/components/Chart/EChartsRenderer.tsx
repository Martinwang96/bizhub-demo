import { memo, useEffect, useMemo, useRef, useState } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, CustomChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ChartDataPatch, ChartKind, ChartPayload, ChartStyleOverrides } from '../../types/chart';
import { filterPayloadForChart, inferChartPlan } from '../../utils/chartInfer';
import { buildChartOption } from '../../utils/chartOptions';
import { applyDataPatch } from '../../utils/applyDataPatch';
import ChartTableFallback, { type ColumnChartRole } from './ChartTableFallback';
import styles from './EChartsRenderer.module.css';

echarts.use([
  BarChart,
  CustomChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  // 差异对比的 bar-to-bar 虚线箭头由 CustomChart 绘制
  CanvasRenderer,
]);

interface Props {
  payload: ChartPayload;
  overrides?: ChartStyleOverrides;
  /**
   * 表格视图下用户对数据的编辑回调；不传则表格只读（向后兼容 SharePage 等只读场景）。
   * 由父级负责把 dataPatch 写入 ChartStyleOverrides。
   */
  onChangeDataPatch?: (next: ChartDataPatch) => void;
  /** 因列名变更等需要顺带清理 overrides 字段时调用 */
  onCleanupOverrides?: (cleanup: Partial<ChartStyleOverrides>) => void;
  /**
   * 表格视图下，用户通过列头 ⋯ 菜单调整某列的图表角色（加入/移除/切换轴）时回调。
   * 由 ChartPanel 负责把角色转译成对 barMetricKeys / lineMetricKeys / metricKeys / lineKeys 的修改。
   * 不传则表格列头菜单不显示"图表角色"子项（向后兼容）。
   */
  onSetColumnRole?: (col: string, role: ColumnChartRole) => void;
  /**
   * 当前参与作图的列集合，由 ChartPanel 根据底层 plan + overrides 汇总后透传进来。
   * 这是 `ChartTableFallback` 判断列头菜单是"加入图表 / 从图表移除"的唯一依据。
   */
  chartingKeys?: string[];
}

function EChartsRenderer({ payload, overrides, onChangeDataPatch, onCleanupOverrides, onSetColumnRole, chartingKeys }: Props) {
  const ref = useRef<ReactEChartsCore>(null);
  /**
   * 通用规则：表格里出现"+x / -x / +x% / ↑↓ / —" 或行名是"环比变化/环比增长率/同比/增速"等
   * 衍生指标行，不参与作图（否则图会被 0 值压扁）。表格 fallback 仍展示原始全量行。
   *
   * 这里先把用户的"轻量数据微调（dataPatch）"应用到原始 payload 上，得到 patchedPayload，
   * 再让 plan/option 链路在它之上工作 —— 这样：
   * - 隐藏的行/列不会进入图
   * - 重命名的列在图例/坐标轴上展示新名
   * - 修正的单元格值会反映在图上
   * patch 为空时 applyDataPatch 走 fast path 直接返回原 payload，无额外开销。
   */
  const patchedPayload = useMemo(() => applyDataPatch(payload, overrides?.dataPatch), [payload, overrides?.dataPatch]);
  const chartPayload = useMemo(() => filterPayloadForChart(patchedPayload), [patchedPayload]);
  const plan = useMemo(() => inferChartPlan(chartPayload), [chartPayload]);
  const baseOption = useMemo(
    () => buildChartOption(chartPayload, plan, overrides),
    [chartPayload, plan, overrides],
  );
  const effectiveKind = overrides?.kind ?? plan.kind;

  /**
   * 视口宽度桶位（≤640 / ≤900 / >900）。
   * 之前依赖 useEffect 内的 setOption 在 mount 后再纠正窄屏 grid，但 echarts-for-react
   * 在首次 mount 时已经吃下 buildChartOption 给的桌面 grid（top:54, bottom:76, left:84...），
   * 在抽屉里这个 grid 把绘图区压扁到画布上半部分。等 effect 跑、RO 触发的时机又依赖
   * 容器 layout 节奏，移动端常出现 "首次打开图表区，画布只占上半段" 的问题。
   *
   * 解决：把 viewport bucket 提到 option 计算的依赖里，让窄屏 grid 在 option 第一次进入
   * ReactEChartsCore 时就已经覆盖好——首帧即正确，不再依赖 setOption 时序。
   */
  const [viewportBucket, setViewportBucket] = useState<'sm' | 'md' | 'lg'>(() => {
    if (typeof window === 'undefined') return 'lg';
    const w = window.innerWidth;
    if (w <= 640) return 'sm';
    if (w <= 900) return 'md';
    return 'lg';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const compute = () => {
      const w = window.innerWidth;
      const next: 'sm' | 'md' | 'lg' = w <= 640 ? 'sm' : w <= 900 ? 'md' : 'lg';
      setViewportBucket((prev) => (prev === next ? prev : next));
    };
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  /**
   * 在桌面 grid 之上叠一层窄屏覆盖。仅 bar/line/barLine/rateCompare/pie 这类有 grid 的图生效；
   * 表格 fallback 走另一分支，不会到这里。
   */
  const option = useMemo(() => {
    if (viewportBucket === 'lg') return baseOption;
    if (effectiveKind === 'pie') return baseOption;
    const narrowGrid = viewportBucket === 'sm'
      ? { left: 8, right: 8, top: 44, bottom: 36, containLabel: true }
      : { left: 24, right: 24, top: 48, bottom: 48, containLabel: true };
    // 同时把 xAxis nameGap 收紧——之前桌面分支根据标签长度可能给到 60+，在窄屏 grid 内会顶到 X 轴标签
    type AxisLike = { nameGap?: number; [k: string]: unknown };
    const overrideAxis = (axis: unknown): unknown => {
      if (!axis) return axis;
      if (Array.isArray(axis)) return axis.map(overrideAxis);
      const a = axis as AxisLike;
      return { ...a, nameGap: viewportBucket === 'sm' ? 22 : 28 };
    };
    return {
      ...baseOption,
      grid: narrowGrid,
      xAxis: overrideAxis((baseOption as { xAxis?: unknown }).xAxis),
    };
  }, [baseOption, effectiveKind, viewportBucket]);

  useEffect(() => {
    const chart = ref.current?.getEchartsInstance();
    const el = chart?.getDom();
    if (!chart || !el || typeof ResizeObserver === 'undefined') return;
    // grid 已经在 option 里按 viewportBucket 提前覆盖好（见 useMemo），
    // 这里只负责响应容器自身的尺寸变化（抽屉动画/方向切换/dvh 变化等）触发 chart.resize。
    const safeResize = () => {
      try {
        chart.resize();
      } catch {
        /* 实例已 dispose */
      }
    };
    safeResize();
    const ro = new ResizeObserver(safeResize);
    ro.observe(el);

    // 移动端兜底：抽屉打开存在 drawerIn 动画（约 180ms），ECharts 第一次拿到的 clientWidth/Height
    // 可能介于动画起止值之间。在 rAF + 动画中段 + 动画结束三个时机各补一次 resize，
    // 让画布最终精确填满抽屉。PC 视口跳过这一分支。
    const timers: ReturnType<typeof setTimeout>[] = [];
    let raf1 = 0;
    let raf2 = 0;
    const isMobileViewport =
      typeof window !== 'undefined' && window.innerWidth <= 900;
    if (isMobileViewport) {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(safeResize);
      });
      timers.push(setTimeout(safeResize, 120));
      timers.push(setTimeout(safeResize, 260));
    }

    return () => {
      ro.disconnect();
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      timers.forEach((t) => clearTimeout(t));
    };
  }, [payload.id, effectiveKind, option]);

  if (plan.kind === 'table' || overrides?.kind === 'table') {
    // 表格视图下，告诉 fallback "如果切回图表，会是什么样"：
    // - effectiveChartKind：优先使用 plan 底层推断的 kind（而不是 'table' 本身），这样即使用户
    //   在 rateCompare / barLine 下手动切到 table 视图，列头菜单也能给出符合原图语义的角色选项；
    //   只有 plan 底层就是 table（数据无法作图）时，菜单自然返回空数组。
    // - chartingKeys：由 ChartPanel 汇总透传；未传时 fallback 自动关闭角色子项。
    const effectiveChartKind: ChartKind = plan.kind === 'table' ? 'table' : plan.kind;
    return (
      <ChartTableFallback
        payload={payload}
        dataPatch={overrides?.dataPatch}
        plan={plan}
        onChangePatch={onChangeDataPatch ? (next) => onChangeDataPatch({ ...next }) : undefined}
        onCleanupOverrides={onCleanupOverrides as ((cleanup: Record<string, unknown>) => void) | undefined}
        overridesForCleanup={overrides}
        effectiveChartKind={effectiveChartKind}
        chartingKeys={chartingKeys}
        onSetColumnRole={onSetColumnRole}
      />
    );
  }

  return (
    <ReactEChartsCore
      ref={ref}
      echarts={echarts}
      option={option}
      notMerge
      lazyUpdate
      className={styles.chart}
    />
  );
}

export default memo(EChartsRenderer);
