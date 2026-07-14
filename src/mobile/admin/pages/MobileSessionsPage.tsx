/**
 * MobileSessionsPage — 移动端「Session 查询」单列版
 *
 * 与 PC 版 SessionsPage 共享同一组 admin api（fetchSessionStats / fetchSessions /
 * fetchSessionDetail），仅渲染层重做：
 *  - MobileSessionsHeader（sticky，右上 ghost「刷新」按钮）
 *  - MobileSessionsStatsCards（双大卡：累计 / 今日；每卡内三栏 messages/users/sessions）
 *  - MobileSessionsFilterBar（user/sessionId/keyword + 日期 + 4 chip + 查询/重置）
 *  - MobileSessionCard 列表（标题、状态徽标、用户、SID 截断、消息数、更新时间）
 *  - MobileAdminNavDrawer（左侧抽屉导航；触发器嵌入 Header leading 槽）
 *  - MobileRightDrawer + MobileSessionDetailContent（chat stream 三种气泡）
 */
import { useCallback, useEffect, useState } from 'react';
import { Notice, SkeletonStack, useToast } from '@shared/components';
import type { Me } from '@shared/types/user';
import {
  fetchSessions,
  fetchSessionStats,
  fetchSessionDetail,
} from '../../../admin/api/adminConsole';
import type { SessionItem, SessionStats } from '../../../admin/api/adminConsole';
import MobileRightDrawer from '../../shared/MobileRightDrawer';
import MobilePagination from '../../shared/MobilePagination';
import MobileSessionsHeader from './parts/MobileSessionsHeader';
import MobileAdminNavDrawer, { MobileAdminNavTrigger } from './parts/MobileAdminNavDrawer';
import MobileSessionsStatsCards from './parts/MobileSessionsStatsCards';
import MobileSessionsFilterBar, { type SessionsFilterState } from './parts/MobileSessionsFilterBar';
import MobileSessionDetailContent, {
  type SessionDetailData,
} from './parts/MobileSessionDetailContent';
import { mapRiskLevel, riskLevelLabel } from './parts/sessionRisk';
import { applyQuickRange, dateToTs } from '../../../admin/utils/dateRange';
import styles from './MobileSessionsPage.module.css';

const EMPTY_FILTER: SessionsFilterState = {
  user: '',
  session_id: '',
  keyword: '',
  since: '',
  until: '',
};

function fmtTime(ts?: number): string {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false });
}

function fmtTimeShort(ts?: number): string {
  if (!ts) return '-';
  const d = new Date(ts * 1000);
  const z = (n: number) => String(n).padStart(2, '0');
  // MM-DD HH:mm
  return `${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
}

function shortSid(sid: string): string {
  if (!sid) return '-';
  if (sid.length <= 12) return sid;
  return `${sid.slice(0, 8)}…${sid.slice(-4)}`;
}

/** 标题最多透出 8 个字符（按 codePoint 计数，避免破坏 emoji/代理对），超出加省略号。 */
function truncateTitle(s: string, max = 8): string {
  if (!s) return '';
  const arr = Array.from(s);
  if (arr.length <= max) return s;
  return arr.slice(0, max).join('') + '…';
}

interface MobileSessionsPageProps {
  me?: Me | null;
}

export default function MobileSessionsPage({ me }: MobileSessionsPageProps = {}) {
  const toast = useToast();

  const PAGE_SIZE = 10;

  const [stats, setStats] = useState<SessionStats | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<SessionsFilterState>({ ...EMPTY_FILTER });
  const [quick, setQuick] = useState('');

  const [detail, setDetail] = useState<SessionDetailData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  // load 接受目标页码（默认 1），后端 cursor=(page-1)*PAGE_SIZE，limit=PAGE_SIZE
  // stats 仅在第一页（或显式刷新）时拉取，翻页只切 sessions 列表
  const load = useCallback(
    async (targetPage = 1, opts: { withStats?: boolean } = {}) => {
      const withStats = opts.withStats ?? targetPage === 1;
      setLoading(true);
      setError('');
      try {
        const sessionsPromise = fetchSessions({
          user: filter.user,
          session_id: filter.session_id,
          keyword: filter.keyword,
          since: dateToTs(filter.since),
          until: dateToTs(filter.until, true),
          cursor: (targetPage - 1) * PAGE_SIZE,
          limit: PAGE_SIZE,
        }).catch(() => null);
        const statsPromise = withStats ? fetchSessionStats().catch(() => null) : Promise.resolve(null);
        const [statsEnv, sessionsEnv] = await Promise.all([statsPromise, sessionsPromise]);
        if (statsEnv?.success && statsEnv.data) setStats(statsEnv.data);
        if (sessionsEnv?.success && sessionsEnv.data) {
          setSessions(sessionsEnv.data.items ?? []);
          setTotal(sessionsEnv.data.total ?? 0);
          setPage(targetPage);
        } else {
          setError(sessionsEnv?.error ?? '加载失败');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        setLoading(false);
      }
    },
    [filter],
  );

  useEffect(() => {
    void load(1, { withStats: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleQuick = (value: string) => {
    setQuick(value);
    setFilter((prev) => ({ ...prev, ...applyQuickRange(value) }));
  };

  const handleReset = () => {
    setFilter({ ...EMPTY_FILTER });
    setQuick('');
  };

  const handlePageChange = (next: number) => {
    if (next === page || loading) return;
    void load(next, { withStats: false });
  };

  const openDetail = async (sid: string) => {
    setDetailOpen(true);
    setDetail({ sessionId: sid, title: '加载中…', messages: [] });
    setDetailLoading(true);
    const env = await fetchSessionDetail(sid).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : '详情加载失败');
      return null;
    });
    setDetailLoading(false);
    if (env?.success) {
      setDetail(env.data as SessionDetailData);
    } else if (env) {
      toast.error(env.error ?? '详情加载失败');
      setDetail(null);
    }
  };

  const closeDetail = () => {
    setDetailOpen(false);
  };

  const detailLevel = mapRiskLevel(detail?.riskTags);
  const detailLevelClass =
    detailLevel === 'critical' ? styles.badgeCritical
    : detailLevel === 'attention' ? styles.badgeAttention
    : styles.badgeNormal;

  const drawerMeta = detail ? (
    <>
      <span className={styles.metaItem}>用户：{detail.user || '-'}</span>
      <code className={styles.metaCode} title={detail.sessionId || ''}>
        {detail.sessionId || '-'}
      </code>
      <span className={styles.metaItem}>更新：{fmtTime(detail.updatedAt)}</span>
      <span className={`${styles.metaBadge} ${detailLevelClass}`}>{riskLevelLabel(detailLevel)}</span>
    </>
  ) : null;

  return (
    <>
      <MobileSessionsHeader
        me={me}
        onRefresh={() => void load(1, { withStats: true })}
        refreshing={loading}
        leading={<MobileAdminNavTrigger onClick={() => setNavOpen(true)} />}
      />

      <main className={styles.main} role="main">
        {error && (
          <Notice tone="danger" title="加载失败">{error}</Notice>
        )}

        <MobileSessionsStatsCards stats={stats} loading={loading} />

        <MobileSessionsFilterBar
          filter={filter}
          setFilter={setFilter}
          quick={quick}
          onQuickChange={handleQuick}
          onSubmit={() => void load(1, { withStats: false })}
          onReset={handleReset}
          loading={loading}
        />

        <section className={styles.listCard} aria-label="会话列表">
          <header className={styles.listCardHead}>
            <div className={styles.listCardHeadLeft}>
              <h2 className={styles.listCardTitle}>会话列表</h2>
              {!loading && total > 0 && (
                <span className={styles.listCardMeta}>共 {total} 条</span>
              )}
            </div>
            <div className={styles.listCardHeadAction}>
              <MobilePagination
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                onChange={handlePageChange}
                unitLabel="条"
                loading={loading}
                compact
              />
            </div>
          </header>

          {loading && sessions.length === 0 ? (
            <div className={styles.skeletonWrap}>
              <SkeletonStack widths={[80, 92, 70, 86]} />
            </div>
          ) : sessions.length === 0 ? (
            <div className={styles.empty}>未找到匹配的会话，请调整筛选条件。</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.thCenter}>风险</th>
                    <th className={styles.thCenter}>标题</th>
                    <th className={styles.thCenter}>用户</th>
                    <th className={styles.thCenter}>Session</th>
                    <th className={styles.thCenter}>消息</th>
                    <th className={styles.thCenter}>更新</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => {
                    const lvl = mapRiskLevel(s.riskTags);
                    const badgeCls =
                      lvl === 'critical' ? styles.tableBadgeCritical
                      : lvl === 'attention' ? styles.tableBadgeAttention
                      : styles.tableBadgeNormal;
                    const fullTitle = s.title || '新对话';
                    return (
                      <tr
                        key={s.sessionId}
                        onClick={() => openDetail(s.sessionId)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openDetail(s.sessionId);
                          }
                        }}
                      >
                        <td className={styles.cellRisk}>
                          <span className={`${styles.tableBadge} ${badgeCls}`}>{riskLevelLabel(lvl)}</span>
                        </td>
                        <td className={styles.cellTitle} title={fullTitle}>{truncateTitle(fullTitle, 8)}</td>
                        <td className={styles.cellUser} title={s.user}>{s.user || '-'}</td>
                        <td className={styles.cellMono} title={s.sessionId}>{shortSid(s.sessionId)}</td>
                        <td className={`${styles.num} ${styles.cellNum}`}>{s.messageCount}</td>
                        <td className={styles.cellMuted} title={fmtTime(s.updatedAt)}>{fmtTimeShort(s.updatedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <MobileAdminNavDrawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        activeId="sessions"
      />

      <MobileRightDrawer
        open={detailOpen}
        title={detail?.title || '会话详情'}
        meta={drawerMeta}
        onClose={closeDetail}
      >
        <MobileSessionDetailContent detail={detail} loading={detailLoading} />
      </MobileRightDrawer>
    </>
  );
}
