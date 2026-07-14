import { useEffect, type RefObject } from 'react';

/**
 * 多行 textarea 自动撑高 hook。
 * @param ref  textarea 的 ref
 * @param value 当前值（变化时触发重计算）
 * @param maxH  最大高度（px），默认 200
 */
export function useAutoResize(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxH = 200,
): void {
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const newH = Math.min(ta.scrollHeight, maxH);
    ta.style.height = `${newH}px`;
    ta.style.overflow = ta.scrollHeight > maxH ? 'auto' : 'hidden';
  }, [ref, value, maxH]);
}
