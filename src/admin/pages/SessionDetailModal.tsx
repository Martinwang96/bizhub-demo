/**
 * SessionDetailModal — 跨 admin 入口共享的会话详情弹层。
 *
 * 提取自 SessionsPage.tsx，本文件不引入新视觉，仅作为可被 SessionsPage / StatsLatencyTab
 * 等多处复用的受控组件。CSS 仍走 SessionsPage.module.css，避免双份样式。
 *
 * 同时导出 `useSessionDetail()` hook：封装 detail/loading 状态与 fetchSessionDetail 调用，
 * 让"点击会话条目 → 弹层展开详情"在多页保持一致行为（含错误 toast 与占位标题）。
 */
import { useState } from 'react';
import { Modal, SkeletonStack, useToast } from '@shared/components';
import Markdown from '@shared/components/content/Markdown';
import { fetchSessionDetail } from '../api/adminConsole';
import styles from './SessionsPage.module.css';

export interface MessageItem {
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

export interface SessionDetail {
  sessionId?: string;
  user?: string;
  title?: string;
  updatedAt?: number;
  riskTags?: string[];
  messages?: MessageItem[];
}

export function fmtTime(ts?: number): string {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString('zh-CN');
}

export interface SessionDetailModalProps {
  detail: SessionDetail | null;
  loading: boolean;
  onClose: () => void;
}

/**
 * useSessionDetail — 跨页复用的"会话详情"状态与异步加载封装。
 *
 * 使用：
 *   const { detail, loading, openDetail, closeDetail } = useSessionDetail();
 *   <SessionDetailModal detail={detail} loading={loading} onClose={closeDetail} />
 *   onClick={() => void openDetail(sid)}
 */
export function useSessionDetail() {
  const toast = useToast();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const openDetail = async (sid: string) => {
    setDetail({ sessionId: sid, title: '加载中…', messages: [] });
    setLoading(true);
    const env = await fetchSessionDetail(sid).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : '详情加载失败');
      return null;
    });
    setLoading(false);
    if (env?.success) {
      setDetail(env.data as SessionDetail);
    } else if (env) {
      toast.error(env.error ?? '详情加载失败');
      setDetail(null);
    }
  };

  const closeDetail = () => setDetail(null);

  return { detail, loading, openDetail, closeDetail, setDetail };
}

export default function SessionDetailModal({ detail, loading, onClose }: SessionDetailModalProps) {
  if (!detail) return null;

  const meta = (
    <>
      <span className={styles.metaItem}>用户：{detail.user || '-'}</span>
      <code className={styles.code}>{detail.sessionId || '-'}</code>
      <span className={styles.metaItem}>更新：{fmtTime(detail.updatedAt)}</span>
      {detail.riskTags?.length
        ? detail.riskTags.map((r) => (
            <span key={r} className={`${styles.tag} ${styles.tagWarn}`}>{r}</span>
          ))
        : null}
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={detail.title || '会话详情'}
      meta={meta}
      width={920}
      bodyBleed
    >
      <div className={styles.chat}>
        {loading ? (
          <SkeletonStack widths={[80, 92, 70]} />
        ) : !detail.messages || detail.messages.length === 0 ? (
          <div className={styles.empty}>该会话暂无可展示消息</div>
        ) : (
          detail.messages.map((m, i) => <SessionMessage key={i} m={m} />)
        )}
      </div>
    </Modal>
  );
}

function SessionMessage({ m }: { m: MessageItem }) {
  const role = String(m.role || 'unknown');
  const isUser = role === 'user';
  const isAssistant = role === 'assistant';
  const roleClass = role === 'user' ? styles.msgUser
    : role === 'assistant' ? styles.msgAssistant
    : role === 'tool' ? styles.msgTool
    : styles.msgOther;

  const meta: string[] = [];
  meta.push(`#${m.index ?? '-'}`);
  if (m.time) meta.push(fmtTime(m.time));
  if (m.status) meta.push(`status: ${m.status}`);
  if (m.stepCount) meta.push(`steps: ${m.stepCount}`);
  if (m.totalDurationMs) meta.push(`${Math.round(m.totalDurationMs)}ms`);
  if (m.toolCallId) meta.push(`tool: ${m.toolCallId}`);
  if (m.toolCallsCount) meta.push(`tool calls: ${m.toolCallsCount}`);

  return (
    <div className={`${styles.msg} ${isUser ? styles.msgRowUser : styles.msgRowOther} ${roleClass}`}>
      <div className={styles.bubble}>
        <div className={styles.bubbleMeta}>
          <span className={styles.roleBadge}>{role}</span>
          {meta.map((p, i) => <span key={i}>{p}</span>)}
        </div>
        {isAssistant
          ? <Markdown text={m.content || ''} className={styles.bubbleMarkdown} />
          : <div className={styles.bubbleContent}>{m.content || ''}</div>}
      </div>
    </div>
  );
}
