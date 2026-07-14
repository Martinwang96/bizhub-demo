/**
 * StatsLatencyTab — 数据统计 · 查询耗时板块。
 * per-request 端到端耗时（来源 session 的 totalDurationMs），按天/周/月统计 平均/最大/最小。
 * 点击最大/最小耗时 → 就地弹出 SessionDetailModal（与 Sessions 页同款，无跳转）。
 *
 * 顶部筛选区接入共享 `StatsToolbar`：粒度 · 日期范围 · 日期快捷 · 用户筛选 + 筛选 · 刷新。
 * 旧的 `RANGE_OPTIONS`（近 7/30/90/全部）chip 已下线，统一改为日期范围 + 日期快捷。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Notice, SkeletonStack, useToast } from '@shared/components';
import {
  fetchLatencyStats,
  type LatencyRequestRow,
  type LatencyStats,
  type StatsBucket,
} from '../api/stats';
import StatsTrendChart, { type TrendSeries } from './StatsTrendChart';
import { fmtInt, fmtSec, fmtTime } from './StatsControls';
import StatsToolbar, { type StatsRange } from './StatsToolbar';
import { dateToTs } from '../utils/dateRange';
import SessionDetailModal, { useSessionDetail } from './SessionDetailModal';
import styles from './StatsPage.module.css';

const EMPTY_RANGE: StatsRange = { since: '', until: '' };

export default function StatsLatencyTab() {
  const toast = useToast();
  const { detail, loading: detailLoading, openDetail, closeDetail } = useSessionDetail();
  const [bucket, setBucket] = useState<StatsBucket>('day');
  const [range, setRange] = useState<StatsRange>({ ...EMPTY_RANGE });
  const [quick, setQuick] = useState('');
  const [userInput, setUserInput] = useState('');
  // 提交快照：日期与用户输入只在点击「筛选」时打接口；粒度切换即时生效
  const [submitted, setSubmitted] = useState<{ since: string; until: string; user: string }>({
    since: '',
    until: '',
    user: '',
  });
  const [data, setData] = useState<LatencyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const since = dateToTs(submitted.since, false, bucket) ?? 0;
    const until = dateToTs(submitted.until, true, bucket);
    const env = await fetchLatencyStats({ bucket, since, until, user: submitted.user }).catch((e: unknown) => {
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
      toast.error('「开始日期」不能晚于「结束日期」，请检查筛选');
      return;
    }
    setSubmitted({ since: range.since, until: range.until, user: userInput.trim() });
  }, [range.since, range.until, userInput, toast, bucket]);

  const trendSeries = useMemo<TrendSeries[]>(() => {
    if (!data) return [];
    return [
      { name: '平均耗时', tone: 'primary', data: data.series.map((s) => s.avgMs / 1000) },
      { name: '最大耗时', tone: 'warn', data: data.series.map((s) => s.maxMs / 1000) },
      { name: '最小耗时', tone: 'sub', data: data.series.map((s) => s.minMs / 1000) },
    ];
  }, [data]);

  const locate = useCallback((row: LatencyRequestRow | null) => {
    if (!row?.sessionId) return;
    void openDetail(row.sessionId);
  }, [openDetail]);

  const totals = data?.totals;
  const extremes = data?.extremes;

  return (
    <>
      <StatsToolbar
        bucket={bucket}
        onBucketChange={setBucket}
        range={range}
        onRangeChange={setRange}
        quick={quick}
        onQuickChange={setQuick}
        userInput={userInput}
        onUserInputChange={setUserInput}
        onSubmit={handleSubmit}
        onRefresh={() => void load()}
      />

      {error && <Notice tone="danger" title="加载失败">{error}</Notice>}

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>平均耗时</span>
          <span className={styles.statNum}>{fmtSec(totals?.avgMs ?? 0)}</span>
          <span className={styles.statHint}>{fmtInt(totals?.count ?? 0)} 次请求</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardWarn}`}>
          <span className={styles.statLabel}>最大耗时</span>
          <span className={styles.statNum}>{fmtSec(totals?.maxMs ?? 0)}</span>
          <span className={styles.statHint}>单次请求峰值</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardSub}`}>
          <span className={styles.statLabel}>最小耗时</span>
          <span className={styles.statNum}>{fmtSec(totals?.minMs ?? 0)}</span>
          <span className={styles.statHint}>单次请求最优</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardAccent}`}>
          <span className={styles.statLabel}>样本数</span>
          <span className={styles.statNum}>{fmtInt(totals?.count ?? 0)}</span>
          <span className={styles.statHint}>per-request 端到端</span>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>耗时趋势（平均 / 最大 / 最小）</h2>
          <span className={styles.muted}>单位：秒</span>
        </div>
        {loading ? (
          <SkeletonStack rows={5} />
        ) : !data || data.series.length === 0 ? (
          <Notice tone="info">所选范围内暂无查询耗时数据（耗时来源于会话记录，会话被删除后对应记录会丢失）。</Notice>
        ) : (
          <StatsTrendChart
            buckets={data.buckets}
            series={trendSeries}
            kind="line"
            unit="s"
            valueFormatter={(v) => v.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
          />
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>耗时极值定位</h2>
          <span className={styles.muted}>点击卡片查看对应会话详情</span>
        </div>
        {loading ? (
          <SkeletonStack rows={2} />
        ) : !extremes?.max && !extremes?.min ? (
          <Notice tone="info">暂无可定位的请求。</Notice>
        ) : (
          <div className={styles.extremesRow}>
            <ExtremeCard kind="max" row={extremes?.max ?? null} onLocate={locate} />
            <ExtremeCard kind="min" row={extremes?.min ?? null} onLocate={locate} />
          </div>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>请求明细（按耗时降序 Top 10）</h2>
          <span className={styles.muted}>点击 Session 查看会话详情</span>
        </div>
        {loading ? (
          <SkeletonStack rows={4} />
        ) : !data || data.table.length === 0 ? (
          <Notice tone="info">暂无数据。</Notice>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>用户</th>
                  <th>Session</th>
                  <th>标题</th>
                  <th className={styles.num}>耗时</th>
                  <th>时间</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {data.table.map((r, i) => (
                  <tr key={`${r.sessionId}-${i}`}>
                    <td className={styles.mono}>{r.user}</td>
                    <td>
                      <button type="button" className={styles.rowLink} onClick={() => locate(r)}>
                        {r.sessionId || '-'}
                      </button>
                    </td>
                    <td className={styles.muted}>{r.sessionTitle || '-'}</td>
                    <td className={styles.num}>{fmtSec(r.durationMs)}</td>
                    <td className={styles.muted}>{fmtTime(r.time)}</td>
                    <td className={styles.muted}>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SessionDetailModal detail={detail} loading={detailLoading} onClose={closeDetail} />
    </>
  );
}

function ExtremeCard(props: {
  kind: 'max' | 'min';
  row: LatencyRequestRow | null;
  onLocate: (row: LatencyRequestRow | null) => void;
}) {
  const { kind, row, onLocate } = props;
  const isMax = kind === 'max';
  return (
    <button
      type="button"
      className={styles.extremeCard}
      disabled={!row?.sessionId}
      onClick={() => onLocate(row)}
      aria-label={`${isMax ? '最大' : '最小'}耗时请求，查看会话详情`}
    >
      <div className={styles.extremeHead}>
        <span className={`${styles.extremeTag} ${isMax ? styles.extremeTagMax : styles.extremeTagMin}`}>
          {isMax ? '最大耗时' : '最小耗时'}
        </span>
        <span className={styles.extremeNum}>{row ? fmtSec(row.durationMs) : '-'}</span>
      </div>
      <span className={styles.extremeMeta}>user: {row?.user || '-'}</span>
      <span className={styles.extremeMeta}>session: {row?.sessionId || '-'}</span>
      <span className={styles.muted}>{row ? fmtTime(row.time) : ''}</span>
    </button>
  );
}
