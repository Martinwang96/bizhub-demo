import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Icon,
  RefreshIcon,
  PinIcon,
  ExpandVerticalIcon,
  ShrinkVerticalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'tdesign-icons-react';
import { Dropdown } from 'tdesign-react';
import type { DropdownProps } from 'tdesign-react';
import { IconTooltip } from '@shared/components';
import { requestMessageVisualize } from '../../api/charts';
import { useSessionStore } from '../../store/useSessionStore';
import { useStreamStore } from '../../store/useStreamStore';
import { useLayoutStore } from '../../store/useLayoutStore';
import ConfirmPopover from './ConfirmPopover';
import styles from './MessageActions.module.css';

export interface MessageActionsProps {
  /** 会话 id */
  sid: string;
  /** 该消息在前端展示消息列表中的下标（同 createShare 的 message_indices 索引空间） */
  messageIndex: number;
  /** 分享按钮点击：复用 AppShell 顶栏的 handleShareOpen；未提供时分享按钮隐藏 */
  onShareOpen?: () => void;
  /** 重新对话：以本条 assistant 为锚点重新生成该轮回答 */
  onRegenerate?: (messageIndex: number) => void;
  /** 改写：详细/简洁。保留旧回答，追加新版本到尾部 */
  onRefine?: (messageIndex: number, mode: 'detailed' | 'concise') => void;
  /** 该轮是否已置顶（turn 级 pin） */
  pinned?: boolean;
  /** 置顶 / 取消置顶本轮对话 */
  onPin?: (messageIndex: number, pinned: boolean) => void;
  /** 该消息是否已结束（非流式中）；false 时本组件不应被渲染，仅做防御 */
  finished?: boolean;
  /** 版本组中当前版本序号（1-based）；与 versionTotal 同时 > 1 时显示翻页导航 */
  versionPos?: number;
  /** 版本组总版本数 */
  versionTotal?: number;
  /** 翻页：-1 上一版本 / +1 下一版本（滚动定位到目标 assistant 并高亮） */
  onVersionNavigate?: (direction: -1 | 1) => void;
}

const ERROR_AUTO_DISMISS_MS = 3000;

export default function MessageActions({
  sid,
  messageIndex,
  onShareOpen,
  onRegenerate,
  onRefine,
  pinned = false,
  onPin,
  finished = true,
  versionPos,
  versionTotal,
  onVersionNavigate,
}: MessageActionsProps) {
  const shareEnabled = useSessionStore((s) => s.shareEnabled);
  const appendChartToMessage = useSessionStore((s) => s.appendChartToMessage);
  const setChartPaneOpen = useLayoutStore((s) => s.setChartPaneOpen);
  // 会话级 loading 守卫：本会话有任意轮在流式中时禁用「重新对话」，避免并发
  const sessionLoading = useStreamStore((s) => !!s.ctxs[sid]?.loading);

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const chartBtnRef = useRef<HTMLButtonElement | null>(null);
  const errorTimerRef = useRef<number | null>(null);

  // 错误自动消失
  useEffect(() => {
    if (!errorMsg) return;
    if (errorTimerRef.current !== null) {
      window.clearTimeout(errorTimerRef.current);
    }
    errorTimerRef.current = window.setTimeout(() => {
      setErrorMsg(null);
      errorTimerRef.current = null;
    }, ERROR_AUTO_DISMISS_MS);
    return () => {
      if (errorTimerRef.current !== null) {
        window.clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
    };
  }, [errorMsg]);

  const openPopover = useCallback(() => {
    if (loading) return;
    setErrorMsg(null);
    setPopoverOpen(true);
  }, [loading]);

  const closePopover = useCallback(() => setPopoverOpen(false), []);

  // 下拉菜单点击：详细/简洁走改写（保留旧回答），重新生成走截断重答
  const handleMenuClick = useCallback<NonNullable<DropdownProps['onClick']>>(
    (data) => {
      if (sessionLoading) return;
      const value = data.value as 'detailed' | 'concise' | 'regenerate';
      if (value === 'regenerate') onRegenerate?.(messageIndex);
      else onRefine?.(messageIndex, value);
    },
    [sessionLoading, onRegenerate, onRefine, messageIndex],
  );

  const handlePin = useCallback(() => {
    onPin?.(messageIndex, !pinned);
  }, [onPin, messageIndex, pinned]);

  const handleConfirm = useCallback(async () => {
    setPopoverOpen(false);
    setLoading(true);
    setErrorMsg(null);
    try {
      const charts = await requestMessageVisualize(sid, messageIndex);
      charts.forEach((chart) => appendChartToMessage(sid, messageIndex, chart));
      // 确保图表面板打开；activeChartId 会被 ChatPage 中的 useEffect 自动切到最新图
      setChartPaneOpen(sid, true);
    } catch (e) {
      console.error('regenerate_chart failed', e);
      const msg = e instanceof Error ? e.message : '生成失败，请重试';
      setErrorMsg(msg || '生成失败，请重试');
    } finally {
      setLoading(false);
    }
  }, [appendChartToMessage, messageIndex, setChartPaneOpen, sid]);

  if (!finished) return null;

  return (
    <div className={styles.bar}>
      {shareEnabled && onShareOpen && (
        <IconTooltip content="分享对话">
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onShareOpen}
            aria-label="分享对话"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <path d="M8.7 10.6l6.6-3.8M8.7 13.4l6.6 3.8" />
            </svg>
          </button>
        </IconTooltip>
      )}

      <IconTooltip content={loading ? '正在生成图表…' : '生成图表'}>
        <button
          ref={chartBtnRef}
          type="button"
          className={styles.iconBtn}
          onClick={openPopover}
          disabled={loading}
          aria-label="生成图表"
          aria-busy={loading || undefined}
        >
          {loading ? (
            <svg
              className={styles.spinner}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M21 12a9 9 0 1 1-6.22-8.56" />
            </svg>
          ) : (
            <Icon name="chart-bar" style={{ fontSize: 16 }} />
          )}
        </button>
      </IconTooltip>

      {(onRegenerate || onRefine) && (
        <IconTooltip content={sessionLoading ? '正在生成中…' : '重新生成'}>
          <Dropdown
            trigger="click"
            minColumnWidth={120}
            options={[
              {
                content: '详细',
                value: 'detailed',
                prefixIcon: (
                  <ExpandVerticalIcon
                    fillColor={['transparent', 'transparent']}
                    strokeColor={['currentColor', 'currentColor']}
                    strokeWidth={2}
                  />
                ),
              },
              {
                content: '简洁',
                value: 'concise',
                prefixIcon: (
                  <ShrinkVerticalIcon
                    fillColor={['transparent', 'transparent']}
                    strokeColor={['currentColor', 'currentColor']}
                    strokeWidth={2}
                  />
                ),
              },
              {
                content: '重新生成',
                value: 'regenerate',
                prefixIcon: (
                  <RefreshIcon fillColor="transparent" strokeColor="currentColor" strokeWidth={2} />
                ),
              },
            ]}
            onClick={handleMenuClick}
            disabled={sessionLoading}
          >
            <button
              type="button"
              className={styles.iconBtn}
              disabled={sessionLoading}
              aria-label="重新生成 / 详细 / 简洁"
            >
              <RefreshIcon fillColor="transparent" strokeColor="currentColor" strokeWidth={2} />
            </button>
          </Dropdown>
        </IconTooltip>
      )}

      {!pinned && (
        <IconTooltip content="置顶到常用对话">
          <button
            type="button"
            className={styles.iconBtn}
            onClick={handlePin}
            aria-label="置顶到常用对话"
            aria-pressed={false}
          >
            <PinIcon
              fillColor="transparent"
              strokeColor="currentColor"
              strokeWidth={2}
            />
          </button>
        </IconTooltip>
      )}

      {errorMsg && (
        <span className={styles.errorText} role="status">{errorMsg}</span>
      )}

      {versionTotal && versionTotal > 1 && versionPos && (
        <div className={styles.pager}>
          <button
            type="button"
            className={styles.pagerBtn}
            onClick={() => onVersionNavigate?.(-1)}
            disabled={versionPos <= 1}
            title="上一版本"
            aria-label="上一版本"
          >
            <ChevronLeftIcon
              fillColor={['transparent', 'transparent']}
              strokeColor={['currentColor', 'currentColor']}
              strokeWidth={2}
            />
          </button>
          <span className={styles.pagerText}>{versionPos}/{versionTotal}</span>
          <button
            type="button"
            className={styles.pagerBtn}
            onClick={() => onVersionNavigate?.(1)}
            disabled={versionPos >= versionTotal}
            title="下一版本"
            aria-label="下一版本"
          >
            <ChevronRightIcon
              fillColor={['transparent', 'transparent']}
              strokeColor={['currentColor', 'currentColor']}
              strokeWidth={2}
            />
          </button>
        </div>
      )}

      <ConfirmPopover
        anchorRef={chartBtnRef}
        open={popoverOpen}
        title="生成图表"
        description="将基于本轮对话数据生成图表"
        confirmText="确认生成"
        cancelText="取消"
        loading={loading}
        onConfirm={handleConfirm}
        onCancel={closePopover}
      />
    </div>
  );
}
