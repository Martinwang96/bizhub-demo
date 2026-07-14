import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChartDataPatch, ChartKind, ChartPayload, ChartRenderPlan } from '../../types/chart';
import { applyDataPatch, getRowId } from '../../utils/applyDataPatch';
import { dataPatchEditor, buildOverrideCleanupOnColumnsChanged } from '../../utils/dataPatchEditor';
import {
  HEADER_UNIT_TOKENS,
  composeCellValueWithUnit,
  normalizeChartUnit,
  splitCellValueAndUnit,
} from '../../utils/chartLabels';
import styles from './ChartTableFallback.module.css';

/**
 * 列在图表中扮演的角色：
 * - `bar` / `line`：参与作图（折柱混合下分流到柱/折线；纯柱/纯折下统一视为"在图中"）
 * - `remove`：不参与作图但保留表格数据（从 barMetricKeys / lineMetricKeys / metricKeys / lineKeys 中移除）
 *
 * rateCompare 下：
 * - 调用 role='line' 语义为"把该列设为当前对比差异列"（单选覆盖 lineKeys: [col]），不是叠加多根；
 * - role='remove' 仅在存在其他候选差异列时可用，避免空图。
 */
export type ColumnChartRole = 'bar' | 'line' | 'remove';

interface Props {
  /** 原始（未应用 patch）的 payload —— 表格 fallback 始终展示原始全量行，但会反映 patch 的隐藏/重命名/单元格编辑视图 */
  payload: ChartPayload;
  /** 当前生效的 dataPatch；不传则视为只读 */
  dataPatch?: ChartDataPatch;
  /**
   * 当前 chart plan：用来判定哪些列是"参与画图的可重排列"，从而决定列头是否显示 `← →` 重排按钮。
   * 不传时只显示重命名/隐藏菜单，不显示重排按钮（向后兼容）。
   */
  plan?: ChartRenderPlan;
  /**
   * 提交修改：调用方将其 merge 回 ChartStyleOverrides。
   * 不传 = 只读模式（向后兼容；SharePage / 任何只读场景天然走这条路径，视觉与原版完全一致）。
   */
  onChangePatch?: (next: ChartDataPatch) => void;
  /**
   * 因列名变更需要顺带清理的 overrides 字段（如 metricKeys/lineKeys/hiddenLegendKeys 中引用了被改名的旧列）。
   * 由调用方负责把这些清理项 merge 进 overrides。
   */
  onCleanupOverrides?: (cleanup: Record<string, unknown>) => void;
  /** 当前 overrides 副本（仅用来计算重命名引发的清理项，不会回写） */
  overridesForCleanup?: Parameters<typeof buildOverrideCleanupOnColumnsChanged>[0];
  /**
   * 用户切换到"表格"视图时，底层 plan 仍然保留了"如果切回图表会是什么样"的信息。
   * 以下三个 prop 用来让列头菜单暴露"把这列加入/移出图表"的能力：
   * - effectiveChartKind：底层推断出的（或 overrides 里用户选的）图表 kind，决定菜单文案分支
   * - chartingKeys：当前参与作图的列集合（用于判断显示"加入图表"还是"从图表移除"）
   * - onSetColumnRole：点击菜单项时的回调，由 ChartPanel 转译为对 overrides 的修改
   * 这三个都可选，缺失时退化为"只读，不显示角色菜单"，保证 SharePage 等场景零影响。
   */
  effectiveChartKind?: ChartKind;
  chartingKeys?: string[];
  onSetColumnRole?: (col: string, role: ColumnChartRole) => void;
}

const PREVIEW_LIMIT = 200;

/** 判断某列在所有行里是否出现过 finite number —— 决定是否在列头菜单暴露"图表角色"子项 */
function isNumericColumn(rows: Record<string, unknown>[], col: string): boolean {
  for (const row of rows) {
    const v = row[col];
    if (typeof v === 'number' && Number.isFinite(v)) return true;
  }
  return false;
}

export default function ChartTableFallback({
  payload,
  dataPatch,
  plan,
  onChangePatch,
  onCleanupOverrides,
  overridesForCleanup,
  effectiveChartKind,
  chartingKeys,
  onSetColumnRole,
}: Props) {
  const editable = !!onChangePatch;

  // 表格视图按 patch 后的列/单元格展示；行隐藏改为"灰显 + 删除线"，让用户能"取消隐藏"，比真正剔除可逆性更好。
  // 这里同时把 dataPatch.columnOrder 应用到表头列序——保证"图表上 ← → 调位"和"表格表头展示"双向同步。
  const visibleColumns = useMemo(() => {
    const hidden = new Set(dataPatch?.hiddenColumns ?? []);
    const visible = (payload.columns ?? []).filter((c) => !hidden.has(c));
    const columnOrder = dataPatch?.columnOrder;
    if (!columnOrder || !columnOrder.length) return visible;
    const visibleSet = new Set(visible);
    const queue = columnOrder.filter((c) => visibleSet.has(c));
    if (!queue.length) return visible;
    const orderedSet = new Set(queue);
    const out: string[] = [];
    let qi = 0;
    for (const col of visible) {
      if (orderedSet.has(col)) {
        out.push(queue[qi]);
        qi += 1;
      } else {
        out.push(col);
      }
    }
    return out;
  }, [payload.columns, dataPatch?.hiddenColumns, dataPatch?.columnOrder]);

  /**
   * 可重排列集合（"参与画图的数值列"）。
   * - 优先用 plan.yKeys（柱/折/折柱混合/差异对比）；
   * - 其次用 plan.metricKeys（多维表）；
   * - 维度列（plan.xKey）锁定，不参与重排；
   * - 不传 plan 时为空集 = 不显示重排按钮（向后兼容只读场景）。
   */
  const reorderableSet = useMemo(() => {
    const keys: string[] = [];
    if (plan?.yKeys?.length) keys.push(...plan.yKeys);
    if (plan?.metricKeys?.length) keys.push(...plan.metricKeys);
    return new Set(keys.filter((k) => k && k !== plan?.xKey));
  }, [plan?.yKeys, plan?.metricKeys, plan?.xKey]);

  /** visibleColumns 中"可重排列"的当前左右顺序——用于 ← → 边界判定与 moveColumn 的输入 */
  const reorderableInVisible = useMemo(
    () => visibleColumns.filter((c) => reorderableSet.has(c)),
    [visibleColumns, reorderableSet],
  );

  // 计算"显示用"的列名（应用 columnRenames）
  const displayColumnName = useCallback((rawCol: string) => dataPatch?.columnRenames?.[rawCol] ?? rawCol, [dataPatch?.columnRenames]);

  // 计算"显示用"单元格值（应用 cellEdits + rowLabelEdits）
  const dimensionKey = visibleColumns[0];
  const cellValue = useCallback((row: Record<string, unknown>, rowId: string, col: string) => {
    const editVal = dataPatch?.cellEdits?.[rowId]?.[col];
    if (editVal !== undefined) return editVal;
    const labelEdit = dataPatch?.rowLabelEdits?.[rowId];
    if (labelEdit !== undefined && col === dimensionKey) return labelEdit;
    return row[col];
  }, [dataPatch?.cellEdits, dataPatch?.rowLabelEdits, dimensionKey]);

  const rows = (payload.data ?? []).slice(0, PREVIEW_LIMIT);
  const hiddenRowIdSet = useMemo(() => new Set(dataPatch?.hiddenRowIds ?? []), [dataPatch?.hiddenRowIds]);

  /**
   * "列的图表角色"支持判定。
   *
   * chartRolesEnabled：有 onSetColumnRole + 有 effectiveChartKind + 可编辑，才启用列头 ⋯ 的角色子项。
   *
   * chartingKeySet：当前已在图中的列集合（由 ChartPanel 汇总 plan.yKeys / metricKeys / lineKeys /
   *   barMetricKeys / lineMetricKeys 得到）。effectiveChartKind === 'table' 时上游仍会根据"如果切回图表"的
   *   底层 plan 计算该集合，保证在表格视图下用户仍然知道哪些列被"视为在图里"。
   *
   * numericColumnSet：从 payload 所有行扫出"至少有一个数值"的列。维度列（plan.xKey）排除。
   *   非数值列/维度列的 ⋯ 菜单保持原样（只有"重命名 / 隐藏列"），不加图表角色项。
   */
  const chartRolesEnabled = editable && !!onSetColumnRole && !!effectiveChartKind;
  const chartingKeySet = useMemo(() => new Set(chartingKeys ?? []), [chartingKeys]);
  const numericColumnSet = useMemo(() => {
    const set = new Set<string>();
    for (const col of payload.columns ?? []) {
      if (col === plan?.xKey) continue;
      if (isNumericColumn(payload.data ?? [], col)) set.add(col);
    }
    return set;
  }, [payload.columns, payload.data, plan?.xKey]);

  /**
   * 给某一列决定列头 ⋯ 菜单里要展示哪些"图表角色"项。
   *
   * 设计要点：
   * - 仅对"数值列 + 非维度列 + chartRolesEnabled"才返回角色项；其它场景返回空数组，菜单保持原样。
   * - barLine：已画 → [设为柱/设为折线/从图表移除]（当前角色置灰）；未画 → [作为柱加入/作为折线加入]
   * - rateCompare：
   *     已画（即当前对比列 lineKeys[0]）→ [从图表移除]（若它是唯一剩余候选，置灰并给 title）
   *     未画差异列 → [设为当前对比列]（单选覆盖）
   *     非差异列（柱基准）→ 无角色项
   * - bar / line / pie：已画 → [从图表移除]（若是最后一个指标，置灰）；未画 → [加入图表]
   *
   * "是否最后一个指标"的保护：移除后 chartingKeySet 为空会导致图空白，此时禁用"移除"。
   */
  const DIFFERENCE_KEY_RE = /(同比|环比|增速|增长率|变化率|变动率|达成率|完成率|差异|差额|偏差|缺口|变化值|变化额|变化量|变动值|变动额|变动量|增减量|净增|净减|对比值|pct|percent|rate|ratio|delta|diff|difference|gap|%)/i;
  type RoleMenuItem = {
    label: string;
    role: ColumnChartRole;
    disabled?: boolean;
    disabledTitle?: string;
    /** 当前选中态（展示为灰色，不可重复点击） */
    current?: boolean;
  };
  const roleItemsForColumn = useCallback((col: string): RoleMenuItem[] => {
    if (!chartRolesEnabled) return [];
    if (col === plan?.xKey) return [];
    if (!numericColumnSet.has(col)) return [];
    const kind = effectiveChartKind as ChartKind;
    const inChart = chartingKeySet.has(col);
    // "从图表移除"后是否会导致空图？
    const willEmptyAfterRemove = inChart && chartingKeySet.size <= 1;
    const removeItem: RoleMenuItem = {
      label: '从图表移除（保留表格数据）',
      role: 'remove',
      disabled: willEmptyAfterRemove,
      disabledTitle: willEmptyAfterRemove ? '至少保留一个指标' : undefined,
    };

    if (kind === 'barLine') {
      // plan 可能是底层真正的 barLine 也可能是用户切到 table 后复用的底层 plan
      const inBar = (overridesForCleanup?.barMetricKeys ?? []).includes(col);
      const inLine = (overridesForCleanup?.lineMetricKeys ?? []).includes(col);
      // 如果用户从未动过工具栏（barMetricKeys / lineMetricKeys 未写入），我们只知道 inChart，
      // 用正则粗略判断默认角色作为"current"提示（仅用于菜单的灰色高亮，不影响回调语义）
      const defaultToLine = /(pct|percent|rate|ratio|率|百分比|%)/i.test(col);
      const isCurrentBar = inBar || (inChart && !inLine && !defaultToLine);
      const isCurrentLine = inLine || (inChart && !inBar && defaultToLine);
      if (inChart) {
        return [
          { label: '设为柱', role: 'bar', current: isCurrentBar },
          { label: '设为折线', role: 'line', current: isCurrentLine },
          removeItem,
        ];
      }
      return [
        { label: '作为柱加入图表', role: 'bar' },
        { label: '作为折线加入图表', role: 'line' },
      ];
    }

    if (kind === 'rateCompare') {
      const isDifference = DIFFERENCE_KEY_RE.test(col);
      if (!isDifference) return []; // 柱基准列不允许角色切换
      if (inChart) {
        // 当前对比列：只允许"移除"，且只有还存在其它候选差异列时才允许
        const otherDiffCandidates = Array.from(numericColumnSet).filter(
          (k) => k !== col && DIFFERENCE_KEY_RE.test(k),
        );
        const canRemove = otherDiffCandidates.length > 0;
        return [{
          label: '从图表移除（保留表格数据）',
          role: 'remove',
          disabled: !canRemove,
          disabledTitle: canRemove ? undefined : '至少保留一个对比指标',
        }];
      }
      // 未画的差异候选列：点击后单选覆盖为当前对比列
      return [{ label: '设为当前对比列', role: 'line' }];
    }

    // bar / line / pie
    if (inChart) return [removeItem];
    return [{ label: '加入图表', role: kind === 'line' ? 'line' : 'bar' }];
  }, [chartRolesEnabled, chartingKeySet, effectiveChartKind, numericColumnSet, overridesForCleanup?.barMetricKeys, overridesForCleanup?.lineMetricKeys, plan?.xKey]);

  // —— 编辑态本地 UI 状态 ——
  const [activeColMenu, setActiveColMenu] = useState<string | null>(null);
  const [renamingCol, setRenamingCol] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [editingColumnUnit, setEditingColumnUnit] = useState<string | null>(null);
  const [columnUnitDraft, setColumnUnitDraft] = useState('');
  const [editingCell, setEditingCell] = useState<{ rid: string; col: string } | null>(null);
  const [cellDraft, setCellDraft] = useState<string>('');
  const [cellUnitDraft, setCellUnitDraft] = useState<string>('');
  const cellInputRef = useRef<HTMLInputElement | null>(null);

  // 触发 patch 更新
  const commitPatch = useCallback((next: ChartDataPatch) => {
    onChangePatch?.(next);
  }, [onChangePatch]);

  const handleSetColumnRoleClick = useCallback((col: string, role: ColumnChartRole) => {
    if (!chartRolesEnabled || !onSetColumnRole) return;
    onSetColumnRole(col, role);
    setActiveColMenu(null);
  }, [chartRolesEnabled, onSetColumnRole]);

  const handleToggleRowHidden = useCallback((rid: string) => {
    if (!editable) return;
    commitPatch(dataPatchEditor.toggleHiddenRow(dataPatch, rid));
  }, [commitPatch, dataPatch, editable]);

  const handleToggleColHidden = useCallback((col: string) => {
    if (!editable) return;
    commitPatch(dataPatchEditor.toggleHiddenColumn(dataPatch, col));
    setActiveColMenu(null);
  }, [commitPatch, dataPatch, editable]);

  /**
   * 在"参与画图列"内左右移动一列。
   * 边界已在 UI 上禁用（首列 ←、末列 → 置灰），此处做个保护性 no-op。
   */
  const handleMoveColumn = useCallback((col: string, direction: -1 | 1) => {
    if (!editable) return;
    const idx = reorderableInVisible.indexOf(col);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= reorderableInVisible.length) return;
    commitPatch(dataPatchEditor.moveColumn(dataPatch, reorderableInVisible, col, direction));
  }, [commitPatch, dataPatch, editable, reorderableInVisible]);

  const beginRenameColumn = useCallback((col: string) => {
    setRenamingCol(col);
    setRenameDraft(displayColumnName(col));
    setActiveColMenu(null);
  }, [displayColumnName]);

  const commitRenameColumn = useCallback(() => {
    if (!editable || !renamingCol) return;
    const oldName = renamingCol;
    const draft = renameDraft.trim();
    const next = dataPatchEditor.renameColumn(dataPatch, oldName, draft);
    commitPatch(next);
    // 列改名导致旧列键不再存在于"显示列"链路中：需要清理引用旧列名的 overrides 字段
    if (draft && draft !== oldName) {
      const cleanup = buildOverrideCleanupOnColumnsChanged(overridesForCleanup, [oldName]);
      if (Object.keys(cleanup).length > 0) onCleanupOverrides?.(cleanup);
    }
    setRenamingCol(null);
    setRenameDraft('');
  }, [commitPatch, dataPatch, editable, onCleanupOverrides, overridesForCleanup, renameDraft, renamingCol]);

  const cancelRenameColumn = useCallback(() => {
    setRenamingCol(null);
    setRenameDraft('');
  }, []);

  const beginEditColumnUnit = useCallback((col: string) => {
    setEditingColumnUnit(col);
    setColumnUnitDraft(dataPatch?.columnUnits?.[col] ?? '');
    setActiveColMenu(null);
  }, [dataPatch?.columnUnits]);

  const commitColumnUnit = useCallback(() => {
    if (!editable || !editingColumnUnit) return;
    const raw = columnUnitDraft.trim();
    if (raw && !normalizeChartUnit(raw)) return;
    commitPatch(dataPatchEditor.setColumnUnit(dataPatch, editingColumnUnit, raw));
    setEditingColumnUnit(null);
    setColumnUnitDraft('');
  }, [columnUnitDraft, commitPatch, dataPatch, editable, editingColumnUnit]);

  const cancelColumnUnit = useCallback(() => {
    setEditingColumnUnit(null);
    setColumnUnitDraft('');
  }, []);

  const handleClearColumnUnit = useCallback((col: string) => {
    if (!editable) return;
    commitPatch(dataPatchEditor.clearColumnUnit(dataPatch, col));
    setActiveColMenu(null);
  }, [commitPatch, dataPatch, editable]);

  const beginEditCell = useCallback((rid: string, col: string, currentValue: unknown) => {
    if (!editable) return;
    const { valueText, unit } = splitCellValueAndUnit(currentValue);
    setEditingCell({ rid, col });
    setCellDraft(valueText);
    setCellUnitDraft(unit);
    // 下一帧聚焦
    requestAnimationFrame(() => cellInputRef.current?.focus());
  }, [editable]);

  const commitEditCell = useCallback(() => {
    if (!editable || !editingCell) return;
    const { rid, col } = editingCell;
    // 找到原始值，判断是否需要写入（值未变 / 还原成原值时清掉编辑）
    const idx = rows.findIndex((r, i) => getRowId(r, i) === rid);
    const originalVal = idx >= 0 ? rows[idx][col] : undefined;
    const draftStr = cellDraft.trim();
    const unit = cellUnitDraft.trim();
    if (unit && !normalizeChartUnit(unit)) return;
    // 尝试还原为数字（如果原值是 number 且未填单位，并且新值能解析成 number），保留数据类型
    let parsed: unknown = unit ? composeCellValueWithUnit(draftStr, unit) : draftStr;
    if (!unit && typeof originalVal === 'number') {
      const num = Number(draftStr.replace(/,/g, ''));
      if (Number.isFinite(num)) parsed = num;
    }
    let next: ChartDataPatch;
    if (parsed === originalVal || (typeof originalVal === 'string' && String(parsed) === originalVal)) {
      next = dataPatchEditor.clearCell(dataPatch, rid, col);
    } else {
      next = dataPatchEditor.setCell(dataPatch, rid, col, parsed);
    }
    commitPatch(next);
    setEditingCell(null);
    setCellUnitDraft('');
  }, [cellDraft, cellUnitDraft, commitPatch, dataPatch, editable, editingCell, rows]);

  const cancelEditCell = useCallback(() => {
    setEditingCell(null);
    setCellUnitDraft('');
  }, []);

  const handleResetPatch = useCallback(() => {
    if (!editable) return;
    commitPatch({});
  }, [commitPatch, editable]);

  // 是否存在 patch（影响顶部 chip 区/重置按钮显隐）
  const hasPatch = useMemo(() => {
    if (!dataPatch) return false;
    if (dataPatch.hiddenRowIds?.length) return true;
    if (dataPatch.hiddenColumns?.length) return true;
    if (dataPatch.cellEdits && Object.keys(dataPatch.cellEdits).length) return true;
    if (dataPatch.rowLabelEdits && Object.keys(dataPatch.rowLabelEdits).length) return true;
    if (dataPatch.columnRenames && Object.keys(dataPatch.columnRenames).length) return true;
    if (dataPatch.columnOrder?.length) return true;
    if (dataPatch.columnUnits && Object.keys(dataPatch.columnUnits).length) return true;
    return false;
  }, [dataPatch]);

  // 隐藏列/行/单位 chip
  const hiddenColumnChips = dataPatch?.hiddenColumns ?? [];
  const hiddenRowChips = useMemo(() => {
    if (!dataPatch?.hiddenRowIds?.length) return [];
    const idToLabel = new Map<string, string>();
    rows.forEach((r, i) => {
      const id = getRowId(r, i);
      const label = dimensionKey ? String(cellValue(r, id, dimensionKey) ?? '') : `第 ${i + 1} 行`;
      idToLabel.set(id, label || `第 ${i + 1} 行`);
    });
    return dataPatch.hiddenRowIds.map((id) => ({ id, label: idToLabel.get(id) ?? id }));
  }, [cellValue, dataPatch?.hiddenRowIds, dimensionKey, rows]);
  const columnUnitChips = useMemo(
    () => Object.entries(dataPatch?.columnUnits ?? {}).map(([col, unit]) => ({ col, unit })),
    [dataPatch?.columnUnits],
  );

  return (
    <div className={styles.wrap}>
      <datalist id="chart-unit-options">
        {HEADER_UNIT_TOKENS.map((unit) => <option key={unit} value={unit} />)}
      </datalist>
      {/* 编辑态：顶部"已隐藏" chip 区 + 重置按钮；只读 / 无 patch 时不渲染，保证视觉与原版一致 */}
      {editable && hasPatch && (
        <div className={styles.editBar} role="region" aria-label="表格编辑状态">
          {hiddenColumnChips.length > 0 && (
            <div className={styles.chipGroup}>
              <span className={styles.chipGroupLabel}>已隐藏列：</span>
              {hiddenColumnChips.map((col) => (
                <button
                  key={`hc-${col}`}
                  type="button"
                  className={styles.chip}
                  onClick={() => handleToggleColHidden(col)}
                  title={`显示列「${displayColumnName(col)}」`}
                >
                  <span>{displayColumnName(col)}</span>
                  <span className={styles.chipX} aria-hidden>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </span>
                </button>
              ))}
            </div>
          )}
          {hiddenRowChips.length > 0 && (
            <div className={styles.chipGroup}>
              <span className={styles.chipGroupLabel}>已隐藏行：</span>
              {hiddenRowChips.map((r) => (
                <button
                  key={`hr-${r.id}`}
                  type="button"
                  className={styles.chip}
                  onClick={() => handleToggleRowHidden(r.id)}
                  title={`恢复行「${r.label}」`}
                >
                  <span>{r.label}</span>
                  <span className={styles.chipX} aria-hidden>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </span>
                </button>
              ))}
            </div>
          )}
          {columnUnitChips.length > 0 && (
            <div className={styles.chipGroup}>
              <span className={styles.chipGroupLabel}>已设单位：</span>
              {columnUnitChips.map(({ col, unit }) => (
                <button
                  key={`cu-${col}`}
                  type="button"
                  className={styles.chip}
                  onClick={() => handleClearColumnUnit(col)}
                  title={`清除「${displayColumnName(col)}」的单位`}
                >
                  <span>{displayColumnName(col)}：{unit}</span>
                  <span className={styles.chipX} aria-hidden>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </span>
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className={styles.resetBtn}
            onClick={handleResetPatch}
            title="清除所有数据微调（不影响图表样式选择）"
          >
            重置数据
          </button>
        </div>
      )}

      <table className={styles.table}>
        <thead>
          <tr>
            {editable && <th className={styles.rowGutter} aria-label="行操作" />}
            {visibleColumns.map((col) => {
              const isRenaming = editable && renamingCol === col;
              const isEditingUnit = editable && editingColumnUnit === col;
              return (
                <th key={col} className={editable ? styles.thEditable : undefined}>
                  {isRenaming ? (
                    <input
                      autoFocus
                      className={styles.colRenameInput}
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={commitRenameColumn}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRenameColumn();
                        else if (e.key === 'Escape') cancelRenameColumn();
                      }}
                    />
                  ) : isEditingUnit ? (
                    <input
                      autoFocus
                      className={styles.colRenameInput}
                      value={columnUnitDraft}
                      placeholder="单位"
                      list="chart-unit-options"
                      onChange={(e) => setColumnUnitDraft(e.target.value)}
                      onBlur={commitColumnUnit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitColumnUnit();
                        else if (e.key === 'Escape') cancelColumnUnit();
                      }}
                    />
                  ) : (
                    <span className={styles.thInner}>
                      <span className={styles.thLabel}>{displayColumnName(col)}</span>
                      {editable && reorderableSet.has(col) && (() => {
                        const reorderIdx = reorderableInVisible.indexOf(col);
                        const canLeft = reorderIdx > 0;
                        const canRight = reorderIdx >= 0 && reorderIdx < reorderableInVisible.length - 1;
                        return (
                          <span className={styles.thReorderWrap} aria-label="调整列顺序">
                            <button
                              type="button"
                              className={styles.thReorderBtn}
                              onClick={() => handleMoveColumn(col, -1)}
                              disabled={!canLeft}
                              aria-label={`将「${displayColumnName(col)}」左移`}
                              title={canLeft ? '左移一列（图表柱顺序同步）' : '已在最左侧'}
                            >
                              ←
                            </button>
                            <button
                              type="button"
                              className={styles.thReorderBtn}
                              onClick={() => handleMoveColumn(col, 1)}
                              disabled={!canRight}
                              aria-label={`将「${displayColumnName(col)}」右移`}
                              title={canRight ? '右移一列（图表柱顺序同步）' : '已在最右侧'}
                            >
                              →
                            </button>
                          </span>
                        );
                      })()}
                      {editable && (
                        <span className={styles.thMenuWrap}>
                          <button
                            type="button"
                            className={styles.thMenuBtn}
                            onClick={() => setActiveColMenu(activeColMenu === col ? null : col)}
                            aria-haspopup="menu"
                            aria-expanded={activeColMenu === col}
                            title="列设置"
                          >
                            ⋯
                          </button>
                          {activeColMenu === col && (
                            <span className={styles.thMenu} role="menu">
                              <button type="button" role="menuitem" className={styles.thMenuItem} onClick={() => beginRenameColumn(col)}>重命名</button>
                              <button type="button" role="menuitem" className={styles.thMenuItem} onClick={() => beginEditColumnUnit(col)}>修改本列单位</button>
                              {dataPatch?.columnUnits?.[col] && (
                                <button type="button" role="menuitem" className={styles.thMenuItem} onClick={() => handleClearColumnUnit(col)}>清除本列单位</button>
                              )}
                              <button type="button" role="menuitem" className={styles.thMenuItem} onClick={() => handleToggleColHidden(col)}>隐藏列</button>
                              {(() => {
                                const roleItems = roleItemsForColumn(col);
                                if (!roleItems.length) return null;
                                return (
                                  <>
                                    <span className={styles.thMenuDivider} aria-hidden />
                                    {roleItems.map((item) => {
                                      const itemClassName = `${styles.thMenuItem} ${item.disabled ? styles.thMenuItemDisabled : ''} ${item.current ? styles.thMenuItemCurrent : ''}`.trim();
                                      return (
                                        <button
                                          key={`role-${item.role}-${item.label}`}
                                          type="button"
                                          role="menuitem"
                                          className={itemClassName}
                                          disabled={item.disabled || item.current}
                                          title={item.disabled ? item.disabledTitle : (item.current ? '当前角色' : undefined)}
                                          onClick={() => handleSetColumnRoleClick(col, item.role)}
                                        >
                                          {item.current ? `✓ ${item.label}` : item.label}
                                        </button>
                                      );
                                    })}
                                  </>
                                );
                              })()}
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const rid = getRowId(row, idx);
            const hidden = hiddenRowIdSet.has(rid);
            return (
              <tr key={rid} className={hidden ? styles.rowHidden : undefined}>
                {editable && (
                  <td className={styles.rowGutter}>
                    <input
                      type="checkbox"
                      className={styles.rowCheckbox}
                      checked={!hidden}
                      onChange={() => handleToggleRowHidden(rid)}
                      aria-label={hidden ? '显示该行' : '隐藏该行'}
                      title={hidden ? '显示该行' : '隐藏该行（不参与图与表展示）'}
                    />
                  </td>
                )}
                {visibleColumns.map((col) => {
                  const isEditingThis = editable && editingCell?.rid === rid && editingCell?.col === col;
                  const v = cellValue(row, rid, col);
                  const isEdited = !!dataPatch?.cellEdits?.[rid]?.[col]
                    || (col === dimensionKey && dataPatch?.rowLabelEdits?.[rid] !== undefined);
                  return (
                    <td
                      key={col}
                      className={`${editable ? styles.tdEditable : ''} ${isEdited ? styles.tdEdited : ''}`}
                      onDoubleClick={() => editable && beginEditCell(rid, col, v)}
                      title={editable ? '双击编辑' : undefined}
                    >
                      {isEditingThis ? (
                        <span
                          className={styles.cellEditWrap}
                          onBlur={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commitEditCell();
                          }}
                        >
                          <input
                            ref={cellInputRef}
                            className={styles.cellEditInput}
                            value={cellDraft}
                            onChange={(e) => setCellDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEditCell();
                              else if (e.key === 'Escape') cancelEditCell();
                            }}
                          />
                          <input
                            className={styles.cellUnitInput}
                            value={cellUnitDraft}
                            placeholder="单位"
                            list="chart-unit-options"
                            onChange={(e) => setCellUnitDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEditCell();
                              else if (e.key === 'Escape') cancelEditCell();
                            }}
                          />
                        </span>
                      ) : (
                        String(v ?? '')
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className={styles.note}>
        已以表格展示{payload.rowCount > rows.length ? `，当前预览 ${rows.length} / ${payload.rowCount} 行` : ''}
        {editable && <span className={styles.noteHint}>　双击单元格可修改数值/单位 · 行首勾选可隐藏</span>}
        {chartRolesEnabled && <span className={styles.noteHint}>　列头 ⋯ 可将数值列加入图表或移除</span>}
      </div>
    </div>
  );
}

/**
 * 给调用方一个工具：把 patch 应用到 payload 上得到"用于作图链路的 payload"。
 * 这里只是 re-export，避免调用方要从两个文件 import。
 */
export { applyDataPatch };
