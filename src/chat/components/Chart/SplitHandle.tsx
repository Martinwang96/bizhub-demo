import { useCallback, useRef } from 'react';
import styles from './SplitHandle.module.css';

interface Props {
  ratio: number;
  onChange: (ratio: number) => void;
  onReset: () => void;
}

export default function SplitHandle({ ratio, onChange, onReset }: Props) {
  const rafRef = useRef<number | null>(null);

  const startDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const container = e.currentTarget.parentElement;
    if (!container) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = container.getBoundingClientRect();

    const handleMove = (ev: PointerEvent) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const next = (ev.clientX - rect.left) / rect.width;
        onChange(next);
      });
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      document.body.style.userSelect = '';
    };

    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onChange(ratio - 0.02);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onChange(ratio + 0.02);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onReset();
    }
  }, [onChange, onReset, ratio]);

  return (
    <div
      className={styles.handle}
      role="separator"
      aria-orientation="vertical"
      aria-label="调整图表区宽度"
      tabIndex={0}
      onPointerDown={startDrag}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
    />
  );
}
