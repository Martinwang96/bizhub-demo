/**
 * useOverlayBackClose
 * ----------------------------------------------------------------------------
 * 让覆盖层（Drawer / Modal / BottomSheet）承接浏览器/系统返回手势。
 *
 * v4 实现策略（关键修复）：
 *
 *   v3 失败的根因：
 *     react-router 在 history.state 里维护 { key, idx, usr } 等关键字段
 *     用于内部 location 同步。如果 pushState 时覆盖或丢失这些字段，
 *     react-router 会认为 location 完全变了 → 重新 reconcile Routes →
 *     业务页可能因 location.key 变化触发 useEffect 重跑 → 白屏 / 304。
 *
 *   v4 修复：
 *     pushState 的第一个参数必须是【完整复制】当前 history.state 后
 *     追加 marker；这样 react-router 看到 key/idx 都没变，认为 location
 *     未变更，不会通知任何订阅者重渲染。pathname 也保持不变。
 *
 *   完整流程：
 *     1. 打开浮层：history.pushState({ ...currentState, [MARKER]: token }, '', currentURL)
 *        - currentState 包含 react-router 的 { key, idx, usr }
 *        - 仅追加我们的 marker，URL 完全不变
 *        - react-router 不会触发 location change（key/idx 不变）
 *     2. 用户按返回：浏览器 pop 哨兵 entry，触发 popstate
 *        - 在 popstate 处理器里立即 history.pushState 把当前 URL 钉回栈顶
 *          （URL/state 都和当前完全一致）
 *        - 调 onClose() 关浮层
 *     3. 主动关闭（× / scrim / ESC）：
 *        - 设标记 closingByBtnRef = true
 *        - history.back() 让浏览器栈自然回落一格
 *        - popstate 触发，但因为 closingByBtnRef，不再 pushState
 *
 *   多层浮层：每实例独立 token，popstate 只有持有该 token 的实例响应。
 *   StrictMode：第二次 mount 时 tokenRef 不为 null，跳过占栈。
 */
import { useEffect, useRef } from 'react';

const STATE_MARKER = '__adminOverlay__';

let tokenSeq = 0;
function nextToken(): string {
  tokenSeq += 1;
  return `ovl-${Date.now().toString(36)}-${tokenSeq}`;
}

export interface UseOverlayBackCloseOptions {
  /** 浮层是否打开 */
  open: boolean;
  /** 关闭回调（点击关闭/scrim/ESC 也要走这里，由各组件自己负责调用） */
  onClose: () => void;
  /** 默认开启 */
  enabled?: boolean;
}

function readMarker(state: unknown): string | undefined {
  if (!state || typeof state !== 'object') return undefined;
  const v = (state as Record<string, unknown>)[STATE_MARKER];
  return typeof v === 'string' ? v : undefined;
}

export function useOverlayBackClose({
  open,
  onClose,
  enabled = true,
}: UseOverlayBackCloseOptions): void {
  // 当前浮层在历史栈中的 token；null 表示未占栈
  const tokenRef = useRef<string | null>(null);
  // 标记：当前正在执行"主动关闭"（点 ×/scrim/ESC）流程
  const closingByBtnRef = useRef<boolean>(false);
  // 上一次 open 值
  const prevOpenRef = useRef<boolean>(false);
  // 最新 onClose
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // ── 1. open 转变 → 占栈 / 弹栈 ───────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      prevOpenRef.current = open;
      return;
    }
    if (typeof window === 'undefined') return;

    const prev = prevOpenRef.current;
    prevOpenRef.current = open;

    if (!prev && open) {
      // false → true：占栈
      if (tokenRef.current) return;
      const token = nextToken();
      tokenRef.current = token;

      // 关键：完整复制当前 history.state（包含 react-router 的 key/idx/usr），
      // 仅追加 marker；URL 完全不变。
      const curState = (window.history.state ?? {}) as Record<string, unknown>;
      const newState = { ...curState, [STATE_MARKER]: token };
      try {
        window.history.pushState(newState, '', window.location.href);
      } catch {
        // 罕见 sandbox 环境失败 → 降级为不接管返回
        tokenRef.current = null;
      }
      return;
    }

    if (prev && !open) {
      // true → false：主动关闭（点 ×/scrim/ESC）
      const t = tokenRef.current;
      if (!t) return;
      // 标记主动关闭，让 popstate 知道不要 pushState 把 URL 拉回
      closingByBtnRef.current = true;
      // 让浏览器自然回退一格哨兵 entry
      try {
        window.history.back();
      } catch {
        closingByBtnRef.current = false;
      }
      return;
    }
  }, [open, enabled]);

  // ── 2. popstate 监听 ─────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    const handler = (e: PopStateEvent) => {
      const t = tokenRef.current;
      if (!t) return; // 当前实例未占栈，与本次 popstate 无关

      const stateMarker = readMarker(e.state);
      if (stateMarker === t) {
        // marker 仍在 e.state（罕见：可能是更深层 popstate 间接触发）
        return;
      }

      // marker 不在 e.state，说明哨兵被弹走 → 当前实例需要响应
      tokenRef.current = null;

      if (closingByBtnRef.current) {
        // 这是我们 history.back() 自己触发的 popstate（主动关闭流程），
        // 浏览器栈已自然回落，不需要再做事；onClose 已由组件方调用过了。
        closingByBtnRef.current = false;
        return;
      }

      // 真正的"用户按返回"：把当前 URL 重新钉回栈顶（state 用 e.state 即上一格的
      // state，避免污染）。再调 onClose 关浮层。pushState 不会触发 popstate。
      try {
        window.history.pushState(e.state, '', window.location.href);
      } catch {
        // ignore
      }
      onCloseRef.current();
    };

    window.addEventListener('popstate', handler);
    return () => {
      window.removeEventListener('popstate', handler);
    };
  }, [enabled]);
}

export default useOverlayBackClose;
