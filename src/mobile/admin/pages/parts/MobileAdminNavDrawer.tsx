import { Link } from 'react-router-dom';
import { MenuFoldIcon } from 'tdesign-icons-react';
import MobileSideDrawer from '../../../shared/MobileSideDrawer';
import styles from './MobileAdminNavDrawer.module.css';

/* ───────────────────── 导航项配置 ───────────────────── */

export type AdminNavId =
  | 'permissions'
  | 'data-acl'
  | 'business-knowledge'
  | 'sessions'
  | 'stats'
  | 'ops';

interface NavItem {
  id: AdminNavId;
  label: string;
  desc: string;
  to: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'permissions',        label: '用户页面权限管理', desc: 'Biz Hub / Skill Hub / 管理后台 三类页面权限', to: '/permissions' },
  { id: 'data-acl',           label: '用户数据权限管理', desc: '维护用户数据权限配置、绑定、发布、回滚',     to: '/data-acl' },
  { id: 'business-knowledge', label: '业务知识管理',     desc: '业务概览 / 产品别名 / 客户简称速查',         to: '/business-knowledge' },
  { id: 'sessions',           label: 'Session 查询',     desc: '跨用户查询会话与脱敏后投影详情',             to: '/sessions' },
  { id: 'stats',              label: '数据统计',         desc: '观测 token 消耗与查询耗时',                 to: '/stats' },
  { id: 'ops',                label: '系统日志告警',     desc: '健康状态、运行指标、审计日志、派生告警',     to: '/ops' },
];

/* ───────────────────── 触发按钮（汉堡） ───────────────────── */

interface TriggerProps {
  onClick: () => void;
  /** 自定义 className，便于嵌入 Header 的 leading 槽 */
  className?: string;
}

export function MobileAdminNavTrigger({ onClick, className }: TriggerProps) {
  return (
    <button
      type="button"
      className={`${styles.trigger} ${className ?? ''}`}
      onClick={onClick}
      aria-label="打开管理后台导航"
      title="导航"
    >
      <MenuFoldIcon fillColor="transparent" strokeColor="currentColor" strokeWidth={1.5} />
    </button>
  );
}

/* ───────────────────── 主组件：左侧抽屉容器（受控） ───────────────────── */

export interface MobileAdminNavDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 当前激活的导航项 id（用于在抽屉中高亮） */
  activeId: AdminNavId;
}

/**
 * 移动端管理后台「左侧抽屉式导航」。
 *
 * 受控用法：页面自己持有 open 状态，
 * - 在 Header `leading` 槽放 <MobileAdminNavTrigger onClick={() => setOpen(true)} />
 * - 在页面 body 末尾放 <MobileAdminNavDrawer open={open} onClose={() => setOpen(false)} activeId=... />
 */
export default function MobileAdminNavDrawer({ open, onClose, activeId }: MobileAdminNavDrawerProps) {
  return (
    <MobileSideDrawer
      open={open}
      title="管理后台"
      subtitle="经营分析智能平台"
      onClose={onClose}
    >
      <nav className={styles.nav} aria-label="管理后台导航">
        {NAV_ITEMS.map((item) => {
          const active = item.id === activeId;
          return (
            <Link
              key={item.id}
              to={item.to}
              className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={onClose}
            >
              <span className={styles.navText}>
                <span className={styles.navLabel}>{item.label}</span>
                <span className={styles.navDesc}>{item.desc}</span>
              </span>
            </Link>
          );
        })}
      </nav>
      <div className={styles.footer}>
        <a href="/" className={styles.backLink}>返回对话</a>
      </div>
    </MobileSideDrawer>
  );
}
