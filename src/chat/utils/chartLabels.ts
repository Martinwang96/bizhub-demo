/**
 * 列名清理（极简版）。
 *
 * 设计原则：
 *  - 前端不应该"猜"数据库字段的中文含义。最终要展示的中文标签（如"考核收入"、"业务线"）
 *    必须由上游（LLM/后端图表 payload）在 `title/unit/columns/labels` 里显式给出。
 *  - 只有在字段名形如 `pro_name_4`、`income_wan_yuan` 这类数据库原始命名出现在图表里时，
 *    才做"单位后缀抽取 + 下划线替空格"的极简清理，避免显示得太丑。
 *  - 不再做英→中词典翻译（之前版本会把 `income` 翻成"收入"，这不符合约定，
 *    会在上游已给中文时反而产生两套命名）。
 *
 * L3 增强：除了英文蛇形列名后缀，还会从中文列名的「括号 / 斜杠」里抽单位
 *   - `带宽（Mbps）` → unit = 'Mbps'
 *   - `费用 (万元)`  → unit = '万元'
 *   - `活跃客户数/户` → unit = '户'
 *   - `日均请求 [QPS]` → unit = 'QPS'
 * 抽到的单位仅作展示用（Y 轴名 / tooltip），不影响数值解析。
 */

// 仅用于把纯英文蛇形列名里带的数值单位抽出来展示在 axisName/tooltip 中
const UNIT_SUFFIX_MAP: Array<{ re: RegExp; unit: string }> = [
  { re: /_wan_yuan$/i, unit: '万元' },
  { re: /_yi_yuan$/i, unit: '亿元' },
  { re: /_yuan$/i, unit: '元' },
  { re: /_rmb$/i, unit: '元' },
  { re: /_usd$/i, unit: 'USD' },
  { re: /_pct$/i, unit: '%' },
  { re: /_percent$/i, unit: '%' },
  { re: /_ratio$/i, unit: '%' },
  { re: /_rate$/i, unit: '%' },
  { re: /_cnt$/i, unit: '次' },
  { re: /_count$/i, unit: '次' },
  { re: /_num$/i, unit: '个' },
  { re: /_days?$/i, unit: '天' },
  { re: /_hours?$/i, unit: '小时' },
  { re: /_minutes?$/i, unit: '分钟' },
];

/**
 * 数值单位白名单（与 `chartInfer.ts` / `chart_payload.py` 的 NUMERIC_UNIT_RE_SOURCE 对齐）。
 *
 * 规则：
 *  - **封闭枚举**，永远不要放开成「任意非数字尾巴」，否则 `2026年1月` / `第3名` 都会被当数字。
 *  - 长 token 优先（`万元` 在 `元` 前面，`Mbps` 在 `bps` 前面），保证最长匹配。
 *  - 大小写不敏感（用 `i` flag）。
 */
export const HEADER_UNIT_TOKENS = [
  '个百分点', 'pp', '%',
  '万元', '亿元', '亿', '万', '元',
  'MB/s', 'GB/s', 'KB/s', 'TB/s',
  'Mbps', 'Gbps', 'Tbps', 'Kbps', 'Pbps', 'bps',
  'PiB', 'TiB', 'GiB', 'MiB', 'KiB',
  'PB', 'TB', 'GB', 'MB', 'KB', 'bytes', 'byte', 'B',
  'QPS', 'TPS', 'RPS',
  'ms', 'min', '小时', '分钟', '毫秒', '秒', '天', 'h', 's',
  '户', '人', '台', '条', '件', '笔', '单', '家', '项', '次', '个',
];

const HEADER_UNIT_TOKEN_RE = new RegExp(
  `^(?:${HEADER_UNIT_TOKENS
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})$`,
  'i',
);

/**
 * 把列名里「最后一个括号/斜杠/方括号」段抽出来，看是不是单位 token。
 * 仅识别封闭枚举里的单位，避免把"同比""人民币"这种修饰词误当单位。
 *
 * 形态：
 *   - `带宽（Mbps）`  → 'Mbps'
 *   - `费用 (万元)`   → '万元'
 *   - `活跃客户数/户` → '户'
 *   - `日均请求[QPS]` → 'QPS'
 *   - `带宽 Mbps`     → 'Mbps'（结尾紧贴单位 token）
 *
 * 不识别：
 *   - `收入(同比)` / `成本（人民币/元）` 中的 `同比/人民币` —— 不在白名单
 *   - `GMV (含税, 万元)` —— 多段时只看最后一段，且要求纯单位 token
 */
function extractHeaderUnit(rawHeader: string): string {
  if (!rawHeader) return '';
  const header = rawHeader.trim();
  // 1) 括号/方括号尾段，支持中英文括号
  const bracketMatch = header.match(/[（(\[【]([^（()\[\]【】]+)[)）\]】]\s*$/);
  if (bracketMatch) {
    const inner = bracketMatch[1].trim();
    // 取「最后一段」（按中英文逗号、斜杠分隔）作为候选单位
    const last = inner.split(/[,，/]/).pop()?.trim() ?? '';
    if (HEADER_UNIT_TOKEN_RE.test(last)) return canonicalizeUnit(last);
    return '';
  }
  // 2) 斜杠分隔尾段：`活跃客户数/户`
  const slashMatch = header.match(/\/([^/]+)$/);
  if (slashMatch) {
    const last = slashMatch[1].trim();
    if (HEADER_UNIT_TOKEN_RE.test(last)) return canonicalizeUnit(last);
  }
  // 3) 结尾直接紧贴单位 token：`带宽 Mbps` / `带宽Mbps`
  for (const token of HEADER_UNIT_TOKENS) {
    if (!token) continue;
    const re = new RegExp(`(^|[\\s\\u00A0])(${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\s*$`, 'i');
    if (re.test(header)) return canonicalizeUnit(token);
  }
  return '';
}

/** 单位规范化：统一 token 大小写形态（业务展示用），数值不受影响。 */
function canonicalizeUnit(unit: string): string {
  const trimmed = unit.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  // 网络/吞吐类统一大小写
  const networkMap: Record<string, string> = {
    mbps: 'Mbps', gbps: 'Gbps', tbps: 'Tbps', kbps: 'Kbps', pbps: 'Pbps', bps: 'bps',
    qps: 'QPS', tps: 'TPS', rps: 'RPS',
    'mb/s': 'MB/s', 'gb/s': 'GB/s', 'kb/s': 'KB/s', 'tb/s': 'TB/s',
    pb: 'PB', tb: 'TB', gb: 'GB', mb: 'MB', kb: 'KB',
    pib: 'PiB', tib: 'TiB', gib: 'GiB', mib: 'MiB', kib: 'KiB',
    bytes: 'bytes', byte: 'byte', b: 'B',
    ms: 'ms', min: 'min', h: 'h', s: 's',
  };
  if (networkMap[lower]) return networkMap[lower];
  return trimmed;
}

export function normalizeChartUnit(unit: unknown): string {
  if (typeof unit !== 'string') return '';
  const trimmed = unit.trim();
  if (!trimmed) return '';
  return HEADER_UNIT_TOKEN_RE.test(trimmed) ? canonicalizeUnit(trimmed) : '';
}

export function isKnownChartUnit(unit: unknown): boolean {
  return !!normalizeChartUnit(unit);
}

const CELL_VALUE_WITH_UNIT_RE = new RegExp(
  String.raw`^\s*([↑↓↗↘▲▼△▽+\-−－±]?\s*\d[\d,，]*(?:\.\d+)?)\s*(${HEADER_UNIT_TOKENS
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})\s*$`,
  'i',
);

export function splitCellValueAndUnit(value: unknown): { valueText: string; unit: string } {
  if (value === undefined || value === null) return { valueText: '', unit: '' };
  if (typeof value === 'number' && Number.isFinite(value)) return { valueText: String(value), unit: '' };
  const text = String(value).trim();
  const match = CELL_VALUE_WITH_UNIT_RE.exec(text);
  if (!match) return { valueText: text, unit: '' };
  return {
    valueText: match[1].replace(/\s+/g, ''),
    unit: canonicalizeUnit(match[2]),
  };
}

export function composeCellValueWithUnit(valueText: string, unit: string): string {
  const text = valueText.trim();
  const normalizedUnit = normalizeChartUnit(unit);
  if (!normalizedUnit) return text;
  return normalizedUnit === '%' ? `${text}%` : `${text} ${normalizedUnit}`;
}

export interface FriendlyLabel {
  label: string; // 展示标签（不含单位）
  unit: string;  // 从列名推断的单位（可能为空）
  full: string;  // label + (unit) 的组合；当 unit 为空时等同 label
}

// 判断一个 key 是否是"纯英文/蛇形"的数据库原始命名（含字母/数字/下划线，且首字符是字母）
function isRawDbKey(key: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(key);
}

/**
 * 把列名转换成可读标签。
 * - 如果 rawKey 是英文蛇形命名，抽出后缀单位，其余下划线转空格；
 * - 否则信任上游中文列名，但仍尝试从「括号/斜杠」抽单位用于 Y 轴展示。
 */
export function toFriendlyLabel(rawKey: string): FriendlyLabel {
  if (!rawKey) return { label: '', unit: '', full: '' };
  const key = rawKey.trim();

  if (!isRawDbKey(key)) {
    // 中文/含特殊符号标签：信任原文作为 label，仅抽单位用于轴名/tooltip
    const headerUnit = extractHeaderUnit(key);
    return { label: key, unit: headerUnit, full: key };
  }

  // 英文蛇形命名，做极简清理
  let rest = key;
  let unit = '';
  for (const { re, unit: u } of UNIT_SUFFIX_MAP) {
    if (re.test(rest)) {
      unit = u;
      rest = rest.replace(re, '');
      break;
    }
  }
  // 末尾的数字编号去掉（如 pro_name_4 → pro_name）
  rest = rest.replace(/_\d+$/, '');
  const label = rest.replace(/_/g, ' ').trim() || key;
  const full = unit ? `${label}（${unit}）` : label;
  return { label, unit, full };
}

export function toFriendlyLabels(rawKeys: string[]): Record<string, FriendlyLabel> {
  const map: Record<string, FriendlyLabel> = {};
  for (const key of rawKeys) map[key] = toFriendlyLabel(key);
  return map;
}

export function friendlyFullLabel(rawKey: string): string {
  return toFriendlyLabel(rawKey).full || rawKey;
}

export function friendlyShortLabel(rawKey: string): string {
  return toFriendlyLabel(rawKey).label || rawKey;
}

/**
 * 当所有数值列带同一单位后缀时，返回该公共单位，用于 y 轴名/tooltip。
 * 仅当 keys 都能抽出可识别后缀（英文蛇形或中文括号）时生效。
 */
export function inferCommonUnit(rawKeys: string[]): string {
  if (!rawKeys.length) return '';
  const units = rawKeys.map((k) => toFriendlyLabel(k).unit).filter(Boolean);
  if (units.length !== rawKeys.length) return '';
  const first = units[0];
  return units.every((u) => u === first) ? first : '';
}

/**
 * 从单元格字符串里抽单位（与数据解析共用同一份白名单）。
 * 只有「数字 + 单位 token」整体 fullmatch 才返回单位，不做模糊匹配。
 */
const CELL_UNIT_FULL_RE = new RegExp(
  String.raw`^\s*[-+±]?\d[\d,，]*(?:\.\d+)?\s*(${HEADER_UNIT_TOKENS
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})\s*$`,
  'i',
);

export function extractCellUnit(value: unknown): string {
  if (typeof value !== 'string') return '';
  // 归一化空格 + 剥离末尾括号注释后再匹配
  const normalized = value.trim()
    .replace(/[\u00A0\u3000]/g, ' ')
    .replace(/[（(][^）)]*[）)]\s*$/, '')
    .trim();
  const m = CELL_UNIT_FULL_RE.exec(normalized);
  return m ? canonicalizeUnit(m[1]) : '';
}

/**
 * 列单位融合：把「列名抽到的单位」与「列内所有单元格抽到的单位」合并成一个最终单位。
 *
 * 规则：
 *  1. 单元格无单位 → 用列名单位（headerUnit）；列名也无 → ''
 *  2. 单元格全部单位一致：
 *     - 列名缺省 / 与单元格相同 → 用单元格单位
 *     - 列名与单元格冲突 → 仍以单元格为准（更贴近真实数据）
 *  3. 单元格出现多种单位 → 视为列内不一致，返回 ''（让上游降级或单独处理）
 *
 * 不抛错、不警告，只返回一个稳定的展示单位。
 */
export function resolveColumnUnit(
  rawKey: string,
  cellValues: ReadonlyArray<unknown>,
): string {
  const headerUnit = toFriendlyLabel(rawKey).unit;
  const cellUnits = new Set<string>();
  for (const v of cellValues) {
    const u = extractCellUnit(v);
    if (u) cellUnits.add(u);
  }
  if (cellUnits.size === 0) return headerUnit;
  if (cellUnits.size === 1) return Array.from(cellUnits)[0];
  // 多种单位 → 列内不一致，避免误导，不返回单位
  return '';
}

/**
 * 一组数值列的「公共单位」融合版：
 * 仅当所有列融合后的单位都非空且相同时返回该单位，否则返回 ''。
 * 用于双轴/单轴的 Y 轴名展示。
 */
export function inferCommonUnitFromRows(
  rawKeys: string[],
  rows: ReadonlyArray<Record<string, unknown>>,
): string {
  if (!rawKeys.length) return '';
  const units = rawKeys.map((k) => resolveColumnUnit(k, rows.map((r) => r[k]))).filter(Boolean);
  if (units.length !== rawKeys.length) return '';
  const first = units[0];
  return units.every((u) => u === first) ? first : '';
}
