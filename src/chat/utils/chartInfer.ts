import type { ChartPayload, ChartRenderPlan } from '../types/chart';

/**
 * "增量/差值/同比环比"字符串的特征：
 * - 以 + 或 - 开头并紧跟数字，如 "+5,944.06" / "-12.3"
 * - 以 + 或 - 开头并紧跟百分号数字，如 "+8.99%" / "-3.2%"
 * - 含上下箭头，如 "↑12%" / "↓3.4"
 * - "—" / "--" / "−" / "－" 这种"无对照"占位
 *
 * 这些值不是真实可对比刻度，混进折线/柱状会让图崩成一条直线（增量行的 0 把真实指标压扁）。
 */
const DELTA_VALUE_RE = /^\s*[+\-±]\s*[\d,，.]+\s*%?\s*$|[↑↓⬆⬇▲▼]/;
const PLACEHOLDER_VALUE_RE = /^[—–\-−－]+$/;

/**
 * 时间/类目列里"行名"是衍生口径的关键词：
 * 命中后整行不参与作图（环比变化、环比增长率、同比增长、增速、累计同比 等）。
 */
const DERIVED_ROW_LABEL_RE = /(环比|同比|增速|增长率|涨跌|变化(率|额|量)?|变动(率|额|量)?|贡献增长|增长贡献|贡献增量|增量|增收|减收|净增|净减|对比差)/;
const TEXT_NOTE_KEY_RE = /(说明|备注|原因|描述|解读|趋势|建议|结论|comment|note|desc|description)/i;
const DIFFERENCE_KEY_RE = /(同比|环比|增速|增长率|变化率|变动率|达成率|完成率|差异|差额|偏差|缺口|变化值|变化额|变化量|变动值|变动额|变动量|增减量|增长额|增长量|贡献增长|增长贡献|贡献增量|增量|增收|减收|净增|净减|对比值|pct|percent|rate|ratio|delta|diff|difference|gap|%)/i;

function isDeltaCellValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (PLACEHOLDER_VALUE_RE.test(trimmed)) return true;
  return DELTA_VALUE_RE.test(trimmed);
}

/**
 * 判断一行数据是否为"衍生指标行"，不应参与作图：
 * - 任意字符串单元格匹配 +x / -x / ↑↓ / —
 * - 或第一/任一文本列的值是 "环比变化 / 环比增长率 / 同比 / 增速 / ..." 这类口径名
 *
 * 该规则 PC / 移动端通用——只在作图链路（plan + options）剔除，表格 fallback 仍展示原始全量行。
 */
export function isDerivedChartRow(row: Record<string, unknown>): boolean {
  for (const value of Object.values(row)) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (DERIVED_ROW_LABEL_RE.test(trimmed)) return true;
    if (isDeltaCellValue(trimmed)) return true;
  }
  return false;
}

function rowLabel(row: Record<string, unknown>, key: string): string {
  return String(row[key] ?? '').trim();
}

/**
 * 处理「月份在行、变化/变化率也在行」的矩阵表：
 *
 *   月份 | 指标A | 指标B
 *   3月  | 10    | 20
 *   4月  | 12    | 18
 *   变化 | +2    | -2
 *   变化率 | +20% | -10%
 *
 * 转成更适合作图的宽表：
 *
 *   指标 | 3月 | 4月 | 变化 | 变化率
 *   指标A | 10 | 12 | 2 | 20
 *   指标B | 20 | 18 | -2 | -10
 *
 * 这样横轴不会出现「变化/变化率」，rateCompare 也能把它们作为可选箭头标签。
 */
function transposeDerivedRowsForChart(payload: ChartPayload): ChartPayload | null {
  const columns = payload.columns ?? [];
  const rows = payload.data ?? [];
  if (columns.length < 3 || rows.length < 3) return null;

  const labelKey = columns.find((col) => rows.some((row) => DERIVED_ROW_LABEL_RE.test(rowLabel(row, col))));
  if (!labelKey) return null;

  const baseRows = rows.filter((row) => !DERIVED_ROW_LABEL_RE.test(rowLabel(row, labelKey)));
  const derivedRows = rows.filter((row) => DERIVED_ROW_LABEL_RE.test(rowLabel(row, labelKey)));
  if (baseRows.length < 2 || derivedRows.length < 1) return null;

  const baseLabels = baseRows.map((row) => rowLabel(row, labelKey)).filter(Boolean);
  const derivedLabels = derivedRows.map((row) => rowLabel(row, labelKey)).filter(Boolean);
  const allLabels = [...baseLabels, ...derivedLabels];
  if (allLabels.length !== new Set(allLabels).size) return null;

  const metricColumns = columns.filter((col) => (
    col !== labelKey
    && !isRankKey(col)
    && rows.some((row) => parseChartNumber(row[col]) !== undefined)
  ));
  if (metricColumns.length < 2) return null;

  const data = metricColumns.map((metricName) => {
    const next: Record<string, unknown> = { 指标: metricName };
    for (const row of [...baseRows, ...derivedRows]) {
      const label = rowLabel(row, labelKey);
      const rawValue = row[metricName];
      next[label] = parseChartNumber(rawValue) !== undefined ? rawValue : null;
    }
    return next;
  });

  return {
    ...payload,
    columns: ['指标', ...allLabels],
    data,
    rowCount: data.length,
  };
}

/**
 * 把 payload.data 中所有"衍生指标行"剔除后的精简版 payload，专供作图链路使用。
 * 表格 fallback / 来源行数等仍以原始 payload 计算，避免显示与图脱节。
 */
export function filterPayloadForChart(payload: ChartPayload): ChartPayload {
  const rows = payload.data ?? [];
  if (!rows.length) return payload;

  const transposed = transposeDerivedRowsForChart(payload);
  if (transposed) return transposed;

  // 制图只保留至少有一个真实数值指标的行。
  // 例如「下半年目标趋势 / 逐月递增 / 从 6 月...」这类纯文字说明行，表格可以展示，但不能进入 xAxis，
  // 否则会出现最后一个类目没有点/柱的空白。
  const metricKeys = (payload.columns ?? []).filter((key) => (
    !isRankKey(key)
    && !TEXT_NOTE_KEY_RE.test(key)
    && rows.some((row) => isNumberValue(row[key]))
  ));
  const filtered = rows.filter((row) => (
    !isDerivedChartRow(row)
    && (!metricKeys.length || metricKeys.some((key) => isNumberValue(row[key])))
  ));
  if (filtered.length === rows.length) return payload;
  // 极端情况：全部行都是衍生/无数值 → 不过滤，否则后端在 plan 里直接走 table，体验更差
  if (!filtered.length) return payload;
  return { ...payload, data: filtered };
}

const TIME_KEY_RE = /(^|_)(dt|date|time|datetime|created_at|updated_at|ftime|month)($|_)|月份|年月|日期/i;
const PERCENT_KEY_RE = /(pct|percent|rate|ratio|率|百分比|增速|同比|环比|%)/i;
const AMOUNT_KEY_RE = /(yuan|rmb|amount|income|revenue|cost|profit|元|万元|亿元|金额|收入|成本|利润|毛利|实际值|目标值|考核)/i;
const RANK_KEY_RE = /^(排名|排行|名次|序号|序|rank|ranking|index|idx|no\.?|number)$/i;
const DIMENSION_KEY_RE = /(业务线|产品|产品名|名称|类别|类目|维度|行业|区域|地区|渠道|客户|部门|团队|项目|产业|pro|product|name|category|type|line|biz|business|region|channel)/i;
const GROUP_KEY_RE = /(区域|地区|国内外|海内外|产品|产品名|业务线|类别|类目|维度|市场|国家|渠道|部门|团队|项目|region|area|product|category|type|channel|line|biz|business)/i;

const NUMERIC_UNIT_RE_SOURCE = String.raw`%|pp|个百分点|万元|亿元|亿|元|万|个|户|人|台|条|件|笔|单|家|项|次|天|小时|分钟|秒|毫秒|ms|s|min|h|pbps|tbps|gbps|mbps|kbps|bps|pib|tib|gib|mib|kib|bytes?|pb|tb|gb|mb|kb|b|qps|tps|rps|[kmgtp]?bit/s|[kmgtp]?b/s|[kmgtp]?byte/s|个/秒|次/秒|户/秒`;
const NUMERIC_CELL_FULL_RE = new RegExp(String.raw`^\s*([-+]?\d[\d,，]*(?:\.\d+)?)\s*(?:${NUMERIC_UNIT_RE_SOURCE})?\s*$`, 'i');
const ARROW_NUMERIC_CELL_FULL_RE = new RegExp(String.raw`^\s*([↑↓↗↘▲▼△▽+\-−－]?)\s*(\d[\d,，]*(?:\.\d+)?)\s*(?:${NUMERIC_UNIT_RE_SOURCE})?\s*$`, 'i');

function parseChartNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
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

function isNumberValue(value: unknown): boolean {
  return parseChartNumber(value) !== undefined;
}

function isTimeKey(key: string): boolean {
  return TIME_KEY_RE.test(key);
}

function isRankKey(key: string): boolean {
  return RANK_KEY_RE.test(key.trim());
}

function hasTextValue(rows: Record<string, unknown>[], key: string): boolean {
  return rows.some((row) => typeof row[key] === 'string' && String(row[key]).trim().length > 0);
}

function dimensionCandidates(columns: string[], rawNumericKeys: string[], rows: Record<string, unknown>[]): string[] {
  return columns.filter((key) => (
    !isTimeKey(key)
    && !isRankKey(key)
    && !rawNumericKeys.includes(key)
    && hasTextValue(rows, key)
  ));
}

function pickCategoryColumn(columns: string[], rawNumericKeys: string[], rows: Record<string, unknown>[]): string | undefined {
  // 横轴必须优先使用真实业务维度（产品/业务线/名称等），不能用“排名/序号”。
  // 同时用 rawNumericKeys 排除所有原始数值列，避免后续过滤掉 rank 后又把 rank 当维度。
  const candidates = dimensionCandidates(columns, rawNumericKeys, rows);
  return candidates.find((key) => DIMENSION_KEY_RE.test(key)) ?? candidates[0];
}

function pickGroupColumn(columns: string[], rawNumericKeys: string[], rows: Record<string, unknown>[]): string | undefined {
  const candidates = dimensionCandidates(columns, rawNumericKeys, rows);
  return candidates.find((key) => GROUP_KEY_RE.test(key)) ?? (candidates.length >= 1 ? candidates[0] : undefined);
}

function hasRepeatedTimeGroups(rows: Record<string, unknown>[], timeKey: string, groupKey: string): boolean {
  const groupsByTime = new Map<string, Set<string>>();
  for (const row of rows) {
    const time = String(row[timeKey] ?? '').trim();
    const group = String(row[groupKey] ?? '').trim();
    if (!time || !group) continue;
    const groups = groupsByTime.get(time) ?? new Set<string>();
    groups.add(group);
    groupsByTime.set(time, groups);
  }
  return Array.from(groupsByTime.values()).some((groups) => groups.size >= 2);
}

export function inferChartPlan(payload: ChartPayload): ChartRenderPlan {
  const rows = payload.data ?? [];
  const columns = payload.columns ?? [];
  if (!rows.length || !columns.length || payload.rowCount > 2000) {
    return { kind: 'table', reason: 'empty_or_too_large' };
  }

  const rawNumericKeys = columns.filter((key) => !isTimeKey(key) && rows.some((row) => isNumberValue(row[key])));
  const metricNumericKeys = rawNumericKeys.filter((key) => !isRankKey(key));
  if (!metricNumericKeys.length) return { kind: 'table', reason: 'no_metric_numeric_column' };
  const amountKeys = metricNumericKeys.filter((key) => AMOUNT_KEY_RE.test(key) && !PERCENT_KEY_RE.test(key));
  const percentKeys = metricNumericKeys.filter((key) => PERCENT_KEY_RE.test(key));
  // 既不是"金额"也不是"比率"的 metric 数值列（如"较3月实际差异""目标缺口"等）。
  // 历史版本在 hasMixedUnits 分支里只拼 amount+percent，这些 other 列会被静默丢弃——
  // 用户观感是表格里明明有某列数字，图上却没画。这里把 other 并入候选池（排在 amount 之后、
  // percent 之前），继续交给下游分流规则（splitBarLineKeys / rateCompare 等）按现有规则归位。
  // amount / percent 自身的定义、规则、顺序均不动。
  const otherKeys = metricNumericKeys.filter(
    (key) => !amountKeys.includes(key) && !percentKeys.includes(key),
  );
  const mixedNumericKeys = amountKeys.length > 0 && percentKeys.length > 0
    ? [...amountKeys, ...otherKeys, ...percentKeys]
    : metricNumericKeys;
  // numericKeys 用于"纯柱/纯折"分支，不应包含百分比列（比率混进单轴会把主指标压扁）；
  // 但 other 差异类有绝对量纲，与 amount 同属柱状侧，应当一并参与。
  const numericKeys = amountKeys.length > 0 && percentKeys.length > 0
    ? [...amountKeys, ...otherKeys]
    : metricNumericKeys;

  const timeKey = columns.find(isTimeKey);
  const groupKey = timeKey ? pickGroupColumn(columns, rawNumericKeys, rows) : undefined;
  const categoryKey = pickCategoryColumn(columns, rawNumericKeys, rows);
  const firstNumber = numericKeys[0];
  const hasMixedUnits = amountKeys.length > 0 && percentKeys.length > 0;
  const differenceKeys = metricNumericKeys.filter((key) => DIFFERENCE_KEY_RE.test(key));
  const baseCompareKeys = metricNumericKeys.filter((key) => !DIFFERENCE_KEY_RE.test(key));

  if (timeKey && groupKey && groupKey !== timeKey && hasRepeatedTimeGroups(rows, timeKey, groupKey)) {
    return { kind: 'bar', xKey: timeKey, groupKey, metricKeys: metricNumericKeys, yKeys: metricNumericKeys };
  }

  if (payload.intent === 'composition' && categoryKey && rows.length <= 30) {
    return { kind: 'pie', categoryKey, valueKey: firstNumber };
  }

  // 宽表里同时存在「两期基准列 + 变化/变化率/贡献增长」时，默认更适合差异对比：
  // 柱画基准列，箭头标签从变化率/变化量等列中选择。
  // 典型来源：filterPayloadForChart 将「变化/变化率」行转置成列后的表。
  if (categoryKey && differenceKeys.length > 0 && baseCompareKeys.length >= 1 && !timeKey) {
    return { kind: 'rateCompare', xKey: categoryKey, yKeys: metricNumericKeys };
  }

  if (payload.intent === 'trend' && timeKey) {
    return hasMixedUnits
      ? { kind: 'barLine', xKey: timeKey, yKeys: mixedNumericKeys }
      : { kind: 'line', xKey: timeKey, yKeys: numericKeys };
  }

  if ((payload.intent === 'compare' || payload.intent === 'matrix') && categoryKey) {
    // 金额/数量 + 比率类指标必须默认双轴折柱混合，否则比率会被主轴吞掉几乎不可见。
    if (hasMixedUnits) {
      return { kind: 'barLine', xKey: categoryKey, yKeys: mixedNumericKeys };
    }
    return { kind: 'bar', xKey: categoryKey, yKeys: numericKeys };
  }

  if (numericKeys.length >= 2 && !timeKey && !categoryKey) {
    return { kind: 'table', reason: 'no_business_dimension_for_chart' };
  }

  if (timeKey) {
    return hasMixedUnits
      ? { kind: 'barLine', xKey: timeKey, yKeys: mixedNumericKeys }
      : { kind: 'bar', xKey: timeKey, yKeys: numericKeys };
  }

  if (categoryKey) {
    return hasMixedUnits
      ? { kind: 'barLine', xKey: categoryKey, yKeys: mixedNumericKeys }
      : { kind: 'bar', xKey: categoryKey, yKeys: numericKeys };
  }

  return { kind: 'table', reason: 'no_business_dimension_for_chart' };
}
