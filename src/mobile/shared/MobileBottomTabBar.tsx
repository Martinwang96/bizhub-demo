import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import styles from './MobileBottomTabBar.module.css';

/**
 * TabBar 的实际占位高度（与 .bar 样式一致：56px 主体 + iOS safe-area）。
 * 通过 :root 上的 CSS 变量暴露，供 BottomSheet 等需要"避让 TabBar"的覆盖层读取。
 */
const TABBAR_H_EXPR = 'calc(56px + env(safe-area-inset-bottom, 0px))';
const TABBAR_H_VAR = '--mobile-tabbar-h';

export interface MobileTabItem {
  id: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  /** 占位项：disabled + tooltip "敬请期待" */
  disabled?: boolean;
  /**
   * 跳转目标（相对路由表 path，如 "/permissions"、"/ops"）。
   * - 仅在 !active && !disabled 时生效，渲染为 <Link>。
   * - 由 react-router 自动处理 basename / Hash / Browser router 差异。
   */
  to?: string;
}

interface MobileBottomTabBarProps {
  items: MobileTabItem[];
}

/**
 * 移动端底部 Tab Bar（4 格），固定 fixed bottom。
 * - 激活格：bg primary-soft + text primary，包裹 icon。<button> 不响应点击。
 * - 占位格：muted + 不可点击 + title="敬请期待"。<button disabled>。
 * - 可跳转格：<Link to={item.to}>，由 react-router 处理路由切换。
 * - 安全区：padding-bottom 含 env(safe-area-inset-bottom)。
 */
export default function MobileBottomTabBar({ items }: MobileBottomTabBarProps) {
  /*
   * 关键：组件挂载时把 TabBar 高度写到 :root，卸载时清掉。
   * 这样所有需要避让底部 TabBar 的浮层（MobileBottomSheet 等）
   * 都能直接读 var(--mobile-tabbar-h)，而不需要硬编码 56px / 重复维护。
   * 没挂 TabBar 的页面（独立 sheet 等）读不到 → 用 0px 兜底。
   */
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.getPropertyValue(TABBAR_H_VAR);
    root.style.setProperty(TABBAR_H_VAR, TABBAR_H_EXPR);
    return () => {
      if (prev) root.style.setProperty(TABBAR_H_VAR, prev);
      else root.style.removeProperty(TABBAR_H_VAR);
    };
  }, []);

  return (
    <nav className={styles.bar} aria-label="移动端管理底部导航">
      {items.map((item) => {
        const active = !!item.active;
        const disabled = !!item.disabled;
        const className = `${styles.item} ${active ? styles.itemActive : ''} ${disabled ? styles.itemDisabled : ''}`;

        // 可跳转：active=false && disabled=false && 配置了 to
        if (!active && !disabled && item.to) {
          return (
            <Link
              key={item.id}
              to={item.to}
              className={className}
              aria-label={item.label}
              title={item.label}
            >
              <span className={styles.iconWrap} aria-hidden="true">
                {item.icon}
              </span>
              <span className={styles.label}>{item.label}</span>
            </Link>
          );
        }

        // 当前激活 / 禁用 / 未配置 to → 用 button 兜底（不会跳转）
        return (
          <button
            key={item.id}
            type="button"
            className={className}
            aria-current={active ? 'page' : undefined}
            aria-label={item.label}
            aria-disabled={disabled || undefined}
            title={disabled ? '敬请期待' : item.label}
            disabled={disabled}
          >
            <span className={styles.iconWrap} aria-hidden="true">
              {item.icon}
            </span>
            <span className={styles.label}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
