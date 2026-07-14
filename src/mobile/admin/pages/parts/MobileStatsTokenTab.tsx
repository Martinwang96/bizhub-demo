/**
 * MobileStatsTokenTab — 移动端「数据统计 · Token 消耗」子板块
 *
 * 与 PC StatsTokenTab 严格同源：
 *   - fetchTokenStats API（dimension × bucket × since/until × user）
 *   - 概览 4 卡 + Top 5 趋势 + 明细表（按 totalTokens 降序）
 *
 * 筛选条接入共享 `MobileStatsToolbar`：粒度 · 维度 · 日期范围（mode 跟粒度）· 日期快捷 · 用户筛选。
 * 已下线旧的 `RANGE_OPTIONS`（最近 7/30/90/全部）；统一改为日期范围 + 快捷下拉，与 PC 字符级一致。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Notice, SkeletonStack } from '@shared/components';
import {
  fetchTokenStats,
  type StatsBucket,
  type StatsDimension,
  type TokenStats,
} from '../../../../admin/api/stats';
import { fmtInt, fmtTime } from '../../../../admin/pages/StatsControls';
import { dateToTs } from '../../../../admin/utils/dateRange';
import MobileStatsTrendChart, {
  getToneColor,
  TONE_PALETTE,
  type MobileTrendSeries,
} from './MobileStatsTrendChart';
import MobileStatsToolbar, { type StatsRange } from './MobileStatsToolbar';
import styles from '../MobileStatsPage.module.css';

const TOP_N = 5;

const DIMENSION_OPTIONS: ReadonlyArray<{ key: StatsDimension; label: string }> = [
  { key: 'user', label: 'User' },
  { key: 'session', label: 'Session' },
  { key: 'model', label: 'Model' },
];

const EMPTY_RANGE: StatsRange = { since: '', until: '' };

export default function MobileStatsTokenTab() {
  const [dimension, setDimension] = useState<StatsDimension>('user');
  const [bucket, setBucket] = useState<StatsBucket>('day');
  const [range, setRange] = useState<StatsRange>({ ...EMPTY_RANGE });
  const [quick, setQuick] = useState('');
  const [userInput, setUserInput] = useState('');
  const [submitted, setSubmitted] = useState<{ since: string; until: string; user: string }>({
    since: '',
    until: '',
    user: '',
  });
  const [data, setData] = useState<TokenStats | null>(null);
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
    const env = await fetchTokenStats({
      dimension,
      bucket,
      since: dateToTs(submitted.since, false, bucket),
      until: dateToTs(submitted.until, true, bucket),
      user: submitted.user,
    }).catch((e: unknown) => {
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
      setError('「开始日期」不能晚于「结束日期」');
      return;
    }
    setSubmitted({ since: range.since, until: range.until, user: userInput.trim() });
  }, [range.since, range.until, userInput, bucket]);

  // 全部系列的元数据（用于 legend 展示，始终包含所有 Top N 条目）
  const allSeriesMeta = useMemo(() => {
    if (!data) return [];
    const topKeys = data.table.slice(0, TOP_N).map((r) => r.key);
    return topKeys.map((key, i) => ({
      name: key,
      tone: TONE_PALETTE[i % TONE_PALETTE.length],
    }));
  }, [data]);

  // Top N keys 趋势序列（过滤已 toggle off 的系列，用于图表渲染）
  const trendSeries = useMemo<MobileTrendSeries[]>(() => {
    if (!data) return [];
    const topKeys = data.table.slice(0, TOP_N).map((r) => r.key);
    const cellMap = new Map<string, number>();
    for (const p of data.series) cellMap.set(`${p.key}@@${p.bucket}`, p.totalTokens);
    // 用 name→tone 映射确保过滤后色调不变
    const toneMap = new Map(allSeriesMeta.map((m) => [m.name, m.tone]));
    return topKeys
      .filter((key) => !hiddenSeries.has(key))
      .map((key) => ({
        name: key,
        tone: toneMap.get(key) ?? TONE_PALETTE[0],
        data: data.buckets.map((b) => cellMap.get(`${key}@@${b}`) ?? 0),
      }));
  }, [data, hiddenSeries, allSeriesMeta]);

  const totals = data?.totals;
  const keyHeader = dimension === 'user' ? '用户' : dimension === 'session' ? 'Session' : '模型';

  const tokenSearchPlaceholder = dimension === 'session'
    ? '搜索 Session…'
    : dimension === 'model'
      ? '搜索模型…'
      : '搜索用户…';

  return (
    <section className={styles.section} aria-label="Token 消耗">
      <MobileStatsToolbar
        bucket={bucket}
        onBucketChange={setBucket}
        dimension={dimension}
        onDimensionChange={setDimension}
        dimensionOptions={DIMENSION_OPTIONS}
        range={range}
        onRangeChange={setRange}
        quick={quick}
        onQuickChange={setQuick}
        userInput={userInput}
        onUserInputChange={setUserInput}
        userPlaceholder={tokenSearchPlaceholder}
        onSubmit={handleSubmit}
        onRefresh={() => void load()}
      />

      {error && <Notice tone="danger" title="加载失败">{error}</Notice>}

      {/* ────────── 概览 4 卡 ────────── */}
      <div className={styles.metricGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricHead}>
            <span>总 TOKENS</span>
          </div>
          <span className={`${styles.metricNum} ${styles.metricNumPrimary}`}>{fmtInt(totals?.totalTokens ?? 0)}</span>
          <span className={styles.metricHint}>{fmtInt(totals?.callCount ?? 0)} 次调用</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHead}>
            <span>PROMPT</span>
          </div>
          <span className={`${styles.metricNum} ${styles.metricNumAccent}`}>{fmtInt(totals?.promptTokens ?? 0)}</span>
          <span className={styles.metricHint}>输入</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHead}>
            <span>COMPLETION</span>
          </div>
          <span className={`${styles.metricNum} ${styles.metricNumWarn}`}>{fmtInt(totals?.completionTokens ?? 0)}</span>
          <span className={styles.metricHint}>输出</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHead}>
            <span>{keyHeader}数</span>
          </div>
          <span className={styles.metricNum}>{fmtInt(data?.table.length ?? 0)}</span>
          <span className={styles.metricHint}>当前维度去重</span>
        </div>
      </div>

      {/* ────────── 趋势 ────────── */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Top {TOP_N} 趋势</h3>
          <div className={styles.chartLegendRow}>
            {allSeriesMeta.map((s) => {
              const hidden = hiddenSeries.has(s.name);
              return (
                <button
                  key={s.name}
                  type="button"
                  className={`${styles.legendChip} ${hidden ? styles.legendChipHidden : ''}`}
                  onClick={() => toggleSeries(s.name)}
                  aria-pressed={!hidden}
                >
                  <span className={styles.legendDot} style={{ background: getToneColor(s.tone) }} />
                  <span style={{ maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className={styles.cardBody}>
          {loading ? (
            <SkeletonStack rows={4} />
          ) : !data || allSeriesMeta.length === 0 ? (
            <Notice tone="info">所选范围内暂无 token 消耗数据。</Notice>
          ) : (
            <MobileStatsTrendChart
              buckets={data.buckets}
              series={trendSeries}
              kind={bucket === 'day' ? 'line' : 'bar'}
              unit="tokens"
              valueFormatter={fmtInt}
            />
          )}
        </div>
      </div>

      {/* ────────── 明细表 ────────── */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>详细数据（按 {keyHeader}）</h3>
          <span className={styles.cardMeta}>共 {fmtInt(data?.table.length ?? 0)} 条</span>
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
                  <th className={styles.thCenter}>{keyHeader}</th>
                  <th className={`${styles.num} ${styles.thCenter}`}>总计</th>
                  <th className={`${styles.num} ${styles.thCenter}`}>Prompt</th>
                  <th className={`${styles.num} ${styles.thCenter}`}>Completion</th>
                  <th className={`${styles.num} ${styles.thCenter}`}>调用</th>
                  <th className={`${styles.num} ${styles.thCenter}`}>最近</th>
                </tr>
              </thead>
              <tbody>
                {data.table.map((r) => (
                  <tr key={r.key}>
                    <td className={styles.cellKey} title={r.key}>{r.key}</td>
                    <td className={`${styles.num} ${styles.cellTotal}`}>{fmtInt(r.totalTokens)}</td>
                    <td className={`${styles.num} ${styles.cellPrompt}`}>{fmtInt(r.promptTokens)}</td>
                    <td className={`${styles.num} ${styles.cellCompletion}`}>{fmtInt(r.completionTokens)}</td>
                    <td className={styles.num}>{fmtInt(r.callCount)}</td>
                    <td className={`${styles.num} ${styles.cellMuted}`}>{fmtTime(r.lastTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
