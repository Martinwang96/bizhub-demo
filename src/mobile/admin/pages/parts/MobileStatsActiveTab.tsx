/**
 * MobileStatsActiveTab — 移动端「数据统计 · 活跃数据」子板块
 *
 * 与 PC StatsActiveTab 同口径：
 *   - 上方六张概览卡（累计 用户/会话/消息 + 今日 用户/会话/消息）来自 fetchSessionStats()
 *   - 中段筛选条接入共享 `MobileStatsToolbar`：粒度 · 日期范围（mode 跟粒度）· 日期快捷 · 用户筛选
 *   - 下方活跃趋势（用户 / 会话 / 消息）来自 fetchActiveStats()
 *
 * 用户筛选与 token / latency 同口径（子串匹配，大小写不敏感）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Notice, SkeletonStack } from '@shared/components';
import { fetchSessionStats } from '../../../../admin/api/adminConsole';
import type { SessionStats } from '../../../../admin/api/adminConsole';
import {
  fetchActiveStats,
  type ActiveStats,
  type StatsBucket,
} from '../../../../admin/api/stats';
import { fmtInt } from '../../../../admin/pages/StatsControls';
import { dateToTs } from '../../../../admin/utils/dateRange';
import MobileStatsTrendChart, {
  getToneColor,
  type MobileTrendSeries,
} from './MobileStatsTrendChart';
import MobileStatsToolbar, { type StatsRange } from './MobileStatsToolbar';
import statsStyles from '../MobileStatsPage.module.css';

const EMPTY_RANGE: StatsRange = { since: '', until: '' };

export default function MobileStatsActiveTab() {
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [bucket, setBucket] = useState<StatsBucket>('day');
  const [range, setRange] = useState<StatsRange>({ ...EMPTY_RANGE });
  const [quick, setQuick] = useState('');
  const [userInput, setUserInput] = useState('');
  // 触发查询的"提交快照"——避免按键即查
  const [submitted, setSubmitted] = useState<{ since: string; until: string; user: string }>({
    since: '',
    until: '',
    user: '',
  });

  const [active, setActive] = useState<ActiveStats | null>(null);
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

  // 六卡数据：进入 tab 加载一次（与 Sessions 一致；不随筛选变化）
  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    fetchSessionStats()
      .then((env) => {
        if (cancelled) return;
        if (env?.success && env.data) setStats(env.data);
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setStatsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const loadActive = useCallback(async () => {
    setLoading(true);
    setError('');
    const env = await fetchActiveStats({
      bucket,
      since: dateToTs(submitted.since, false, bucket),
      until: dateToTs(submitted.until, true, bucket),
      user: submitted.user,
    }).catch((e: unknown) => {
      console.error('fetchActiveStats failed', e);
      return null;
    });
    if (env?.success && env.data) setActive(env.data);
    else {
      setActive(null);
      setError(env?.error || '加载失败');
    }
    setLoading(false);
  }, [bucket, submitted.since, submitted.until, submitted.user]);

  useEffect(() => { void loadActive(); }, [loadActive]);

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
    if (!active) return [];
    return [
      { name: '用户数', tone: 'primary' as const },
      { name: '会话数', tone: 'accent' as const },
      { name: '消息数', tone: 'warn' as const },
    ];
  }, [active]);

  const trendSeries = useMemo<MobileTrendSeries[]>(() => {
    if (!active) return [];
    const all: MobileTrendSeries[] = [
      { name: '用户数', tone: 'primary', data: active.series.map((s) => s.users) },
      { name: '会话数', tone: 'accent', data: active.series.map((s) => s.sessions) },
      { name: '消息数', tone: 'warn', data: active.series.map((s) => s.messages) },
    ];
    // 过滤已 toggle off（hidden）的系列
    return all.filter((s) => !hiddenSeries.has(s.name));
  }, [active, hiddenSeries]);

  const statCards = useMemo(() => {
    if (!stats) return [];
    const t = stats.total;
    const today = stats.today;
    return [
      { label: '累计用户数', num: t?.users ?? 0, hint: '去重 user_id', tone: 'primary' as const },
      { label: '累计会话数', num: t?.sessions ?? 0, hint: 'session 总数', tone: 'accent' as const },
      { label: '累计消息数', num: t?.messages ?? 0, hint: 'message 总数', tone: 'warn' as const },
      { label: '今日用户数', num: today?.users ?? 0, hint: '今日活跃 user', tone: 'primary' as const },
      { label: '今日会话数', num: today?.sessions ?? 0, hint: '今日 updatedAt', tone: 'accent' as const },
      { label: '今日消息数', num: today?.messages ?? 0, hint: '今日消息总数', tone: 'warn' as const },
    ];
  }, [stats]);

  const numClassFor = (tone: 'primary' | 'accent' | 'warn'): string => {
    if (tone === 'primary') return statsStyles.metricNumPrimary;
    if (tone === 'accent') return statsStyles.metricNumAccent;
    return statsStyles.metricNumWarn;
  };

  return (
    <section className={statsStyles.section} aria-label="活跃数据">
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
        onRefresh={() => void loadActive()}
      />

      {/* ────────── 概览六卡 ────────── */}
      <div className={statsStyles.metricGrid}>
        {statsLoading && !stats ? (
          <SkeletonStack rows={3} />
        ) : (
          statCards.map((s) => (
            <div key={s.label} className={statsStyles.metricCard}>
              <div className={statsStyles.metricHead}>
                <span>{s.label}</span>
              </div>
              <span className={`${statsStyles.metricNum} ${numClassFor(s.tone)}`}>{fmtInt(s.num)}</span>
              <span className={statsStyles.metricHint}>{s.hint}</span>
            </div>
          ))
        )}
      </div>

      {error && <Notice tone="danger" title="加载失败">{error}</Notice>}

      {/* ────────── 趋势图 ────────── */}
      <div className={statsStyles.card}>
        <div className={statsStyles.cardHead}>
          <h3 className={statsStyles.cardTitle}>活跃趋势</h3>
          <div className={statsStyles.chartLegendRow}>
            {allSeriesMeta.map((s) => {
              const hidden = hiddenSeries.has(s.name);
              return (
                <button
                  key={s.name}
                  type="button"
                  className={`${statsStyles.legendChip} ${hidden ? statsStyles.legendChipHidden : ''}`}
                  onClick={() => toggleSeries(s.name)}
                  aria-pressed={!hidden}
                >
                  <span className={statsStyles.legendDot} style={{ background: getToneColor(s.tone) }} />
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>
        <div className={statsStyles.cardBody}>
          {loading ? (
            <SkeletonStack rows={4} />
          ) : !active || active.series.length === 0 ? (
            <Notice tone="info">所选范围内暂无活跃数据。</Notice>
          ) : (
            <MobileStatsTrendChart
              buckets={active.buckets}
              series={trendSeries}
              kind="line"
              valueFormatter={(v) => v.toLocaleString('zh-CN')}
            />
          )}
        </div>
      </div>
    </section>
  );
}
