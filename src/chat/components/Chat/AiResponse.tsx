import { memo } from 'react';
import type { Message } from '../../types/session';
import type { StreamCtx } from '../../store/useStreamStore';
import Markdown from '@shared/components/content/Markdown';
import ProcessPanel from './ProcessPanel';
import MessageActions from './MessageActions';
import styles from './AiResponse.module.css';

interface Props {
  sid: string;
  messageIndex: number;
  message: Message;
  ctx?: StreamCtx;
  processAllowed?: boolean;
  /** 该消息是否为"已结束" assistant（非当前流式中）。仅已结束时渲染底部 actions bar。 */
  finished?: boolean;
  onRetry: (text: string) => void;
  /** 分享回调，由 AppShell.handleShareOpen 透传；未提供时分享按钮自动隐藏。 */
  onShareOpen?: () => void;
  /** 重新对话回调，透传给 MessageActions；未提供时「重新对话」按钮自动隐藏。 */
  onRegenerate?: (messageIndex: number) => void;
  /** 改写（详细/简洁）回调，透传给 MessageActions */
  onRefine?: (messageIndex: number, mode: 'detailed' | 'concise') => void;
  /** 置顶/取消置顶本轮，透传给 MessageActions */
  onPin?: (messageIndex: number, pinned: boolean) => void;
  /** 当前 session 是否已置顶（常用对话） */
  sessionPinned?: boolean;
  /** 版本组中当前版本序号（1-based） */
  versionPos?: number;
  /** 版本组总版本数 */
  versionTotal?: number;
  /** 版本翻页：-1 上一版本 / +1 下一版本 */
  onVersionNavigate?: (direction: -1 | 1) => void;
}

/**
 * memo 比较策略 —— 性能优化关键：
 *   - 历史 AiResponse（ctx 都是 undefined）：message 引用相同则跳过
 *   - 当前 live 条目：浅比 ctx 的关键字段（content/steps/liveThinking/liveTools/loading/error/todo），
 *     **同时**比较 message 引用——避免 done 后 force ensureDetail 覆盖 messagesBySid 时
 *     仅 message 变化、ctx 引用未变化的合法 rerender 被错误跳过。
 */
function arePropsEqual(prev: Props, next: Props): boolean {
  if (prev.onRetry !== next.onRetry) return false;
  if (prev.processAllowed !== next.processAllowed) return false;
  if (prev.finished !== next.finished) return false;
  if (prev.sid !== next.sid) return false;
  if (prev.messageIndex !== next.messageIndex) return false;
  if (prev.onShareOpen !== next.onShareOpen) return false;
  if (prev.onRegenerate !== next.onRegenerate) return false;
  if (prev.onRefine !== next.onRefine) return false;
  if (prev.onPin !== next.onPin) return false;
  if (prev.sessionPinned !== next.sessionPinned) return false;
  if (prev.versionPos !== next.versionPos) return false;
  if (prev.versionTotal !== next.versionTotal) return false;
  if (prev.onVersionNavigate !== next.onVersionNavigate) return false;
  // message 任一变化都需要 rerender（覆盖 force ensureDetail 后 stepCount/steps 跳变的场景）
  if (prev.message !== next.message) return false;
  if (prev.ctx === undefined && next.ctx === undefined) {
    return true;
  }
  if (prev.ctx !== next.ctx) {
    const p = prev.ctx;
    const n = next.ctx;
    if (!p || !n) return false;
    return (
      p.content === n.content &&
      p.steps === n.steps &&
      p.liveThinking === n.liveThinking &&
      p.liveTools === n.liveTools &&
      p.loading === n.loading &&
      p.error === n.error
    );
  }
  return true;
}

function AiResponse({ sid, messageIndex, message, ctx, processAllowed, finished, onRetry, onShareOpen, onRegenerate, onRefine, onPin, sessionPinned, versionPos, versionTotal, onVersionNavigate }: Props) {
  const isLive = !!ctx?.loading;
  const hasProcess = processAllowed && (
    (message.steps && message.steps.length > 0) ||
    !!message.reasoning ||
    isLive
  );

  const content = isLive ? ctx!.content : (message.content ?? '');
  const steps = isLive ? ctx!.steps : (message.steps ?? []);
  const error = isLive ? ctx!.error : (message.status === 'error' ? '发生错误' : null);

  const showTyping = isLive && !content && !steps.length && !ctx?.liveThinking;

  // 已结束即显示 actions bar（取消也算完整对话轮，供用户继续操作）；error 不显示（保留错误卡片+重试）。
  const showActions = !!finished && !isLive && !error;

  return (
    <div className={styles.row}>
      <div className={styles.container}>
        {/* ProcessPanel */}
        {hasProcess && (
          <ProcessPanel
            steps={steps}
            isLive={isLive}
            ctx={ctx}
            stepCount={message.stepCount}
            totalDurationMs={message.totalDurationMs}
          />
        )}

        {/* 等待中三点 */}
        {showTyping && (
          <div className={styles.typing}>
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </div>
        )}

        {/* 正文 */}
        {content && <Markdown text={content} />}

        {/* 已中断提示 */}
        {(message.status === 'aborted' || (isLive && ctx?.aborted)) && (
          <div className={styles.abortedNotice}>用户已取消</div>
        )}

        {/* 错误卡片 */}
        {error && (
          <div className={styles.errorCard}>
            {error}
            <br />
            <button
              type="button"
              className={styles.retryBtn}
              onClick={() => {
                // 找最近一条 user 消息重试
                onRetry(error);
              }}
            >
              重试
            </button>
          </div>
        )}

        {/* 底部 actions bar：图表 + pin（始终显示），分享 + 重新对话（按回调决定） */}
        {showActions && (
          <MessageActions
            sid={sid}
            messageIndex={messageIndex}
            onShareOpen={onShareOpen}
            onRegenerate={onRegenerate}
            onRefine={onRefine}
            pinned={sessionPinned ?? false}
            onPin={onPin}
            finished
            versionPos={versionPos}
            versionTotal={versionTotal}
            onVersionNavigate={onVersionNavigate}
          />
        )}
      </div>
    </div>
  );
}

export default memo(AiResponse, arePropsEqual);
