import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createReportLinkShare,
  listShareCandidates,
  shareReport,
  type ReportLinkShare,
  type ReportMeta,
  type ShareCandidate,
} from '../../api/reports';
import { writeClipboard } from '../../utils/clipboard';
import { formatReportShareText } from '../../utils/shareText';
import styles from './ShareReportModal.module.css';

interface Props {
  report: ReportMeta;
  onClose: () => void;
  onUpdated: (meta: ReportMeta) => void;
}

type ShareType = 'internal' | 'link';

/** 报表分享弹窗：平台内分享指定用户；链接分享仅 Biz-Hub 有权限用户可访问。 */
export default function ShareReportModal({ report, onClose, onUpdated }: Props) {
  const [shareType, setShareType] = useState<ShareType>('internal');
  const [candidates, setCandidates] = useState<ShareCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(report.sharedTo));
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [error, setError] = useState('');
  const [rejected, setRejected] = useState<string[]>([]);
  const [linkShare, setLinkShare] = useState<ReportLinkShare | null>(null);
  const [copied, setCopied] = useState<'none' | 'text' | 'url'>('none');

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    listShareCandidates()
      .then((list) => { if (alive) setCandidates(list); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : '加载失败'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => () => {
    if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => c.loginName.toLowerCase().includes(q));
  }, [candidates, query]);

  const fullLink = useMemo(() => {
    if (!linkShare?.url) return '';
    return linkShare.url.startsWith('http') ? linkShare.url : `${window.location.origin}${linkShare.url}`;
  }, [linkShare]);

  const shareText = useMemo(
    () => (fullLink ? formatReportShareText(report.title, fullLink) : ''),
    [fullLink, report.title],
  );

  const toggle = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    setRejected([]);
    try {
      const { meta, rejected: rej } = await shareReport(report.reportId, Array.from(selected));
      onUpdated(meta);
      if (rej.length) setRejected(rej);
      else onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }, [report.reportId, selected, saving, onUpdated, onClose]);

  const handleCreateLink = useCallback(async () => {
    if (linkLoading) return;
    setLinkLoading(true);
    setError('');
    setCopied('none');
    try {
      const data = await createReportLinkShare(report.reportId);
      setLinkShare(data);
      if (data.report) onUpdated(data.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建链接失败');
    } finally {
      setLinkLoading(false);
    }
  }, [linkLoading, onUpdated, report.reportId]);

  // 切到链接分享时自动获取链接，无需手动点按钮
  useEffect(() => {
    if (shareType === 'link' && !linkShare && !linkLoading) {
      void handleCreateLink();
    }
  }, [shareType, linkShare, linkLoading, handleCreateLink]);

  const handleCopyText = useCallback(() => {
    if (!shareText) return;
    writeClipboard(shareText).then((ok) => {
      if (!ok) {
        setError('复制失败，请长按上方文字手动选择复制');
        return;
      }
      setError('');
      setCopied('text');
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied('none'), 2000);
    });
  }, [shareText]);

  const handleCopyLink = useCallback(() => {
    if (!fullLink) return;
    writeClipboard(fullLink).then((ok) => {
      if (!ok) {
        setError('复制失败，请手动选择链接复制');
        return;
      }
      setError('');
      setCopied('url');
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied('none'), 2000);
    });
  }, [fullLink]);

  return (
    <div className={styles.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="分享看板">
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <span className={styles.titleIcon} aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="M8.7 10.6l6.6-3.8M8.7 13.4l6.6 3.8" />
              </svg>
            </span>
            <span className={styles.title}>分享看板</span>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <div className={styles.body}>
          <section className={styles.section}>
            <div className={styles.sectionLabel}>分享类型</div>
            <div className={styles.typeGrid}>
              <button
                type="button"
                className={`${styles.typeCard} ${shareType === 'internal' ? styles.typeCardActive : ''}`}
                onClick={() => { setShareType('internal'); setError(''); }}
              >
                <span className={styles.typeIcon} aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </span>
                <span className={styles.typeText}>
                  <span className={styles.typeTitle}>平台内分享</span>
                  <span className={styles.typeDesc}>指定用户可访问</span>
                </span>
                <span className={styles.checkBadge}>✓</span>
              </button>

              <button
                type="button"
                className={`${styles.typeCard} ${shareType === 'link' ? styles.typeCardActive : ''}`}
                onClick={() => { setShareType('link'); setError(''); }}
              >
                <span className={styles.typeIcon} aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </span>
                <span className={styles.typeText}>
                  <span className={styles.typeTitle}>链接分享</span>
                  <span className={styles.typeDesc}>Biz-Hub 有权限用户可访问</span>
                </span>
                <span className={styles.checkBadge}>✓</span>
              </button>
            </div>
          </section>

          {shareType === 'internal' ? (
            <section className={styles.section}>
              <div className={styles.sectionLabel}>被分享者</div>
              <div className={styles.searchBox}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  placeholder="搜索用户"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              {loading ? (
                <div className={styles.hint}>加载中...</div>
              ) : filtered.length === 0 ? (
                <div className={styles.hint}>无可分享用户</div>
              ) : (
                <div className={styles.list}>
                  {filtered.map((c) => {
                    const on = selected.has(c.loginName);
                    return (
                      <label key={c.loginName} className={styles.item}>
                        <input type="checkbox" checked={on} onChange={() => toggle(c.loginName)} />
                        <span className={styles.name}>{c.loginName}</span>
                        <span className={styles.role}>{c.role}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {rejected.length > 0 && (
                <div className={styles.rejected}>
                  以下用户不在白名单内，未被分享：{rejected.join('、')}
                </div>
              )}
            </section>
          ) : (
            <section className={styles.section}>
              {linkLoading ? (
                <div className={styles.hint}>正在生成链接...</div>
              ) : fullLink ? (
                <>
                  <div className={styles.shareTextBox}>
                    <div className={styles.shareTextHint}>推荐复制以下完整文字（含标题与链接）</div>
                    <pre className={styles.shareTextPreview}>{shareText}</pre>
                    <div className={styles.shareTextActions}>
                      <button
                        type="button"
                        className={styles.btn}
                        onClick={handleCopyText}
                      >
                        {copied === 'text' ? '已复制' : '复制文字+链接'}
                      </button>
                    </div>
                  </div>

                  <div className={styles.sectionLabel}>仅复制链接</div>
                  <div className={styles.linkResult}>
                    <input className={styles.linkInput} readOnly value={fullLink} onClick={(e) => e.currentTarget.select()} />
                    <button type="button" className={styles.btn} onClick={handleCopyLink}>
                      {copied === 'url' ? '已复制' : '复制'}
                    </button>
                  </div>
                </>
              ) : null}
            </section>
          )}

          {error && <div className={styles.errorTip}>{error}</div>}
        </div>

        <div className={styles.footer}>
          {shareType === 'internal' && <span className={styles.count}>已选 {selected.size} 人</span>}
          <div className={styles.footerBtns}>
            <button type="button" className={styles.btn} onClick={onClose}>取消</button>
            {shareType === 'internal' && (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => void handleSave()}
                disabled={saving}
              >
                {saving ? '分享中...' : '分享'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
