import { useMemo, useState } from 'react';
import { discoveryLatestPartition } from '../api/dataAcl';
import type { DiscoveryColumn } from '../api/dataAcl';
import styles from './DataAclPage.module.css';

const PARTITION_CANDIDATES = [
  'ftime', 'dt', 'ds', 'date',
  'stat_date', 'imp_date', 'p_date', 'partition_date',
];

interface Props {
  table: string;
  schema?: string;
  enumColumn: string;
  columns: DiscoveryColumn[];
  onClose: () => void;
  onStart: (partitionColumn: string, partitionValue: string) => void;
}

function candidateRank(name: string): number {
  const idx = PARTITION_CANDIDATES.indexOf(name.toLowerCase());
  return idx >= 0 ? idx : 1000;
}

export default function DataAclPartitionProbePopover({
  table,
  schema = '',
  enumColumn,
  columns,
  onClose,
  onStart,
}: Props) {
  const [selectedColumn, setSelectedColumn] = useState('');
  const [latest, setLatest] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const sortedColumns = useMemo(() => {
    return [...columns].sort((a, b) => {
      const ar = candidateRank(a.name);
      const br = candidateRank(b.name);
      if (ar !== br) return ar - br;
      return a.name.localeCompare(b.name);
    });
  }, [columns]);

  const choosePartitionColumn = async (column: string) => {
    setSelectedColumn(column);
    setLatest('');
    setError('');
    setLoading(true);
    const env = await discoveryLatestPartition({ table, schema, partition_column: column }).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : '最新分区探测失败');
      return null;
    });
    setLoading(false);
    if (env?.success && env.data?.latest) {
      setLatest(String(env.data.latest));
    } else if (env?.success) {
      setError('该字段未探测到最新分区值，请选择其他字段');
    } else if (env) {
      setError(env.error || '最新分区探测失败');
    }
  };

  const canStart = Boolean(selectedColumn && latest && !loading);

  return (
    <div className={styles.partitionPopoverMask}>
      <div className={styles.partitionPopover} role="dialog" aria-modal="true" aria-label="选择分区字段">
        <div className={styles.partitionPopoverHead}>
          <div>
            <b>选择分区字段</b>
            <div className={styles.formHint}>表 {table} · 枚举字段 {enumColumn}</div>
          </div>
          <button type="button" className={styles.btnGhost} onClick={onClose}>关闭</button>
        </div>

        <div className={styles.partitionStepBox}>
          <span className={styles.partitionStep}>1</span>
          <div>
            <b>选择用于限定扫描范围的字段</b>
            <p>推荐字段会优先展示，但你可以选择字段列表中的任意字段。</p>
          </div>
        </div>

        <div className={styles.partitionFieldList}>
          {sortedColumns.length === 0 ? (
            <div className={styles.empty}>字段列表为空，请先完成字段探测</div>
          ) : sortedColumns.map((c) => {
            const recommended = candidateRank(c.name) < 1000;
            const active = c.name === selectedColumn;
            return (
              <button
                key={c.name}
                type="button"
                className={active ? `${styles.partitionFieldItem} ${styles.partitionFieldItemActive}` : styles.partitionFieldItem}
                onClick={() => void choosePartitionColumn(c.name)}
                disabled={loading && !active}
              >
                <span><code>{c.name}</code><small>{c.type}</small></span>
                {recommended && <b>推荐</b>}
              </button>
            );
          })}
        </div>

        <div className={styles.partitionLatestBox}>
          <span className={styles.partitionStep}>2</span>
          <div>
            <b>最新分区</b>
            {loading ? (
              <p>正在探测 {selectedColumn} 的最新分区…</p>
            ) : latest ? (
              <p><code>{selectedColumn}</code> = <strong>{latest}</strong></p>
            ) : error ? (
              <p className={styles.partitionError}>{error}</p>
            ) : (
              <p>点击字段后自动探测最新分区。</p>
            )}
          </div>
        </div>

        <div className={styles.partitionPopoverActions}>
          <button type="button" className={styles.btnGhost} onClick={onClose}>取消</button>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={!canStart}
            onClick={() => onStart(selectedColumn, latest)}
          >
            开始探测
          </button>
        </div>
      </div>
    </div>
  );
}
