import { useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useResolvedPath } from 'react-router-dom';
import { getJson } from '@shared/api/httpClient';
import type { Me } from '@shared/types/user';
import Watermark from '@shared/components/content/Watermark';
import BrandLogo from '@shared/components/brand/BrandLogo';
import AclDenied from '@shared/components/feedback/AclDenied/AclDenied';
import { IconTooltip } from '@shared/components';
import { useMediaQuery } from '@shared/hooks/useMediaQuery';
import MobileShell from '../../mobile/shared/MobileShell';
import { MOBILE_BREAKPOINT } from '../../mobile/shared/constants';
import MobilePermissionsPage from '../../mobile/admin/pages/MobilePermissionsPage';
import MobileOpsPage from '../../mobile/admin/pages/MobileOpsPage';
import MobileSessionsPage from '../../mobile/admin/pages/MobileSessionsPage';
import MobileDataAclPage from '../../mobile/admin/pages/MobileDataAclPage';
import MobileBusinessKnowledgePage from '../../mobile/admin/pages/MobileBusinessKnowledgePage';
import MobileStatsPage from '../../mobile/admin/pages/MobileStatsPage';
import styles from './AdminShell.module.css';

interface NavChild {
  /** hash 片段（不含 #） */
  hash: string;
  label: string;
}

interface NavItem {
  to: string;
  label: string;
  desc: string;
  /** 可选：在 sidebar 内直接展开的二级菜单（基于 location.hash 切换） */
  children?: NavChild[];
}

/** 数据权限二级菜单（与 DataAclPage 内的 DATA_ACL_TABS 顺序一致） */
const DATA_ACL_CHILDREN: NavChild[] = [
  { hash: 'users', label: '用户绑定' },
  { hash: 'groups', label: '用户组' },
  { hash: 'tree', label: '产业树' },
  { hash: 'simulate', label: '模拟 & 历史' },
];

/** 数据统计二级菜单（与 StatsPage 内的 STATS_TABS 顺序一致） */
const STATS_CHILDREN: NavChild[] = [
  { hash: 'token', label: 'token 消耗' },
  { hash: 'latency', label: '查询耗时' },
  { hash: 'active', label: '活跃数据' },
];

const NAV_ITEMS: NavItem[] = [
  { to: 'permissions', label: '用户页面权限管理', desc: '配置 Biz Hub、Skill Hub 和管理后台三类页面权限。' },
  { to: 'data-acl', label: '用户数据权限管理', desc: '维护用户数据权限配置、策略绑定、发布、回滚和模拟鉴权。', children: DATA_ACL_CHILDREN },
  { to: 'business-knowledge', label: '业务知识管理', desc: '维护业务概览、产品别名和客户简称速查表，注入 LLM 上下文。' },
  { to: 'sessions', label: 'Session 查询', desc: '跨用户查询会话并查看脱敏后的安全投影详情。' },
  { to: 'stats', label: '数据统计', desc: '观测 token 消耗与查询耗时，按时间、用户、会话和模型维度统计。', children: STATS_CHILDREN },
  { to: 'ops', label: '系统日志告警', desc: '查看健康状态、运行指标、审计日志、日志摘要和派生告警。' },
];

export interface AdminTopbarConfig {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export interface AdminOutletContext {
  me: Me | null;
  setTopbar: (config: AdminTopbarConfig | null) => void;
}

export default function AdminShell() {
  const [me, setMe] = useState<Me | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [topbar, setTopbarState] = useState<AdminTopbarConfig | null>(null);
  const location = useLocation();
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);
  // 已接入移动端专属布局的路由：permissions / ops / sessions / data-acl / business-knowledge / stats；其它仍走 PC shell
  const normalizedPath = location.pathname.replace(/\/+$/, '');
  const isMobilePermissions = isMobile && normalizedPath.endsWith('/permissions');
  const isMobileOps = isMobile && normalizedPath.endsWith('/ops');
  const isMobileSessions = isMobile && normalizedPath.endsWith('/sessions');
  const isMobileDataAcl = isMobile && normalizedPath.endsWith('/data-acl');
  const isMobileBizKnowledge = isMobile && normalizedPath.endsWith('/business-knowledge');
  const isMobileStats = isMobile && normalizedPath.endsWith('/stats');

  useEffect(() => {
    // 同时拉两个 me：
    // - /admin/api/console/me 用于校验管理后台访问权（被 ACL/角色拦截会 403）
    // - /api/me 在 ACL 中始终放行，可拿到 admins 列表用于拦截页提示联系人
    void Promise.all([
      getJson<Me>('/admin/api/console/me').catch((e: unknown) => {
        const status = (e as { status?: number })?.status;
        if (status === 401) setAuthError(true);
        else if (status === 403) setForbidden(true);
        return null;
      }),
      getJson<Me>('/api/me').catch(() => null),
    ]).then(([adminEnv, baseEnv]) => {
      if (adminEnv?.success && adminEnv.data) {
        setMe(adminEnv.data);
        return;
      }
      // 没拿到 admin me 时，退回到 /api/me（让拦截页能展示账号 + admins）
      if (baseEnv?.success && baseEnv.data) {
        setMe(baseEnv.data);
        if (baseEnv.data.authorized === false) setForbidden(true);
      }
    });
  }, []);

  const setTopbar = useCallback((config: AdminTopbarConfig | null) => {
    setTopbarState(config);
  }, []);

  const outletContext = useMemo<AdminOutletContext>(() => ({ me, setTopbar }), [me, setTopbar]);

  // 移动端 + Permissions 路由：使用移动端单列布局，直接渲染移动端页面（不走 Outlet）
  if (isMobilePermissions) {
    return (
      <MobileShell me={me}>
        <MobilePermissionsPage me={me} />
      </MobileShell>
    );
  }

  // 移动端 + Ops（系统日志告警）路由：移动端单列布局
  if (isMobileOps) {
    return (
      <MobileShell me={me}>
        <MobileOpsPage me={me} />
      </MobileShell>
    );
  }

  // 移动端 + Sessions（会话查询）路由：移动端单列布局
  if (isMobileSessions) {
    return (
      <MobileShell me={me}>
        <MobileSessionsPage me={me} />
      </MobileShell>
    );
  }

  // 移动端 + Data ACL（用户数据权限管理）路由：移动端单列布局
  if (isMobileDataAcl) {
    return (
      <MobileShell me={me}>
        <MobileDataAclPage me={me} />
      </MobileShell>
    );
  }

  // 移动端 + Business Knowledge（业务知识管理）路由：移动端单列布局
  if (isMobileBizKnowledge) {
    return (
      <MobileShell me={me}>
        <MobileBusinessKnowledgePage me={me} />
      </MobileShell>
    );
  }

  // 移动端 + Stats（数据统计）路由：移动端单列布局
  if (isMobileStats) {
    return (
      <MobileShell me={me}>
        <MobileStatsPage me={me} />
      </MobileShell>
    );
  }

  if (forbidden || authError) {
    return (
      <div className={styles.shell} aria-hidden="true">
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <a href="/" className={styles.brandLink} aria-label="返回 Biz Hub 首页">
              <div className={styles.logoSlot}>
                <BrandLogo size="sm" />
              </div>
              <span className={styles.brandText}>
                <span className={styles.brandTitle}>经营分析智能平台</span>
                <span className={styles.brandSub}>管理后台</span>
              </span>
            </a>
          </div>
        </aside>
        <section className={styles.workspace} aria-label="管理后台操作区">
          <header className={styles.workspaceTopbar}>
            <div className={styles.topbarTitleGroup}>
              <h1 className={styles.workspaceTitle}>管理后台</h1>
            </div>
          </header>
          <main className={styles.main} />
        </section>
        <AclDenied
          authError={authError}
          loginName={me?.loginName}
          admins={me?.admins}
        />
      </div>
    );
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
              <span className={styles.brandSub}>管理后台</span>
            </span>
          </a>
        </div>

        <nav className={styles.sideNav} aria-label="管理后台菜单">
          {NAV_ITEMS.map((item) => (
            <SidebarNavEntry key={item.to} item={item} />
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          {me && (
            <span className={styles.meChip}>
              {me.loginName}
              <span className={styles.roleText}>{me.adminConsoleRole || 'admin'}</span>
            </span>
          )}
          <a href="/" className={styles.backLink}>返回对话</a>
        </div>
      </aside>

      <section className={styles.workspace} aria-label="管理后台操作区">
        <header className={styles.workspaceTopbar}>
          <div className={styles.topbarTitleGroup}>
            <h1 className={styles.workspaceTitle}>{topbar?.title ?? '管理后台'}</h1>
            {topbar?.description && (
              <span className={styles.workspaceSubtitle}>{topbar.description}</span>
            )}
          </div>
          <div className={styles.topbarActions}>
            {(me?.adminConsoleRole === 'admin' || (me?.skillHubRoles ?? []).some((r) => r === 'user' || r === 'approval')) && (
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
            {topbar?.actions}
          </div>
        </header>

        <main className={styles.main}>
          <Outlet context={outletContext} />
        </main>
      </section>
    </div>
  );
}

/**
 * 单个一级 NavItem。带 children 时：
 *   - 父项命中（pathname 落在 to 下）则展开子菜单
 *   - 子项命中态由 location.hash 判断（与 DataAclPage 的 hash 路由保持一致）
 */
function SidebarNavEntry({ item }: { item: NavItem }) {
  const location = useLocation();
  const navigate = useNavigate();
  const resolved = useResolvedPath(item.to);
  // 父项命中：当前 pathname 等于或位于 resolved.pathname 之下
  const parentActive = location.pathname === resolved.pathname
    || location.pathname.startsWith(resolved.pathname + '/');
  const showChildren = !!item.children && parentActive;
  const currentHash = location.hash.replace(/^#/, '');
  const defaultChildHash = item.children?.[0]?.hash ?? '';

  return (
    <>
      <NavLink
        to={item.to}
        className={({ isActive }) =>
          `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
        }
        end={!item.children}
      >
        <span className={styles.navMain}>
          <span>{item.label}</span>
        </span>
        <span className={styles.navDesc}>{item.desc}</span>
      </NavLink>

      {showChildren && (
        <ul className={styles.subNav} role="list">
          {item.children!.map((child) => {
            // 当 hash 为空时，把首个子项视为命中（与 DataAclPage 默认 'users' 行为对齐）
            const active = currentHash
              ? currentHash === child.hash
              : child.hash === defaultChildHash;
            return (
              <li key={child.hash}>
                <button
                  type="button"
                  className={active ? `${styles.subNavItem} ${styles.subNavItemActive}` : styles.subNavItem}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => navigate(`${item.to}#${child.hash}`)}
                >
                  <span className={styles.subNavDot} aria-hidden />
                  <span className={styles.subNavLabel}>{child.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
