import type { ChartDataPatch, ChartPayload } from '../types/chart';

/** 给一行数据生成稳定 id：优先用 row.__rid，否则用行索引 */
export function getRowId(row: Record<string, unknown>, index: number): string {
  const rid = (row as { __rid?: unknown }).__rid;
  if (typeof rid === 'string' && rid) return rid;
  if (typeof rid === 'number' && Number.isFinite(rid)) return String(rid);
  return `__row_${index}`;
}

/**
 * 给原始 payload.data 注入稳定 __rid（仅在缺失时），保证后续按 rowId 操作的稳定性。
 * 不会改变行内容；如所有行都已带 __rid 则原样返回，避免不必要的引用变更。
 */
export function ensureRowIds(payload: ChartPayload): ChartPayload {
  const rows = payload.data ?? [];
  if (!rows.length) return payload;
  let mutated = false;
  const next = rows.map((row, idx) => {
    const rid = (row as { __rid?: unknown }).__rid;
    if (typeof rid === 'string' && rid) return row;
    if (typeof rid === 'number' && Number.isFinite(rid)) return row;
    mutated = true;
    return { ...row, __rid: `__row_${idx}` };
  });
  if (!mutated) return payload;
  return { ...payload, data: next };
}

function isPatchEmpty(patch?: ChartDataPatch): boolean {
  if (!patch) return true;
  const { hiddenRowIds, hiddenColumns, cellEdits, rowLabelEdits, columnRenames, columnOrder, columnUnits } = patch;
  if (hiddenRowIds && hiddenRowIds.length) return false;
  if (hiddenColumns && hiddenColumns.length) return false;
  if (cellEdits && Object.keys(cellEdits).length) return false;
  if (rowLabelEdits && Object.keys(rowLabelEdits).length) return false;
  if (columnRenames && Object.keys(columnRenames).length) return false;
  if (columnOrder && columnOrder.length) return false;
  if (columnUnits && Object.keys(columnUnits).length) return false;
  return true;
}

/**
 * 按 columnOrder 重排"已剔除隐藏"的列。
 * 规则：
 * - columnOrder 中存在且也在 visibleColumns 中的列，按 columnOrder 的相对顺序排到这些列原本占位的"段"上；
 * - 不在 columnOrder 中的列保持其原始相对顺序；
 * - 实现：找出 visibleColumns 中所有被 columnOrder 命中的位置，把这些位置依次填入 columnOrder 的列；其它位置保持原列。
 *   这样保证"未被显式排序的列"在最终列表中的相对位置不变（包括维度列恒为第 0 位的情形——只要调用方不把维度列放进 columnOrder）。
 */
function applyColumnOrder(visibleColumns: string[], columnOrder?: string[]): string[] {
  if (!columnOrder || !columnOrder.length) return visibleColumns;
  const visibleSet = new Set(visibleColumns);
  const orderedQueue = columnOrder.filter((c) => visibleSet.has(c));
  if (!orderedQueue.length) return visibleColumns;
  const orderedSet = new Set(orderedQueue);
  const result: string[] = [];
  let qi = 0;
  for (const col of visibleColumns) {
    if (orderedSet.has(col)) {
      // 该位置由 orderedQueue 接管（按相对顺序填入）
      result.push(orderedQueue[qi]);
      qi += 1;
    } else {
      result.push(col);
    }
  }
  return result;
}

/**
 * 把 ChartDataPatch 应用到 payload 上，返回新的 payload。
 * - patch 为空时走 fast path 直接返回原 payload，引用不变（memo 友好）。
 * - 列重命名只影响 columns 的文案：内部用映射保留旧 -> 新；同时把每行的 key 也按映射改写，保证表/图链路使用新的列键无歧义。
 *   * 调用方在重命名时如需清空 metricKeys/lineKeys/hiddenLegendKeys 等"按列名引用"的 overrides，由 editor 工具负责，applyDataPatch 不做副作用。
 * - 行隐藏/列隐藏在最终输出中直接剔除。
 *
 * 该函数会把"被编辑过的行"复制为新对象，未编辑的行保留原引用，尽量减少下游 echarts setOption 的 churn。
 */
export function applyDataPatch(payload: ChartPayload, patch?: ChartDataPatch): ChartPayload {
  if (isPatchEmpty(patch)) return payload;
  const safePatch = patch!;
  const baseRows = payload.data ?? [];
  const baseColumns = payload.columns ?? [];

  const hiddenRowIdSet = new Set(safePatch.hiddenRowIds ?? []);
  const hiddenColumnSet = new Set(safePatch.hiddenColumns ?? []);
  const cellEdits = safePatch.cellEdits ?? {};
  const rowLabelEdits = safePatch.rowLabelEdits ?? {};
  const columnRenames = safePatch.columnRenames ?? {};

  // 列：先剔除隐藏列 → 再按 columnOrder 重排 → 最后改名（保持顺序）
  const visibleColumns = baseColumns.filter((c) => !hiddenColumnSet.has(c));
  const reorderedColumns = applyColumnOrder(visibleColumns, safePatch.columnOrder);
  const renamedColumns = reorderedColumns.map((c) => columnRenames[c] ?? c);

  // 行：剔除隐藏行 + 应用单元格编辑 + 应用行标签编辑 + 按列改名
  const nextRows: Record<string, unknown>[] = [];
  const dimensionKey = baseColumns.find((c) => !hiddenColumnSet.has(c)); // 第一列做"行标签"目标，足够覆盖大多数表

  for (let i = 0; i < baseRows.length; i++) {
    const row = baseRows[i];
    const rid = getRowId(row, i);
    if (hiddenRowIdSet.has(rid)) continue;

    const cellPatch = cellEdits[rid];
    const rowLabel = rowLabelEdits[rid];
    const noEditOnRow = !cellPatch && rowLabel === undefined && Object.keys(columnRenames).length === 0 && hiddenColumnSet.size === 0;
    if (noEditOnRow) {
      nextRows.push(row);
      continue;
    }

    const out: Record<string, unknown> = {};
    // 保留 __rid（不暴露在 columns 里，但下游仍可用来追踪）
    if ((row as { __rid?: unknown }).__rid !== undefined) {
      out.__rid = (row as { __rid?: unknown }).__rid;
    }
    for (const oldKey of baseColumns) {
      if (hiddenColumnSet.has(oldKey)) continue;
      const newKey = columnRenames[oldKey] ?? oldKey;
      let value = row[oldKey];
      if (cellPatch && Object.prototype.hasOwnProperty.call(cellPatch, oldKey)) {
        value = cellPatch[oldKey];
      }
      // 行标签：把第一列（维度列）的值替换为用户改写的标签
      if (rowLabel !== undefined && oldKey === dimensionKey) {
        value = rowLabel;
      }
      out[newKey] = value;
    }
    nextRows.push(out);
  }

  // rowCount 仍按原始行数保持语义（"原始全集 N 行"）；如需对外暴露"过滤后行数"由调用方决定。
  return {
    ...payload,
    columns: renamedColumns,
    data: nextRows,
  };
}
