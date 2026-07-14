import { useEffect, useRef, type ReactNode } from 'react';
import useOverlayBackClose from '@shared/hooks/useOverlayBackClose';
import styles from './MobileBottomSheet.module.css';

export interface MobileBottomSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** 底部操作区（保存/取消等），sticky 在 sheet 底部 */
  footer?: ReactNode;
  /** 关闭时是否保留 DOM，默认 true（保表单状态） */
  keepMounted?: boolean;
  /** 给 a11y 用的可选 id 前缀 */
  ariaLabelledById?: string;
}

/**
 * 通用 Bottom Sheet：scrim + sheet 两层。
 * - ESC / 点 scrim 关闭
 * - 打开时锁滚动 + autofocus 第一个可聚焦元素
 * - 仅 opacity + transform 动效
 * - prefers-reduced-motion 自动降级
 */
export default function MobileBottomSheet({
  open,
  title,
  onClose,
  children,
  footer,
  keepMounted = true,
  ariaLabelledById,
}: MobileBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);

  // 报名浏览器/系统返回手势：返回一次仅关闭 sheet。
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
      // 用 rAF 等动画启动后再 focus，避免 IME / 滚动跳跃
      requestAnimationFrame(() => focusable.focus());
    }
  }, [open]);

  if (!open && !keepMounted) {
    return null;
  }

  const titleId = ariaLabelledById ?? `mobile-sheet-title-${title}`;

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
          <span className={styles.handle} aria-hidden="true" />
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
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
