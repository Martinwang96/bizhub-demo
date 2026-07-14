/**
 * 日期范围筛选工具：admin 入口共享（Sessions / Stats / Mobile）。
 *
 * 行为与原 SessionsPage / MobileSessionsPage 内联实现保持字符级一致：
 * - `dateToTs(value, endOfDay?)`：将日期 / 月份 / 周字符串转 Unix 秒级时间戳；
 *   `endOfDay=true` 时取结束边界；空串返回 undefined。
 * - `fmtDate(d)`：将 Date 格式化为 `YYYY-MM-DD`（本地时区）。
 * - `applyQuickRange(quick, bucket?)`：根据快捷 key 返回 `{since, until}` 字符串对，
 *   未命中返回空串清空范围。
 * - `QUICK_RANGE_OPTIONS`：含「不限」首项（value='none' 哨兵）的 SelectInput 选项（day 兼容默认）；
 *   初始空值不命中任何 option，由 placeholder 兜底；用户主动点「不限」→ value='none' → 显示选中态。
 *   `QUICK_RANGE_CHIPS`：移动端 chip 用（不含「不限」）。
 * - `getQuickRangeOptions(bucket)`：按粒度返回可用快捷集合（Stats Toolbar 用）。
 *
 * **快捷集合按粒度分组**：
 * - `day`：今天 / 昨天 / 近 7 天 / 近 30 天（含当天）。
 * - `week`：上周 / 近 3 周 / 近 6 周 / 近 9 周；语义为「截止上周日（不含本周）的 N 个完整 ISO 周窗口」。
 * - `month`：上月 / 近 3 月 / 近 6 月 / 近 9 月；语义为「截止上月最后一天（不含本月）的 N 个完整自然月窗口」。
 *
 * 前端 quick 是语法糖，最终落地为 `{since, until}` 字符串对；后端只识别 since/until 时间戳，
 * 因此周/月扩展无需后端改动。
 */

export type QuickRangeKey =
  | ''
  | 'today'
  | 'yesterday'
  | '7d'
  | '30d'
  | 'last_week'
  | '3w'
  | '6w'
  | '9w'
  | 'last_month'
  | '3m'
  | '6m'
  | '9m';

export interface QuickRangeOption {
  value: string;
  label: string;
}

export const QUICK_RANGE_OPTIONS: QuickRangeOption[] = [
  { value: 'none', label: '不限' },
  { value: 'today', label: '今天' },
  { value: 'yesterday', label: '昨天' },
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
];

export const QUICK_RANGE_CHIPS: QuickRangeOption[] = [
  { value: 'today', label: '今天' },
  { value: 'yesterday', label: '昨天' },
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
];

/**
 * 将 'YYYY-MM-DD' 转 Unix 秒级时间戳。
 *
 * - `endOfDay=false`（since 用）：返回当日 00:00:00；
 *   `bucket='week'` 时左对齐到所属 ISO 周的**周一** 00:00:00；
 *   `bucket='month'` 时左对齐到当月 **1 日** 00:00:00（t-design mode=month 已给出 'YYYY-MM-01'，此处幂等）。
 * - `endOfDay=true`（until 用）：返回当日 23:59:59；
 *   `bucket='week'` 时右对齐到所属周的**周日** 23:59:59（周一 + 6 天）；
 *   `bucket='month'` 时右对齐到**当月最后一天** 23:59:59（自动处理 28/29/30/31）。
 *
 * 这样保证：t-design DateRangePicker 在 mode='month'/'week' 下按默认格式回传 'YYYY-MM' / 'YYYY-25周' 时，
 * 前端发给后端的 [since, until] 完整覆盖整个月 / 整周；与后端 `_bucket_label`（ISO 周 / YYYY-MM）落桶口径一致。
 *
 * 不传 `bucket` 或传 `'day'` 时退化为原行为（00:00:00 / 23:59:59），不影响 Sessions 等非粒度场景。
 */
export type DateBucket = 'day' | 'week' | 'month';

const DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const MONTH_RE = /^(\d{4})-(\d{1,2})$/;
const WEEK_RE = /^(\d{4})-(?:第)?(\d{1,2})周$/;

function parseLocalDate(value: string): Date | null {
  const dateMatch = DATE_RE.exec(value);
  if (dateMatch) {
    const y = Number(dateMatch[1]);
    const m = Number(dateMatch[2]);
    const d = Number(dateMatch[3]);
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d) return date;
    return null;
  }

  const monthMatch = MONTH_RE.exec(value);
  if (monthMatch) {
    const y = Number(monthMatch[1]);
    const m = Number(monthMatch[2]);
    if (m >= 1 && m <= 12) return new Date(y, m - 1, 1);
  }

  return null;
}

function isoWeekMonday(weekYear: number, week: number): Date {
  const jan4 = new Date(weekYear, 0, 4);
  const jan4Dow = jan4.getDay() || 7;
  return new Date(weekYear, 0, 4 - jan4Dow + 1 + (week - 1) * 7);
}

function parseWeekDate(value: string, side: 'start' | 'end'): Date | null {
  const match = WEEK_RE.exec(value);
  if (!match) return null;
  const weekYear = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return null;
  const monday = isoWeekMonday(weekYear, week);
  return side === 'start'
    ? monday
    : new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
}

function getIsoWeekParts(date: Date): { year: number; week: number } {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay() || 7;
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 4 - dow);
  const year = thursday.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const week = Math.ceil((((thursday.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year, week };
}

export function formatWeekValue(value: string): string {
  if (!value) return value;
  const weekMatch = WEEK_RE.exec(value);
  if (weekMatch) return `${weekMatch[1]}-${Number(weekMatch[2])}周`;
  const date = parseLocalDate(value);
  if (!date) return value;
  const { year, week } = getIsoWeekParts(date);
  return `${year}-${week}周`;
}

export function formatMonthValue(value: string): string {
  if (!value) return value;
  const date = parseLocalDate(value);
  if (!date) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function dateToTs(value: string, endOfDay = false, bucket: DateBucket = 'day'): number | undefined {
  if (!value) return undefined;
  const weekDate = bucket === 'week' ? parseWeekDate(value, endOfDay ? 'end' : 'start') : null;
  const d = weekDate ?? parseLocalDate(value);
  if (!d) return undefined;

  let aligned = d;
  if (bucket === 'month') {
    aligned = endOfDay
      // 当月最后一天 23:59:59：第 (month+1) 月的第 0 天 = 当月末日
      ? new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
      // 当月 1 日 00:00:00（幂等：t-design mode=month 已给出月初）
      : new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0);
  } else if (bucket === 'week') {
    // ISO 周：周一为周首日。getDay()：周日=0、周一=1…周六=6
    const dow = d.getDay();
    const offsetToMonday = dow === 0 ? -6 : 1 - dow; // 周日回退 6 天，其他回退到本周一
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetToMonday);
    aligned = endOfDay
      // 周日 23:59:59 = 周一 + 6 天
      ? new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 23, 59, 59)
      : monday;
  } else if (endOfDay) {
    aligned = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
  }

  return Math.floor(aligned.getTime() / 1000);
}

export function fmtDate(d: Date): string {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/**
 * 将日期 / 月份 / 周字符串对齐到所属"桶"边界，输出统一为 'YYYY-MM-DD'。
 *
 * 用途：业务 state 和后端参数始终保存日期边界；传给 t-design 时再转回它默认展示格式：
 *   - mode='month' onChange '2026-06' → state.until '2026-06-30'
 *   - mode='week' onChange '2026-25周' → state.since/state.until 对齐到该周周一/周日
 *
 * 与 dateToTs(bucket) 逻辑严格镜像：
 *   - side='start' & bucket='month' → 当月 1 日；'week' → 当周周一（ISO 周）
 *   - side='end'   & bucket='month' → 当月最后一天（自动 28/29/30/31）；'week' → 当周周日
 *   - bucket='day' / 未传：原值返回（不做对齐，不影响 Sessions 等场景）
 */
export function alignDateString(value: string, side: 'start' | 'end', bucket: DateBucket = 'day'): string {
  if (!value) return value;
  if (bucket === 'week') {
    const weekDate = parseWeekDate(value, side);
    if (weekDate) return fmtDate(weekDate);
  }

  const d = parseLocalDate(value);
  if (!d) return value;

  if (bucket === 'month') {
    const aligned = side === 'end'
      ? new Date(d.getFullYear(), d.getMonth() + 1, 0)
      : new Date(d.getFullYear(), d.getMonth(), 1);
    return fmtDate(aligned);
  }
  if (bucket === 'week') {
    const dow = d.getDay();
    const offsetToMonday = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetToMonday);
    if (side === 'start') return fmtDate(monday);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    return fmtDate(sunday);
  }
  return value;
}

/** 取当前日期所属 ISO 周的"周一" 00:00（本地时区，时分秒清零）。 */
function thisWeekMonday(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = d.getDay();
  const offsetToMonday = dow === 0 ? -6 : 1 - dow; // 周日回退 6 天
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetToMonday);
}

/**
 * 根据快捷 key 返回 `{since, until}` 字符串对。
 *
 * 周/月快捷的 bucket 语义：
 * - `last_week`：上一个完整 ISO 周（周一~周日）。
 * - `3w/6w/9w`：截止上周日（不含本周），往前数 3/6/9 个完整 ISO 周。
 * - `last_month`：上一个完整自然月（1 号~月末）。
 * - `3m/6m/9m`：截止上月末（不含本月），往前数 3/6/9 个完整自然月。
 *
 * 未命中或空 key 返回 `{since:'', until:''}` 表示不限。
 */
export function applyQuickRange(quick: string, _bucket?: DateBucket): { since: string; until: string } {
  const now = new Date();

  // ── day 快捷（含当天） ───────────────────────────────────────────────
  if (quick === 'today') return { since: fmtDate(now), until: fmtDate(now) };
  if (quick === 'yesterday') {
    const d = new Date(now.getTime() - 86400000);
    return { since: fmtDate(d), until: fmtDate(d) };
  }
  if (quick === '7d') {
    const a = new Date(now.getTime() - 6 * 86400000);
    return { since: fmtDate(a), until: fmtDate(now) };
  }
  if (quick === '30d') {
    const a = new Date(now.getTime() - 29 * 86400000);
    return { since: fmtDate(a), until: fmtDate(now) };
  }

  // ── week 快捷（完整 ISO 周，不含本周） ──────────────────────────────
  if (quick === 'last_week' || quick === '3w' || quick === '6w' || quick === '9w') {
    const weeks = quick === 'last_week' ? 1 : quick === '3w' ? 3 : quick === '6w' ? 6 : 9;
    const thisMon = thisWeekMonday(now);
    const lastSun = new Date(thisMon.getFullYear(), thisMon.getMonth(), thisMon.getDate() - 1);
    const startMon = new Date(thisMon.getFullYear(), thisMon.getMonth(), thisMon.getDate() - 7 * weeks);
    return { since: fmtDate(startMon), until: fmtDate(lastSun) };
  }

  // ── month 快捷（完整自然月，不含本月） ──────────────────────────────
  if (quick === 'last_month' || quick === '3m' || quick === '6m' || quick === '9m') {
    const months = quick === 'last_month' ? 1 : quick === '3m' ? 3 : quick === '6m' ? 6 : 9;
    // 上月最后一天 = 本月 1 号 - 1 天 == new Date(y, m, 0)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    // 起始月 1 号 = (本月 - months) 月 1 号
    const startMonthFirst = new Date(now.getFullYear(), now.getMonth() - months, 1);
    return { since: fmtDate(startMonthFirst), until: fmtDate(lastMonthEnd) };
  }

  return { since: '', until: '' };
}

const WEEK_QUICK_OPTIONS: QuickRangeOption[] = [
  { value: 'none', label: '不限' },
  { value: 'last_week', label: '上周' },
  { value: '3w', label: '近 3 周' },
  { value: '6w', label: '近 6 周' },
  { value: '9w', label: '近 9 周' },
];

const MONTH_QUICK_OPTIONS: QuickRangeOption[] = [
  { value: 'none', label: '不限' },
  { value: 'last_month', label: '上月' },
  { value: '3m', label: '近 3 月' },
  { value: '6m', label: '近 6 月' },
  { value: '9m', label: '近 9 月' },
];

/**
 * 按粒度返回可用快捷下拉选项。
 *
 * - `day` 返回与历史 `QUICK_RANGE_OPTIONS` 一致的 5 项；
 * - `week` / `month` 返回完整周 / 完整月的快捷集合（不含本周 / 本月）。
 */
export function getQuickRangeOptions(bucket: DateBucket = 'day'): QuickRangeOption[] {
  if (bucket === 'week') return WEEK_QUICK_OPTIONS;
  if (bucket === 'month') return MONTH_QUICK_OPTIONS;
  return QUICK_RANGE_OPTIONS;
}
