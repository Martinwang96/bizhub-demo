import ShareModal from '../Chat/ShareModal';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { Icon } from 'tdesign-icons-react';
import { useSessionStore } from '../../store/useSessionStore';
import { useLayoutStore } from '../../store/useLayoutStore';
import { getLatestChartMessage } from '../../utils/chartSelectors';
import { getAllReportArtifacts } from '../../utils/reportSelectors';
import Sidebar from './Sidebar';
import AclDenied from '@shared/components/feedback/AclDenied/AclDenied';
import Watermark from '@shared/components/content/Watermark';
import { IconTooltip } from '@shared/components';
import styles from './AppShell.module.css';

export interface ShellOutletContext {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean, source?: 'user' | 'auto') => void;
  toggleSidebar: () => void;
  isMobile: boolean;
  onShareOpen: () => void;
  shareOpen: boolean;
  chartPaneOpen: boolean;
  toggleChartPane: () => void;
  hasLatestChart: boolean;
}

const STORAGE_KEY = 'biz-hub:sidebar-open';
const MOBILE_BREAKPOINT = 900;

function AppShellShareModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const messages = useSessionStore((s) => s.messagesBySid[sessionId] ?? []);
  return <ShareModal sessionId={sessionId} messages={messages} onClose={onClose} />;
}

export default function AppShell() {
  const bootstrap = useSessionStore((s) => s.bootstrap);
  const authorized = useSessionStore((s) => s.authorized);
  const authError = useSessionStore((s) => s.authError);
  const user = useSessionStore((s) => s.user);
  const shareEnabled = useSessionStore((s) => s.shareEnabled);

  const navigate = useNavigate();

  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT,
  );
  const [sidebarOpenState, setSidebarOpenState] = useState(() => {
    if (typeof window === 'undefined') return true;
    if (window.innerWidth <= MOBILE_BREAKPOINT) return false;
    return localStorage.getItem(STORAGE_KEY) !== '0';
  });
  const [shareOpen, setShareOpen] = useState(false);

  const location = useLocation();
  const chatMatch = useMatch('/c/:sessionId');
  // 报表详情页：顶栏左侧用「返回」按钮取代 BIZ-HUB 品牌字样，点击回到报表列表
  const reportDetailMatch = useMatch('/reports/:reportId');
  const isReportDetail = !!reportDetailMatch;
  const isHome = location.pathname === '/';
  const sessionId = chatMatch?.params.sessionId ?? '';
  const messages = useSessionStore((s) => s.messagesBySid[sessionId] ?? []);
  const latestChart = useMemo(() => getLatestChartMessage(messages), [messages]);
  const hasLatestChart = !!latestChart;
  // 会话中是否存在看板（run_code）产物：决定顶栏是否显示「看板区」切换按钮，
  // 让用户在手动关闭看板区后仍能重新打开。
  const hasReport = useMemo(() => getAllReportArtifacts(messages).length > 0, [messages]);
  const chartPaneOpen = useLayoutStore((s) => sessionId ? (s.chartPaneOpenBySid[sessionId] ?? false) : false);
  const toggleChartPaneInStore = useLayoutStore((s) => s.toggleChartPane);
  const setChartPaneOpen = useLayoutStore((s) => s.setChartPaneOpen);
  const reportPaneOpen = useLayoutStore((s) => sessionId ? (s.reportPaneOpenBySid[sessionId] ?? false) : false);
  const setReportPaneOpen = useLayoutStore((s) => s.setReportPaneOpen);
  const rightPaneOpen = chartPaneOpen || reportPaneOpen;
  const canToggleRightPane = !!sessionId && (hasLatestChart || hasReport);

  useEffect(() => {
    setShareOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      if (e.matches) setSidebarOpenState(false);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (isMobile) setSidebarOpenState(false);
  }, [location.pathname, isMobile]);

  // 移动端：打开侧边栏时自动收起图表区/看板区，避免抽屉浮在 sidebar/scrim 之上造成层级混乱。
  // 桌面端：sidebar 与右侧栏是并排栅格关系，互不影响，跳过。
  useEffect(() => {
    if (!isMobile) return;
    if (!sidebarOpenState) return;
    if (!sessionId) return;
    if (chartPaneOpen) setChartPaneOpen(sessionId, false);
    if (reportPaneOpen) setReportPaneOpen(sessionId, false);
  }, [isMobile, sidebarOpenState, sessionId, chartPaneOpen, setChartPaneOpen, reportPaneOpen, setReportPaneOpen]);

  // 移动端：分享面板打开时同步收起侧边栏与图表区/看板区，让分享对话框成为唯一前景。
  useEffect(() => {
    if (!shareOpen) return;
    if (!isMobile) return;
    if (sidebarOpenState) setSidebarOpenState(false);
    if (sessionId && chartPaneOpen) setChartPaneOpen(sessionId, false);
    if (sessionId && reportPaneOpen) setReportPaneOpen(sessionId, false);
  }, [shareOpen, isMobile, sidebarOpenState, sessionId, chartPaneOpen, setChartPaneOpen, reportPaneOpen, setReportPaneOpen]);

  useEffect(() => {
    if (!isMobile) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sidebarOpenState) setSidebarOpenState(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isMobile, sidebarOpenState]);

  const setSidebarOpen = useCallback((open: boolean) => {
    setSidebarOpenState(open);
    localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(!sidebarOpenState);
  }, [setSidebarOpen, sidebarOpenState]);

  const handleShareOpen = useCallback(() => setShareOpen(true), []);
  const handleShareClose = useCallback(() => setShareOpen(false), []);
  const handleGoHome = useCallback(() => {
    if (!isHome) navigate('/');
  }, [isHome, navigate]);
  const handleToggleChartPane = useCallback(() => {
    if (sessionId && hasLatestChart) toggleChartPaneInStore(sessionId);
  }, [hasLatestChart, sessionId, toggleChartPaneInStore]);
  // 顶栏「图表 / 报表区」总开关：已展开则收起；未展开则优先打开报表区（有报表产物时），否则打开图表区。
  const handleToggleRightPane = useCallback(() => {
    if (!sessionId) return;
    if (rightPaneOpen) {
      setChartPaneOpen(sessionId, false);
      setReportPaneOpen(sessionId, false);
      return;
    }
    if (hasReport) setReportPaneOpen(sessionId, true);
    else if (hasLatestChart) setChartPaneOpen(sessionId, true);
  }, [sessionId, rightPaneOpen, hasReport, hasLatestChart, setChartPaneOpen, setReportPaneOpen]);

  const outletContext: ShellOutletContext = useMemo(() => ({
    sidebarOpen: sidebarOpenState,
    setSidebarOpen,
    toggleSidebar,
    isMobile,
    onShareOpen: handleShareOpen,
    shareOpen,
    chartPaneOpen,
    toggleChartPane: handleToggleChartPane,
    hasLatestChart,
  }), [sidebarOpenState, setSidebarOpen, toggleSidebar, isMobile, handleShareOpen, shareOpen, chartPaneOpen, handleToggleChartPane, hasLatestChart]);

  if (!authorized) {
    return (
      <div className={styles.shell} aria-hidden="true">
        <Sidebar sidebarOpen={sidebarOpenState} onToggle={toggleSidebar} />
        <main className={styles.main}>
          <div className={`${styles.topbar} ${styles.topbarHome}`}>
            <span className={styles.topBrand}>BIZ-HUB</span>
          </div>
        </main>
        <AclDenied
          authError={authError}
          loginName={user?.loginName}
          admins={user?.admins}
        />
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      {user && <Watermark text={user.loginName} />}

      <Sidebar sidebarOpen={sidebarOpenState} onToggle={toggleSidebar} />

      {isMobile && sidebarOpenState && (
        <div className={styles.scrimVisible + ' ' + styles.scrim} onClick={toggleSidebar} />
      )}

      <main className={styles.main}>
        <div className={`${styles.topbar} ${isHome ? styles.topbarHome : ''}`}>
          {isMobile && (
            <button
              type="button"
              className={styles.menuBtn}
              onClick={toggleSidebar}
              aria-label={sidebarOpenState ? '关闭侧边栏' : '打开侧边栏'}
              aria-expanded={sidebarOpenState}
              title={sidebarOpenState ? '关闭侧边栏' : '打开侧边栏'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </svg>
            </button>
          )}
          {isReportDetail ? (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => navigate('/reports')}
              aria-label="返回报表列表"
              title="返回报表列表"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          ) : (
            <span className={styles.topBrand}>BIZ-HUB</span>
          )}
          <div className={styles.topActions}>
            {(user?.adminConsoleRole === 'admin' || (user?.skillHubRoles ?? []).some((r) => r === 'user' || r === 'approval')) && (
              <IconTooltip content="技能管理">
                <a
                  href="/skill-hub"
                  className={styles.iconBtn}
                  aria-label="技能管理"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                  </svg>
                </a>
              </IconTooltip>
            )}
            {(user?.adminConsoleRole === 'admin' || user?.adminConsoleRole === 'readonly') && (
              <IconTooltip content="管理后台">
                <a
                  href="/admin"
                  className={styles.iconBtn}
                  aria-label="管理后台"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </a>
              </IconTooltip>
            )}
            {sessionId && (
              <IconTooltip content={rightPaneOpen ? '收起图表 / 报表区' : '打开图表 / 报表区'}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={handleToggleRightPane}
                  disabled={!canToggleRightPane}
                  aria-label="图表 / 报表区"
                  aria-pressed={rightPaneOpen}
                >
                  <Icon name="chart-bar" style={{ fontSize: 18 }} />
                </button>
              </IconTooltip>
            )}
            {shareEnabled && sessionId && (
              <IconTooltip content="分享对话">
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={handleShareOpen}
                  aria-label="分享对话"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <path d="M8.7 10.6l6.6-3.8M8.7 13.4l6.6 3.8" />
                  </svg>
                </button>
              </IconTooltip>
            )}
            <IconTooltip content={isHome ? '当前在首页' : '返回首页'}>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={handleGoHome}
                disabled={isHome}
                aria-label={isHome ? '当前在首页' : '返回首页'}
                tabIndex={isHome ? -1 : 0}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 11l9-8 9 8" />
                  <path d="M5 10v10h14V10" />
                </svg>
              </button>
            </IconTooltip>
          </div>
        </div>
        <Outlet context={outletContext} />
      </main>

      {shareOpen && sessionId && (
        <AppShellShareModal sessionId={sessionId} onClose={handleShareClose} />
      )}
    </div>
  );
}
