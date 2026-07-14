import { memo, useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import styles from './StatsPage.module.css';

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

export interface TrendSeries {
  name: string;
  data: number[];
  /** 色板语义：primary=主指标 / warn / sub / accent / primary2（主色浅调）；默认 primary */
  tone?: 'primary' | 'warn' | 'sub' | 'accent' | 'primary2';
}

interface Props {
  /** X 轴时间桶标签 */
  buckets: string[];
  series: TrendSeries[];
  kind?: 'line' | 'bar';
  /** Y 轴单位/数值格式化 */
  unit?: string;
  valueFormatter?: (v: number) => string;
}

// DESIGN.md dataVisualization.palette：主蓝只用于最重要序列，其余用 accent/warn/neutral 区分
const TONE_COLOR: Record<NonNullable<TrendSeries['tone']>, string> = {
  primary: '#0052D9',
  primary2: '#4C7DF0',
  warn: '#E8A317',
  sub: '#86909C',
  accent: '#16A34A',
};

function StatsTrendChart({ buckets, series, kind = 'line', unit = '', valueFormatter }: Props) {
  const option = useMemo(() => {
    const fmt = valueFormatter ?? ((v: number) => `${v}`);
    return {
      grid: { left: 56, right: 20, top: 36, bottom: 40, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(29,33,41,0.92)',
        borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 12 },
        valueFormatter: (v: number | string) => `${fmt(Number(v))}${unit ? ' ' + unit : ''}`,
      },
      legend: {
        show: series.length > 1,
        top: 4,
        textStyle: { color: '#4E5969', fontSize: 12 },
        itemWidth: 14,
        itemHeight: 8,
      },
      xAxis: {
        type: 'category',
        data: buckets,
        axisLine: { lineStyle: { color: '#E5E6EB' } },
        axisLabel: { color: '#86909C', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        name: unit,
        nameTextStyle: { color: '#86909C', fontSize: 11 },
        splitLine: { lineStyle: { color: '#F2F3F9' } },
        axisLabel: { color: '#86909C', fontSize: 11 },
      },
      series: series.map((s) => {
        const color = TONE_COLOR[s.tone ?? 'primary'];
        return {
          name: s.name,
          type: kind,
          data: s.data,
          smooth: kind === 'line',
          symbol: 'circle',
          symbolSize: 5,
          itemStyle: { color },
          lineStyle: { color, width: 2 },
          barMaxWidth: 28,
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
      className={styles.chart}
      style={{ height: 300 }}
    />
  );
}

export default memo(StatsTrendChart);
