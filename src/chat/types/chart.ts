export type ChartIntent = 'auto' | 'trend' | 'compare' | 'composition' | 'matrix';

export type ChartKind = 'line' | 'bar' | 'barLine' | 'rateCompare' | 'pie' | 'table';

export interface ChartPayload {
  id: string;
  title?: string;
  intent?: ChartIntent;
  columns: string[];
  data: Record<string, unknown>[];
  rowCount: number;
  truncated?: boolean;
  limitReason?: string;
  source?: string;
  unit?: string;
}

/**
 * 用户对原始 payload.data 的"轻量微调"集合。
 * 注意：这里只承载"用户编辑过"的差异，未涉及的行/单元保持原 payload 数据 —— 服务端权威数据不被覆盖，刷新数据时 patch 仍然安全可叠加。
 *
 * - hiddenRowIds：被隐藏的行 id（不参与图 + 表显示）
 * - cellEdits：按 rowId -> { 列名 -> 新值 } 的稀疏覆盖
 * - rowLabelEdits：按 rowId -> 新行标签（可选语义层；当存在"维度列"时把维度单元改名）
 * - columnRenames：按 旧列名 -> 新列名（仅影响表头与图例显示文案，不改 payload.columns 的引用键）
 * - hiddenColumns：被隐藏的列名（不参与图 + 表显示；编辑前应过滤一次）
 * - columnOrder：用户对"参与画图列"的自定义顺序（仅记录被显式移动过的列名子集）。
 *   * 维度列（plan.xKey）锁第一位，不参与重排；
 *   * 不在画图列集合内的列保持原序；
 *   * 应用时：先把命中 columnOrder 且仍可见的列按指定顺序排到画图区段，剩余画图列与非画图列按原相对顺序保留。
 *
 * rowId 约定：优先使用 row 中的 `__rid` 字段；不存在则按"行索引"作为 id，渲染层会负责注入 `__rid`。
 */
export interface ChartDataPatch {
  hiddenRowIds?: string[];
  hiddenColumns?: string[];
  cellEdits?: Record<string, Record<string, unknown>>;
  rowLabelEdits?: Record<string, string>;
  columnRenames?: Record<string, string>;
  columnOrder?: string[];
  /**
   * 用户手动设置的列单位，优先级高于单元格自带单位和自动推断单位。
   * key 使用原始列名；列被重命名后，消费侧需要通过 columnRenames 反查原始列名以继续生效。
   */
  columnUnits?: Record<string, string>;
}

export interface ChartStyleOverrides {
  kind?: ChartKind;
  swapAxis?: boolean;
  splitNumber?: number;
  showLabel?: boolean;
  showLegend?: boolean;
  hiddenLegendKeys?: string[];
  /**
   * 折柱混合图中指定用折线展示的指标；在差异对比（rateCompare）下复用为"当前对比差异列"字段（单选覆盖）。
   * 写入通道：工具栏"差异指标/折线指标"选择器 + 表格视图列头 ⋯ 菜单的"设为当前对比列"。
   */
  lineKeys?: string[];
  metricKey?: string;   // 兼容旧状态：多维表中当前选择的单个指标列
  /**
   * 多维表中当前选择的多个指标列。
   * 写入通道：工具栏指标选择器 + 表格视图列头 ⋯ 菜单的"加入图表 / 从图表移除"。
   */
  metricKeys?: string[];
  /**
   * 多维折柱混合：柱状指标。
   * 写入通道：工具栏"柱状"指标选择器 + 表格视图列头 ⋯ 菜单的"设为柱 / 从图表移除"。
   */
  barMetricKeys?: string[];
  /**
   * 多维折柱混合：折线指标。
   * 写入通道：工具栏"折线"指标选择器 + 表格视图列头 ⋯ 菜单的"设为折线 / 从图表移除"。
   */
  lineMetricKeys?: string[];
  groupValues?: string[]; // 多维表中当前选择的分组值，如 国内/海外/合计
  /**
   * 差异对比（rateCompare）模式下，用户显式勾选"也作为柱"的差异列（如"变化量"）。
   * 默认空数组：差异类列只做箭头标签，不做柱。
   * 仅允许"量类"差异列被勾入（率类被强制排除，避免双 y 轴量纲冲突）。
   * 写入通道：工具栏"也作为柱"复选行。
   */
  rateCompareBarKeys?: string[];
  /**
   * 差异对比（rateCompare）默认箭头标签值来源。
   * 用户显式选择 lineKeys 时，lineKeys 始终最高优先级。
   */
  rateCompareValueMode?: 'absolute' | 'rate';
  /** 用户在表格视图中对原始数据的轻量微调（隐藏/改名/单元格修正等） */
  dataPatch?: ChartDataPatch;
}

export interface ChartRenderPlan {
  kind: ChartKind;
  xKey?: string;
  yKeys?: string[];
  categoryKey?: string;
  valueKey?: string;
  groupKey?: string;
  metricKeys?: string[];
  reason?: string;
}
