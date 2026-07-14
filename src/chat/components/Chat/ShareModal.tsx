import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createShare } from '../../api/sessions';
import { useSessionStore } from '../../store/useSessionStore';
import { useLayoutStore } from '../../store/useLayoutStore';
import type { Message } from '../../types/session';
import { getLastTurnIndices } from '../../utils/projectMessages';
import { formatShareText } from '../../utils/shareText';
import { writeClipboard } from '../../utils/clipboard';
import styles from './ShareModal.module.css';

interface Props {
  sessionId: string;
  messages: Message[];
  onClose: () => void;
}

type Range = 'all' | 'partial' | 'last';

interface DisplayItem {
  index: number;
  role: 'user' | 'assistant';
  preview: string;
}

const PREVIEW_MAX = 80;

export default function ShareModal({ sessionId, messages, onClose }: Props) {
  const sessions = useSessionStore((s) => s.sessions);
  const chartStyleOverridesById = useLayoutStore((s) => s.chartStyleOverridesById);

  const sessionTitle = useMemo(() => {
    const found = sessions.find((s) => s.sessionId === sessionId);
    if (found?.title) return found.title;
    const firstUser = messages.find((m) => m.role === 'user');
    if (firstUser?.content) {
      const c = firstUser.content.trim();
      return c.length > 30 ? c.slice(0, 30) + '...' : c;
    }
    return '分享的对话';
  }, [sessions, sessionId, messages]);

  const displayItems = useMemo<DisplayItem[]>(() => {
    const items: DisplayItem[] = [];
    messages.forEach((m, i) => {
      if (m.role !== 'user' && m.role !== 'assistant') return;
      // 改写指令（详细/简洁）不进入分享选择列表——它是内部指令，不应分享
      if (m.role === 'user' && m._refine) return;
      const content = (m.content ?? '').trim();
      if (!content) return;
      items.push({
        index: i,
        role: m.role,
        preview: content.length > PREVIEW_MAX ? content.slice(0, PREVIEW_MAX) + '...' : content,
      });
    });
    return items;
  }, [messages]);

  const displayLen = displayItems.length;

  const [range, setRange] = useState<Range>('all');
  const [partialSelected, setPartialSelected] = useState<Set<number>>(new Set());

  const [linkStatus, setLinkStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [shareUrl, setShareUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState<'none' | 'text' | 'url'>('none');
  const [copyError, setCopyError] = useState<string>('');

  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const computedIndices = useMemo<number[] | null>(() => {
    if (range === 'all') return null;
    if (range === 'last') {
      const projected = displayItems.map((d) => ({ role: d.role, content: '' }));
      const idxs = getLastTurnIndices(displayLen, projected);
      if (!idxs) return [];
      return idxs.map((i) => displayItems[i].index);
    }
    if (range === 'partial') {
      return Array.from(partialSelected).sort((a, b) => a - b);
    }
    return null;
  }, [range, partialSelected, displayItems, displayLen]);

  const selectionCount = useMemo(() => {
    if (range === 'all') return displayLen;
    if (range === 'last') return (computedIndices?.length) ?? 0;
    return partialSelected.size;
  }, [range, displayLen, partialSelected, computedIndices]);

  const canProceed = selectionCount > 0;

  // 「多选」模式下，未选任何消息时的说明文字
  const emptySelectionHint = range === 'partial' && partialSelected.size === 0
    ? '请至少勾选一条消息'
    : null;

  const togglePartial = useCallback((idx: number) => {
    setPartialSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setPartialSelected(new Set(displayItems.map((d) => d.index)));
  }, [displayItems]);

  const invertAll = useCallback(() => {
    setPartialSelected((prev) => {
      const next = new Set<number>();
      for (const d of displayItems) {
        if (!prev.has(d.index)) next.add(d.index);
      }
      return next;
    });
  }, [displayItems]);

  const clearAll = useCallback(() => {
    setPartialSelected(new Set());
  }, []);

  const handleCreateLink = useCallback(async () => {
    if (!canProceed) return;
    setLinkStatus('loading');
    setErrorMsg('');
    try {
      const env = await createShare(sessionId, computedIndices, chartStyleOverridesById);
      if (env.success && env.data?.url) {
        // 服务端返回相对路径 /s/{token}，补全为完整 URL
        const relUrl: string = env.data.url;
        const fullUrl = relUrl.startsWith('http') ? relUrl : `${window.location.origin}${relUrl}`;
        setShareUrl(fullUrl);
        setLinkStatus('done');
      } else {
        setErrorMsg(env.error ?? '创建失败');
        setLinkStatus('error');
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '网络错误');
      setLinkStatus('error');
    }
  }, [sessionId, computedIndices, canProceed, chartStyleOverridesById]);

  // P1：返回选择页，保留已选状态
  const handleBackToSelect = useCallback(() => {
    setLinkStatus('idle');
    setShareUrl('');
    setErrorMsg('');
    setCopied('none');
    setCopyError('');
  }, []);

  // 注意：此处 handler 必须是 *同步* 函数，writeClipboard() 立即调用以保留
  // 用户手势上下文（iOS/WebView 上 execCommand 必须在用户手势同步栈内执行）。
  // 状态更新通过 .then 异步完成，这部分不再依赖手势上下文。
  const handleCopyText = useCallback(() => {
    if (!shareUrl) return;
    const text = formatShareText(sessionTitle, shareUrl);
    writeClipboard(text).then((ok) => {
      if (ok) {
        setCopyError('');
        setCopied('text');
        if (timerRef.current !== null) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied('none'), 2000);
      } else {
        setCopyError('复制失败，请长按上方文字手动选择复制');
      }
    });
  }, [shareUrl, sessionTitle]);

  const handleCopyUrl = useCallback(() => {
    if (!shareUrl) return;
    writeClipboard(shareUrl).then((ok) => {
      if (ok) {
        setCopyError('');
        setCopied('url');
        if (timerRef.current !== null) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied('none'), 2000);
      } else {
        setCopyError('复制失败，请长按链接手动选择复制');
      }
    });
  }, [shareUrl]);

  const handleInputClick = useCallback(() => {
    inputRef.current?.select();
  }, []);

  const showLinkResult = linkStatus === 'done';

  // 按钮文字：error 时显示"重试"
  const createBtnLabel = linkStatus === 'loading'
    ? '创建中...'
    : linkStatus === 'error'
      ? '重试'
      : '创建分享链接';

  return (
    <div className={styles.backdrop} onMouseDown={handleBackdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="分享对话">
        <div className={styles.header}>
          <span className={styles.headerTitle}>分享对话</span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="关闭">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M2 2l12 12M14 2L2 14" />
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          {!showLinkResult && (
            <>
              {/* ── 范围选择 ───────────────────────── */}
              <div>
                <div className={styles.label}>分享范围</div>
                <div className={styles.radioGroup}>
                  <label className={styles.radioItem}>
                    <input
                      type="radio"
                      name="share-range"
                      value="all"
                      checked={range === 'all'}
                      onChange={() => setRange('all')}
                    />
                    <span>全部消息（{displayLen} 条）</span>
                  </label>
                  <label className={styles.radioItem}>
                    <input
                      type="radio"
                      name="share-range"
                      value="last"
                      checked={range === 'last'}
                      onChange={() => setRange('last')}
                    />
                    <span>仅最后一轮对话</span>
                  </label>
                  <label className={styles.radioItem}>
                    <input
                      type="radio"
                      name="share-range"
                      value="partial"
                      checked={range === 'partial'}
                      onChange={() => setRange('partial')}
                    />
                    <span>手动选择消息{range === 'partial' && partialSelected.size > 0 ? `（已选 ${partialSelected.size} 条）` : ''}</span>
                  </label>
                </div>
              </div>

              {/* ── 多选列表（仅 partial 模式展开）── */}
              {range === 'partial' && (
                <div className={styles.partialBlock}>
                  <div className={styles.partialActions}>
                    <button type="button" className={styles.linkBtn} onClick={selectAll}>全选</button>
                    <button type="button" className={styles.linkBtn} onClick={invertAll}>反选</button>
                    <button type="button" className={styles.linkBtn} onClick={clearAll}>清空</button>
                  </div>
                  <div className={styles.partialList} role="listbox" aria-multiselectable="true">
                    {displayItems.length === 0 && (
                      <div className={styles.partialEmpty}>暂无可选消息</div>
                    )}
                    {displayItems.map((item) => {
                      const selected = partialSelected.has(item.index);
                      return (
                        <div
                          key={item.index}
                          className={`${styles.partialItem} ${selected ? styles.partialItemOn : ''}`}
                          role="option"
                          aria-selected={selected}
                          tabIndex={0}
                          onClick={() => togglePartial(item.index)}
                          onKeyDown={(e) => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault();
                              togglePartial(item.index);
                            }
                          }}
                        >
                          <div className={`${styles.checkbox} ${selected ? styles.checkboxOn : ''}`}>
                            {selected && (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6.2L4.8 9 10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <div className={styles.partialBody}>
                            <span className={`${styles.roleTag} ${item.role === 'user' ? styles.roleTagUser : styles.roleTagAi}`}>
                              {item.role === 'user' ? '提问' : '回答'}
                            </span>
                            <span className={styles.partialPreview}>{item.preview}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── P2 安全警示（创建前展示）── */}
              <div className={styles.securityNotice}>
                <svg width="14" height="14" fill="none" viewBox="0 0 16 16" className={styles.securityIcon} aria-hidden="true">
                  <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Z" fill="currentColor"/>
                  <path d="M7.25 10.75V7h1.5v3.75h-1.5ZM8 5.5a.875.875 0 1 0 0 1.75A.875.875 0 0 0 8 5.5Z" fill="currentColor"/>
                </svg>
                <span>生成的链接对任何获得链接的人可见（无需登录），请确认分享范围后再创建。</span>
              </div>

              {emptySelectionHint && (
                <div className={styles.emptyHint}>{emptySelectionHint}</div>
              )}

              {errorMsg && <div className={styles.errorTip}>{errorMsg}</div>}

              <div className={styles.footer}>
                <button type="button" className={styles.cancelBtn} onClick={onClose}>取消</button>
                <button
                  type="button"
                  className={styles.createBtn}
                  onClick={() => void handleCreateLink()}
                  disabled={!canProceed || linkStatus === 'loading'}
                >
                  {createBtnLabel}
                </button>
              </div>
            </>
          )}

          {/* ── 链接结果 ─────────────────────────── */}
          {showLinkResult && (
            <>
              <div className={styles.resultHeader}>
                <span className={styles.label}>分享链接已生成</span>
              </div>

              <div className={styles.shareTextBox}>
                <div className={styles.shareTextHint}>推荐复制以下完整文字（含标题与链接）</div>
                <pre className={styles.shareTextPreview}>{formatShareText(sessionTitle, shareUrl)}</pre>
                <button
                  type="button"
                  className={`${styles.copyBtn} ${copied === 'text' ? styles.copyBtnDone : ''}`}
                  onClick={handleCopyText}
                >
                  {copied === 'text' ? '已复制' : '复制文字+链接'}
                </button>
              </div>

              <div className={styles.label}>仅复制链接</div>
              <div className={styles.urlRow}>
                <input
                  ref={inputRef}
                  type="text"
                  className={styles.urlInput}
                  value={shareUrl}
                  readOnly
                  onClick={handleInputClick}
                />
                <button
                  type="button"
                  className={`${styles.copyBtn} ${styles.copyBtnSecondary} ${copied === 'url' ? styles.copyBtnDone : ''}`}
                  onClick={handleCopyUrl}
                >
                  {copied === 'url' ? '已复制' : '复制'}
                </button>
              </div>

              {copyError && <div className={styles.errorTip}>{copyError}</div>}

              <div className={styles.footer}>
                {/* P1：返回修改范围 */}
                <button type="button" className={styles.backBtn} onClick={handleBackToSelect}>
                  ← 重新选择范围
                </button>
                <button type="button" className={styles.cancelBtn} onClick={onClose}>关闭</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
