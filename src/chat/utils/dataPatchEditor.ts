import type { ChartDataPatch, ChartStyleOverrides } from '../types/chart';
import { normalizeChartUnit } from './chartLabels';

/**
 * 编辑 dataPatch 的辅助工具，统一负责 immer-like 不可变更新 + 必要的副作用清理：
 * 当用户重命名一个列时，hiddenLegendKeys / metricKey(s) / lineKeys / barMetricKeys / lineMetricKeys 中
 * 引用旧列名的项需要清空，否则会出现"图例/选择器持有不存在的列名"的灵异现象。
 */

function pruneArr(arr: string[] | undefined, dropped: Set<string>): string[] | undefined {
  if (!arr || !arr.length) return arr;
  const next = arr.filter((k) => !dropped.has(k));
  if (next.length === arr.length) return arr;
  return next;
}

export interface OverridePatch {
  dataPatch?: ChartDataPatch;
  hiddenLegendKeys?: string[];
  metricKey?: string;
  metricKeys?: string[];
  lineKeys?: string[];
  barMetricKeys?: string[];
  lineMetricKeys?: string[];
}

/** 计算"列名变更后"需要顺带清理的 overrides 字段 */
export function buildOverrideCleanupOnColumnsChanged(
  prev: ChartStyleOverrides | undefined,
  droppedColumns: string[],
): Partial<ChartStyleOverrides> {
  if (!droppedColumns.length || !prev) return {};
  const dropped = new Set(droppedColumns);
  const out: Partial<ChartStyleOverrides> = {};
  if (prev.metricKey && dropped.has(prev.metricKey)) out.metricKey = undefined;
  const mk = pruneArr(prev.metricKeys, dropped);
  if (mk !== prev.metricKeys) out.metricKeys = mk;
  const lk = pruneArr(prev.lineKeys, dropped);
  if (lk !== prev.lineKeys) out.lineKeys = lk;
  const bmk = pruneArr(prev.barMetricKeys, dropped);
  if (bmk !== prev.barMetricKeys) out.barMetricKeys = bmk;
  const lmk = pruneArr(prev.lineMetricKeys, dropped);
  if (lmk !== prev.lineMetricKeys) out.lineMetricKeys = lmk;
  const hlk = pruneArr(prev.hiddenLegendKeys, dropped);
  if (hlk !== prev.hiddenLegendKeys) out.hiddenLegendKeys = hlk;
  return out;
}

export const dataPatchEditor = {
  toggleHiddenRow(patch: ChartDataPatch | undefined, rowId: string): ChartDataPatch {
    const set = new Set(patch?.hiddenRowIds ?? []);
    if (set.has(rowId)) set.delete(rowId);
    else set.add(rowId);
    return { ...(patch ?? {}), hiddenRowIds: Array.from(set) };
  },

  setHiddenRows(patch: ChartDataPatch | undefined, rowIds: string[]): ChartDataPatch {
    return { ...(patch ?? {}), hiddenRowIds: Array.from(new Set(rowIds)) };
  },

  unhideRow(patch: ChartDataPatch | undefined, rowId: string): ChartDataPatch {
    const next = (patch?.hiddenRowIds ?? []).filter((id) => id !== rowId);
    return { ...(patch ?? {}), hiddenRowIds: next };
  },

  toggleHiddenColumn(patch: ChartDataPatch | undefined, column: string): ChartDataPatch {
    const set = new Set(patch?.hiddenColumns ?? []);
    if (set.has(column)) set.delete(column);
    else set.add(column);
    return { ...(patch ?? {}), hiddenColumns: Array.from(set) };
  },

  unhideColumn(patch: ChartDataPatch | undefined, column: string): ChartDataPatch {
    const next = (patch?.hiddenColumns ?? []).filter((c) => c !== column);
    return { ...(patch ?? {}), hiddenColumns: next };
  },

  setColumnUnit(patch: ChartDataPatch | undefined, column: string, rawUnit: string): ChartDataPatch {
    const unit = normalizeChartUnit(rawUnit);
    const columnUnits = { ...(patch?.columnUnits ?? {}) };
    if (unit) columnUnits[column] = unit;
    else delete columnUnits[column];
    const next: ChartDataPatch = { ...(patch ?? {}) };
    if (Object.keys(columnUnits).length) next.columnUnits = columnUnits;
    else delete next.columnUnits;
    return next;
  },

  clearColumnUnit(patch: ChartDataPatch | undefined, column: string): ChartDataPatch {
    const columnUnits = { ...(patch?.columnUnits ?? {}) };
    delete columnUnits[column];
    const next: ChartDataPatch = { ...(patch ?? {}) };
    if (Object.keys(columnUnits).length) next.columnUnits = columnUnits;
    else delete next.columnUnits;
    return next;
  },

  setCell(patch: ChartDataPatch | undefined, rowId: string, column: string, value: unknown): ChartDataPatch {
    const cellEdits = { ...(patch?.cellEdits ?? {}) };
    const rowEdit = { ...(cellEdits[rowId] ?? {}) };
    rowEdit[column] = value;
    cellEdits[rowId] = rowEdit;
    return { ...(patch ?? {}), cellEdits };
  },

  clearCell(patch: ChartDataPatch | undefined, rowId: string, column: string): ChartDataPatch {
    const cellEdits = { ...(patch?.cellEdits ?? {}) };
    const rowEdit = { ...(cellEdits[rowId] ?? {}) };
    delete rowEdit[column];
    if (Object.keys(rowEdit).length === 0) delete cellEdits[rowId];
    else cellEdits[rowId] = rowEdit;
    return { ...(patch ?? {}), cellEdits };
  },

  setRowLabel(patch: ChartDataPatch | undefined, rowId: string, label: string | undefined): ChartDataPatch {
    const rowLabelEdits = { ...(patch?.rowLabelEdits ?? {}) };
    if (label === undefined || label === '') delete rowLabelEdits[rowId];
    else rowLabelEdits[rowId] = label;
    return { ...(patch ?? {}), rowLabelEdits };
  },

  /**
   * 列重命名：把 oldName -> newName 写进 columnRenames；同时返回需要顺带清理的 overrides 字段（按旧列名引用的需要清空）。
   * newName 为空字符串或与 oldName 相同时，相当于撤销重命名。
   */
  renameColumn(
    patch: ChartDataPatch | undefined,
    oldName: string,
    newName: string,
  ): ChartDataPatch {
    const renames = { ...(patch?.columnRenames ?? {}) };
    if (!newName || newName === oldName) {
      delete renames[oldName];
    } else {
      renames[oldName] = newName;
    }
    return { ...(patch ?? {}), columnRenames: renames };
  },

  /**
   * 在 reorderable 列集合内左右移动一列。
   * @param patch        当前 patch
   * @param currentOrder 当前显示顺序下"参与画图的可重排列"序列（顺序就是这些列在表/图上的当前左右位置）
   * @param column       要移动的列
   * @param direction    -1 = 左移一格；+1 = 右移一格
   *
   * 实现：基于 currentOrder 计算移动后的新顺序，作为 columnOrder 写回；
   * 因为 applyColumnOrder 只把 columnOrder 的列填入 visibleColumns 中"原命中位置"，
   * 所以维度列、不可重排列、隐藏列都不会被打乱。
   */
  moveColumn(
    patch: ChartDataPatch | undefined,
    currentOrder: string[],
    column: string,
    direction: -1 | 1,
  ): ChartDataPatch {
    const idx = currentOrder.indexOf(column);
    if (idx < 0) return patch ?? {};
    const target = idx + direction;
    if (target < 0 || target >= currentOrder.length) return patch ?? {};
    const next = currentOrder.slice();
    const tmp = next[idx];
    next[idx] = next[target];
    next[target] = tmp;
    return { ...(patch ?? {}), columnOrder: next };
  },
};
