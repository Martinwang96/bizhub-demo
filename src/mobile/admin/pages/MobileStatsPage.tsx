/**
 * MobileStatsPage — 移动端「数据统计」单列版
 *
 * 与 PC StatsPage 完全同源：复用 fetchTokenStats / fetchLatencyStats，hash 路由（#token / #latency）
 * 切换两个子板块。视觉上借鉴 /Users/martinwang/Downloads/数据统计-dashboard 的紧凑卡片化布局，
 * 但 token / 间距 / 阴影 / 控件全部映射到项目 design tokens，与 OpsPage / SessionsPage 一致。
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Me } from '@shared/types/user';
import MobileStatsHeader from './parts/MobileStatsHeader';
import MobileStatsTabs, { type StatsTabKey } from './parts/MobileStatsTabs';
import MobileStatsTokenTab from './parts/MobileStatsTokenTab';
import MobileStatsLatencyTab from './parts/MobileStatsLatencyTab';
import MobileStatsActiveTab from './parts/MobileStatsActiveTab';
import MobileAdminNavDrawer, { MobileAdminNavTrigger } from './parts/MobileAdminNavDrawer';
import styles from './MobileStatsPage.module.css';

/** 解析 URL hash → tab key（默认 token，与 PC 版 STATS_TABS[0] 对齐）。 */
function parseHashTab(hash: string): StatsTabKey {
  const stripped = hash.replace(/^#/, '');
  if (stripped === 'latency') return 'latency';
  if (stripped === 'active') return 'active';
  return 'token';
}

interface MobileStatsPageProps {
  me?: Me | null;
}

export default function MobileStatsPage({ me }: MobileStatsPageProps = {}) {
  const location = useLocation();
  const navigate = useNavigate();

  const [tab, setTab] = useState<StatsTabKey>(() => parseHashTab(location.hash));
  const [navOpen, setNavOpen] = useState(false);
  /** 子 tab 触发的「整体刷新」时戳；通过 key 重挂载子组件，触发其内部 fetch。 */
  const [refreshSeq, setRefreshSeq] = useState(0);
  /** 显式 refreshing 态（仅短暂高亮 header 按钮，避免与子 tab 内部 loading 状态冲突） */
  const [refreshing, setRefreshing] = useState(false);

  // hash → tab 双向同步
  useEffect(() => {
    const next = parseHashTab(location.hash);
    setTab((cur) => (cur === next ? cur : next));
  }, [location.hash]);

  const handleTabChange = (next: StatsTabKey) => {
    if (next === tab) return;
    setTab(next);
    navigate(`${location.pathname}#${next}`, { replace: false });
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setRefreshSeq((s) => s + 1);
    // 视觉反馈 ~ 600ms（子组件自身 loading 态接管真实数据）
    window.setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <>
      <MobileStatsHeader
        me={me}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        leading={<MobileAdminNavTrigger onClick={() => setNavOpen(true)} />}
      />
      <MobileStatsTabs active={tab} onChange={handleTabChange} />

      <main className={styles.main} role="main">
        {tab === 'token' && <MobileStatsTokenTab key={`token-${refreshSeq}`} />}
        {tab === 'latency' && <MobileStatsLatencyTab key={`latency-${refreshSeq}`} />}
        {tab === 'active' && <MobileStatsActiveTab key={`active-${refreshSeq}`} />}
      </main>

      <MobileAdminNavDrawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        activeId="stats"
      />
    </>
  );
}
