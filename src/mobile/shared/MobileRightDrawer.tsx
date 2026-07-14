import { useEffect, useRef, type ReactNode } from 'react';
import useOverlayBackClose from '@shared/hooks/useOverlayBackClose';
import styles from './MobileRightDrawer.module.css';

export interface MobileRightDrawerProps {
  open: boolean;
  title: string;
  /** 标题下方的元信息（用户/SID/时间/状态等），可选 */
  meta?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** 关闭时是否保留 DOM，默认 true */
  keepMounted?: boolean;
  /** a11y 标题 id，可选自定义 */
  ariaLabelledById?: string;
}

/**
 * 通用右侧抽屉（移动端会话详情场景）。
 * - scrim + sheet 两层
 * - ESC / 点 scrim 关闭
 * - 打开时锁滚动 + 自动 focus 首个可聚焦元素
 * - 仅 opacity + transform 动效（translateX 100%→0）
 * - prefers-reduced-motion 自动降级
 *
 * 与 MobileBottomSheet 同源 a11y/锁滚/ESC/keepMounted；仅方向与无 footer/handle。
 */
export default function MobileRightDrawer({
  open,
  title,
  meta,
  onClose,
  children,
  keepMounted = true,
  ariaLabelledById,
}: MobileRightDrawerProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);

  // 报名浏览器/系统返回手势：返回一次仅关闭抽屉。
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
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable) {
      requestAnimationFrame(() => focusable.focus());
    }
  }, [open]);

  if (!open && !keepMounted) {
    return null;
  }

  const titleId = ariaLabelledById ?? `mobile-drawer-title-${title}`;

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
      <div ref={sheetRef} className={styles.sheet} role="document">
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
          {meta && <div className={styles.meta}>{meta}</div>}
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
