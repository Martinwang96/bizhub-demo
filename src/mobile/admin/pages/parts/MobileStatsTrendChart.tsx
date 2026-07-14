import { memo, useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import styles from '../MobileStatsPage.module.css';

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

export type TrendTone = 'primary' | 'warn' | 'sub' | 'accent' | 'primary2' | 'danger';

export interface MobileTrendSeries {
  name: string;
  data: number[];
  /** 与 PC StatsTrendChart 同色板（DESIGN.md dataVisualization.palette），追加 danger 用于最大值。 */
  tone?: TrendTone;
  /** 是否使用虚线（用于"最小耗时"等次要序列） */
  dashed?: boolean;
}

interface Props {
  /** X 轴时间桶标签 */
  buckets: string[];
  series: MobileTrendSeries[];
  kind?: 'line' | 'bar';
  /** Y 轴单位 */
  unit?: string;
  valueFormatter?: (v: number) => string;
}

const TONE_COLOR: Record<TrendTone, string> = {
  primary: '#0052D9',
  primary2: '#4C7DF0',
  warn: '#E8A317',
  sub: '#86909C',
  accent: '#16A34A',
  danger: '#D54941',
};

export const TONE_PALETTE: ReadonlyArray<TrendTone> = ['primary', 'accent', 'warn', 'primary2', 'sub'];

export function getToneColor(tone: TrendTone | undefined): string {
  return TONE_COLOR[tone ?? 'primary'];
}

/**
 * 移动端紧凑趋势图。与 PC StatsTrendChart 共享色板，但：
 *  - 高度固定 240
 *  - grid 边距收紧、字号 10/11
 *  - legend 由父级（卡片头）自行渲染（避免在小屏挤压绘图区）
 */
function MobileStatsTrendChart({ buckets, series, kind = 'line', unit = '', valueFormatter }: Props) {
  const option = useMemo(() => {
    const fmt = valueFormatter ?? ((v: number) => `${v}`);
    return {
      grid: { left: 8, right: 12, top: 12, bottom: 24, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(29,33,41,0.92)',
        borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 11 },
        valueFormatter: (v: number | string) => `${fmt(Number(v))}${unit ? ' ' + unit : ''}`,
      },
      legend: { show: false },
      xAxis: {
        type: 'category',
        data: buckets,
        boundaryGap: kind === 'bar',
        axisLine: { lineStyle: { color: '#E5E6EB' } },
        axisTick: { show: false },
        axisLabel: { color: '#86909C', fontSize: 10, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#F2F3F9' } },
        axisLabel: { color: '#86909C', fontSize: 10 },
      },
      series: series.map((s) => {
        const color = TONE_COLOR[s.tone ?? 'primary'];
        return {
          name: s.name,
          type: kind,
          data: s.data,
          smooth: kind === 'line',
          symbol: s.dashed ? 'none' : 'circle',
          symbolSize: 4,
          itemStyle: { color },
          lineStyle: { color, width: 2, type: s.dashed ? ('dashed' as const) : ('solid' as const), opacity: s.dashed ? 0.7 : 1 },
          barMaxWidth: 22,
          barWidth: series.length > 1 ? undefined : '46%',
          emphasis: { focus: 'series' },
        };
      }),
    };
  }, [buckets, series, kind, unit, valueFormatter]);

  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      notMerge
      lazyUpdate
      className={styles.chartHost}
      style={{ height: 240 }}
    />
  );
}

export default memo(MobileStatsTrendChart);
