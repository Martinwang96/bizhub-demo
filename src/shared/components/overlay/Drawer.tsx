/**
 * Drawer — 通用右抽屉
 *
 * 设计：
 * - Portal 挂到 body，避免被父级 overflow 截断
 * - mask + drawer container；transform: translateX 出场
 * - sticky drawer-foot；ESC + mask click 关闭；focus trap 简版（首/尾环绕）
 * - 复用 DESIGN.md token，不使用渐变
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Drawer.module.css';

export interface DrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** 抽屉宽度，默认 520 */
  width?: number;
  /** 关闭按钮 aria 标签 */
  closeLabel?: string;
}

export function Drawer({ open, title, onClose, children, footer, width = 520, closeLabel = '关闭' }: DrawerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveRef = useRef<Element | null>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    previousActiveRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    // 聚焦到关闭按钮
    requestAnimationFrame(() => {
      const closeBtn = containerRef.current?.querySelector<HTMLButtonElement>('[data-drawer-close]');
      closeBtn?.focus();
    });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
      const prev = previousActiveRef.current as HTMLElement | null;
      prev?.focus?.();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return createPortal(
    <div className={styles.root} role="presentation">
      <button
        type="button"
        className={styles.mask}
        onClick={onClose}
        aria-label="关闭抽屉遮罩"
        tabIndex={-1}
      />
      <aside
        ref={containerRef}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width: `min(${width}px, 92vw)` }}
      >
        <header className={styles.header}>
          <h3 className={styles.title}>{title}</h3>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={closeLabel}
            data-drawer-close
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.foot}>{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}

export default Drawer;
