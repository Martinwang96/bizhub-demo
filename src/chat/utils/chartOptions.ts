import type { EChartsOption } from 'echarts';
import type { ChartPayload, ChartRenderPlan, ChartStyleOverrides } from '../types/chart';
import { CHART_COLORS_10 } from './chartColors';
import {
  extractCellUnit,
  friendlyShortLabel,
  friendlyFullLabel,
  inferCommonUnit,
  inferCommonUnitFromRows,
  resolveColumnUnit,
} from './chartLabels';

/** 外部 legend 条目（配合新版 ChartPanel 在图表下方的"图示"行展示） */
export interface ChartLegendItem {
  name: string;
  key: string;
  color: string;
}

const RANK_KEY_RE = /^(排名|排行|名次|序号|序|rank|ranking|index|idx|no\.?|number)$/i;
const PERCENT_KEY_RE = /(pct|percent|rate|ratio|率|百分比|增速|同比|环比|%)/i;
const RATE_LABEL_RE = /(率|百分比|占比|占收比|达成率|毛利率|增速|同比|环比|pct|percent|rate|ratio|%)/i;
const CONNECTOR_RATE_KEY_RE = /(增速|同比|环比|增长率|变化率|变动率|growth|change\s*rate|mom|yoy)/i;
const COMPARE_RATE_KEY_RE = /(达成率|完成率|目标完成率|achievement|attainment)/i;
const COMPARE_DELTA_KEY_RE = /(差异|差额|偏差|缺口|变化值|变化额|变化量|变动值|变动额|变动量|增减量|增长额|增长量|贡献增长|增长贡献|贡献增量|增量|增收|减收|净增|净减|对比值|delta|diff|difference|gap)/i;
const ACTUAL_KEY_RE = /(实际|实收|考核|完成|actual)/i;
const TARGET_KEY_RE = /(目标|预估|预计|预算|计划|预测|target|forecast|estimate|budget|plan)/i;
const SUMMARY_VALUE_RE = /(合计|总计|小计|总和|汇总|total)/i;
const NUMERIC_UNIT_RE_SOURCE = String.raw`%|pp|个百分点|万元|亿元|亿|元|万|个|户|人|台|条|件|笔|单|家|项|次|天|小时|分钟|秒|毫秒|ms|s|min|h|pbps|tbps|gbps|mbps|kbps|bps|pib|tib|gib|mib|kib|bytes?|pb|tb|gb|mb|kb|b|qps|tps|rps|[kmgtp]?bit/s|[kmgtp]?b/s|[kmgtp]?byte/s|个/秒|次/秒|户/秒`;
const NUMERIC_CELL_FULL_RE = new RegExp(String.raw`^\s*([-+]?\d[\d,，]*(?:\.\d+)?)\s*(?:${NUMERIC_UNIT_RE_SOURCE})?\s*$`, 'i');
const ARROW_NUMERIC_CELL_FULL_RE = new RegExp(String.raw`^\s*([↑↓↗↘▲▼△▽+\-−－]?)\s*(\d[\d,，]*(?:\.\d+)?)\s*(?:${NUMERIC_UNIT_RE_SOURCE})?\s*$`, 'i');

/** 剥离括号注释（中英文括号），并归一化不可见空格为普通空格 */
function normalizeCell(text: string): string {
  return text
    .replace(/[\u00A0\u3000]/g, ' ')       // 不间断空格/全角空格 → 普通空格
    .replace(/[（(][^）)]*[）)]\s*$/, '')   // 去掉末尾括号注释
    .trim();
}

/** 从单元格尾部括号中提取百分比数字（如 "(+22.7%)" → 22.7, "（-1.2%）" → -1.2） */
function extractParenRate(text: string): number | undefined {
  const m = text.match(/[（(]\s*([-+]?\d[\d,，]*(?:\.\d+)?)\s*%\s*[）)]\s*$/);
  if (!m) return undefined;
  const v = Number(m[1].replace(/[,，]/g, ''));
  return Number.isFinite(v) ? v : undefined;
}

/** 从单元格中提取主体单位（去掉括号注释后的部分） */
function extractMainUnit(text: string): string {
  const main = normalizeCell(text);
  // 尝试匹配 "数字 + 单位" 的单位部分
  const m = main.match(new RegExp(String.raw`(?:${NUMERIC_UNIT_RE_SOURCE})\s*$`, 'i'));
  return m ? m[0].trim() : '';
}

/**
 * 复合格式解析结果：
 * - absolute: 主体绝对值（如 52.13）
 * - unit: 主体单位（如 '亿元'、'%'）
 * - rate: 括号内百分比（如 22.7）；无括号时为 undefined
 */
interface ChartNumberPair {
  absolute: number;
  unit: string;
  rate: number | undefined;
}

/**
 * 解析单元格复合格式，同时提取绝对值和括号内百分比。
 * 例如："+52.13 亿元（+22.7%）" → { absolute: 52.13, unit: '亿元', rate: 22.7 }
 *       "+54.85 亿元"          → { absolute: 54.85, unit: '亿元', rate: undefined }
 *       "19.94%"               → { absolute: 19.94, unit: '%', rate: undefined }
 */
function chartNumberPair(value: unknown): ChartNumberPair | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { absolute: value, unit: '', rate: undefined };
  }
  if (typeof value !== 'string') return undefined;
  const raw = value.trim().replace(/[\u00A0\u3000]/g, ' ');
  if (!raw) return undefined;

  // 先提取括号内百分比（有的话）
  const parenRate = extractParenRate(raw);

  // 剥离括号后，用主体部分解析绝对值
  const main = raw.replace(/[（(][^）)]*[）)]\s*$/, '').trim();
  if (!main) return undefined;

  const unit = extractMainUnit(raw);

  // 尝试 ARROW 正则
  const arrowMatch = ARROW_NUMERIC_CELL_FULL_RE.exec(main);
  if (arrowMatch) {
    const arrow = arrowMatch[1];
    const parsed = Number(arrowMatch[2].replace(/[,，]/g, ''));
    if (!Number.isFinite(parsed)) return undefined;
    const abs = (["↓", "↘", "▼", "▽", "-", "−", "－"].includes(arrow)) ? -Math.abs(parsed) : Math.abs(parsed);
    return { absolute: abs, unit, rate: parenRate };
  }

  // 尝试普通数值正则
  const match = NUMERIC_CELL_FULL_RE.exec(main);
  if (!match) return undefined;
  const parsed = Number(match[1].replace(/[,，]/g, ''));
  if (!Number.isFinite(parsed)) return undefined;
  return { absolute: parsed, unit, rate: parenRate };
}

function chartNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const raw = value.trim().replace(/[\u00A0\u3000]/g, ' ');
  if (!raw) return undefined;
  // 剥离末尾括号注释后再匹配
  const text = raw.replace(/[（(][^）)]*[）)]\s*$/, '').trim();
  if (!text) return undefined;
  const arrowMatch = ARROW_NUMERIC_CELL_FULL_RE.exec(text);
  if (arrowMatch) {
    const arrow = arrowMatch[1];
    const parsed = Number(arrowMatch[2].replace(/[,，]/g, ''));
    if (!Number.isFinite(parsed)) return undefined;
    if (["↓", "↘", "▼", "▽", "-", "−", "－"].includes(arrow)) return -Math.abs(parsed);
    return Math.abs(parsed);
  }
  const match = NUMERIC_CELL_FULL_RE.exec(text);
  if (!match) return undefined;
  const parsed = Number(match[1].replace(/[,，]/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function pieLegendKey(categoryKey: string, row: Record<string, unknown>, index: number): string {
  return `${categoryKey}:${String(row[categoryKey] ?? '')}:${index}`;
}

function formatValue(value: unknown, unit?: string): string {
  if (typeof value === 'number') return `${value.toLocaleString()}${unit ? ` ${unit}` : ''}`;
  return `${value ?? ''}${unit ? ` ${unit}` : ''}`;
}

function joinValueAndUnit(valueText: string, unit?: string): string {
  if (!unit) return valueText;
  return unit === '%' ? `${valueText}%` : `${valueText} ${unit}`;
}

function formatLabelValue(value: unknown, unit?: string): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) return joinValueAndUnit(value.toLocaleString(), unit);
  return joinValueAndUnit(String(value), unit);
}

function makeRenameReverseMap(columnRenames?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [raw, renamed] of Object.entries(columnRenames ?? {})) {
    if (renamed) out[renamed] = raw;
  }
  return out;
}

function resolveManualColumnUnit(
  key: string,
  columnUnits: Record<string, string> | undefined,
  renameReverseMap: Record<string, string>,
): string {
  if (!columnUnits) return '';
  return columnUnits[key] ?? (renameReverseMap[key] ? columnUnits[renameReverseMap[key]] : '') ?? '';
}

function makeCellAwareLabelFormatter(
  sourceCells: ReadonlyArray<unknown>,
  manualUnit: string,
  fallbackUnit: string,
): (params: { value?: unknown; dataIndex?: number }) => string {
  return (params) => {
    const idx = typeof params.dataIndex === 'number' ? params.dataIndex : -1;
    const cellUnit = idx >= 0 ? extractCellUnit(sourceCells[idx]) : '';
    const unit = manualUnit || cellUnit || fallbackUnit || '';
    return formatLabelValue(params.value, unit);
  };
}

function labelOption(
  showLabel: boolean,
  formatter?: (params: { value?: unknown; dataIndex?: number }) => string,
) {
  return showLabel && formatter ? { show: true, formatter } : { show: showLabel };
}

function axisData(payload: ChartPayload, key?: string): string[] {
  if (!key) return [];
  return payload.data.map((row) => String(row[key] ?? ''));
}

function numericColumns(payload: ChartPayload): string[] {
  return payload.columns.filter((col) => !RANK_KEY_RE.test(col.trim()) && payload.data.some((row) => chartNumber(row[col]) !== undefined));
}

function resolveYKeys(payload: ChartPayload, plan: ChartRenderPlan): string[] {
  return plan.yKeys?.length ? plan.yKeys : numericColumns(payload);
}

export function isMultiDimensionPlan(plan: ChartRenderPlan): boolean {
  return !!(plan.xKey && plan.groupKey && plan.metricKeys?.length);
}

function uniqueStringValues(payload: ChartPayload, key: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const row of payload.data) {
    const value = String(row[key] ?? '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

function isSummaryValue(value: string): boolean {
  return SUMMARY_VALUE_RE.test(value.trim());
}

export function getMultiDimensionMetricItems(payload: ChartPayload, plan: ChartRenderPlan) {
  const metricKeys = plan.metricKeys?.length ? plan.metricKeys : numericColumns(payload);
  return metricKeys.map((key) => ({ key, name: friendlyShortLabel(key) }));
}

export function getMultiDimensionGroupItems(payload: ChartPayload, plan: ChartRenderPlan) {
  if (!plan.groupKey) return [];
  return uniqueStringValues(payload, plan.groupKey).map((value) => ({ key: value, name: value }));
}

export function resolveMultiDimensionMetrics(payload: ChartPayload, plan: ChartRenderPlan, overrides: ChartStyleOverrides = {}): string[] {
  const metricKeys = plan.metricKeys?.length ? plan.metricKeys : numericColumns(payload);
  if (!metricKeys.length) return [];
  if (overrides.metricKeys?.length) {
    const selected = overrides.metricKeys.filter((key) => metricKeys.includes(key));
    if (selected.length) return selected;
  }
  if (overrides.metricKey && metricKeys.includes(overrides.metricKey)) return [overrides.metricKey];
  return [metricKeys.find((key) => !PERCENT_KEY_RE.test(key)) ?? metricKeys[0]];
}

export function resolveMultiDimensionMetric(payload: ChartPayload, plan: ChartRenderPlan, overrides: ChartStyleOverrides = {}): string | undefined {
  return resolveMultiDimensionMetrics(payload, plan, overrides)[0];
}

export function resolveMultiDimensionBarLineMetrics(payload: ChartPayload, plan: ChartRenderPlan, overrides: ChartStyleOverrides = {}) {
  const metricKeys = plan.metricKeys?.length ? plan.metricKeys : numericColumns(payload);
  const allowed = new Set(metricKeys);
  const defaultLineKeys = metricKeys.filter((key) => PERCENT_KEY_RE.test(key));
  const defaultBarKeys = metricKeys.filter((key) => !defaultLineKeys.includes(key));
  const selectedBarKeys = Array.isArray(overrides.barMetricKeys)
    ? overrides.barMetricKeys.filter((key) => allowed.has(key))
    : undefined;
  const selectedLineKeys = Array.isArray(overrides.lineMetricKeys)
    ? overrides.lineMetricKeys.filter((key) => allowed.has(key))
    : undefined;
  let barKeys = selectedBarKeys ?? (defaultBarKeys.length ? defaultBarKeys : metricKeys.slice(0, 1));
  let lineKeys = selectedLineKeys ?? (defaultLineKeys.length ? defaultLineKeys : metricKeys.slice(-1));
  if (!barKeys.length && !lineKeys.length) {
    barKeys = metricKeys.slice(0, 1);
    lineKeys = metricKeys.slice(-1);
  }
  return { barKeys, lineKeys };
}

function multiDimensionLegendKey(group: string, metricKey: string, metricCount: number): string {
  return metricCount > 1 ? `${group}::${metricKey}` : group;
}

function multiDimensionLegendName(group: string, metricKey: string, metricCount: number, groupCount: number): string {
  if (metricCount > 1 && groupCount > 1) return `${group} · ${friendlyShortLabel(metricKey)}`;
  if (metricCount > 1) return friendlyShortLabel(metricKey);
  return group;
}

export function resolveMultiDimensionGroups(payload: ChartPayload, plan: ChartRenderPlan, overrides: ChartStyleOverrides = {}): string[] {
  if (!plan.groupKey) return [];
  const allGroups = uniqueStringValues(payload, plan.groupKey);
  if (overrides.groupValues?.length) {
    const selected = overrides.groupValues.filter((value) => allGroups.includes(value));
    if (selected.length) return selected;
  }
  const nonSummaryGroups = allGroups.filter((value) => !isSummaryValue(value));
  return nonSummaryGroups.length ? nonSummaryGroups : allGroups;
}

function valueAxisName(payload: ChartPayload, yKeys: string[]): string {
  if (payload.unit) return payload.unit;
  // 双源融合：优先列名公共单位，其次列名+单元格融合后的公共单位
  const headerCommon = inferCommonUnit(yKeys);
  if (headerCommon) return headerCommon;
  const fusedCommon = inferCommonUnitFromRows(yKeys, payload.data ?? []);
  if (fusedCommon) return fusedCommon;
  if (yKeys.length === 1) {
    // 单列：把该列融合后的单位拼到列名后，避免出现 `带宽` 这种没单位的轴名
    const single = yKeys[0];
    const fused = resolveColumnUnit(single, (payload.data ?? []).map((r) => r[single]));
    const base = friendlyFullLabel(single);
    if (!fused) return base;
    // 列名里已经含括号单位时，friendlyFullLabel 会原样返回，避免重复拼
    return /[（(\[【].+[)）\]】]\s*$/.test(base) ? base : `${base}（${fused}）`;
  }
  return yKeys.map(friendlyShortLabel).join(' / ');
}

function maxLabelLength(labels: string[]): number {
  return labels.reduce((max, label) => Math.max(max, String(label).length), 0);
}

function buildXAxisLabelRotate(labels: string[]): { rotate: number; interval: number | 'auto'; formatter?: (value: string) => string } {
  const labelCount = labels.length;
  const maxLen = maxLabelLength(labels);
  const avgLen = labels.length ? labels.reduce((sum, label) => sum + String(label).length, 0) / labels.length : 0;

  if (labelCount > 20) {
    return {
      rotate: 60,
      interval: Math.floor(labelCount / 15),
      formatter: (v: string) => (v.length > 10 ? v.slice(0, 10) + '…' : v),
    };
  }

  if (maxLen > 18 || avgLen > 12 || labelCount > 10) {
    return {
      rotate: 45,
      interval: 0,
      formatter: (v: string) => (v.length > 16 ? v.slice(0, 16) + '…' : v),
    };
  }

  if (labelCount > 6 || maxLen > 10) {
    return {
      rotate: 30,
      interval: 0,
      formatter: (v: string) => (v.length > 18 ? v.slice(0, 18) + '…' : v),
    };
  }

  return { rotate: 0, interval: 0 };
}

function buildXAxisLayout(labels: string[], rotate: number): { nameGap: number; bottom: number; yLabelWidth: number } {
  const maxLen = maxLabelLength(labels);
  if (rotate >= 60) {
    return {
      nameGap: Math.min(168, 96 + maxLen * 3.5),
      bottom: Math.min(188, 126 + maxLen * 3.5),
      yLabelWidth: Math.min(180, Math.max(112, maxLen * 12)),
    };
  }
  if (rotate >= 45) {
    return {
      nameGap: Math.min(148, 78 + maxLen * 3),
      bottom: Math.min(172, 112 + maxLen * 3),
      yLabelWidth: Math.min(168, Math.max(112, maxLen * 11)),
    };
  }
  if (rotate >= 30) {
    return {
      nameGap: Math.min(116, 56 + maxLen * 2.4),
      bottom: Math.min(148, 96 + maxLen * 2.4),
      yLabelWidth: Math.min(156, Math.max(112, maxLen * 10)),
    };
  }
  return {
    nameGap: Math.min(72, 42 + Math.max(0, maxLen - 6) * 1.5),
    bottom: Math.min(112, 76 + Math.max(0, maxLen - 6) * 2),
    yLabelWidth: Math.min(144, Math.max(112, maxLen * 9)),
  };
}

function isPercentKey(key: string): boolean {
  return PERCENT_KEY_RE.test(key);
}

function isRateCategory(label: string): boolean {
  return RATE_LABEL_RE.test(label);
}

function formatSignedNumber(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toLocaleString()}`;
}

function formatRateCompareLabel(value: unknown, name?: string): string {
  const label = name ? `${name} ` : '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${label}${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  }
  return `${label}${value ?? ''}`;
}

/**
 * 差异/比率箭头标签的"裸数字"版本：去掉前缀字段名（如"达成率""差异"），只保留数字 / 百分比本身。
 *
 * 分流优先级（按单元格实际单位 > 列名语义）：
 * 1. 如果提供了 rawCell（原始单元格值），先从中提取实际单位：
 *    - 单位为 %/个百分点/pp → 输出 `value%`
 *    - 单位为 亿元/万元/元/万 等绝对量 → 输出带符号数字 + 单位
 * 2. 无 rawCell 或无法提取单位时，退回按列名判断：
 *    - 命中 COMPARE_DELTA_KEY_RE → 带符号显示
 *    - 命中率类关键词 → value%
 *    - 其他 → toLocaleString 直出
 */
function formatBareCompareLabel(key: string, value: unknown, rawCell?: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? '');

  // 优先按单元格实际单位格式化
  if (rawCell !== undefined && typeof rawCell === 'string') {
    const cellUnit = extractMainUnit(rawCell);
    if (cellUnit) {
      if (/^(%|pp|个百分点)$/i.test(cellUnit)) {
        return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
      }
      // 绝对量单位：带符号 + 单位
      return `${value >= 0 ? '+' : ''}${value.toLocaleString()} ${cellUnit}`;
    }
  }

  // 退回按列名判断
  if (COMPARE_DELTA_KEY_RE.test(key)) {
    return formatSignedNumber(value);
  }
  if (/(率|百分比|%|pct|percent|ratio|rate|同比|环比|增速|增长率|变化率|变动率)/i.test(key)) {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  }
  // 普通数值列（如 毛利/收入/成本）作为箭头标签：直出原值，不带符号前缀
  return value.toLocaleString();
}

type RateCompareArrowValue = [number, number, number, number, number, string, number, number, number];
type RateCompareArrowDatum = { value: RateCompareArrowValue };

type CustomRenderApi = {
  value: (index: number) => unknown;
  coord: (value: [number, number]) => [number, number];
  size: (value: [number, number]) => [number, number];
};

function arrowHeadPoints(x: number, y: number, angle: number): number[][] {
  const size = 8;
  const spread = 0.56;
  return [
    [x, y],
    [x - size * Math.cos(angle - spread), y - size * Math.sin(angle - spread)],
    [x - size * Math.cos(angle + spread), y - size * Math.sin(angle + spread)],
  ];
}

function buildRateCompareArrowSeries(data: RateCompareArrowDatum[]) {
  if (!data.length) return undefined;
  return {
    id: 'rateCompareArrows',
    name: '差异对比',
    type: 'custom' as const,
    coordinateSystem: 'cartesian2d' as const,
    z: 30,
    silent: false,
    data,
    tooltip: {
      formatter: (rawParams: unknown) => {
        const params = rawParams as { value?: RateCompareArrowValue };
        return params.value?.[5] ?? '';
      },
    },
    renderItem: (_params: unknown, api: CustomRenderApi) => {
      const fromIndex = Number(api.value(0));
      const fromValue = Number(api.value(1));
      const toIndex = Number(api.value(2));
      const toValue = Number(api.value(3));
      const label = String(api.value(5) ?? '');
      const fromSlot = Number(api.value(6));
      const toSlot = Number(api.value(7));
      const slotCount = Math.max(1, Number(api.value(8)) || 1);
      if (![fromIndex, fromValue, toIndex, toValue, fromSlot, toSlot].every(Number.isFinite)) return null;

      const fromPoint = api.coord([fromIndex, fromValue]);
      const toPoint = api.coord([toIndex, toValue]);
      const sameCategory = fromIndex === toIndex;
      const bandWidth = Math.max(0, api.size([1, 0])[0] || 0);
      const slotStep = sameCategory ? Math.min(72, Math.max(28, bandWidth * 0.36)) : 0;
      const slotOffset = (slot: number) => (slot - (slotCount - 1) / 2) * slotStep;
      const x1 = fromPoint[0] + slotOffset(fromSlot);
      const y1 = fromPoint[1];
      const x2 = toPoint[0] + slotOffset(toSlot);
      const y2 = toPoint[1];
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const labelX = (x1 + x2) / 2;
      const labelY = Math.min(y1, y2) - 14;

      return {
        type: 'group',
        children: [
          {
            type: 'line',
            shape: { x1, y1, x2, y2 },
            style: { stroke: '#5A8DEE', lineWidth: 1.7, lineDash: [5, 4], opacity: 0.88 },
            z2: 30,
          },
          {
            type: 'polygon',
            shape: { points: arrowHeadPoints(x2, y2, angle) },
            style: { fill: '#5A8DEE', opacity: 0.9 },
            z2: 31,
          },
          {
            type: 'text',
            style: {
              text: label,
              x: labelX,
              y: labelY,
              fill: '#3B5BB8',
              fontSize: 11,
              fontWeight: 700,
              align: 'center',
              verticalAlign: 'middle',
              backgroundColor: 'rgba(90,141,238,0.12)',
              padding: [2, 6],
              borderRadius: 4,
            },
            z2: 32,
          },
        ],
      };
    },
  };
}

function buildRateCompareArrowData(
  payload: ChartPayload,
  barKeys: string[],
  rateKeys: string[],
  xData: string[],
  valueMode: 'absolute' | 'rate' = 'absolute',
): RateCompareArrowDatum[] {
  const rateKey = rateKeys[0];
  const data: RateCompareArrowDatum[] = [];

  if (barKeys.length >= 2) {
    // 组内：同一个 x 类目下，从基准柱指向结果柱，且不改变柱状 series 顺序。
    const { fromKey, toKey } = resolveCompareDirection(barKeys);
    const fromSlot = barKeys.indexOf(fromKey);
    const toSlot = barKeys.indexOf(toKey);
    for (let i = 0; i < xData.length; i += 1) {
      const row = payload.data[i];
      const fromValue = chartNumber(row?.[fromKey]);
      const toValue = chartNumber(row?.[toKey]);
      if (fromValue === undefined || toValue === undefined) continue;
      const delta = toValue - fromValue;
      const computedRate = fromValue !== 0 ? (delta / Math.abs(fromValue)) * 100 : delta;

      // 解析显式差异列的复合值
      const rawCell = rateKey ? row?.[rateKey] : undefined;
      const pair = rateKey ? chartNumberPair(rawCell) : undefined;
      const hasExplicit = pair !== undefined;

      // 决定标签显示什么
      let label: string;
      let rate: number;
      if (hasExplicit) {
        if (valueMode === 'rate') {
          // 优先用括号内百分比，其次自动补算
          const rateVal = pair.rate ?? computedRate;
          rate = rateVal;
          label = `${rateVal >= 0 ? '+' : ''}${rateVal.toFixed(2)}%`;
        } else {
          // 绝对值模式：用解析出的绝对值
          rate = pair.rate ?? computedRate;
          label = formatBareCompareLabel(rateKey, pair.absolute, rawCell);
        }
      } else {
        rate = computedRate;
        label = `${delta >= 0 ? '+' : ''}${delta.toLocaleString()}`;
      }
      data.push({ value: [i, fromValue, i, toValue, rate, label, fromSlot, toSlot, barKeys.length] });
    }
  } else if (barKeys.length === 1) {
    const barKey = barKeys[0];
    if (rateKey) {
      // 单指标但存在明确差异/比率字段
      for (let i = 0; i < xData.length; i += 1) {
        const row = payload.data[i];
        const barValue = chartNumber(row?.[barKey]);
        const rawCell = row?.[rateKey];
        const pair = chartNumberPair(rawCell);
        if (barValue === undefined || pair === undefined) continue;

        let label: string;
        let compareValue: number;
        if (valueMode === 'rate') {
          // 优先括号内百分比；无括号时若有相邻行可算则算，否则直接用绝对值
          if (pair.rate !== undefined) {
            compareValue = pair.rate;
            label = `${pair.rate >= 0 ? '+' : ''}${pair.rate.toFixed(2)}%`;
          } else if (/^(%|pp|个百分点)$/i.test(pair.unit)) {
            // 单元格本身就是百分比
            compareValue = pair.absolute;
            label = `${pair.absolute >= 0 ? '+' : ''}${pair.absolute.toFixed(2)}%`;
          } else {
            // 无法获得百分比，fallback 用绝对值
            compareValue = pair.absolute;
            label = formatBareCompareLabel(rateKey, pair.absolute, rawCell);
          }
        } else {
          compareValue = pair.absolute;
          label = formatBareCompareLabel(rateKey, pair.absolute, rawCell);
        }
        data.push({ value: [i, barValue, i, barValue, compareValue, label, 0, 0, 1] });
      }
    } else {
      // 无明确差异字段时，才按当前可见相邻柱计算。
      for (let i = 1; i < xData.length; i += 1) {
        const prev = payload.data[i - 1];
        const curr = payload.data[i];
        const prevValue = chartNumber(prev?.[barKey]);
        const currValue = chartNumber(curr?.[barKey]);
        if (prevValue === undefined || currValue === undefined) continue;
        const delta = currValue - prevValue;
        const rate = prevValue !== 0 ? (delta / Math.abs(prevValue)) * 100 : delta;
        const label = valueMode === 'rate'
          ? `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%`
          : `${delta >= 0 ? '+' : ''}${delta.toLocaleString()}`;
        data.push({ value: [i - 1, prevValue, i, currValue, rate, label, 0, 0, 1] });
      }
    }
  }

  return data;
}

function buildMultiDimensionRateCompareArrowData(
  payload: ChartPayload,
  plan: ChartRenderPlan,
  metricKey: string,
  groups: string[],
  xData: string[],
): RateCompareArrowDatum[] {
  if (!plan.xKey || !plan.groupKey || !metricKey) return [];
  const data: RateCompareArrowDatum[] = [];
  // 当用户选的箭头列不是"率类"时（如"毛利"），标签用该 x 类目下"目标组"的原值；
  // 否则保持组间比例（fromGroup→toGroup 的 +x.xx%）。
  const isRateLikeKey = /(率|百分比|%|pct|percent|ratio|rate|同比|环比|增速|增长率|变化率|变动率)/i.test(metricKey);
  if (groups.length >= 2) {
    const [fromGroup, toGroup] = groups;
    for (let i = 0; i < xData.length; i += 1) {
      const xValue = xData[i];
      const fromRow = payload.data.find((row) => String(row[plan.xKey!] ?? '') === xValue && String(row[plan.groupKey!] ?? '') === fromGroup);
      const toRow = payload.data.find((row) => String(row[plan.xKey!] ?? '') === xValue && String(row[plan.groupKey!] ?? '') === toGroup);
      const fromValue = chartNumber(fromRow?.[metricKey]);
      const toValue = chartNumber(toRow?.[metricKey]);
      if (fromValue === undefined || toValue === undefined) continue;
      const delta = toValue - fromValue;
      const ratio = fromValue !== 0 ? (delta / Math.abs(fromValue)) * 100 : delta;
      const label = isRateLikeKey
        ? formatRateCompareLabel(ratio, `${fromGroup}→${toGroup}`)
        : formatBareCompareLabel(metricKey, toValue);
      data.push({ value: [i, fromValue, i, toValue, ratio, label, 0, 1, groups.length] });
    }
  }
  return data;
}

function isLongMetricValuePlan(plan: ChartRenderPlan, yKeys: string[]): boolean {
  return !!(plan.xKey && yKeys.length === 1);
}

function hasRateCategories(labels: string[]): boolean {
  return labels.some(isRateCategory);
}

function splitBarLineKeys(yKeys: string[], selectedLineKeys?: string[]): { barKeys: string[]; lineKeys: string[] } {
  const explicitLineKeys = (selectedLineKeys ?? []).filter((key) => yKeys.includes(key));
  if (explicitLineKeys.length > 0 && yKeys.length >= 2) {
    return {
      barKeys: yKeys.filter((key) => !explicitLineKeys.includes(key)),
      lineKeys: explicitLineKeys,
    };
  }

  const percentKeys = yKeys.filter(isPercentKey);
  if (percentKeys.length > 0) {
    return {
      barKeys: yKeys.filter((key) => !percentKeys.includes(key)),
      lineKeys: percentKeys,
    };
  }
  if (yKeys.length >= 2) {
    return { barKeys: yKeys.slice(0, -1), lineKeys: [yKeys[yKeys.length - 1]] };
  }
  return { barKeys: yKeys, lineKeys: [] };
}

function actualTargetPair(keys: string[]): { actualKey: string; targetKey: string } | null {
  const actualKey = keys.find((key) => ACTUAL_KEY_RE.test(key));
  const targetKey = keys.find((key) => TARGET_KEY_RE.test(key));
  return actualKey && targetKey ? { actualKey, targetKey } : null;
}

function isBaselineActualKey(key: string): boolean {
  return ACTUAL_KEY_RE.test(key) && /(^|\s|_|-)vs(\s|_|-|$)|较/.test(key);
}

function resolveCompareDirection(keys: string[]): { fromKey: string; toKey: string } {
  const pair = actualTargetPair(keys);
  if (!pair) return { fromKey: keys[0], toKey: keys[1] };
  return isBaselineActualKey(pair.actualKey)
    ? { fromKey: pair.actualKey, toKey: pair.targetKey }
    : { fromKey: pair.targetKey, toKey: pair.actualKey };
}

export function isDifferenceMetricKey(key: string): boolean {
  return CONNECTOR_RATE_KEY_RE.test(key) || COMPARE_RATE_KEY_RE.test(key) || COMPARE_DELTA_KEY_RE.test(key);
}

/** "率类"差异列：含 率/%/pct/percent/ratio/rate；用于：(1) 箭头标签默认优先；(2) 禁止做柱。 */
function isRateLikeDifferenceKey(key: string): boolean {
  return /(率|百分比|%|pct|percent|ratio|rate|同比|环比|增速|增长率|变化率|变动率)/i.test(key);
}

/** "量类"差异列：是差异列、但不是率类——允许通过 keepAsBarKeys 也做柱（单位通常与原列一致）。 */
export function isAmountLikeDifferenceKey(key: string): boolean {
  return isDifferenceMetricKey(key) && !isRateLikeDifferenceKey(key);
}

/**
 * rateCompare 模式下，决定"差异列 / 任意箭头候选列"在 柱 / 箭头标签 两种身份上的分配。
 *
 * @param yKeys 全集（应传 allYKeys，未被 hiddenLegendKeys 过滤），保证箭头能看到被灰掉的列以做联动决策。
 * @param selectedRateKeys 用户在工具栏"差异指标"显式选择的箭头列（最高优先级；可以是任意 yKey，
 *                         不再强制要求命中 isDifferenceMetricKey——支持选 `毛利`/`毛利率` 这类派生列）。
 * @param hiddenLegendKeys 当前被图例灰掉的列；用于"灰掉率类→自动切量类做箭头"。
 * @param keepAsBarKeys 用户在工具栏"也作为柱"显式勾选的差异列（仅"量类差异列"生效，避免量纲冲突）。
 *
 * @returns
 *   barDifferenceKeys：差异列里被允许做柱的（即用户显式勾的"量类"差异列）。
 *   arrowKeys：用于箭头标签的列（按优先级：用户显式选 > 可见率类差异列 > 可见差异列 > 全部差异列）。
 *              注意：用户显式选的列可能不是 isDifferenceMetricKey（如"毛利"），底层 buildRateCompareArrowData
 *              会把它当作"该 x 类目下该列的原始值"渲染为标签。
 */
export function classifyDifferenceKeys(
  yKeys: string[],
  selectedRateKeys: string[] | undefined,
  hiddenLegendKeys: Set<string> | undefined,
  keepAsBarKeys: string[] | undefined,
  valueMode: ChartStyleOverrides['rateCompareValueMode'] = 'absolute',
): { barDifferenceKeys: string[]; arrowKeys: string[] } {
  const allDiff = yKeys.filter(isDifferenceMetricKey);
  // 仅允许"量类"差异列保留为柱（率类被强制排除以规避量纲冲突）
  const keepBar = new Set(
    (keepAsBarKeys ?? []).filter((k) => allDiff.includes(k) && isAmountLikeDifferenceKey(k)),
  );
  const barDifferenceKeys = allDiff.filter((k) => keepBar.has(k));

  // 显式选择不再要求命中差异正则——任意 yKey 都允许（如"毛利"/"毛利率"）
  const explicit = (selectedRateKeys ?? []).filter((k) => yKeys.includes(k));
  let arrowKeys: string[];
  if (explicit.length) {
    arrowKeys = explicit;
  } else if (allDiff.length) {
    const visible = hiddenLegendKeys
      ? allDiff.filter((k) => !hiddenLegendKeys.has(k))
      : allDiff;
    const visiblePool = visible.length ? visible : allDiff;
    const amountKeys = visiblePool.filter(isAmountLikeDifferenceKey);
    const rateKeys = visiblePool.filter(isRateLikeDifferenceKey);
    arrowKeys = valueMode === 'rate'
      ? (rateKeys.length ? rateKeys : (amountKeys.length ? amountKeys : visiblePool))
      : (amountKeys.length ? amountKeys : (rateKeys.length ? rateKeys : visiblePool));
  } else {
    // 无差异列时：退回从全部 yKeys 里挑"率类派生列"（如"毛利率"）做默认箭头候选；
    // 都没有则箭头候选为空，调用方会回退到"相邻柱差额"等内置规则。
    const visibleAll = hiddenLegendKeys
      ? yKeys.filter((k) => !hiddenLegendKeys.has(k))
      : yKeys;
    arrowKeys = visibleAll.filter(isRateLikeDifferenceKey);
  }
  return { barDifferenceKeys, arrowKeys };
}

export function buildChartOption(
  payload: ChartPayload,
  plan: ChartRenderPlan,
  overrides: ChartStyleOverrides = {},
): EChartsOption {
  const kind = overrides.kind && overrides.kind !== 'table' ? overrides.kind : plan.kind;
  const palette = CHART_COLORS_10;
  const showLabel = overrides.showLabel ?? false;
  const splitNumber = overrides.splitNumber ?? 5;
  const hiddenLegendKeys = new Set(overrides.hiddenLegendKeys ?? []);
  const allYKeys = resolveYKeys(payload, plan);
  const columnUnits = overrides.dataPatch?.columnUnits;
  const renameReverseMap = makeRenameReverseMap(overrides.dataPatch?.columnRenames);
  const formatterForKey = (key: string, sourceCells?: ReadonlyArray<unknown>) => {
    const cells = sourceCells ?? payload.data.map((row) => row[key]);
    // 兜底单位优先级：手动列单位 > 单元格单位 > 列单位推断 > payload.unit（图表级公共单位）
    const fallbackUnit = resolveColumnUnit(key, cells) || payload.unit || '';
    return makeCellAwareLabelFormatter(
      cells,
      resolveManualColumnUnit(key, columnUnits, renameReverseMap),
      fallbackUnit,
    );
  };
  const tooltipUnit = payload.unit
    || inferCommonUnit(allYKeys)
    || inferCommonUnitFromRows(allYKeys, payload.data ?? [])
    || '';

  const base: EChartsOption = {
    color: palette,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: kind === 'pie' ? 'item' : 'axis',
      confine: true,
      valueFormatter: (value) => formatValue(value, tooltipUnit),
    },
    legend: { show: false },
    grid: { left: 80, right: 40, top: 24, bottom: 88, containLabel: true },
  };

  if (kind === 'pie') {
    const categoryKey = plan.categoryKey ?? plan.xKey ?? payload.columns[0];
    const valueKey = plan.valueKey ?? plan.yKeys?.[0] ?? numericColumns(payload)[0];
    return {
      ...base,
      series: [{
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        label: { show: showLabel, formatter: '{b}: {d}%' },
        labelLine: { show: showLabel },
        data: payload.data
          .filter((row, index) => !hiddenLegendKeys.has(pieLegendKey(categoryKey, row, index)))
          .map((row) => ({
            name: String(row[categoryKey] ?? ''),
            value: chartNumber(row[valueKey ?? '']) ?? 0,
          })),
      }],
    };
  }

  const xKey = plan.xKey ?? plan.categoryKey ?? payload.columns[0];
  const yKeys = allYKeys.filter((key) => !hiddenLegendKeys.has(key));
  const swapped = overrides.swapAxis === true && kind !== 'barLine';
  const xData = isMultiDimensionPlan(plan) && plan.xKey ? uniqueStringValues(payload, plan.xKey) : axisData(payload, xKey);
  const rotateCfg = buildXAxisLabelRotate(xData);
  const axisLayout = buildXAxisLayout(xData, rotateCfg.rotate);
  const axisNameStyle = { fontSize: 12, color: '#495770', fontWeight: 600 as const };
  const axisLabelStyle = { fontSize: 12, color: '#495770' };

  const categoryAxisOnX = {
    type: 'category' as const,
    name: friendlyFullLabel(xKey),
    nameGap: axisLayout.nameGap,
    nameLocation: 'middle' as const,
    nameTextStyle: axisNameStyle,
    data: xData,
    axisTick: { alignWithLabel: true },
    axisLabel: {
      rotate: rotateCfg.rotate,
      interval: rotateCfg.interval,
      formatter: rotateCfg.formatter,
      margin: 14,
      ...axisLabelStyle,
    },
  };

  const categoryAxisOnY = {
    type: 'category' as const,
    name: friendlyFullLabel(xKey),
    nameLocation: 'end' as const,
    nameGap: 18,
    nameTextStyle: { ...axisNameStyle, align: 'right' as const },
    data: xData,
    axisTick: { alignWithLabel: true },
    axisLabel: {
      margin: 14,
      width: axisLayout.yLabelWidth,
      overflow: 'truncate' as const,
      ...axisLabelStyle,
    },
  };

  const valueAxisNameText = valueAxisName(payload, yKeys.length ? yKeys : allYKeys);
  const valueAxisOnY = {
    type: 'value' as const,
    name: valueAxisNameText,
    nameLocation: 'end' as const,
    nameGap: 14,
    nameTextStyle: { ...axisNameStyle, align: 'left' as const },
    splitNumber,
    axisLabel: { ...axisLabelStyle, margin: 10 },
  };

  const valueAxisOnX = {
    type: 'value' as const,
    name: valueAxisNameText,
    nameLocation: 'middle' as const,
    nameGap: 42,
    nameTextStyle: axisNameStyle,
    splitNumber,
    axisLabel: { ...axisLabelStyle, margin: 10 },
  };

  if (isMultiDimensionPlan(plan) && plan.xKey && plan.groupKey) {
    const barLineMetrics = resolveMultiDimensionBarLineMetrics(payload, plan, overrides);
    const baseMetrics = kind === 'barLine'
      ? Array.from(new Set([...barLineMetrics.barKeys, ...barLineMetrics.lineKeys]))
      : resolveMultiDimensionMetrics(payload, plan, overrides);
    // rateCompare 多维：差异列默认不做柱（除非用户在 rateCompareBarKeys 勾了"也作为柱"）；
    // 箭头标签按 classifyDifferenceKeys 的智能默认（率类优先，灰掉率→自动切量）。
    let selectedMetrics = baseMetrics;
    let multiArrowMetricKey: string | undefined;
    if (kind === 'rateCompare') {
      const { barDifferenceKeys, arrowKeys } = classifyDifferenceKeys(
        baseMetrics,
        overrides.lineKeys,
        hiddenLegendKeys,
        overrides.rateCompareBarKeys,
        overrides.rateCompareValueMode,
      );
      const allDiff = new Set(baseMetrics.filter(isDifferenceMetricKey));
      const keepBarSet = new Set(barDifferenceKeys);
      selectedMetrics = baseMetrics.filter((k) => !allDiff.has(k) || keepBarSet.has(k));
      if (!selectedMetrics.length) selectedMetrics = baseMetrics.slice(0, 1);
      multiArrowMetricKey = arrowKeys[0];
    }
    const selectedGroups = resolveMultiDimensionGroups(payload, plan, overrides);
    const hasLineAxis = kind === 'barLine' && barLineMetrics.lineKeys.length > 0;
    const multiRateCompareArrowSeries = kind === 'rateCompare' && multiArrowMetricKey
      ? buildRateCompareArrowSeries(buildMultiDimensionRateCompareArrowData(payload, plan, multiArrowMetricKey, selectedGroups, xData))
      : undefined;
    const visiblePairs = selectedGroups.flatMap((group) => selectedMetrics.map((metricKey) => ({ group, metricKey })))
      .filter(({ group, metricKey }) => !hiddenLegendKeys.has(multiDimensionLegendKey(group, metricKey, selectedMetrics.length)));
    const series = visiblePairs.map(({ group, metricKey }) => {
      const seriesType = kind === 'line' || (kind === 'barLine' && barLineMetrics.lineKeys.includes(metricKey))
        ? 'line' as const
        : 'bar' as const;
      const sourceRows = xData.map((timeValue) => payload.data.find((item) => (
        String(item[plan.xKey!] ?? '') === timeValue
        && String(item[plan.groupKey!] ?? '') === group
      )));
      const sourceCells = sourceRows.map((row) => row?.[metricKey]);
      return {
        type: seriesType,
        name: multiDimensionLegendName(group, metricKey, selectedMetrics.length, selectedGroups.length),
        yAxisIndex: hasLineAxis && barLineMetrics.lineKeys.includes(metricKey) ? 1 : 0,
        smooth: seriesType === 'line',
        label: labelOption(showLabel, formatterForKey(metricKey, sourceCells)),
        data: sourceRows.map((row) => chartNumber(row?.[metricKey]) ?? null),
      };
    });
    const metricAxisName = kind === 'barLine' && barLineMetrics.barKeys.length
      ? valueAxisName(payload, barLineMetrics.barKeys)
      : (selectedMetrics.length ? valueAxisName(payload, selectedMetrics) : valueAxisNameText);
    const lineAxisName = barLineMetrics.lineKeys.length ? valueAxisName(payload, barLineMetrics.lineKeys) : metricAxisName;
    const metricValueAxisOnY = { ...valueAxisOnY, name: metricAxisName };
    const metricValueAxisOnX = { ...valueAxisOnX, name: metricAxisName };

    return {
      ...base,
      grid: swapped
        ? { left: axisLayout.yLabelWidth + 20, right: 56, top: 44, bottom: 78, containLabel: true }
        : { left: 84, right: hasLineAxis ? 72 : 48, top: 54, bottom: axisLayout.bottom, containLabel: true },
      tooltip: {
        ...base.tooltip,
        axisPointer: { type: kind === 'bar' || kind === 'barLine' || kind === 'rateCompare' ? 'shadow' : 'cross' },
      },
      xAxis: swapped ? metricValueAxisOnX : categoryAxisOnX,
      yAxis: swapped
        ? categoryAxisOnY
        : hasLineAxis
          ? [
            metricValueAxisOnY,
            {
              type: 'value' as const,
              name: lineAxisName,
              nameLocation: 'end' as const,
              nameGap: 14,
              nameTextStyle: { ...axisNameStyle, align: 'right' as const },
              splitNumber,
              splitLine: { show: false },
              axisLabel: { ...axisLabelStyle, margin: 10 },
            },
          ]
          : metricValueAxisOnY,
      series: multiRateCompareArrowSeries ? [...series, multiRateCompareArrowSeries as never] : series,
    };
  }

  if (kind === 'barLine') {
    if (isLongMetricValuePlan(plan, yKeys) && hasRateCategories(xData)) {
      const valueKey = yKeys[0];
      const barData = payload.data.map((row) => (isRateCategory(String(row[xKey] ?? '')) ? null : chartNumber(row[valueKey]) ?? null));
      const lineData = payload.data.map((row) => (isRateCategory(String(row[xKey] ?? '')) ? chartNumber(row[valueKey]) ?? null : null));
      return {
        ...base,
        grid: { left: 84, right: 72, top: 54, bottom: axisLayout.bottom, containLabel: true },
        tooltip: {
          ...base.tooltip,
          axisPointer: { type: 'cross', crossStyle: { color: '#8B97AD' } },
        },
        xAxis: { ...categoryAxisOnX, axisPointer: { type: 'shadow' } },
        yAxis: [
          { ...valueAxisOnY, name: friendlyFullLabel(valueKey) },
          {
            type: 'value' as const,
            name: '比率',
            nameLocation: 'end' as const,
            nameGap: 14,
            nameTextStyle: { ...axisNameStyle, align: 'right' as const },
            splitNumber,
            splitLine: { show: false },
            axisLabel: { ...axisLabelStyle, margin: 10 },
          },
        ],
        series: [
          {
            type: 'bar' as const,
            name: friendlyShortLabel(valueKey),
            label: labelOption(showLabel, formatterForKey(valueKey)),
            data: barData,
          },
          {
            type: 'line' as const,
            name: '比率指标',
            yAxisIndex: 1,
            smooth: true,
            label: labelOption(showLabel, formatterForKey(valueKey)),
            data: lineData,
          },
        ],
      };
    }

    const { barKeys, lineKeys } = splitBarLineKeys(yKeys, overrides.lineKeys);
    const lineSeriesKeys = lineKeys;
    const barAxisName = barKeys.length ? valueAxisName(payload, barKeys) : '';
    const lineAxisName = lineSeriesKeys.length ? valueAxisName(payload, lineSeriesKeys) : valueAxisNameText;
    return {
      ...base,
      grid: { left: 84, right: lineSeriesKeys.length ? 72 : 48, top: 54, bottom: axisLayout.bottom, containLabel: true },
      tooltip: {
        ...base.tooltip,
        axisPointer: { type: 'cross', crossStyle: { color: '#8B97AD' } },
      },
      xAxis: { ...categoryAxisOnX, axisPointer: { type: 'shadow' } },
      yAxis: lineSeriesKeys.length
        ? [
          { ...valueAxisOnY, name: barAxisName },
          {
            type: 'value' as const,
            name: lineAxisName,
            nameLocation: 'end' as const,
            nameGap: 14,
            nameTextStyle: { ...axisNameStyle, align: 'right' as const },
            splitNumber,
            splitLine: { show: false },
            axisLabel: { ...axisLabelStyle, margin: 10 },
          },
        ]
        : valueAxisOnY,
      series: [
        ...barKeys.map((key) => ({
          type: 'bar' as const,
          name: key,
          label: labelOption(showLabel, formatterForKey(key)),
          data: payload.data.map((row) => chartNumber(row[key]) ?? null),
        })),
        ...lineSeriesKeys.map((key) => ({
          type: 'line' as const,
          name: key,
          yAxisIndex: 1,
          smooth: true,
          label: labelOption(showLabel, formatterForKey(key)),
          data: payload.data.map((row) => chartNumber(row[key]) ?? null),
        })),
      ],
    };
  }

  // 差异对比（rateCompare）：同比/环比/变化率/差异额等"差异列"默认作为虚线箭头的标签值，不作为柱。
  // 用户可在工具栏：
  //   1) "差异指标"行任意选一列（含派生列如"毛利""毛利率"）作为箭头标签源 —— 该列默认从柱里剔出。
  //   2) "也作为柱"行勾选"量类差异列"（如"变化量"），让其同时作为柱 + 箭头候选。
  const rateCompareKeys = (() => {
    if (kind !== 'rateCompare') return null;
    const { barDifferenceKeys, arrowKeys } = classifyDifferenceKeys(
      allYKeys,
      overrides.lineKeys,
      hiddenLegendKeys,
      overrides.rateCompareBarKeys,
      overrides.rateCompareValueMode,
    );
    const allDiff = new Set(allYKeys.filter(isDifferenceMetricKey));
    const keepBarSet = new Set(barDifferenceKeys);
    // 用户显式选作箭头的"非差异列"（如"毛利"）：默认从柱里剔出，除非也勾了"也作为柱"
    const explicitArrowSet = new Set((overrides.lineKeys ?? []).filter((k) => allYKeys.includes(k)));
    // 柱列 = (非差异列 ∪ 用户勾选保留为柱的差异列) − 用户显式选作箭头的非差异列；并按 hiddenLegendKeys 过滤
    const barKeys = allYKeys.filter((k) => {
      if (hiddenLegendKeys.has(k)) return false;
      if (allDiff.has(k)) return keepBarSet.has(k);
      // 非差异列：默认做柱；若被显式选作箭头且未勾"也作为柱"，则剔出
      if (explicitArrowSet.has(k) && !keepBarSet.has(k)) return false;
      return true;
    });
    return {
      barKeys: barKeys.length ? barKeys : yKeys.slice(0, 1),
      rateKeys: arrowKeys,
    };
  })();
  const renderYKeys = rateCompareKeys ? rateCompareKeys.barKeys : yKeys;
  const rateCompareArrowSeries = rateCompareKeys && !swapped
    ? buildRateCompareArrowSeries(buildRateCompareArrowData(payload, rateCompareKeys.barKeys, rateCompareKeys.rateKeys, xData, overrides.rateCompareValueMode ?? 'absolute'))
    : undefined;

  // rateCompare 在 series 渲染层退化为 bar，差异箭头由 custom series 叠加绘制（不堆叠）。
  const seriesType = kind === 'line' ? 'line' as const : 'bar' as const;

  const series = renderYKeys.map((key) => ({
    type: seriesType,
    name: key,
    smooth: kind === 'line',
    label: labelOption(showLabel, formatterForKey(key)),
    data: payload.data.map((row) => chartNumber(row[key]) ?? null),
  }));

  return {
    ...base,
    grid: swapped
      ? { left: axisLayout.yLabelWidth + 20, right: 56, top: 44, bottom: 78, containLabel: true }
      : { left: 84, right: 48, top: 54, bottom: axisLayout.bottom, containLabel: true },
    tooltip: {
      ...base.tooltip,
      axisPointer: { type: kind === 'bar' || kind === 'rateCompare' ? 'shadow' : 'cross' },
    },
    xAxis: swapped ? valueAxisOnX : categoryAxisOnX,
    yAxis: swapped ? categoryAxisOnY : valueAxisOnY,
    series: rateCompareArrowSeries ? [...series, rateCompareArrowSeries as never] : series,
  };
}

export function buildLegendItems(
  payload: ChartPayload,
  plan: ChartRenderPlan,
  overrides: ChartStyleOverrides = {},
): ChartLegendItem[] {
  const kind = overrides.kind && overrides.kind !== 'table' ? overrides.kind : plan.kind;
  const palette = CHART_COLORS_10;

  if (kind === 'pie') {
    const categoryKey = plan.categoryKey ?? plan.xKey ?? payload.columns[0];
    return payload.data.map((row, i) => ({
      name: String(row[categoryKey] ?? ''),
      key: pieLegendKey(categoryKey, row, i),
      color: palette[i % palette.length],
    }));
  }

  if (isMultiDimensionPlan(plan)) {
    const barLineMetrics = kind === 'barLine' ? resolveMultiDimensionBarLineMetrics(payload, plan, overrides) : null;
    const selectedMetrics = barLineMetrics
      ? Array.from(new Set([...barLineMetrics.barKeys, ...barLineMetrics.lineKeys]))
      : resolveMultiDimensionMetrics(payload, plan, overrides);
    const selectedGroups = resolveMultiDimensionGroups(payload, plan, overrides);
    return selectedGroups.flatMap((group) => selectedMetrics.map((metricKey) => ({ group, metricKey }))).map((item, i) => ({
      name: multiDimensionLegendName(item.group, item.metricKey, selectedMetrics.length, selectedGroups.length),
      key: multiDimensionLegendKey(item.group, item.metricKey, selectedMetrics.length),
      color: palette[i % palette.length],
    }));
  }

  const yKeys = resolveYKeys(payload, plan);
  return yKeys.map((k, i) => ({
    name: friendlyShortLabel(k),
    key: k,
    color: palette[i % palette.length],
  }));
}
