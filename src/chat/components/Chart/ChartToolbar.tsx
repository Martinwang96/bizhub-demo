import type { ChartDataPatch, ChartKind, ChartStyleOverrides } from '../../types/chart';
import { dataPatchEditor } from '../../utils/dataPatchEditor';
import styles from './ChartToolbar.module.css';

interface PickerItem {
  key: string;
  name: string;
}

interface Props {
  value: ChartStyleOverrides;
  currentKind: ChartKind;
  lineMetricItems?: PickerItem[];
  metricItems?: PickerItem[];
  groupItems?: PickerItem[];
  selectedMetricKeys?: string[];
  selectedBarMetricKeys?: string[];
  selectedLineMetricKeys?: string[];
  selectedGroupValues?: string[];
  /**
   * 当前"参与画图的数值列"按表/图共享顺序——仅这些列之间允许左右调位。
   * 不传或空则不渲染重排按钮（向后兼容）。
   */
  reorderableColumns?: string[];
  onChange: (patch: Partial<ChartStyleOverrides>) => void;
}

const KINDS: Array<{ kind: ChartKind; label: string }> = [
  { kind: 'bar', label: '柱状' },
  { kind: 'line', label: '折线' },
  { kind: 'barLine', label: '折柱混合' },
  { kind: 'rateCompare', label: '差异对比' },
  { kind: 'pie', label: '饼状' },
  { kind: 'table', label: '表格' },
];

const PERCENT_KEY_RE = /(pct|percent|rate|ratio|率|百分比|增速|同比|环比|%)/i;
const DIFFERENCE_KEY_RE = /(同比|环比|增速|增长率|变化率|变动率|达成率|完成率|差异|差额|偏差|缺口|变化值|变化额|变化量|变动值|变动额|变动量|增减量|增长额|增长量|贡献增长|增长贡献|贡献增量|增量|增收|减收|净增|净减|对比值|pct|percent|rate|ratio|delta|diff|difference|gap|%)/i;
/** "率类"差异列正则：用于把"也作为柱"行的候选限制为"量类"（避免量纲冲突） */
const RATE_LIKE_KEY_RE = /(率|百分比|%|pct|percent|ratio|rate|同比|环比|增速|增长率|变化率|变动率)/i;

export default function ChartToolbar({
  value,
  currentKind,
  lineMetricItems = [],
  metricItems = [],
  groupItems = [],
  selectedMetricKeys = [],
  selectedBarMetricKeys = [],
  selectedLineMetricKeys = [],
  selectedGroupValues = [],
  reorderableColumns = [],
  onChange,
}: Props) {
  const selectedLineKeys = value.lineKeys ?? [];
  const differenceMetricItems = lineMetricItems.filter((item) => DIFFERENCE_KEY_RE.test(item.key));
  // rateCompare 下"差异指标"行的候选列表：
  //   - 有差异列时：仍以差异列优先（保留"同比/环比/变化率"等的语义聚焦）
  //   - 无差异列时：退回展示**全部 yKeys**，让用户能选"毛利/毛利率"这类派生列做箭头标签
  // 其它图类型（barLine 等）行为不变。
  const visibleLineMetricItems = currentKind === 'rateCompare'
    ? (differenceMetricItems.length > 0 ? differenceMetricItems : lineMetricItems)
    : lineMetricItems;
  const activeRateCompareValueMode = value.rateCompareValueMode ?? 'absolute';
  const defaultLineKeys = currentKind === 'rateCompare'
    ? (() => {
      const amountItems = differenceMetricItems.filter((item) => !RATE_LIKE_KEY_RE.test(item.key));
      const rateItems = differenceMetricItems.filter((item) => RATE_LIKE_KEY_RE.test(item.key));
      const picked = activeRateCompareValueMode === 'rate'
        ? (rateItems.length ? rateItems : amountItems)
        : (amountItems.length ? amountItems : rateItems);
      return picked.map((item) => item.key);
    })()
    : visibleLineMetricItems.filter((item) => PERCENT_KEY_RE.test(item.key)).map((item) => item.key);
  // rateCompare 无差异列时，默认挑率类（如"毛利率"）做箭头；都没有就挑最后一项
  const fallbackDefaultKeys = currentKind === 'rateCompare' && defaultLineKeys.length === 0
    ? visibleLineMetricItems.filter((item) => PERCENT_KEY_RE.test(item.key)).map((item) => item.key)
    : [];
  const validSelectedLineKeys = selectedLineKeys.filter((key) => visibleLineMetricItems.some((item) => item.key === key));
  const activeLineKeys = validSelectedLineKeys.length > 0
    ? validSelectedLineKeys
    : (defaultLineKeys.length > 0
      ? defaultLineKeys
      : (fallbackDefaultKeys.length > 0 ? fallbackDefaultKeys : visibleLineMetricItems.slice(-1).map((item) => item.key)));
  const showLineMetricPicker = (currentKind === 'barLine' || currentKind === 'rateCompare') && visibleLineMetricItems.length > 1;
  const lineMetricPickerLabel = currentKind === 'rateCompare' ? '差异指标' : '折线指标';
  const lineMetricPickerTitle = currentKind === 'rateCompare' ? '作为差异对比标签' : '作为折线指标';
  const showMultiDimensionPicker = metricItems.length > 1 || groupItems.length > 1;

  const handleLineMetricClick = (key: string) => {
    const nextLineKeys = selectedLineKeys.includes(key) ? undefined : [key];
    const hiddenLegendKeys = (value.hiddenLegendKeys ?? []).filter((hiddenKey) => hiddenKey !== key);
    onChange({ lineKeys: nextLineKeys, hiddenLegendKeys });
  };

  // rateCompare 模式下"也作为柱"候选：仅"量类"差异列（差异列且非率类），避免量纲冲突
  const amountDifferenceItems = differenceMetricItems.filter((item) => !RATE_LIKE_KEY_RE.test(item.key));
  const showRateCompareValueMode = currentKind === 'rateCompare' && differenceMetricItems.length > 0;
  const showRateCompareBarPicker = currentKind === 'rateCompare' && amountDifferenceItems.length > 0;
  const selectedRateCompareBarKeys = value.rateCompareBarKeys ?? [];
  const handleRateCompareModeClick = (mode: 'absolute' | 'rate') => {
    onChange({ rateCompareValueMode: mode });
  };
  const handleRateCompareBarClick = (key: string) => {
    const cur = selectedRateCompareBarKeys;
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    // 勾入"也作为柱"时，顺手把图例隐藏态去掉，确保该列同时可见
    const hiddenLegendKeys = (value.hiddenLegendKeys ?? []).filter((hiddenKey) => hiddenKey !== key);
    onChange({ rateCompareBarKeys: next, hiddenLegendKeys });
  };

  const handleMetricClick = (key: string) => {
    const current = selectedMetricKeys.length ? selectedMetricKeys : metricItems.slice(0, 1).map((item) => item.key);
    const next = current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key];
    if (!next.length) return;
    const hiddenLegendKeys = (value.hiddenLegendKeys ?? []).filter((hiddenKey) => !hiddenKey.endsWith(`::${key}`));
    onChange({ metricKeys: next, metricKey: next[0], hiddenLegendKeys });
  };

  const handleBarMetricClick = (key: string) => {
    const current = selectedBarMetricKeys.length ? selectedBarMetricKeys : metricItems.filter((item) => !PERCENT_KEY_RE.test(item.key)).map((item) => item.key);
    const nextBarMetricKeys = current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key];
    const nextLineMetricKeys = selectedLineMetricKeys.filter((item) => item !== key);
    if (!nextBarMetricKeys.length && !nextLineMetricKeys.length) return;
    onChange({ barMetricKeys: nextBarMetricKeys, lineMetricKeys: nextLineMetricKeys });
  };

  const handleBarLineMetricClick = (key: string) => {
    const current = selectedLineMetricKeys.length ? selectedLineMetricKeys : metricItems.filter((item) => PERCENT_KEY_RE.test(item.key)).map((item) => item.key);
    const fallback = current.length ? current : metricItems.slice(-1).map((item) => item.key);
    const nextLineMetricKeys = fallback.includes(key)
      ? fallback.filter((item) => item !== key)
      : [...fallback, key];
    const nextBarMetricKeys = selectedBarMetricKeys.filter((item) => item !== key);
    if (!nextLineMetricKeys.length && !nextBarMetricKeys.length) return;
    onChange({ barMetricKeys: nextBarMetricKeys, lineMetricKeys: nextLineMetricKeys });
  };

  const handleGroupClick = (key: string) => {
    const current = selectedGroupValues.length ? selectedGroupValues : groupItems.map((item) => item.key);
    const next = current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key];
    if (!next.length) return;
    const hiddenLegendKeys = (value.hiddenLegendKeys ?? []).filter((hiddenKey) => hiddenKey !== key && !hiddenKey.startsWith(`${key}::`));
    onChange({ groupValues: next, hiddenLegendKeys });
  };

  /**
   * 工具栏内"参与画图列"的左右调位：与表格表头的 ← → 共享同一份 ChartDataPatch.columnOrder。
   * 触发后通过 onChange({ dataPatch }) 写回，applyDataPatch 会在表/图链路统一重排。
   */
  const reorderIndex = (key: string) => reorderableColumns.indexOf(key);
  const canMoveLeft = (key: string) => reorderIndex(key) > 0;
  const canMoveRight = (key: string) => {
    const idx = reorderIndex(key);
    return idx >= 0 && idx < reorderableColumns.length - 1;
  };
  const handleMoveColumn = (key: string, direction: -1 | 1) => {
    if (!reorderableColumns.length) return;
    if (reorderIndex(key) < 0) return;
    const nextPatch = dataPatchEditor.moveColumn(value.dataPatch, reorderableColumns, key, direction);
    onChange({ dataPatch: nextPatch as ChartDataPatch });
  };

  /** 渲染按钮右侧的 ← →（仅当该 key 是"参与画图的可重排列"时） */
  const renderReorderButtons = (key: string) => {
    if (!reorderableColumns.includes(key)) return null;
    const left = canMoveLeft(key);
    const right = canMoveRight(key);
    return (
      <span className={styles.reorderWrap} aria-hidden>
        <button
          type="button"
          className={styles.reorderBtn}
          onClick={(e) => { e.stopPropagation(); handleMoveColumn(key, -1); }}
          disabled={!left}
          aria-label={`向左移动 ${key}`}
          title={left ? '左移一列（与表格列序同步）' : '已在最左侧'}
        >
          ←
        </button>
        <button
          type="button"
          className={styles.reorderBtn}
          onClick={(e) => { e.stopPropagation(); handleMoveColumn(key, 1); }}
          disabled={!right}
          aria-label={`向右移动 ${key}`}
          title={right ? '右移一列（与表格列序同步）' : '已在最右侧'}
        >
          →
        </button>
      </span>
    );
  };

  return (
    <div className={styles.toolbar} aria-label="图表展示设置">
      <div className={styles.labeledRow}>
        <span className={styles.rowLabel}>布局</span>
        <div className={styles.rowContent}>
          <button
            type="button"
            className={`${styles.toolBtn} ${value.swapAxis ? styles.active : ''}`}
            onClick={() => onChange({ swapAxis: !value.swapAxis })}
            title="交换横/纵轴"
          >
            换轴
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => onChange({ splitNumber: value.splitNumber === 8 ? 5 : 8 })}
            title="切换网格密度"
          >
            网格
          </button>
          <button
            type="button"
            className={`${styles.toolBtn} ${value.showLabel ? styles.active : ''}`}
            onClick={() => onChange({ showLabel: !value.showLabel })}
            title="数据标签"
          >
            标签
          </button>
          <button
            type="button"
            className={`${styles.toolBtn} ${value.showLegend === false ? '' : styles.active}`}
            onClick={() => onChange({ showLegend: value.showLegend === false })}
            title="图例"
          >
            图例
          </button>
        </div>
      </div>

      <div className={styles.labeledRow}>
        <span className={styles.rowLabel}>样式</span>
        <div className={styles.rowContent}>
          {KINDS.map((item) => (
            <button
              key={item.kind}
              type="button"
              className={`${styles.toolBtn} ${styles.kindBtn} ${currentKind === item.kind ? styles.active : ''}`}
              onClick={() => onChange({ kind: item.kind })}
              title={`切换为${item.label}图`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {showMultiDimensionPicker && (
        <>
          {metricItems.length > 1 && (
            <div className={styles.labeledRow} aria-label="指标">
              <span className={styles.rowLabel}>指标</span>
              {currentKind === 'barLine' ? (
                <div className={styles.metricSplit}>
                  <div className={styles.metricGroup}>
                    <span className={styles.metricSubLabel}>柱状</span>
                    <div className={styles.rowContent}>
                      {metricItems.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className={`${styles.lineMetricBtn} ${selectedBarMetricKeys.includes(item.key) ? styles.active : ''}`}
                          onClick={() => handleBarMetricClick(item.key)}
                          title={selectedBarMetricKeys.includes(item.key) ? `从柱状隐藏 ${item.name}` : `作为柱状显示 ${item.name}`}
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={styles.metricGroup}>
                    <span className={styles.metricSubLabel}>折线</span>
                    <div className={styles.rowContent}>
                      {metricItems.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className={`${styles.lineMetricBtn} ${selectedLineMetricKeys.includes(item.key) ? styles.active : ''}`}
                          onClick={() => handleBarLineMetricClick(item.key)}
                          title={selectedLineMetricKeys.includes(item.key) ? `从折线隐藏 ${item.name}` : `作为折线显示 ${item.name}`}
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className={styles.rowContent}>
                  {metricItems.map((item) => (
                    <span key={item.key} className={styles.btnWithReorder}>
                      <button
                        type="button"
                        className={`${styles.lineMetricBtn} ${selectedMetricKeys.includes(item.key) ? styles.active : ''}`}
                        onClick={() => handleMetricClick(item.key)}
                        title={selectedMetricKeys.includes(item.key) ? `隐藏 ${item.name}` : `显示 ${item.name}`}
                      >
                        {item.name}
                      </button>
                      {renderReorderButtons(item.key)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {groupItems.length > 1 && (
            <div className={styles.labeledRow} aria-label="分组">
              <span className={styles.rowLabel}>分组</span>
              <div className={styles.rowContent}>
                {groupItems.map((item) => {
                  const active = selectedGroupValues.includes(item.key);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`${styles.lineMetricBtn} ${active ? styles.active : ''}`}
                      onClick={() => handleGroupClick(item.key)}
                      title={active ? `隐藏 ${item.name}` : `显示 ${item.name}`}
                    >
                      {item.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {showLineMetricPicker && (
        <div className={styles.labeledRow} aria-label={lineMetricPickerLabel}>
          <span className={styles.rowLabel}>{lineMetricPickerLabel}</span>
          <div className={styles.rowContent}>
            {visibleLineMetricItems.map((item) => (
              <span key={item.key} className={styles.btnWithReorder}>
                <button
                  type="button"
                  className={`${styles.lineMetricBtn} ${activeLineKeys.includes(item.key) ? styles.active : ''}`}
                  onClick={() => handleLineMetricClick(item.key)}
                  title={`将 ${item.name} ${lineMetricPickerTitle}`}
                >
                  {item.name}
                </button>
                {renderReorderButtons(item.key)}
              </span>
            ))}
          </div>
        </div>
      )}

      {showRateCompareValueMode && (
        <div className={styles.labeledRow} aria-label="对比值">
          <span className={styles.rowLabel}>对比值</span>
          <div className={styles.rowContent}>
            <button
              type="button"
              className={`${styles.toolBtn} ${activeRateCompareValueMode === 'absolute' ? styles.active : ''}`}
              onClick={() => handleRateCompareModeClick('absolute')}
              title="默认使用变化量、差额等绝对值作为箭头标签"
            >
              绝对值
            </button>
            <button
              type="button"
              className={`${styles.toolBtn} ${activeRateCompareValueMode === 'rate' ? styles.active : ''}`}
              onClick={() => handleRateCompareModeClick('rate')}
              title="默认使用变化率、同比、环比等比率作为箭头标签"
            >
              比率
            </button>
          </div>
        </div>
      )}

      {showRateCompareBarPicker && (
        <div className={styles.labeledRow} aria-label="也作为柱">
          <span className={styles.rowLabel}>也作为柱</span>
          <div className={styles.rowContent}>
            {amountDifferenceItems.map((item) => {
              const active = selectedRateCompareBarKeys.includes(item.key);
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`${styles.lineMetricBtn} ${active ? styles.active : ''}`}
                  onClick={() => handleRateCompareBarClick(item.key)}
                  title={active ? `取消将 ${item.name} 作为柱` : `让 ${item.name} 同时作为柱（保留差异箭头标签）`}
                >
                  {item.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
