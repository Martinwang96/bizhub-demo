import { SkeletonStack } from '@shared/components';
import Markdown from '@shared/components/content/Markdown';
import styles from './MobileSessionDetailContent.module.css';

export interface SessionDetailMessage {
  role?: string;
  content?: string;
  index?: number | string;
  time?: number;
  status?: string;
  stepCount?: number;
  totalDurationMs?: number;
  toolCallId?: string;
  toolCallsCount?: number;
}

export interface SessionDetailData {
  sessionId?: string;
  user?: string;
  title?: string;
  updatedAt?: number;
  riskTags?: string[];
  messages?: SessionDetailMessage[];
}

interface MobileSessionDetailContentProps {
  detail: SessionDetailData | null;
  loading: boolean;
}

function fmtTime(ts?: number): string {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false });
}

function buildMeta(m: SessionDetailMessage): string[] {
  const meta: string[] = [];
  meta.push(`#${m.index ?? '-'}`);
  if (m.time) meta.push(fmtTime(m.time));
  if (m.status) meta.push(`status: ${m.status}`);
  if (m.stepCount) meta.push(`steps: ${m.stepCount}`);
  if (m.totalDurationMs) meta.push(`${Math.round(m.totalDurationMs)}ms`);
  if (m.toolCallId) meta.push(`tool: ${m.toolCallId}`);
  if (m.toolCallsCount) meta.push(`tool calls: ${m.toolCallsCount}`);
  return meta;
}

function MessageBubble({ m }: { m: SessionDetailMessage }) {
  const role = String(m.role || 'unknown');
  const isUser = role === 'user';
  const isAssistant = role === 'assistant';
  const bubbleClass =
    role === 'user' ? styles.bubbleUser
    : role === 'assistant' ? styles.bubbleAssistant
    : role === 'tool' ? styles.bubbleTool
    : styles.bubbleOther;

  const meta = buildMeta(m);

  return (
    <div className={`${styles.row} ${isUser ? styles.rowUser : styles.rowOther}`}>
      <div className={`${styles.bubble} ${bubbleClass}`}>
        <div className={styles.bubbleMeta}>
          <span className={styles.roleBadge}>{role}</span>
          {meta.map((p, i) => (
            <span key={i} className={styles.metaItem}>{p}</span>
          ))}
        </div>
        {isAssistant
          ? <Markdown text={m.content || ''} className={styles.bubbleMarkdown} />
          : <div className={styles.bubbleContent}>{m.content || ''}</div>}
      </div>
    </div>
  );
}

/**
 * 移动端会话详情抽屉 body —— chat stream。
 * - 3 种气泡：user 右气泡 primary 实色 / assistant 左气泡 primary 边 / tool 左气泡 mono + warn 左竖条
 * - meta 行字段顺序对齐 PC 版 SessionMessage
 * - loading / empty 完整态
 */
export default function MobileSessionDetailContent({ detail, loading }: MobileSessionDetailContentProps) {
  if (loading) {
    return (
      <div className={styles.skeletonWrap}>
        <SkeletonStack widths={[80, 92, 70]} />
      </div>
    );
  }

  if (!detail) {
    return <div className={styles.empty}>暂无详情</div>;
  }

  const messages = detail.messages ?? [];

  if (messages.length === 0) {
    return <div className={styles.empty}>该会话暂无可展示消息</div>;
  }

  return (
    <div className={styles.chat}>
      {messages.map((m, i) => (
        <MessageBubble key={i} m={m} />
      ))}
    </div>
  );
}
