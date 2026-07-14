/**
 * Modal — 通用居中模态弹层（Portal）
 *
 * 不使用渐变 / backdrop-filter blur（DESIGN.md 禁用）
 * - mask + modal 容器；scale + opacity 出场
 * - ESC + mask click 关闭；focus trap 简版
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  width?: number;
  closeLabel?: string;
  /** 是否以宽 body 形式（去掉 body padding，由调用方完全控制） */
  bodyBleed?: boolean;
}

export function Modal({ open, onClose, title, meta, children, width = 920, closeLabel = '关闭', bodyBleed = false }: ModalProps) {
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

    requestAnimationFrame(() => {
      const closeBtn = containerRef.current?.querySelector<HTMLButtonElement>('[data-modal-close]');
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
        aria-label="关闭弹层遮罩"
        tabIndex={-1}
      />
      <section
        ref={containerRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        style={{ width: `min(${width}px, calc(100vw - 48px))` }}
      >
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            {title && <h3 className={styles.title}>{title}</h3>}
            {meta && <div className={styles.meta}>{meta}</div>}
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={closeLabel}
            data-modal-close
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div className={bodyBleed ? styles.bodyBleed : styles.body}>{children}</div>
      </section>
    </div>,
    document.body,
  );
}

export default Modal;
