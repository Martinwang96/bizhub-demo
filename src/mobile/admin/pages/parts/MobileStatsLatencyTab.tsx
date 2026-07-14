/**
 * MobileStatsLatencyTab — 移动端「数据统计 · 查询耗时」子板块
 *
 * 与 PC StatsLatencyTab 完全同源：
 *   - fetchLatencyStats API（per-request 端到端 totalDurationMs）
 *   - 粒度(day/week/month) × 日期范围 × 用户筛选
 *   - 概览 4 卡 + 极值卡（点击跳 Session 详情）+ 平均/最大/最小 趋势 + Top 10 表
 *
 * 筛选条接入共享 `MobileStatsToolbar`，与 token / active tab 三者完全对称。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Notice, SkeletonStack } from '@shared/components';
import {
  fetchLatencyStats,
  type LatencyRequestRow,
  type LatencyStats,
  type StatsBucket,
} from '../../../../admin/api/stats';
import { fmtInt, fmtSec, fmtTime } from '../../../../admin/pages/StatsControls';
import { dateToTs } from '../../../../admin/utils/dateRange';
import MobileStatsTrendChart, { getToneColor, type MobileTrendSeries } from './MobileStatsTrendChart';
import MobileSessionDetailDrawer, { useMobileSessionDetail } from './MobileSessionDetailDrawer';
import MobileStatsToolbar, { type StatsRange } from './MobileStatsToolbar';
import styles from '../MobileStatsPage.module.css';

/** 表头注明了"耗时/秒"，单元格里只展示数字，去掉公共 fmtSec 拼出来的 's' 后缀。 */
function stripSecUnit(text: string): string {
  return text.replace(/\s*s$/i, '');
}

const EMPTY_RANGE: StatsRange = { since: '', until: '' };

export default function MobileStatsLatencyTab() {
  const { detail, detailOpen, detailLoading, openDetail, closeDetail } = useMobileSessionDetail();
  const [bucket, setBucket] = useState<StatsBucket>('day');
  const [range, setRange] = useState<StatsRange>({ ...EMPTY_RANGE });
  const [quick, setQuick] = useState('');
  const [userInput, setUserInput] = useState('');
  const [submitted, setSubmitted] = useState<{ since: string; until: string; user: string }>({
    since: '',
    until: '',
    user: '',
  });
  const [data, setData] = useState<LatencyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── 图表系列 toggle（tick off）—— 与 PC 端 legend 点击行为一致 ──
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  const toggleSeries = useCallback((name: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const env = await fetchLatencyStats({
      bucket,
      since: dateToTs(submitted.since, false, bucket),
      until: dateToTs(submitted.until, true, bucket),
      user: submitted.user,
    }).catch((e: unknown) => {
      console.error('fetchLatencyStats failed', e);
      return null;
    });
    if (env?.success && env.data) setData(env.data);
    else {
      setData(null);
      setError(env?.error || '加载失败');
    }
    setLoading(false);
  }, [bucket, submitted.since, submitted.until, submitted.user]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = useCallback(() => {
    const since = dateToTs(range.since, false, bucket);
    const until = dateToTs(range.until, true, bucket);
    if (since && until && since > until) {
      setError('「开始日期」不能晚于「结束日期」');
      return;
    }
    setSubmitted({ since: range.since, until: range.until, user: userInput.trim() });
  }, [range.since, range.until, userInput, bucket]);

  // 全部系列的元数据（用于 legend 展示，始终包含三条）
  const allSeriesMeta = useMemo(() => {
    return [
      { name: 'Avg', label: '平均', tone: 'primary' as const },
      { name: 'Max', label: '最大', tone: 'danger' as const },
      { name: 'Min', label: '最小', tone: 'accent' as const },
    ];
  }, []);

  const trendSeries = useMemo<MobileTrendSeries[]>(() => {
    if (!data) return [];
    const all: MobileTrendSeries[] = [
      { name: '平均', tone: 'primary', data: data.series.map((s) => s.avgMs / 1000) },
      { name: '最大', tone: 'danger', data: data.series.map((s) => s.maxMs / 1000) },
      { name: '最小', tone: 'accent', data: data.series.map((s) => s.minMs / 1000), dashed: true },
    ];
    return all.filter((s) => !hiddenSeries.has(s.name));
  }, [data, hiddenSeries]);

  const locate = useCallback((row: LatencyRequestRow | null) => {
    if (!row?.sessionId) return;
    void openDetail(row.sessionId);
  }, [openDetail]);

  const totals = data?.totals;
  const extremes = data?.extremes;

  return (
    <section className={styles.section} aria-label="查询耗时">
      <MobileStatsToolbar
        bucket={bucket}
        onBucketChange={setBucket}
        range={range}
        onRangeChange={setRange}
        quick={quick}
        onQuickChange={setQuick}
        userInput={userInput}
        onUserInputChange={setUserInput}
        userPlaceholder="检索用户 ID…"
        onSubmit={handleSubmit}
        onRefresh={() => void load()}
      />

      {error && <Notice tone="danger" title="加载失败">{error}</Notice>}

      {/* ────────── 概览 4 卡 ────────── */}
      <div className={styles.metricGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricHead}>
            <span>平均耗时</span>
          </div>
          <span className={`${styles.metricNum} ${styles.metricNumPrimary}`}>
            {fmtSec(totals?.avgMs ?? 0)}
          </span>
          <span className={styles.metricHint}>{fmtInt(totals?.count ?? 0)} 次请求</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHead}>
            <span>最大耗时</span>
          </div>
          <span className={`${styles.metricNum} ${styles.metricNumDanger}`}>{fmtSec(totals?.maxMs ?? 0)}</span>
          <span className={styles.metricHint}>单次峰值</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHead}>
            <span>最小耗时</span>
          </div>
          <span className={`${styles.metricNum} ${styles.metricNumAccent}`}>{fmtSec(totals?.minMs ?? 0)}</span>
          <span className={styles.metricHint}>单次最优</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHead}>
            <span>样本数</span>
          </div>
          <span className={styles.metricNum}>{fmtInt(totals?.count ?? 0)}</span>
          <span className={styles.metricHint}>per-request 端到端</span>
        </div>
      </div>

      {/* ────────── 极值卡（点击跳 Session 详情） ────────── */}
      <div className={styles.extremeRow}>
        <ExtremeCard kind="max" row={extremes?.max ?? null} onLocate={locate} />
        <ExtremeCard kind="min" row={extremes?.min ?? null} onLocate={locate} />
      </div>

      {/* ────────── 趋势 ────────── */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>耗时趋势 (秒)</h3>
          <div className={styles.chartLegendRow}>
            {allSeriesMeta.map((s) => {
              const hidden = hiddenSeries.has(s.label);
              return (
                <button
                  key={s.name}
                  type="button"
                  className={`${styles.legendChip} ${hidden ? styles.legendChipHidden : ''}`}
                  onClick={() => toggleSeries(s.label)}
                  aria-pressed={!hidden}
                >
                  <span className={styles.legendDot} style={{ background: getToneColor(s.tone) }} />
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>
        <div className={styles.cardBody}>
          {loading ? (
            <SkeletonStack rows={4} />
          ) : !data || data.series.length === 0 ? (
            <Notice tone="info">所选范围内暂无查询耗时数据（耗时来源于会话记录，会话被删除后对应记录会丢失）。</Notice>
          ) : (
            <MobileStatsTrendChart
              buckets={data.buckets}
              series={trendSeries}
              kind="line"
              unit="s"
              valueFormatter={(v) => v.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
            />
          )}
        </div>
      </div>

      {/* ────────── Top 10 表 ────────── */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>最高耗时 Top 10</h3>
          <span className={styles.cardMeta}>点击 Session 看详情</span>
        </div>
        {loading ? (
          <div className={styles.cardBody}>
            <SkeletonStack rows={4} />
          </div>
        ) : !data || data.table.length === 0 ? (
          <div className={styles.empty}>暂无数据</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thCenter}>用户</th>
                  <th className={styles.thCenter}>Session</th>
                  <th className={`${styles.num} ${styles.thCenter}`}>耗时/秒</th>
                  <th className={styles.thCenter}>状态</th>
                  <th className={`${styles.num} ${styles.thCenter}`}>时间</th>
                </tr>
              </thead>
              <tbody>
                {data.table.map((r, i) => {
                  const slow = r.durationMs >= 3000;
                  const ok = !r.status || r.status === 'success';
                  return (
                    <tr key={`${r.sessionId}-${i}`}>
                      <td className={styles.cellKey} title={r.user}>{r.user}</td>
                      <td className={styles.cellMono} title={r.sessionId}>
                        <button type="button" className={styles.rowLink} onClick={() => locate(r)}>{r.sessionId || '-'}</button>
                      </td>
                      <td className={`${styles.num} ${slow ? styles.cellLatencyHigh : ''}`}>{stripSecUnit(fmtSec(r.durationMs))}</td>
                      <td>
                        <span className={`${styles.badge} ${ok ? styles.badgeOk : styles.badgeFail}`}>
                          {ok ? 'SUCCESS' : (r.status || 'FAILED').toUpperCase()}
                        </span>
                      </td>
                      <td className={`${styles.num} ${styles.cellMuted}`}>{fmtTime(r.time)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <MobileSessionDetailDrawer
        detail={detail}
        open={detailOpen}
        loading={detailLoading}
        onClose={closeDetail}
      />
    </section>
  );
}

/* ───────────────────── 极值卡（max / min） ───────────────────── */

function ExtremeCard(props: {
  kind: 'max' | 'min';
  row: LatencyRequestRow | null;
  onLocate: (row: LatencyRequestRow | null) => void;
}) {
  const { kind, row, onLocate } = props;
  const isMax = kind === 'max';
  const ariaLabel = `${isMax ? '最大' : '最小'}耗时记录，查看会话详情`;
  return (
    <button
      type="button"
      className={`${styles.extremeCard} ${isMax ? styles.extremeCardMax : styles.extremeCardMin}`}
      disabled={!row?.sessionId}
      onClick={() => onLocate(row)}
      aria-label={ariaLabel}
    >
      <div className={`${styles.extremeHead} ${isMax ? styles.extremeHeadMax : styles.extremeHeadMin}`}>
        <span>{isMax ? '最大耗时记录' : '最小耗时记录'}</span>
        <span aria-hidden="true">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </span>
      </div>
      <div className={`${styles.extremeNum} ${isMax ? styles.extremeNumMax : styles.extremeNumMin}`}>
        {row ? fmtSec(row.durationMs) : '-'}
      </div>
      <span className={styles.extremeMeta} title={row?.sessionId || '-'}>{row?.sessionId || '-'}</span>
    </button>
  );
}
