/**
 * StatsTokenTab — 数据统计 · token 消耗板块。
 * 维度(按 user / session / 模型) × 时间粒度(天/周/月) × 范围；趋势图 + 概览卡 + 明细表。
 *
 * 顶部筛选区接入共享 `StatsToolbar`：粒度 · 维度 · 日期范围 · 日期快捷 · 用户筛选 + 筛选 · 刷新。
 * 旧的 `RANGE_OPTIONS`（近 7/30/90/全部）chip 已下线，统一改为日期范围 + 日期快捷。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Notice, SkeletonStack, useToast } from '@shared/components';
import {
  fetchTokenStats,
  type StatsBucket,
  type StatsDimension,
  type TokenStats,
} from '../api/stats';
import StatsTrendChart, { type TrendSeries } from './StatsTrendChart';
import { fmtInt, fmtTime } from './StatsControls';
import StatsToolbar, { type StatsRange } from './StatsToolbar';
import { dateToTs } from '../utils/dateRange';
import styles from './StatsPage.module.css';

const DIMENSIONS: ReadonlyArray<{ key: StatsDimension; label: string }> = [
  { key: 'user', label: '按 user' },
  { key: 'session', label: '按 session' },
  { key: 'model', label: '按模型' },
];

const SERIES_TONES: ReadonlyArray<TrendSeries['tone']> = ['primary', 'accent', 'warn', 'sub', 'primary2'];
const TOP_N = 5;
const EMPTY_RANGE: StatsRange = { since: '', until: '' };

export default function StatsTokenTab() {
  const toast = useToast();
  const [dimension, setDimension] = useState<StatsDimension>('user');
  const [bucket, setBucket] = useState<StatsBucket>('day');
  const [range, setRange] = useState<StatsRange>({ ...EMPTY_RANGE });
  const [quick, setQuick] = useState('');
  const [userInput, setUserInput] = useState('');
  // 提交快照：日期与用户输入只在点击「筛选」时打接口；粒度 / 维度切换即时生效
  const [submitted, setSubmitted] = useState<{ since: string; until: string; user: string }>({
    since: '',
    until: '',
    user: '',
  });
  const [data, setData] = useState<TokenStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const since = dateToTs(submitted.since, false, bucket) ?? 0;
    const until = dateToTs(submitted.until, true, bucket);
    const env = await fetchTokenStats({ dimension, bucket, since, until, user: submitted.user }).catch((e: unknown) => {
      console.error('fetchTokenStats failed', e);
      return null;
    });
    if (env?.success && env.data) setData(env.data);
    else {
      setData(null);
      setError(env?.error || '加载失败');
    }
    setLoading(false);
  }, [dimension, bucket, submitted.since, submitted.until, submitted.user]);

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

  // 趋势：取明细表 totalTokens 前 TOP_N 个 key，沿时间桶铺成多条曲线
  const trendSeries = useMemo<TrendSeries[]>(() => {
    if (!data) return [];
    const topKeys = data.table.slice(0, TOP_N).map((r) => r.key);
    const cellMap = new Map<string, number>();
    for (const p of data.series) cellMap.set(`${p.key}@@${p.bucket}`, p.totalTokens);
    return topKeys.map((key, i) => ({
      name: key,
      tone: SERIES_TONES[i % SERIES_TONES.length],
      data: data.buckets.map((b) => cellMap.get(`${key}@@${b}`) ?? 0),
    }));
  }, [data]);

  const totals = data?.totals;
  const keyHeader = dimension === 'user' ? '用户' : dimension === 'session' ? 'Session' : '模型';

  return (
    <>
      <StatsToolbar
        bucket={bucket}
        onBucketChange={setBucket}
        dimension={dimension}
        onDimensionChange={setDimension}
        dimensionOptions={DIMENSIONS}
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
          <span className={styles.statLabel}>总 Tokens</span>
          <span className={styles.statNum}>{fmtInt(totals?.totalTokens ?? 0)}</span>
          <span className={styles.statHint}>调用 {fmtInt(totals?.callCount ?? 0)} 次</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardSub}`}>
          <span className={styles.statLabel}>Prompt Tokens</span>
          <span className={styles.statNum}>{fmtInt(totals?.promptTokens ?? 0)}</span>
          <span className={styles.statHint}>输入</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardAccent}`}>
          <span className={styles.statLabel}>Completion Tokens</span>
          <span className={styles.statNum}>{fmtInt(totals?.completionTokens ?? 0)}</span>
          <span className={styles.statHint}>输出</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardWarn}`}>
          <span className={styles.statLabel}>{keyHeader}数</span>
          <span className={styles.statNum}>{fmtInt(data?.table.length ?? 0)}</span>
          <span className={styles.statHint}>当前维度去重计数</span>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>Token 消耗趋势（{keyHeader} · Top {TOP_N}）</h2>
          <span className={styles.muted}>单位：tokens</span>
        </div>
        {loading ? (
          <SkeletonStack rows={5} />
        ) : trendSeries.length === 0 ? (
          <Notice tone="info">所选范围内暂无 token 消耗数据。</Notice>
        ) : (
          <StatsTrendChart
            buckets={data!.buckets}
            series={trendSeries}
            kind={bucket === 'day' ? 'line' : 'bar'}
            unit="tokens"
            valueFormatter={fmtInt}
          />
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>明细（按 {keyHeader}）</h2>
          <span className={styles.muted}>按总 Tokens 降序</span>
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
                  <th>{keyHeader}</th>
                  {dimension === 'session' && <th>所属用户</th>}
                  <th className={styles.num}>Prompt</th>
                  <th className={styles.num}>Completion</th>
                  <th className={styles.num}>Total</th>
                  <th className={styles.num}>调用次数</th>
                  <th>最近时间</th>
                </tr>
              </thead>
              <tbody>
                {data.table.map((r) => (
                  <tr key={r.key}>
                    <td className={styles.mono}>{r.key}</td>
                    {dimension === 'session' && <td className={styles.mono}>{r.secondary || '-'}</td>}
                    <td className={styles.num}>{fmtInt(r.promptTokens)}</td>
                    <td className={styles.num}>{fmtInt(r.completionTokens)}</td>
                    <td className={styles.num}>{fmtInt(r.totalTokens)}</td>
                    <td className={styles.num}>{fmtInt(r.callCount)}</td>
                    <td className={styles.muted}>{fmtTime(r.lastTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
