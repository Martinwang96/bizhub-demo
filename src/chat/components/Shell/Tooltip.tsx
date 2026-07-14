/**
 * Tooltip
 * ─────────────────────────────────────────────────────────────
 * 折叠态侧边栏（rail）所用的自定义 hover 提示组件。
 * 设计目标：
 *   1. 视觉沿用「浅蓝灰胶囊 + 深色文字 + 左尖角」（颜色 #DFE8F4 / #1D2129）。
 *   2. 冷启动 600ms hover 延迟，避免误触；离开立即消失。
 *   3. Group warmup：同 groupId 的多个 Tooltip 共享「已加热」状态——
 *      只要组内任一项已成功显示过，组内其他项 hover 时立即弹出（delay = 0），
 *      离开整组 300ms（warmupExitMs）内若无新 hover，再回退到冷启动 600ms。
 *      ↑ 这就是「一旦触发，平移到下一个 icon 同样生效」的语义。
 *   4. 通过 React Portal 渲染到 body，不受 sidebar / 父容器 overflow 影响，便于复用。
 *
 * API 设计参考 tdesign-react Tooltip：
 *   - content / placement / showArrow 同名同义。
 *   - placement 当前仅实现 "right"（折叠态侧边栏右侧弹出），其余值类型保留待扩展，
 *     运行时未实现的 placement 一律 fallback 到 right。
 *
 * 用法示例：
 *   <Tooltip content="新建对话" groupId="sidebar-rail">
 *     <button onClick={...}><IconCompose /></button>
 *   </Tooltip>
 *
 * 注意：children 必须是单一可接收 ref + 鼠标事件的元素（button / a / div 等）。
 */

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';

import styles from './Tooltip.module.css';

// 当前实现仅支持 right；类型保留全集以便未来扩展同名 placement 不破坏调用方。
export type TooltipPlacement =
  | 'right'
  | 'top'
  | 'top-left'
  | 'top-right'
  | 'bottom'
  | 'bottom-left'
  | 'bottom-right'
  | 'left'
  | 'left-top'
  | 'left-bottom'
  | 'right-top'
  | 'right-bottom';

export interface TooltipProps {
  /** 浮层文案 / 节点 */
  content: ReactNode;
  /** 浮层方位；仅 "right" 已实现，其它取值会 fallback 到 right。 */
  placement?: TooltipPlacement;
  /** 是否显示箭头，默认 true。 */
  showArrow?: boolean;
  /** 冷启动 hover 延迟，单位 ms，默认 600。 */
  delay?: number;
  /**
   * 组 id：同组的 Tooltip 共享 warmup 状态，组内已显示过则其他项 hover 立即弹出。
   * 不传则走独立的 600ms 冷启动。
   */
  groupId?: string;
  /** 离开整组多久后回退到冷启动，默认 300ms。 */
  warmupExitMs?: number;
  /** 锚点子元素，必须为可附加事件 + ref 的单一 React 元素。 */
  children: ReactElement;
}

/** 组级 warmup 状态：模块级单例，组件实例间共享。 */
interface GroupState {
  warm: boolean;
  exitTimer: ReturnType<typeof setTimeout> | null;
  /** 当前正在 hover 的实例数，用于判断是否真的离开了整组。 */
  activeCount: number;
}
const groupRegistry = new Map<string, GroupState>();

function getGroup(groupId: string): GroupState {
  let g = groupRegistry.get(groupId);
  if (!g) {
    g = { warm: false, exitTimer: null, activeCount: 0 };
    groupRegistry.set(groupId, g);
  }
  return g;
}

/** 检测是否为 hover 设备（粗略判定，触屏不显示自定义 tooltip）。 */
function isHoverDevice(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(hover: hover)').matches;
}

export default function Tooltip({
  content,
  placement = 'right',
  showArrow = true,
  delay = 600,
  groupId,
  warmupExitMs = 300,
  children,
}: TooltipProps) {
  const tipId = useId();
  const anchorRef = useRef<HTMLElement | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // mounted: 是否插入了 portal DOM；visible: 是否处于显隐过渡的"显"态。
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);

  // —— 计算 tooltip 位置（当前仅实现 right）——
  const computePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // right：锚点右侧 + 间距（gap），垂直居中（top=锚点中点；CSS translateY(-50%) 居中）
    // 当前仅实现 right，其余 placement 值统一按 right 计算（未来扩展时在此分支化）。
    // gap=16：tooltip 整体再向右平移一档，确保胶囊与左侧尖角都不会与 sidebar 右边界重叠 / 紧贴。
    const gap = 16;
    void placement; // 显式标注：当前实现尚未根据 placement 分支
    setCoords({
      left: rect.right + gap,
      top: rect.top + rect.height / 2,
    });
  }, [placement]);

  // —— 显示 ——
  const show = useCallback(() => {
    if (!isHoverDevice()) return;
    computePosition();
    setMounted(true);
    // 下一帧再切 visible，确保过渡能从 opacity:0 起跳
    requestAnimationFrame(() => {
      setVisible(true);
    });
  }, [computePosition]);

  // —— 隐藏 ——
  const hide = useCallback(() => {
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    setVisible(false);
    // 等过渡跑完再卸载 portal（约 200ms）。这里用一个保守的 220ms。
    // 不依赖 transitionend：visible 切换可能被打断，timer 简单可靠。
    setTimeout(() => {
      setMounted((m) => {
        // 若期间又 show 了（visible=true），不要卸载
        return m && visible ? m : false;
      });
    }, 220);
  }, [visible]);

  // —— mouseenter：根据 group warmup 决定立即/延时显示 ——
  const handleEnter = useCallback(() => {
    if (!isHoverDevice()) return;

    const group = groupId ? getGroup(groupId) : null;
    if (group) {
      group.activeCount += 1;
      if (group.exitTimer !== null) {
        clearTimeout(group.exitTimer);
        group.exitTimer = null;
      }
    }

    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }

    const effectiveDelay = group?.warm ? 0 : delay;
    if (effectiveDelay <= 0) {
      show();
      if (group) group.warm = true;
    } else {
      showTimerRef.current = setTimeout(() => {
        show();
        if (group) group.warm = true;
        showTimerRef.current = null;
      }, effectiveDelay);
    }
  }, [delay, groupId, show]);

  // —— mouseleave：立即隐藏自己；如果整组没人 hover 了，启动 warmup 退火计时器 ——
  const handleLeave = useCallback(() => {
    hide();

    if (!groupId) return;
    const group = getGroup(groupId);
    group.activeCount = Math.max(0, group.activeCount - 1);
    if (group.activeCount === 0) {
      if (group.exitTimer !== null) clearTimeout(group.exitTimer);
      group.exitTimer = setTimeout(() => {
        group.warm = false;
        group.exitTimer = null;
      }, warmupExitMs);
    }
  }, [groupId, hide, warmupExitMs]);

  // —— focus / blur：键盘可访问性，立即显示（不走 600ms 等待）——
  const handleFocus = useCallback(() => {
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    show();
  }, [show]);

  const handleBlur = useCallback(() => {
    hide();
  }, [hide]);

  // —— 组件卸载兜底清理 ——
  useEffect(() => {
    return () => {
      if (showTimerRef.current !== null) clearTimeout(showTimerRef.current);
      // 不要清 group 的 exitTimer：可能有兄弟 Tooltip 仍在使用同一 group
      if (groupId) {
        const g = groupRegistry.get(groupId);
        if (g && g.activeCount > 0) {
          g.activeCount = Math.max(0, g.activeCount - 1);
        }
      }
    };
  }, [groupId]);

  // —— window resize / scroll 时刷新位置（仅在 mounted 时监听）——
  useLayoutEffect(() => {
    if (!mounted) return;
    const update = () => computePosition();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [mounted, computePosition]);

  // —— 克隆 children，注入事件 + ref + aria-describedby ——
  if (!isValidElement(children)) {
    // 防御式编程：错误用法时直接返回 children 不阻塞渲染
    return <>{children}</>;
  }

  // 取出原 props，做事件链式调用以兼容业务侧自带的 hover/focus 处理器
  type AnchorProps = {
    onMouseEnter?: (e: MouseEvent<HTMLElement>) => void;
    onMouseLeave?: (e: MouseEvent<HTMLElement>) => void;
    onFocus?: (e: FocusEvent<HTMLElement>) => void;
    onBlur?: (e: FocusEvent<HTMLElement>) => void;
    'aria-describedby'?: string;
    ref?: Ref<HTMLElement>;
  };
  const childEl = children as ReactElement<AnchorProps>;
  const originalProps = (childEl.props ?? {}) as AnchorProps;

  // 处理 ref 合并：children 可能自己有 ref（e.g. forwardRef 组件）
  // ref-typing 较复杂，这里用 any 局部松绑（注释解释 trade-off）。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const childAnyProps = childEl.props as any;
  const originalRef: Ref<HTMLElement> | undefined = childAnyProps?.ref;
  const setAnchor = (node: HTMLElement | null) => {
    anchorRef.current = node;
    if (typeof originalRef === 'function') {
      originalRef(node);
    } else if (originalRef && typeof originalRef === 'object') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (originalRef as any).current = node;
    }
  };

  const cloned = cloneElement(childEl, {
    ref: setAnchor,
    'aria-describedby': mounted ? tipId : originalProps['aria-describedby'],
    onMouseEnter: (e: MouseEvent<HTMLElement>) => {
      originalProps.onMouseEnter?.(e);
      handleEnter();
    },
    onMouseLeave: (e: MouseEvent<HTMLElement>) => {
      originalProps.onMouseLeave?.(e);
      handleLeave();
    },
    onFocus: (e: FocusEvent<HTMLElement>) => {
      originalProps.onFocus?.(e);
      handleFocus();
    },
    onBlur: (e: FocusEvent<HTMLElement>) => {
      originalProps.onBlur?.(e);
      handleBlur();
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const portalNode =
    mounted && coords && typeof document !== 'undefined'
      ? createPortal(
          <div
            id={tipId}
            role="tooltip"
            className={`${styles.tooltip} ${visible ? styles.visible : ''}`}
            style={
              {
                left: `${coords.left}px`,
                top: `${coords.top}px`,
              } satisfies CSSProperties
            }
          >
            {showArrow && <span className={styles.arrow} aria-hidden />}
            {content}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {cloned}
      {portalNode}
    </>
  );
}
