/**
 * MobileSessionDetailDrawer — 移动端「会话详情抽屉」一行复用封装。
 *
 * 抽屉本身（MobileRightDrawer）+ chat stream（MobileSessionDetailContent）+ 元信息行
 * 都在此整合；外部仅需用 `useMobileSessionDetail()` hook 拿状态/openDetail，传给本组件。
 *
 * - PC 端等价物：admin/pages/SessionDetailModal.tsx + useSessionDetail
 * - 用于：MobileSessionsPage / MobileStatsLatencyTab 等移动端 admin 页
 *
 * 元信息（用户 / sessionId / 更新时间）使用 inline style + var(--token)，避免跨页 CSS module
 * 依赖；视觉与 MobileSessionsPage 的 drawerMeta 在 token 上保持一致（使用 design tokens 内
 * 已有的 --muted / --line / --r-xs 等）。
 */
import { useState } from 'react';
import { useToast } from '@shared/components';
import MobileRightDrawer from '../../../shared/MobileRightDrawer';
import { fetchSessionDetail } from '../../../../admin/api/adminConsole';
import MobileSessionDetailContent, {
  type SessionDetailData,
} from './MobileSessionDetailContent';

function fmtTime(ts?: number): string {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false });
}

const META_ITEM_STYLE: React.CSSProperties = {
  fontSize: 'var(--fs-xs)',
  color: 'var(--muted)',
  whiteSpace: 'nowrap',
};

const META_CODE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--ff-mono, ui-monospace, SFMono-Regular, monospace)',
  fontSize: 'var(--fs-xs)',
  padding: '0 6px',
  borderRadius: 'var(--r-xs)',
  background: 'var(--surface-2, var(--hover-soft))',
  color: 'var(--text)',
  maxWidth: 200,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  display: 'inline-block',
};

/**
 * useMobileSessionDetail — 移动端 admin 页"打开会话详情"的状态封装。
 *
 * 与 PC 版 useSessionDetail 行为一致；额外维护 detailOpen 以便抽屉关闭后保留卸载动画。
 */
export function useMobileSessionDetail() {
  const toast = useToast();
  const [detail, setDetail] = useState<SessionDetailData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const openDetail = async (sid: string) => {
    setDetailOpen(true);
    setDetail({ sessionId: sid, title: '加载中…', messages: [] });
    setDetailLoading(true);
    const env = await fetchSessionDetail(sid).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : '详情加载失败');
      return null;
    });
    setDetailLoading(false);
    if (env?.success) {
      setDetail(env.data as SessionDetailData);
    } else if (env) {
      toast.error(env.error ?? '详情加载失败');
      setDetail(null);
    }
  };

  const closeDetail = () => setDetailOpen(false);

  return { detail, detailOpen, detailLoading, openDetail, closeDetail };
}

export interface MobileSessionDetailDrawerProps {
  detail: SessionDetailData | null;
  open: boolean;
  loading: boolean;
  onClose: () => void;
}

export default function MobileSessionDetailDrawer({
  detail,
  open,
  loading,
  onClose,
}: MobileSessionDetailDrawerProps) {
  const meta = detail ? (
    <>
      <span style={META_ITEM_STYLE}>用户：{detail.user || '-'}</span>
      <code style={META_CODE_STYLE} title={detail.sessionId || ''}>
        {detail.sessionId || '-'}
      </code>
      <span style={META_ITEM_STYLE}>更新：{fmtTime(detail.updatedAt)}</span>
    </>
  ) : null;

  return (
    <MobileRightDrawer
      open={open}
      title={detail?.title || '会话详情'}
      meta={meta}
      onClose={onClose}
    >
      <MobileSessionDetailContent detail={detail} loading={loading} />
    </MobileRightDrawer>
  );
}
