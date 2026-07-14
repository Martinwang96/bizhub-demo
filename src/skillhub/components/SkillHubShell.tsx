/**
 * Skill Hub Layout Shell
 *
 * 与 admin/components/AdminShell.tsx 同构：
 * - sidebar + topbar + <Outlet /> 三段式 layout
 * - 用 useLocation 推导当前激活 Tab，NavLink 替换原 button + setActiveTab
 * - 通过 <Outlet context={...}> 把 me / makeRegister / setPendingCount 暴露给 7 个 Tab 子路由
 * - 对受限子路由（pending / admin）做 <Navigate to="upload" replace> 守卫，避免直链绕过
 *
 * 集中式刷新（v2 admin refreshCurrent 模式）：
 * - Shell 持有 refreshHandlesRef
 * - 每个 Tab 通过 onRegisterRefresh(handle) 在 mount 时注册 load fn，unmount 时注销
 * - Topbar 右侧"刷新"按钮按当前 path 调用对应 handle；upload tab 不注册 → 按钮 disabled
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import { getJson } from '@shared/api/httpClient';
import type { Me } from '@shared/types/user';
import Watermark from '@shared/components/content/Watermark';
import BrandLogo from '@shared/components/brand/BrandLogo';
import AclDenied from '@shared/components/feedback/AclDenied/AclDenied';
import { IconTooltip } from '@shared/components';
import styles from '../SkillHubApp.module.css';

export type TabId = 'upload' | 'skills' | 'pending' | 'my' | 'versions' | 'audit' | 'admin';

export type RefreshHandle = () => void | Promise<void>;
export type RegisterRefresh = (handle: RefreshHandle | null) => void;

const TABS: { id: TabId; label: string; desc: string }[] = [
  { id: 'upload', label: '上传 / 发布', desc: '暂存校验与提交审批' },
  { id: 'skills', label: '技能列表', desc: '状态、版本与归属' },
  { id: 'pending', label: '待我审批', desc: '处理发布申请' },
  { id: 'my', label: '我的申请', desc: '追踪审批进度' },
  { id: 'versions', label: '版本与回滚', desc: '查看历史并回退' },
  { id: 'audit', label: '审计日志', desc: '追溯关键动作' },
  { id: 'admin', label: '管理员', desc: '全局技能管理' },
];

const APPROVER_ONLY: TabId[] = ['pending', 'admin'];

export interface SkillHubOutletContext {
  me: Me | null;
  /** 注册 / 注销当前 Tab 的刷新句柄；切路由后子组件 unmount 时会自动注销 */
  makeRegister: (tabId: TabId) => RegisterRefresh;
  /** PendingTab 用此函数上报当前待审批数量，驱动侧栏 badge */
  setPendingCount: (count: number) => void;
}

export function useSkillHubContext(): SkillHubOutletContext {
  return useOutletContext<SkillHubOutletContext>();
}

/** 从 location.pathname 反查当前激活 Tab；basename 已被 react-router 剥离 */
function useActiveTab(): TabId | null {
  const { pathname } = useLocation();
  // pathname 形如 "/upload"、"/skills"、"/"（index 重定向前的瞬间） 等
  const seg = pathname.replace(/^\/+/, '').split('/')[0] as TabId | '';
  if (!seg) return null;
  return TABS.some((t) => t.id === seg) ? (seg as TabId) : null;
}

export default function SkillHubShell() {
  const [me, setMe] = useState<Me | null>(null);
  const [role, setRole] = useState<string>('');
  const [pendingCount, setPendingCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [authError, setAuthError] = useState(false);

  // 用 ref 持有 refresh 句柄，避免每次注册触发 Shell re-render
  const refreshHandlesRef = useRef<Partial<Record<TabId, RefreshHandle | null>>>({});

  useEffect(() => {
    void Promise.all([
      getJson<Me>('/api/me').catch((e: unknown) => {
        const status = (e as { status?: number })?.status;
        if (status === 401) setAuthError(true);
        return null;
      }),
      getJson<{ role?: string; is_approver?: boolean; skill_hub_roles?: string[] }>('/skill-hub/api/config').catch(() => null),
    ]).then(([meEnv, configEnv]) => {
      if (meEnv?.success && meEnv.data) setMe(meEnv.data);
      const config = configEnv?.success ? configEnv.data : null;
      if (config?.role) setRole(config.role);
      else if (meEnv?.success && meEnv.data) setRole(meEnv.data.role);
    });
  }, []);

  const authorized = me ? me.authorized !== false : !authError;
  const isGuest = role === 'guest';
  const skillHubRoles = me?.skillHubRoles ?? [];
  const isApprover = role === 'admin' || role === 'approver' || skillHubRoles.includes('approval');

  const visibleTabs = useMemo(
    () => TABS.filter((t) => (isApprover ? true : !APPROVER_ONLY.includes(t.id))),
    [isApprover],
  );

  /** Tab 子组件用此函数注册 refresh 句柄；切路由 unmount 时 React 会调用 cleanup 传 null 注销 */
  const makeRegister = useCallback((tabId: TabId): RegisterRefresh => {
    return (handle) => {
      refreshHandlesRef.current[tabId] = handle;
    };
  }, []);

  const activeTab = useActiveTab();
  const currentTab = useMemo(
    () => (activeTab ? TABS.find((t) => t.id === activeTab) ?? null : null),
    [activeTab],
  );

  const handleRefresh = useCallback(async () => {
    if (!activeTab) return;
    const handle = refreshHandlesRef.current[activeTab];
    if (!handle) return;
    setRefreshing(true);
    try {
      await handle();
    } catch (e) {
      console.error('[SkillHubShell] refresh failed', e);
    } finally {
      setRefreshing(false);
    }
  }, [activeTab]);

  // upload tab 没有 refresh 语义；其余 Tab 是否禁用由 ref 中是否注册了 handle 决定
  const refreshDisabled = activeTab === 'upload' || refreshing || !activeTab;

  const outletContext = useMemo<SkillHubOutletContext>(
    () => ({ me, makeRegister, setPendingCount }),
    [me, makeRegister],
  );

  // 角色守卫：非审批人访问 pending / admin 直链时回 upload；放在 sidebar/topbar 渲染之前
  // 但需等待 role 拉取完成（首屏 role 为空字符串），否则会在拉取期间错误重定向到 upload
  if (role && !isApprover && activeTab && APPROVER_ONLY.includes(activeTab)) {
    return <Navigate to="/upload" replace />;
  }

  return (
    <div className={styles.shell}>
      {me && <Watermark text={me.loginName} />}

      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <a href="/" className={styles.brandLink} aria-label="返回 Biz Hub 首页">
            <div className={styles.logoSlot}>
              <BrandLogo size="sm" />
            </div>
            <span className={styles.brandText}>
              <span className={styles.brandTitle}>经营分析智能平台</span>
              <span className={styles.brandSub}>SKILL HUB</span>
            </span>
          </a>
        </div>

        <nav className={styles.sideNav} role="tablist" aria-label="Skill Hub 模块">
          {visibleTabs.map((t) => (
            <NavLink
              key={t.id}
              to={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
              }
            >
              <span className={styles.navMain}>
                <span>{t.label}</span>
                {t.id === 'pending' && pendingCount > 0 && (
                  <span className={styles.pendingBadge}>{pendingCount}</span>
                )}
              </span>
              <span className={styles.navDesc}>{t.desc}</span>
            </NavLink>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          {me && (
            <span className={styles.meChip}>
              {me.loginName}
              <span className={styles.roleText}>{me.role}</span>
            </span>
          )}
          <a href="/" className={styles.backLink}>返回对话</a>
        </div>
      </aside>

      <section className={styles.workspace} aria-label="Skill Hub 操作区">
        <header className={styles.workspaceTopbar}>
          <div className={styles.topbarTitleGroup}>
            <h1 className={styles.workspaceTitle}>{currentTab?.label ?? '技能管理'}</h1>
            {currentTab?.desc && (
              <span className={styles.workspaceSubtitle}>{currentTab.desc}</span>
            )}
          </div>
          <div className={styles.topbarActions}>
            {(me?.adminConsoleRole === 'admin' || me?.adminConsoleRole === 'readonly') && (
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
            <button
              type="button"
              className={styles.topbarRefreshBtn}
              onClick={() => void handleRefresh()}
              disabled={refreshDisabled}
              title={activeTab === 'upload' ? '上传页无需刷新' : '刷新当前页'}
              aria-label="刷新当前页"
            >
              {refreshing ? '刷新中…' : '刷新'}
            </button>
          </div>
        </header>

        <main className={styles.main}>
          <div className={styles.panelActive}>
            <Outlet context={outletContext} />
          </div>
        </main>
      </section>

      {(!authorized || isGuest) && (
        <AclDenied
          authError={authError}
          loginName={me?.loginName}
          admins={me?.admins}
        />
      )}
    </div>
  );
}
