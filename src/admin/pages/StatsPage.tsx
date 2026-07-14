/**
 * StatsPage — 数据统计（管理后台子页面）
 *
 * 两个独立板块（由左侧边栏二级菜单切换，URL hash 联动，刷新保持）：
 *  - token 消耗：按 user / session / 模型，按天/周/月统计 token 消耗
 *  - 查询耗时：按 per-request 端到端耗时，按天/周/月统计 平均/最大/最小
 *
 * 视觉对齐根目录 DESIGN.md（Management Surface）+ 现有 admin 页面（OpsPage/DataAclPage）。
 */
import { useEffect, useMemo } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import type { AdminOutletContext } from '../components/AdminShell';
import StatsTokenTab from './StatsTokenTab';
import StatsLatencyTab from './StatsLatencyTab';
import StatsActiveTab from './StatsActiveTab';
import styles from './StatsPage.module.css';

type StatsTabKey = 'token' | 'latency' | 'active';

const STATS_TAB_KEYS = new Set<StatsTabKey>(['token', 'latency', 'active']);

function pickTabFromHash(rawHash: string): StatsTabKey {
  const raw = rawHash.replace(/^#/, '').trim() as StatsTabKey;
  return STATS_TAB_KEYS.has(raw) ? raw : 'token';
}

export default function StatsPage() {
  const { setTopbar } = useOutletContext<AdminOutletContext>();
  const location = useLocation();

  const activeTab = useMemo<StatsTabKey>(() => pickTabFromHash(location.hash), [location.hash]);

  useEffect(() => {
    setTopbar({
      title: '数据统计',
      description: '观测 token 消耗、查询耗时与活跃数据，按时间、用户、会话和模型维度统计。',
    });
    return () => setTopbar(null);
  }, [setTopbar]);

  return (
    <div className={styles.page}>
      {activeTab === 'token' && <StatsTokenTab />}
      {activeTab === 'latency' && <StatsLatencyTab />}
      {activeTab === 'active' && <StatsActiveTab />}
    </div>
  );
}
