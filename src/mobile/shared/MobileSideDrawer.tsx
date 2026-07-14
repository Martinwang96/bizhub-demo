import { useEffect, useRef, type ReactNode } from 'react';
import useOverlayBackClose from '@shared/hooks/useOverlayBackClose';
import styles from './MobileSideDrawer.module.css';

export interface MobileSideDrawerProps {
  open: boolean;
  /** 顶部标题（可选）；不传则不渲染 header 区 */
  title?: string;
  /** 标题下方副标题/元信息，可选 */
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** 关闭时是否保留 DOM，默认 true */
  keepMounted?: boolean;
  /** a11y 标题 id，可选自定义 */
  ariaLabelledById?: string;
  /** 抽屉宽度上限，默认 320px */
  maxWidth?: number;
}

/**
 * 通用左侧抽屉（移动端导航/菜单场景）。
 * - scrim + sheet 两层
 * - ESC / 点 scrim / 系统返回手势 关闭
 * - 打开时锁滚动 + 自动 focus 首个可聚焦元素
 * - translateX(-100%) → 0 平移动效
 * - prefers-reduced-motion 自动降级
 *
 * 与 MobileRightDrawer 同源 a11y/锁滚/ESC/keepMounted；仅方向反转 + 默认更窄。
 */
export default function MobileSideDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  keepMounted = true,
  ariaLabelledById,
  maxWidth = 320,
}: MobileSideDrawerProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);

  // 接管浏览器/系统返回手势：返回一次仅关闭抽屉。
  useOverlayBackClose({ open, onClose });

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // 打开时锁滚动
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // 自动 focus 首个可聚焦元素
  useEffect(() => {
    if (!open) return;
    const node = sheetRef.current;
    if (!node) return;
    const focusable = node.querySelector<HTMLElement>(
      'a:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable) {
      requestAnimationFrame(() => focusable.focus());
    }
  }, [open]);

  if (!open && !keepMounted) {
    return null;
  }

  const titleId = ariaLabelledById ?? (title ? `mobile-side-drawer-title-${title}` : undefined);

  return (
    <div
      className={`${styles.root} ${open ? styles.rootOpen : ''}`}
      aria-hidden={!open}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className={styles.scrim}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="document"
        style={{ maxWidth: `${maxWidth}px` }}
      >
        {title && (
          <header className={styles.header}>
            <div className={styles.titleRow}>
              <h2 id={titleId} className={styles.title}>{title}</h2>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={onClose}
                aria-label="关闭"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
          </header>
        )}
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
