/**
 * SessionsPage — 会话查询：stats 卡 + 筛选 + 列表 + 详情 Modal。
 */
import { useEffect, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import {
  buildSessionsExportUrl,
  fetchSessions,
  fetchSessionStats,
} from '../api/adminConsole';
import type { SessionItem, SessionStats } from '../api/adminConsole';
import { DatePicker, Notice, SelectInput, SkeletonStack, useToast } from '@shared/components';
import type { AdminOutletContext } from '../components/AdminShell';
import { applyQuickRange, dateToTs, QUICK_RANGE_OPTIONS } from '../utils/dateRange';
import SessionDetailModal, { fmtTime, useSessionDetail } from './SessionDetailModal';
import styles from './SessionsPage.module.css';

const EMPTY_FILTER = { user: '', session_id: '', keyword: '', since: '', until: '' };
const SESSION_QUICK_OPTIONS = QUICK_RANGE_OPTIONS.map((item) => (
  item.value === '' ? { ...item, label: '请选择' } : item
));

export default function SessionsPage() {
  const { me, setTopbar } = useOutletContext<AdminOutletContext>();
  const toast = useToast();

  const isAdmin = me?.adminConsoleRole === 'admin';

  const [stats, setStats] = useState<SessionStats | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState({ ...EMPTY_FILTER });
  const [quick, setQuick] = useState('');

  const { detail, loading: detailLoading, openDetail, closeDetail } = useSessionDetail();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [statsEnv, sessionsEnv] = await Promise.all([
        fetchSessionStats().catch(() => null),
        fetchSessions({
          user: filter.user,
          session_id: filter.session_id,
          keyword: filter.keyword,
          since: dateToTs(filter.since),
          until: dateToTs(filter.until, true),
          limit: 50,
        }).catch(() => null),
      ]);
      if (statsEnv?.success && statsEnv.data) setStats(statsEnv.data);
      if (sessionsEnv?.success && sessionsEnv.data) setSessions(sessionsEnv.data.items ?? []);
      else setError(sessionsEnv?.error ?? '加载失败');
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    setTopbar({
      title: 'Session 查询',
      description: '跨用户查询会话并查看脱敏后的安全投影详情。',
      actions: (
        <button type="button" className={styles.btnGhost} onClick={() => void load()}>刷新</button>
      ),
    });
    return () => setTopbar(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setTopbar]);

  const handleQuick = (value: string) => {
    setQuick(value);
    setFilter((prev) => ({ ...prev, ...applyQuickRange(value) }));
  };

  const handleReset = () => {
    setFilter({ ...EMPTY_FILTER });
    setQuick('');
  };

  const handleExport = () => {
    const since = dateToTs(filter.since);
    const until = dateToTs(filter.until, true);
    if (since && until && since > until) {
      toast.error('「更新自」不能晚于「至」，请检查筛选日期');
      return;
    }
    const url = buildSessionsExportUrl({
      user: filter.user || undefined,
      session_id: filter.session_id || undefined,
      keyword: filter.keyword || undefined,
      since,
      until,
    });
    // 直接走浏览器原生下载，cookie 自动携带满足 admin 鉴权
    window.location.assign(url);
  };

  // 深链：?session_id= 自动定位会话详情
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const sid = searchParams.get('session_id');
    if (!sid) return;
    setFilter((prev) => ({ ...prev, session_id: sid }));
    void openDetail(sid);
    const next = new URLSearchParams(searchParams);
    next.delete('session_id');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <div className={styles.page}>
      {error && <Notice tone="danger" title="加载失败">{error}</Notice>}

      <div className={styles.statsRow}>
        {statCards.map((s) => (
          <div key={s.label} className={s.warn ? `${styles.statCard} ${styles.statCardWarn}` : styles.statCard}>
            <span className={styles.statLabel}>{s.label}</span>
            <span className={styles.statNum}>{s.num}</span>
            <span className={styles.statHint}>{s.hint}</span>
          </div>
        ))}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>会话筛选</h3>
        </div>

        <div className={styles.filterBar}>
          <div className={`${styles.filterField} ${styles.fieldText}`}>
            <label className={styles.filterLabel}>用户名</label>
            <input className={styles.input} value={filter.user}
              onChange={(e) => setFilter({ ...filter, user: e.target.value })} />
          </div>
          <div className={`${styles.filterField} ${styles.fieldText}`}>
            <label className={styles.filterLabel}>Session ID</label>
            <input className={styles.input} value={filter.session_id}
              onChange={(e) => setFilter({ ...filter, session_id: e.target.value })} />
          </div>
          <div className={`${styles.filterField} ${styles.fieldText}`}>
            <label className={styles.filterLabel}>标题关键词</label>
            <input className={styles.input} value={filter.keyword}
              onChange={(e) => setFilter({ ...filter, keyword: e.target.value })} />
          </div>
          <div className={`${styles.filterField} ${styles.fieldDate}`}>
            <label className={styles.filterLabel}>更新自</label>
            <DatePicker value={filter.since}
              onChange={(next) => setFilter({ ...filter, since: next })} />
          </div>
          <div className={`${styles.filterField} ${styles.fieldDate}`}>
            <label className={styles.filterLabel}>至</label>
            <DatePicker value={filter.until}
              onChange={(next) => setFilter({ ...filter, until: next })} />
          </div>
          <div className={`${styles.filterField} ${styles.fieldQuick}`}>
            <label className={styles.filterLabel}>日期快捷</label>
            <SelectInput
              value={quick}
              onChange={handleQuick}
              options={SESSION_QUICK_OPTIONS}
            />
          </div>
          <div className={styles.filterActions}>
            <button type="button" className={styles.btnPrimary} onClick={() => void load()}>查询</button>
            <button type="button" className={styles.btnGhost} onClick={handleReset}>重置</button>
            {isAdmin && (
              <button type="button" className={styles.btnGhost} onClick={handleExport}>导出</button>
            )}
          </div>
        </div>

        {loading ? (
          <SkeletonStack widths={[80, 92, 70, 86]} />
        ) : sessions.length === 0 ? (
          <div className={styles.empty}>未找到匹配的会话，请调整筛选条件。</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>用户</th>
                  <th>Session</th>
                  <th>标题</th>
                  <th className={styles.colNum}>消息</th>
                  <th>风险</th>
                  <th>更新时间</th>
                  <th className={styles.colActions}>操作</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.sessionId}>
                    <td>{s.user}</td>
                    <td><code className={styles.code}>{s.sessionId}</code></td>
                    <td className={styles.titleCol}>{s.title || '新对话'}</td>
                    <td className={styles.colNum}>{s.messageCount}</td>
                    <td>
                      {s.riskTags?.length
                        ? s.riskTags.map((r) => (
                            <span key={r} className={`${styles.tag} ${styles.tagWarn}`}>{r}</span>
                          ))
                        : <span className={styles.muted}>—</span>}
                    </td>
                    <td className={styles.tableMeta}>{fmtTime(s.updatedAt)}</td>
                    <td className={styles.colActions}>
                      <button type="button" className={styles.btnGhost} onClick={() => void openDetail(s.sessionId)}>
                        详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SessionDetailModal detail={detail} loading={detailLoading} onClose={closeDetail} />
    </div>
  );
}


