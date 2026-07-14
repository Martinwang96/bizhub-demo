/**
 * StatsActiveTab — 数据统计 · 活跃数据板块。
 *
 * 上方复用 Sessions 六张卡（累计 用户/会话/消息 + 今日 用户/会话/消息），数据来自
 * `fetchSessionStats()`，与 Sessions 页严格同口径。
 *
 * 下方按粒度（天/周/月）展示用户数 / 会话数 / 消息数趋势，数据来自 `fetchActiveStats()`。
 * 顶部筛选区接入共享 `StatsToolbar`：粒度 · 日期范围（mode 跟随粒度） · 日期快捷 · 用户筛选 + 筛选 · 刷新。
 * 用户筛选与 latency / token tab 同口径（子串匹配，大小写不敏感）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Notice, SkeletonStack, useToast } from '@shared/components';
import { fetchSessionStats } from '../api/adminConsole';
import type { SessionStats } from '../api/adminConsole';
import { fetchActiveStats, type ActiveStats, type StatsBucket } from '../api/stats';
import StatsTrendChart, { type TrendSeries } from './StatsTrendChart';
import { fmtInt } from './StatsControls';
import StatsToolbar, { type StatsRange } from './StatsToolbar';
import { dateToTs } from '../utils/dateRange';
import sessionStyles from './SessionsPage.module.css';
import styles from './StatsPage.module.css';

const EMPTY_RANGE: StatsRange = { since: '', until: '' };

export default function StatsActiveTab() {
  const toast = useToast();

  const [stats, setStats] = useState<SessionStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [bucket, setBucket] = useState<StatsBucket>('day');
  const [range, setRange] = useState<StatsRange>({ ...EMPTY_RANGE });
  const [quick, setQuick] = useState('');
  const [userInput, setUserInput] = useState('');
  // 触发查询的"提交快照"——避免范围输入框每次按键都打接口
  const [submitted, setSubmitted] = useState<{ since: string; until: string; user: string }>({
    since: '',
    until: '',
    user: '',
  });

  const [active, setActive] = useState<ActiveStats | null>(null);
  const [activeLoading, setActiveLoading] = useState(true);
  const [activeError, setActiveError] = useState('');

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
    setActiveLoading(true);
    setActiveError('');
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
      setActiveError(env?.error || '加载失败');
    }
    setActiveLoading(false);
  }, [bucket, submitted.since, submitted.until, submitted.user]);

  useEffect(() => { void loadActive(); }, [loadActive]);

  const handleSubmit = useCallback(() => {
    // 校验时按当前 bucket 对齐，避免 mode='month' 选 [4月,4月] 因右端=月初而误判 since>until
    const since = dateToTs(range.since, false, bucket);
    const until = dateToTs(range.until, true, bucket);
    if (since && until && since > until) {
      toast.error('「开始日期」不能晚于「结束日期」，请检查筛选');
      return;
    }
    setSubmitted({ since: range.since, until: range.until, user: userInput.trim() });
  }, [range.since, range.until, userInput, toast, bucket]);

  const trendSeries = useMemo<TrendSeries[]>(() => {
    if (!active) return [];
    return [
      { name: '用户数', tone: 'primary', data: active.series.map((s) => s.users) },
      { name: '会话数', tone: 'accent', data: active.series.map((s) => s.sessions) },
      { name: '消息数', tone: 'warn', data: active.series.map((s) => s.messages) },
    ];
  }, [active]);

  const statCards = useMemo(() => {
    if (!stats) return [];
    const t = stats.total;
    const today = stats.today;
    return [
      { label: '累计用户数', num: t?.users ?? 0, hint: '去重 user_id', warn: false },
      { label: '累计会话数', num: t?.sessions ?? 0, hint: 'session 总数', warn: false },
      { label: '累计消息数', num: t?.messages ?? 0, hint: 'message 总数', warn: false },
      { label: '今日用户数', num: today?.users ?? 0, hint: '今日活跃 user', warn: true },
      { label: '今日会话数', num: today?.sessions ?? 0, hint: '今日累计 updatedAt', warn: true },
      { label: '今日消息数', num: today?.messages ?? 0, hint: '今日消息总数', warn: true },
    ];
  }, [stats]);

  return (
    <>
      {/* 顶部筛选 toolbar（共享）—— 与耗时 / Token Tab 顺序一致：toolbar 在卡片之上 */}
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
        onRefresh={() => void loadActive()}
      />

      {/* 概览六卡：复用 Sessions 同款样式 */}
      <div className={sessionStyles.statsRow}>
        {statsLoading && !stats ? (
          <SkeletonStack widths={[60, 60, 60, 60, 60, 60]} />
        ) : (
          statCards.map((s) => (
            <div
              key={s.label}
              className={s.warn ? `${sessionStyles.statCard} ${sessionStyles.statCardWarn}` : sessionStyles.statCard}
            >
              <span className={sessionStyles.statLabel}>{s.label}</span>
              <span className={sessionStyles.statNum}>{fmtInt(s.num)}</span>
              <span className={sessionStyles.statHint}>{s.hint}</span>
            </div>
          ))
        )}
      </div>

      {activeError && <Notice tone="danger" title="加载失败">{activeError}</Notice>}

      {/* 趋势图 */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>活跃趋势（用户 / 会话 / 消息）</h2>
          <span className={styles.muted}>按 {bucket === 'day' ? '天' : bucket === 'week' ? '周' : '月'} 聚合</span>
        </div>
        {activeLoading ? (
          <SkeletonStack rows={5} />
        ) : !active || active.series.length === 0 ? (
          <Notice tone="info">所选范围内暂无活跃数据。</Notice>
        ) : (
          <StatsTrendChart
            buckets={active.buckets}
            series={trendSeries}
            kind="line"
            valueFormatter={(v) => v.toLocaleString('zh-CN')}
          />
        )}
      </div>
    </>
  );
}
