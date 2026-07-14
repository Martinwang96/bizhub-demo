import { memo, useCallback } from 'react';
import type { Message } from '../../types/session';
import type { StreamCtx } from '../../store/useStreamStore';
import { useSessionStore } from '../../store/useSessionStore';
import type { ChartMessagePair } from '../../utils/chartSelectors';
import UserBubble from './UserBubble';
import AiResponse from './AiResponse';
import styles from './MessageList.module.css';

interface Props {
  sid: string;
  messages: Message[];
  ctx?: StreamCtx;
  onRetry: (text: string) => void;
  onShareOpen?: () => void;
  onRegenerate?: (messageIndex: number) => void;
  onRefine?: (messageIndex: number, mode: 'detailed' | 'concise') => void;
  onPin?: (messageIndex: number, pinned: boolean) => void;
  sessionPinned?: boolean;
  messageRefs?: React.MutableRefObject<Record<number, HTMLElement | null>>;
  chartMessages?: ChartMessagePair[];
}

/** 单个 assistant 的版本组信息 */
interface VersionInfo {
  /** 当前 assistant 在组内 1-based 位置 */
  pos: number;
  /** 版本组总数 */
  total: number;
  /** 版本组内全部 assistant 的展示下标（按出现顺序） */
  indices: number[];
  /** 该组所属的非 _refine user 展示下标（-1 = 前面没有 user） */
  ownerUser: number;
}

/**
 * 计算版本组：按「非 _refine 的 user 消息」分段，每段内连续 assistant 为一组。
 * 「详细/简洁」追加的 user 带 _refine 标记，不作为分段点——其前后 assistant 同组，
 * 从而把「原始回答 + 各改写版本」聚合成一个可覆盖式翻页的版本组。
 * 返回 assistant 展示下标 → VersionInfo 的映射。
 */
function computeVersionGroups(messages: Message[]): Map<number, VersionInfo> {
  const groups: { indices: number[]; ownerUser: number }[] = [];
  let cur: { indices: number[]; ownerUser: number } | null = null;
  let lastOwnerUser = -1;

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === 'user') {
      // 非 _refine user 开启新分段并更新 ownerUser；_refine user 不分段、不更新
      if (!m._refine) {
        lastOwnerUser = i;
        cur = null;
      }
      continue;
    }
    if (m.role === 'assistant') {
      if (!cur) {
        cur = { indices: [], ownerUser: lastOwnerUser };
        groups.push(cur);
      }
      cur.indices.push(i);
    }
  }

  const map = new Map<number, VersionInfo>();
  for (const g of groups) {
    g.indices.forEach((idx, k) => {
      map.set(idx, { pos: k + 1, total: g.indices.length, indices: g.indices, ownerUser: g.ownerUser });
    });
  }
  return map;
}

/**
 * 每个 user 提问只允许其下方**最后一条 assistant** 显示 ProcessPanel，
 * 历史条目不展开（防止长对话被面板撑开）。
 */
function pickProcessAllowed(messages: Message[]): Set<number> {
  const allowed = new Set<number>();
  const groupDone = new Set<number>();

  for (let mi = messages.length - 1; mi >= 0; mi--) {
    const m = messages[mi];
    if (m.role !== 'assistant') continue;
    if (!((m.steps && m.steps.length) || m.reasoning)) continue;

    let ownerUser = -1;
    for (let ui = mi - 1; ui >= 0; ui--) {
      if (messages[ui].role === 'user') { ownerUser = ui; break; }
    }

    const key = ownerUser >= 0 ? ownerUser : -1;
    if (!groupDone.has(key)) {
      groupDone.add(key);
      allowed.add(mi);
    }
  }

  return allowed;
}

function MessageList({ sid, messages, ctx, onRetry, onShareOpen, onRegenerate, onRefine, onPin, sessionPinned, messageRefs, chartMessages }: Props) {
  const processAllowedSet = pickProcessAllowed(messages);
  const versionGroups = computeVersionGroups(messages);
  const activeVersionByGroup = useSessionStore((s) => s.activeVersionByGroup);
  const setActiveVersion = useSessionStore((s) => s.setActiveVersion);

  /**
   * 覆盖式翻页：同一版本组只渲染「激活」的那一条 assistant，其余跳过（不占屏）。
   * 默认激活最后一条（最新版本）；用户翻页后由 activeVersionByGroup 锁定。
   */
  const skipSet = new Set<number>();
  for (const info of versionGroups.values()) {
    if (info.total <= 1) continue;
    const key = `${sid}::${info.ownerUser}`;
    const active = activeVersionByGroup[key] ?? info.indices[info.total - 1];
    for (const i of info.indices) {
      if (i !== active) skipSet.add(i);
    }
  }

  // 构建含图表的消息索引集合，用于 data-message-index 标记
  const chartMsgIndexSet = new Set<number>();
  if (chartMessages) {
    chartMessages.forEach((p) => chartMsgIndexSet.add(p.messageIndex));
  }

  const handleRef = useCallback(
    (el: HTMLElement | null, idx: number) => {
      if (messageRefs) {
        messageRefs.current[idx] = el;
      }
    },
    [messageRefs],
  );

  if (!messages.length) {
    return <div className={styles.empty}>暂无消息</div>;
  }

  return (
    <div className={styles.list}>
      {messages.map((m, i) => {
        // 覆盖式翻页：跳过版本组内非激活的 assistant（不渲染、不占屏）
        if (skipSet.has(i)) return null;

        const hasChart = m.role === 'assistant' && chartMsgIndexSet.has(i);
        const dataProps: Record<string, string> = {};
        if (hasChart) {
          dataProps['data-message-index'] = String(i);
        }

        if (m.role === 'user') {
          // 「详细/简洁」追加的改写指令 user：后端记录用于审计追溯，前端跳过渲染（不显示气泡）
          if (m._refine) return null;
          return <UserBubble key={i} content={m.content ?? ''} time={m.time} />;
        }

        const isLastAssistant = i === messages.length - 1 && m.role === 'assistant';
        const livectx = isLastAssistant ? ctx : undefined;
        // 「已结束」：非当前正在流式输出的最后一条 assistant
        const finished = !(isLastAssistant && !!ctx?.loading);

        const vinfo = versionGroups.get(i);
        // 翻页：切换该版本组的激活 assistant（覆盖式，原位切换显示）
        const handleVersionNavigate = vinfo && vinfo.total > 1
          ? (direction: -1 | 1) => {
              const key = `${sid}::${vinfo.ownerUser}`;
              const currentActive = activeVersionByGroup[key] ?? vinfo.indices[vinfo.total - 1];
              const currentPos = vinfo.indices.indexOf(currentActive);
              const targetIdx = vinfo.indices[currentPos + direction];
              if (targetIdx !== undefined) setActiveVersion(sid, vinfo.ownerUser, targetIdx);
            }
          : undefined;

        return (
          <div key={i} ref={(el) => handleRef(el, i)} {...dataProps}>
            <AiResponse
              sid={sid}
              messageIndex={i}
              message={m}
              ctx={livectx}
              processAllowed={processAllowedSet.has(i) || isLastAssistant}
              finished={finished}
              onRetry={onRetry}
              onShareOpen={onShareOpen}
              onRegenerate={onRegenerate}
              onRefine={onRefine}
              onPin={onPin}
              sessionPinned={sessionPinned}
              versionPos={vinfo?.pos}
              versionTotal={vinfo?.total}
              onVersionNavigate={handleVersionNavigate}
            />
          </div>
        );
      })}
    </div>
  );
}

export default memo(MessageList);
