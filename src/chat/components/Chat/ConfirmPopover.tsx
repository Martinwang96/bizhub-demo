import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './ConfirmPopover.module.css';

export interface ConfirmPopoverProps {
  /** 锚点元素 ref（icon 按钮）。popover 会以它的位置定位。 */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** 是否打开 */
  open: boolean;
  /** 标题（如「生成图表」） */
  title: string;
  /** 可选的辅助说明 */
  description?: string;
  /** 主按钮文案，默认「确认」 */
  confirmText?: string;
  /** 次按钮文案，默认「取消」 */
  cancelText?: string;
  /** 主按钮是否处于 loading（不会替换文案，仅 disable） */
  loading?: boolean;
  /** 确认回调（点击主按钮） */
  onConfirm: () => void;
  /** 取消回调（点击次按钮 / 外部 / ESC） */
  onCancel: () => void;
}

interface Position {
  top: number;
  left: number;
  // anchor 中心点相对 popover 左边缘的偏移，用于定位三角箭头
  arrowLeft: number;
}

/**
 * 轻量受控 Popover：
 *  - 通过 portal 挂载到 body，避免被父级 overflow:hidden 裁剪
 *  - 锚定在 anchorRef 元素正下方 8px
 *  - 点击 popover 外部 / 按下 ESC 自动 onCancel
 *
 * 不依赖任何第三方 popover 库。
 */
export default function ConfirmPopover({
  anchorRef,
  open,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmPopoverProps) {
  const [pos, setPos] = useState<Position | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // 计算 popover 位置（每次打开 + 滚动 / resize 时重新计算）
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const recalc = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const cardWidth = 220;
      const margin = 12;
      const viewportWidth = window.innerWidth;

      // 默认：居中对齐 anchor
      let left = rect.left + rect.width / 2 - cardWidth / 2;
      // 屏幕边缘修正
      if (left < margin) left = margin;
      if (left + cardWidth > viewportWidth - margin) {
        left = viewportWidth - margin - cardWidth;
      }
      const top = rect.bottom + 8;
      const anchorCenterX = rect.left + rect.width / 2;
      const arrowLeft = Math.max(12, Math.min(cardWidth - 12, anchorCenterX - left));
      setPos({ top, left, arrowLeft });
    };
    recalc();
    window.addEventListener('resize', recalc);
    window.addEventListener('scroll', recalc, true);
    return () => {
      window.removeEventListener('resize', recalc);
      window.removeEventListener('scroll', recalc, true);
    };
  }, [open, anchorRef]);

  // 外部点击 + ESC 关闭
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      const card = cardRef.current;
      const anchor = anchorRef.current;
      const target = e.target as Node;
      if (card?.contains(target)) return;
      if (anchor?.contains(target)) return;
      onCancel();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, anchorRef, onCancel]);

  if (!open || !pos) return null;

  const node = (
    <div
      ref={cardRef}
      className={styles.card}
      style={{ top: pos.top, left: pos.left }}
      role="dialog"
      aria-label={title}
    >
      <div className={styles.arrow} style={{ left: pos.arrowLeft }} />
      <div className={styles.title}>{title}</div>
      {description && <div className={styles.desc}>{description}</div>}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btnSecondary}
          onClick={onCancel}
          disabled={loading}
        >
          {cancelText}
        </button>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={onConfirm}
          disabled={loading}
        >
          {confirmText}
        </button>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
