import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PinIcon } from 'tdesign-icons-react';
import BrandLogo from '@shared/components/brand/BrandLogo';
import { useSessionStore } from '../../store/useSessionStore';
import { IconTooltip } from '@shared/components';
import styles from './Sidebar.module.css';
import Tooltip from './Tooltip';

interface Props {
  sidebarOpen: boolean;
  onToggle: () => void;
}

function isToday(ts: number): boolean {
  return new Date(ts * 1000).toDateString() === new Date().toDateString();
}

function isYesterday(ts: number): boolean {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return new Date(ts * 1000).toDateString() === y.toDateString();
}

// ─ SVG Icons ─
const IconCompose = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

const IconHistory = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

const IconReport = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="9" rx="1"/>
    <rect x="14" y="3" width="7" height="5" rx="1"/>
    <rect x="14" y="12" width="7" height="9" rx="1"/>
    <rect x="3" y="16" width="7" height="5" rx="1"/>
  </svg>
);

const IconChevronLeft = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

const IconChevronDown = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

// 图钉图标：filled 表示已置顶，outline 表示未置顶
const IconPin = ({ filled }: { filled: boolean }) => (
  <PinIcon
    fillColor={filled ? 'currentColor' : 'transparent'}
    strokeColor="currentColor"
    strokeWidth={1.5}
  />
);

function Sidebar({ sidebarOpen, onToggle }: Props) {
  const navigate = useNavigate();
  const { sessionId: activeSid } = useParams<{ sessionId?: string }>();
  const location = useLocation();
  const onReports = location.pathname === '/reports';

  const sessions = useSessionStore((s) => s.sessions);
  const user = useSessionStore((s) => s.user);
  const modelInfo = useSessionStore((s) => s.modelInfo);
  const removeSession = useSessionStore((s) => s.removeSession);
  const pinSession = useSessionStore((s) => s.pinSession);

  const [historyOpen, setHistoryOpen] = useState(true);

  // 软删除 + Undo：pendingUndo 保存待撤销的 session，5s 后真正删除
  const [pendingUndo, setPendingUndo] = useState<{ sid: string; title: string } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 执行真正删除
  const commitDelete = useCallback((sid: string) => {
    void removeSession(sid);
    setPendingUndo(null);
    undoTimerRef.current = null;
  }, [removeSession]);

  // 双击确认：第一次点进入 pending，第二次点执行软删除
  const [pendingConfirm, setPendingConfirm] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDelete = useCallback((e: React.MouseEvent | React.KeyboardEvent, sid: string, title: string) => {
    e.stopPropagation();

    if (pendingConfirm === sid) {
      // 第二次点击：确认删除，执行软删除
      if (confirmTimerRef.current !== null) clearTimeout(confirmTimerRef.current);
      setPendingConfirm(null);
      confirmTimerRef.current = null;

      // 如有上一条未提交的软删除，先提交
      if (undoTimerRef.current !== null && pendingUndo) {
        clearTimeout(undoTimerRef.current);
        void removeSession(pendingUndo.sid);
      }

      // 软删除：列表立即过滤，5s 后真正删除
      setPendingUndo({ sid, title });
      undoTimerRef.current = setTimeout(() => {
        commitDelete(sid);
      }, 5000);

      if (activeSid === sid) navigate('/');
    } else {
      // 第一次点击：进入确认态，2.2s 超时自动取消
      if (confirmTimerRef.current !== null) clearTimeout(confirmTimerRef.current);
      setPendingConfirm(sid);
      confirmTimerRef.current = setTimeout(() => {
        setPendingConfirm(null);
        confirmTimerRef.current = null;
      }, 2200);
    }
  }, [pendingConfirm, pendingUndo, removeSession, activeSid, navigate, commitDelete]);

  const handleUndo = useCallback(() => {
    if (undoTimerRef.current !== null) clearTimeout(undoTimerRef.current);
    setPendingUndo(null);
    undoTimerRef.current = null;
  }, []);

  // 组件卸载时提交残余删除
  useEffect(() => {
    return () => {
      if (undoTimerRef.current !== null && pendingUndo) {
        clearTimeout(undoTimerRef.current);
        void removeSession(pendingUndo.sid);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 置顶 / 取消置顶（阻止冒泡，避免触发选中会话）
  const handlePin = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent, sid: string, pinned: boolean) => {
      e.stopPropagation();
      void pinSession(sid, !pinned);
    },
    [pinSession],
  );

  const handleNewChat = useCallback(() => navigate('/'), [navigate]);
  const handleReports = useCallback(() => navigate('/reports'), [navigate]);

  const handleSelectSession = useCallback((sid: string) => {
    navigate(`/c/${sid}`);
  }, [navigate]);

  // A4: rail History icon 展开 sidebar 并确保历史列表展开
  const handleRailHistory = useCallback(() => {
    onToggle();
    setHistoryOpen(true);
  }, [onToggle]);

  // 软删除时从列表过滤掉 pendingUndo 的 session（视觉上立即消失）
  const visibleSessions = sessions.filter((s) => s.sessionId !== pendingUndo?.sid);

  // 置顶组（常用对话）：pinnedAt > 0，按 pinnedAt 降序（最近置顶在前）
  const pinned = visibleSessions
    .filter((s) => (s.pinnedAt ?? 0) > 0)
    .sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0));

  // 其余按时间分组（已置顶的不再出现在时间分组里）
  const groups: { today: typeof sessions; yesterday: typeof sessions; earlier: typeof sessions } = {
    today: [], yesterday: [], earlier: [],
  };
  visibleSessions
    .filter((s) => !((s.pinnedAt ?? 0) > 0))
    .forEach((s) => {
      const t = s.updatedAt || s.createdAt;
      if (isToday(t)) groups.today.push(s);
      else if (isYesterday(t)) groups.yesterday.push(s);
      else groups.earlier.push(s);
    });

  const renderGroup = (label: string, items: typeof sessions) => {
    if (!items.length) return null;
    return (
      <div className={styles.historyGroup}>
        <div className={styles.groupLabel}>{label}</div>
        {items.map((s) => {
          const active = activeSid === s.sessionId;
          const confirming = pendingConfirm === s.sessionId;
          const isPinned = (s.pinnedAt ?? 0) > 0;
          return (
            <button
              key={s.sessionId}
              type="button"
              className={`${styles.historyItem} ${active ? styles.historyItemActive : ''}`}
              onClick={() => handleSelectSession(s.sessionId)}
            >
              <span className={styles.itemTitle}>{s.title || '新对话'}</span>
              <IconTooltip content={isPinned ? '取消置顶' : '置顶到常用对话'} compact>
                <span
                  role="button"
                  tabIndex={0}
                  className={`${styles.pinBtn} ${isPinned ? styles.pinBtnActive : ''}`}
                  onClick={(e) => handlePin(e, s.sessionId, isPinned)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePin(e, s.sessionId, isPinned)}
                  aria-label={isPinned ? '取消置顶此对话' : '置顶此对话'}
                >
                  <IconPin filled={isPinned} />
                </span>
              </IconTooltip>
              {confirming ? (
                <span
                  role="button"
                  tabIndex={0}
                  className={`${styles.deleteBtn} ${styles.deleteBtnConfirming}`}
                  onClick={(e) => handleDelete(e, s.sessionId, s.title || '新对话')}
                  onKeyDown={(e) => e.key === 'Enter' && handleDelete(e, s.sessionId, s.title || '新对话')}
                  aria-label="确认删除此对话"
                >
                  确认?
                </span>
              ) : (
                <IconTooltip content="删除对话" compact>
                  <span
                    role="button"
                    tabIndex={0}
                    className={styles.deleteBtn}
                    onClick={(e) => handleDelete(e, s.sessionId, s.title || '新对话')}
                    onKeyDown={(e) => e.key === 'Enter' && handleDelete(e, s.sessionId, s.title || '新对话')}
                    aria-label="删除此对话"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </span>
                </IconTooltip>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <aside
      className={styles.sidebar}
      data-open={sidebarOpen ? 'true' : 'false'}
      aria-expanded={sidebarOpen}
    >
      {/* 展开态内容层 */}
      <div className={styles.expandedPane} aria-hidden={!sidebarOpen}>
        <div className={styles.header}>
          <div className={styles.brandRow}>
            <button type="button" className={styles.brandLink} onClick={handleNewChat} title="返回首页">
              <div className={styles.logoSlot}>
                <BrandLogo size="sm" />
              </div>
              <span className={styles.brandText}>
                <span className={styles.brandTitle}>经营分析智能平台</span>
                <span className={styles.brandSub}>BIZ HUB</span>
              </span>
            </button>
            <button
              type="button"
              className={`${styles.toggleBtn} ${!sidebarOpen ? styles.toggleBtnFlipped : ''}`}
              onClick={onToggle}
              title={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
            >
              <IconChevronLeft />
            </button>
          </div>
        </div>

        <div className={styles.body}>
          <button
            type="button"
            className={`${styles.navRow} ${onReports ? styles.navRowActive : ''}`}
            onClick={handleReports}
            tabIndex={sidebarOpen ? 0 : -1}
          >
            <span className={styles.navIcon}><IconReport /></span>
            <span className={styles.navLabel}>报表</span>
          </button>

          <button type="button" className={styles.navRow} onClick={handleNewChat} tabIndex={sidebarOpen ? 0 : -1}>
            <span className={styles.navIcon}><IconCompose /></span>
            <span className={styles.navLabel}>新建对话</span>
          </button>

          <button
            type="button"
            className={styles.navRow}
            onClick={() => setHistoryOpen((v) => !v)}
            tabIndex={sidebarOpen ? 0 : -1}
          >
            <span className={styles.navIcon}><IconHistory /></span>
            <span className={styles.navLabel}>对话历史</span>
            <span className={`${styles.chevron} ${historyOpen ? styles.chevronOpen : ''}`}>
              <IconChevronDown />
            </span>
          </button>

          <div className={`${styles.historyDrawer} ${historyOpen ? styles.historyDrawerOpen : ''}`}>
            <div className={styles.historyDrawerInner}>
              <div className={styles.historyIndent}>
                {visibleSessions.length === 0 ? (
                  <div className={styles.emptyState}>还没有对话记录</div>
                ) : (
                  <>
                    {renderGroup('常用对话', pinned)}
                    {renderGroup('今天', groups.today)}
                    {renderGroup('昨天', groups.yesterday)}
                    {renderGroup('更早', groups.earlier)}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          {user && (
            <div className={styles.userBadge}>
              <div className={styles.avatar}>{user.loginName[0]?.toUpperCase() ?? '?'}</div>
              <span className={styles.userName}>{user.loginName}</span>
            </div>
          )}
          {modelInfo && (
            <div className={styles.modelInfo}>
              <span className={styles.dot} />
              {modelInfo}
            </div>
          )}
        </div>
      </div>

      {/* Rail 内容层（收起态）
          rail 按钮的 hover 提示统一走 <Tooltip placement="right" groupId="sidebar-rail">：
          - 颜色 #DFE8F4 浅蓝灰胶囊 + #1D2129 文字 + 左尖角，参考 tdesign Tooltip placement-right。
          - 冷启动 600ms 后弹出；同组（sidebar-rail）warmup：第一次显示后，移到下一个 icon 立即弹出，
            离开整组 300ms 内无 hover 才回退到冷启动 → 满足"一旦触发，平移到下一个 icon 同样生效"。
          - Tooltip 通过 portal 挂在 body，不受 sidebar overflow 影响；按钮不再写 title 以免与自定义 tooltip 叠加。 */}
      <div className={styles.railPane} aria-hidden={sidebarOpen}>
        <Tooltip content="展开侧边栏" placement="right" groupId="sidebar-rail">
          <button
            type="button"
            className={styles.railBrand}
            onClick={onToggle}
            aria-label="展开侧边栏"
            tabIndex={sidebarOpen ? -1 : 0}
          >
            <BrandLogo size="sm" />
          </button>
        </Tooltip>
        <div className={styles.railIcons}>
          <Tooltip content="报表" placement="right" groupId="sidebar-rail">
            <button
              type="button"
              className={`${styles.railItem} ${onReports ? styles.railItemActive : ''}`}
              onClick={handleReports}
              aria-label="报表"
              tabIndex={sidebarOpen ? -1 : 0}
            >
              <IconReport />
            </button>
          </Tooltip>
          <Tooltip content="新建对话" placement="right" groupId="sidebar-rail">
            <button
              type="button"
              className={styles.railItem}
              onClick={handleNewChat}
              aria-label="新建对话"
              tabIndex={sidebarOpen ? -1 : 0}
            >
              <IconCompose />
            </button>
          </Tooltip>
          {/* A4: 展开 sidebar 并确保历史列表展开 */}
          <Tooltip content="对话历史" placement="right" groupId="sidebar-rail">
            <button
              type="button"
              className={styles.railItem}
              onClick={handleRailHistory}
              aria-label="对话历史"
              tabIndex={sidebarOpen ? -1 : 0}
            >
              <IconHistory />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* A5: Undo Snackbar */}
      {pendingUndo && (
        <div className={styles.undoSnackbar} role="status" aria-live="polite">
          <span className={styles.undoText}>「{pendingUndo.title.slice(0, 12)}{pendingUndo.title.length > 12 ? '…' : ''}」已删除</span>
          <button type="button" className={styles.undoBtn} onClick={handleUndo}>
            撤销
          </button>
        </div>
      )}
    </aside>
  );
}

export default memo(Sidebar);
