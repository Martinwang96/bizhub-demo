import { useCallback, useEffect, useRef } from 'react';

const THRESHOLD = 120;

function isNearBottom(el: HTMLElement, threshold = THRESHOLD): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

/**
 * 自动滚动到底部 hook。
 * 当用户在底部附近时，新内容到来会自动滚动；
 * 用户上滚则停止自动滚动，显示"回到底部"FAB。
 *
 * @returns [ref, atBottom, scrollToBottom]
 */
export function useAutoScroll(deps: unknown[]): [
  React.RefObject<HTMLDivElement | null>,
  boolean,
  (smooth?: boolean) => void,
] {
  const ref = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = ref.current;
    if (!el) return;
    if (smooth) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  // 监听滚动，更新 atBottomRef
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = () => { atBottomRef.current = isNearBottom(el); };
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, []);

  // deps 变化时，如果在底部则自动滚动
  useEffect(() => {
    if (atBottomRef.current) scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return [ref, atBottomRef.current, scrollToBottom];
}
