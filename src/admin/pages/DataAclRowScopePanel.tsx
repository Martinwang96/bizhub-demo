import { useMemo, useState } from 'react';
import { discoveryColumns, discoveryEnumValues } from '../api/dataAcl';
import type { DiscoveryColumn, DiscoveryEnumValue, DiscoveryPartition, RowScopeBinding } from '../api/dataAcl';
import DataAclPartitionProbePopover from './DataAclPartitionProbePopover';
import styles from './DataAclPage.module.css';

interface SkillTableEntry {
  table: string;
  skill: string;
  datasource?: string;
  brief?: string;
  /** 后端 v3.x 起回填，"unavailable" 表示下线 skill 占位行（table=""），需被本组件过滤掉。 */
  status?: 'active' | 'unavailable';
}

interface Props {
  readonly: boolean;
  skillIndex: SkillTableEntry[];
  selectedSkills: Set<string>;
  rowScopes: RowScopeBinding[];
  onChange: (next: RowScopeBinding[]) => void;
  toast: { warning: (msg: string) => void; error: (msg: string) => void; success: (msg: string) => void };
}

function scopeKey(s: Pick<RowScopeBinding, 'skill_id' | 'source' | 'schema' | 'table'>): string {
  return `${s.skill_id}|${s.source || 'mysql'}|${s.schema || ''}|${s.table}`;
}

function enumCacheKey(s: { source?: string; schema?: string; table: string }, column: string): string {
  return `${s.source || 'mysql'}|${s.schema || ''}|${s.table}|${column}`;
}

export default function DataAclRowScopePanel({ readonly, skillIndex, selectedSkills, rowScopes, onChange, toast }: Props) {
  const [tableSearch, setTableSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [columns, setColumns] = useState<DiscoveryColumn[]>([]);
  const [columnSearch, setColumnSearch] = useState('');
  const [enumSearch, setEnumSearch] = useState<Record<string, string>>({});
  const [enumValues, setEnumValues] = useState<Record<string, DiscoveryEnumValue[]>>({});
  const [enumPartitions, setEnumPartitions] = useState<Record<string, DiscoveryPartition>>({});
  const [enumErrors, setEnumErrors] = useState<Record<string, string>>({});
  const [partitionTarget, setPartitionTarget] = useState<{ column: string; cacheKey: string } | null>(null);
  const [loading, setLoading] = useState('');

  const authorizedTables = useMemo(() => {
    // 过滤下线 skill 占位行（table=""）：下线 sid 即便残留在 selectedSkills 里，
    // 也不会暴露任何可编辑的行权限目标；与后端 _filtered_table_entries() 口径闭环。
    return skillIndex
      .filter((x) => x.table && selectedSkills.has(x.skill))
      .map((x) => ({ ...x, datasource: x.datasource || 'mysql' }));
  }, [skillIndex, selectedSkills]);

  const filteredTables = useMemo(() => {
    const kw = tableSearch.trim().toLowerCase();
    return authorizedTables.filter((x) => !kw || `${x.skill} ${x.table} ${x.brief || ''}`.toLowerCase().includes(kw));
  }, [authorizedTables, tableSearch]);

  const selectedTable = authorizedTables.find((x) => scopeKey({
    skill_id: x.skill,
    source: x.datasource || 'mysql',
    schema: '',
    table: x.table,
  }) === selectedKey);

  const currentScope = selectedTable
    ? rowScopes.find((x) => scopeKey(x) === selectedKey)
    : undefined;

  const updateScope = (nextScope: RowScopeBinding | null) => {
    const next = rowScopes.filter((x) => scopeKey(x) !== selectedKey);
    if (nextScope) next.push(nextScope);
    onChange(next);
  };

  const probeColumns = async (): Promise<DiscoveryColumn[]> => {
    if (!selectedTable) return [];
    setLoading('columns');
    const env = await discoveryColumns(selectedTable.table, selectedTable.datasource || 'mysql').catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : '字段探测失败');
      return null;
    });
    setLoading('');
    if (env?.success) {
      const nextColumns = (env.data || []) as DiscoveryColumn[];
      setColumns(nextColumns);
      toast.success('字段探测完成');
      return nextColumns;
    }
    if (env) toast.error(env.error || '字段探测失败');
    return [];
  };

  const probeEnums = async (column: string) => {
    if (!selectedTable) return;
    const key = enumCacheKey({ source: selectedTable.datasource || 'mysql', schema: '', table: selectedTable.table }, column);
    let availableColumns = columns;
    if (availableColumns.length === 0) {
      availableColumns = await probeColumns();
    }
    if (availableColumns.length === 0) {
      toast.warning('请先完成字段探测，再选择分区字段');
      return;
    }
    setPartitionTarget({ column, cacheKey: key });
  };

  const startEnumProbe = async (partitionColumn: string, partitionValue: string) => {
    if (!selectedTable || !partitionTarget) return;
    const target = partitionTarget;
    const table = selectedTable.table;
    setPartitionTarget(null);
    setLoading(`enum:${target.cacheKey}`);
    setEnumErrors((prev) => ({ ...prev, [target.cacheKey]: '' }));
    const env = await discoveryEnumValues({
      table,
      column: target.column,
      schema: '',
      partition_column: partitionColumn,
      partition_value: partitionValue,
    }).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : '枚举值探测失败';
      toast.error(msg);
      setEnumErrors((prev) => ({ ...prev, [target.cacheKey]: msg }));
      return null;
    });
    setLoading('');
    if (env?.success) {
      setEnumValues((prev) => ({ ...prev, [target.cacheKey]: env.data?.values || [] }));
      setEnumPartitions((prev) => ({ ...prev, [target.cacheKey]: env.data?.partition || {} }));
      toast.success(`${target.column} 枚举值探测完成`);
    } else if (env) {
      const msg = env.error || '枚举值探测失败';
      setEnumErrors((prev) => ({ ...prev, [target.cacheKey]: msg }));
      toast.error(msg);
    }
  };

  const toggleColumn = (column: string) => {
    if (!selectedTable || readonly) return;
    const base = currentScope || {
      skill_id: selectedTable.skill,
      source: selectedTable.datasource || 'mysql',
      schema: '',
      table: selectedTable.table,
      enabled: true,
      columns: [],
    };
    const exists = base.columns.some((x) => x.column === column);
    const nextColumns = exists
      ? base.columns.filter((x) => x.column !== column)
      : [...base.columns, { column, values: [] }];
    updateScope(nextColumns.length ? { ...base, columns: nextColumns } : null);
  };

  const toggleValue = (column: string, value: string) => {
    if (!selectedTable || !currentScope || readonly) return;
    const nextColumns = currentScope.columns.map((c) => {
      if (c.column !== column) return c;
      const set = new Set(c.values || []);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...c, values: [...set] };
    });
    updateScope({ ...currentScope, columns: nextColumns });
  };

  const selectedColumns = new Set((currentScope?.columns || []).map((x) => x.column));
  const visibleColumns = columns.filter((c) => {
    const kw = columnSearch.trim().toLowerCase();
    return !kw || `${c.name} ${c.type}`.toLowerCase().includes(kw);
  });

  return (
    <div className={styles.rowScopeLayout}>
      <aside className={styles.rowScopeAside}>
        <input className={styles.input} placeholder="筛选 Skill / 表名 / 用途" value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} />
        <div className={styles.rowScopeTableList}>
          {filteredTables.length === 0 ? <div className={styles.empty}>当前授权 Skill 下暂无声明表</div> : filteredTables.map((it) => {
            const key = scopeKey({ skill_id: it.skill, source: it.datasource || 'mysql', schema: '', table: it.table });
            const configured = rowScopes.some((x) => scopeKey(x) === key);
            return (
              <button key={key} type="button" className={key === selectedKey ? `${styles.rowScopeTableItem} ${styles.rowScopeTableItemActive}` : styles.rowScopeTableItem} onClick={() => { setSelectedKey(key); setColumns([]); setColumnSearch(''); }}>
                <span><code>{it.table}</code>{configured && <b className={styles.rowScopeDot}>已配置</b>}</span>
                {it.brief && <small className={styles.skillTableDesc}>{it.brief}</small>}
                <small>{it.skill} · {it.datasource || 'mysql'}</small>
              </button>
            );
          })}
        </div>
      </aside>
      <section className={styles.rowScopeMain}>
        {!selectedTable ? (
          <div className={styles.empty}>请先从左侧选择一个已授权 Skill 声明的表</div>
        ) : (
          <>
            <div className={styles.rowScopeHeader}>
              <div>
                {/* 长表名通过 title 给完整名，视觉上由 CSS 省略号收纳，避免把右侧按钮挤压成竖排两字 */}
                <b title={selectedTable.table}>{selectedTable.table}</b>
                <div className={styles.formHint}>Skill: {selectedTable.skill} · 未配置行权限时默认全表可查</div>
              </div>
              <div className={styles.drawerActions}>
                <button type="button" className={styles.btnGhost} onClick={() => void probeColumns()} disabled={loading === 'columns'}>{loading === 'columns' ? '探测中…' : '探测字段'}</button>
                <button type="button" className={styles.btnGhost} onClick={() => updateScope(null)} disabled={readonly || !currentScope}>清空行权限</button>
              </div>
            </div>
            <input className={`${styles.input} ${styles.rowScopeColumnFilter}`} placeholder="输入字段名筛选" value={columnSearch} onChange={(e) => setColumnSearch(e.target.value)} />
            <div className={styles.rowScopeColumns}>
              {visibleColumns.length === 0 ? <div className={styles.empty}>点击「探测字段」加载字段列表</div> : visibleColumns.map((c) => {
                const active = selectedColumns.has(c.name);
                const colScope = currentScope?.columns.find((x) => x.column === c.name);
                const key = selectedTable
                  ? enumCacheKey({ source: selectedTable.datasource || 'mysql', schema: '', table: selectedTable.table }, c.name)
                  : c.name;
                const enumLoaded = Object.prototype.hasOwnProperty.call(enumValues, key);
                const enumLoading = loading === `enum:${key}`;
                const values = enumValues[key] || [];
                const partitionInfo = enumPartitions[key];
                const enumError = enumErrors[key] || '';
                const kw = (enumSearch[key] || '').trim().toLowerCase();
                const visibleValues = values.filter((v) => !kw || v.value.toLowerCase().includes(kw));
                return (
                  <div key={c.name} className={styles.rowScopeColumnCard}>
                    <label className={styles.rowScopeCheckLine}>
                      <input type="checkbox" checked={active} disabled={readonly} onChange={() => toggleColumn(c.name)} />
                      <span><code>{c.name}</code> <small>{c.type}{c.suggested_for_scope ? ' · 推荐' : ''}</small></span>
                    </label>
                    {active && (
                      <div className={styles.rowScopeEnumBox}>
                        <div className={styles.simRow}>
                          <input className={styles.input} placeholder="输入枚举值筛选" value={enumSearch[key] || ''} onChange={(e) => setEnumSearch((prev) => ({ ...prev, [key]: e.target.value }))} />
                          <button type="button" className={styles.btnGhost} onClick={() => void probeEnums(c.name)} disabled={enumLoading}>{enumLoading ? '探测中…' : enumLoaded ? '重新探测' : '探测枚举值'}</button>
                        </div>
                        {partitionInfo?.applied && (
                          <div className={styles.rowScopePartitionHint}>基于分区 <code>{partitionInfo.column}</code> = <b>{partitionInfo.latest}</b> 探测</div>
                        )}
                        {enumError && <div className={styles.rowScopeEnumError}>{enumError}</div>}
                        {!enumLoaded ? (
                          <div className={styles.formHint}>{enumLoading ? '枚举值探测中…' : '点击「探测枚举值」选择分区字段并加载可选值；保存前至少选择一个值'}</div>
                        ) : visibleValues.length === 0 ? (
                          <div className={styles.formHint}>{values.length === 0 ? '未发现枚举值；保存前至少选择一个值' : '没有匹配的枚举值'}</div>
                        ) : visibleValues.map((v) => (
                          <label key={v.value} className={styles.rowScopeValueLine}>
                            <input type="checkbox" checked={(colScope?.values || []).includes(v.value)} disabled={readonly} onChange={() => toggleValue(c.name, v.value)} />
                            <span>{v.value}</span>
                            <small>{v.row_count.toLocaleString('zh-CN')} 行</small>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
      {selectedTable && partitionTarget && (
        <DataAclPartitionProbePopover
          table={selectedTable.table}
          schema=""
          enumColumn={partitionTarget.column}
          columns={columns}
          onClose={() => setPartitionTarget(null)}
          onStart={(partitionColumn, partitionValue) => void startEnumProbe(partitionColumn, partitionValue)}
        />
      )}
    </div>
  );
}
