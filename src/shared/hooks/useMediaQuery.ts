import { useEffect, useState } from 'react';

/**
 * 通用断点 hook：监听 window.matchMedia，返回当前是否命中。
 * - SSR 安全（typeof window === 'undefined' 时返回 false）。
 * - 自动订阅 / 取消订阅 change 事件。
 * - 兼容旧 Safari 的 addListener fallback。
 *
 * 用法：
 *   const isMobile = useMediaQuery('(max-width: 900px)');
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);

    // 立即同步一次（首次挂载时 query 可能与初始 state 不一致，例如 SSR hydrate）
    setMatches(mql.matches);

    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    // Safari < 14 fallback
    type LegacyMql = MediaQueryList & {
      addListener: (cb: (e: MediaQueryListEvent) => void) => void;
      removeListener: (cb: (e: MediaQueryListEvent) => void) => void;
    };
    const legacy = mql as LegacyMql;
    legacy.addListener(handler);
    return () => legacy.removeListener(handler);
  }, [query]);

  return matches;
}

export default useMediaQuery;
