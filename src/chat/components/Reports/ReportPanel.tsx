import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SendIcon, CheckIcon, GestureSlideLeftAndRightIcon } from 'tdesign-icons-react';
import { artifactPreviewUrl, artifactDownloadUrl, fetchArtifactMeta, publishReport } from '../../api/reports';
import type { ReportDownloadItem } from '../../utils/reportSelectors';
import ReportViewer from './ReportViewer';
import styles from './ReportPanel.module.css';

interface Props {
  /** 最近一次含 report.html 的执行 id；用于 HTML 预览与发布。无 HTML 产物时为 null。 */
  previewExecId: string | null;
  /** 全部可下载产物（跨执行汇总，已排除 report.html）。 */
  downloads: ReportDownloadItem[];
  /** 是否正在生成（run_code 仍在跑）；true 时优先展示骨架屏。 */
  generating: boolean;
  sessionId: string;
  onClose: () => void;
  /** 切换回图表区（提供时头部展示「切换到图表」按钮）。与 ChartPanel.onOpenReport 对称。 */
  onOpenChart?: () => void;
}

/**
 * 对话右侧「看板区」：与 ChartPanel 同级的常驻分栏面板。
 * - 生成中：展示骨架屏（对齐图表区视觉语言）。
 * - 含 HTML 报表：复用 ReportViewer（预览 / 下载），头部提供「发布看板」图标按钮（发布后切换为「查看看板」）；
 *   若同时还有其他产物（如 .docx），在预览下方追加下载条，保证二者同时可访问、互不覆盖。
 * - 仅其他产物：展示下载列表。
 */
export default function ReportPanel({ previewExecId, downloads, generating, sessionId, onClose, onOpenChart }: Props) {
  const navigate = useNavigate();
  const [publishOpen, setPublishOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [publishedId, setPublishedId] = useState('');

  // 新一次生成（预览产物变化）时清空上一次的发布态
  useEffect(() => {
    setPublishedId('');
    setError('');
    setTitle('');
    setPublishOpen(false);
  }, [previewExecId]);

  useEffect(() => {
    if (!publishOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setPublishOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [publishOpen]);

  // 打开发布弹窗：先拉看板 meta 拿到 title 预填输入框，再开 modal。
  // 失败时静默回退空串（输入框仍显示原 placeholder），不影响发布流程。
  const openPublishModal = useCallback(async () => {
    if (!previewExecId) return;
    setError('');
    try {
      const meta = await fetchArtifactMeta(previewExecId);
      setTitle(meta.title || '');
    } catch {
      setTitle('');
    }
    setPublishOpen(true);
  }, [previewExecId]);

  const handlePublish = useCallback(async () => {
    if (!previewExecId || publishing) return;
    setPublishing(true);
    setError('');
    try {
      const meta = await publishReport(previewExecId, title.trim() || '数据看板', sessionId);
      setPublishedId(meta.reportId);
      // 发布成功后保留弹窗，将「确认发布」按钮切换为绿色的「已发布，点击查看」
    } catch (e) {
      setError(e instanceof Error ? e.message : '发布失败');
    } finally {
      setPublishing(false);
    }
  }, [previewExecId, title, sessionId, publishing]);

  const hasReport = !!previewExecId;
  const showSkeleton = generating || (!hasReport && downloads.length === 0);

  // 「切换到图表」按钮：与 ChartPanel 的「切换到报表」对称，仅当父级提供 onOpenChart（会话内存在图表）时渲染。
  const openChartBtn = onOpenChart ? (
    <button
      type="button"
      className={styles.menuBtn}
      title="切换到图表"
      aria-label="切换到图表"
      onClick={onOpenChart}
    >
      <GestureSlideLeftAndRightIcon
        fillColor={['transparent', 'transparent']}
        strokeColor={['currentColor', 'currentColor']}
        strokeWidth={2}
      />
    </button>
  ) : null;

  /**
   * 头部操作：仅保留「发布看板」图标按钮。
   * 发布前为「发布看板」（SendIcon，打开发布弹窗）；发布后切换为「查看看板」（CheckIcon，跳转报表详情）。
   */
  const actions = !showSkeleton && hasReport
    ? (
        publishedId ? (
          <button
            type="button"
            className={styles.menuBtn}
            title="查看看板"
            aria-label="查看看板"
            onClick={() => navigate(`/reports/${encodeURIComponent(publishedId)}`)}
          >
            <CheckIcon
              fillColor={['transparent', 'transparent']}
              strokeColor={['currentColor', 'currentColor']}
              strokeWidth={2}
            />
          </button>
        ) : (
          <button
            type="button"
            className={styles.menuBtn}
            title="发布看板"
            aria-label="发布看板"
            onClick={() => void openPublishModal()}
          >
            <SendIcon
              fillColor={['transparent', 'transparent']}
              strokeColor={['currentColor', 'currentColor']}
              strokeWidth={2}
            />
          </button>
        )
      )
    : undefined;

  return (
    <aside className={styles.panel} aria-label="看板区">
      {showSkeleton ? (
        <div className={styles.generating}>
          <div className={styles.generatingTop}>
            <span className={styles.generatingBadge}>Generating theme</span>
            <div className={styles.headActions}>
              {openChartBtn}
              <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="关闭">✕</button>
            </div>
          </div>
          <div className={styles.generatingBody}>
            <div className={styles.generatingTitle}>正在生成看板，请稍候</div>
            <div className={styles.skeletonRow}>
              <div className={styles.skeletonCard}>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
              </div>
              <div className={`${styles.skeletonCard} ${styles.skeletonCardAccent}`}>
                <span className={styles.sparkle}>✦</span>
                <div className={styles.skeletonBar} />
                <div className={styles.skeletonLine} />
                <div className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
              </div>
            </div>
            <div className={styles.hint}>看板生成中会先查询真实数据，再渲染为可交互的 HTML 页面</div>
          </div>
        </div>
      ) : hasReport ? (
        <div className={styles.reportWrap}>
          <div className={styles.viewerHost}>
            <ReportViewer
              src={artifactPreviewUrl(previewExecId)}
              fileName="dashboard.html"
              onClose={onClose}
              leadingActions={openChartBtn}
              actions={actions}
            />
          </div>
          {downloads.length > 0 && (
            <div className={styles.downloadBar}>
              <span className={styles.downloadBarLabel}>其他产物</span>
              <ul className={styles.downloadBarList}>
                {downloads.map((d) => (
                  <li key={`${d.execId}:${d.name}`} className={styles.downloadChip}>
                    <span className={styles.fileIcon} aria-hidden>📄</span>
                    <span className={styles.fileName}>{d.name}</span>
                    <a
                      className={styles.downloadLink}
                      href={artifactDownloadUrl(d.execId, d.name)}
                      download={d.name}
                    >
                      下载
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.downloadPanel}>
          <div className={styles.downloadHeader}>
            <span className={styles.downloadTitle}>产物文件</span>
            <div className={styles.headActions}>
              {openChartBtn}
              <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="关闭">✕</button>
            </div>
          </div>
          <div className={styles.downloadBody}>
            {downloads.length ? (
              <ul className={styles.downloadList}>
                {downloads.map((d) => (
                  <li key={`${d.execId}:${d.name}`} className={styles.downloadItem}>
                    <span className={styles.fileIcon} aria-hidden>📄</span>
                    <span className={styles.fileName}>{d.name}</span>
                    <a
                      className={styles.downloadLink}
                      href={artifactDownloadUrl(d.execId, d.name)}
                      download={d.name}
                    >
                      下载
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.hint}>暂无可下载的产物</div>
            )}
          </div>
        </div>
      )}

      {publishOpen && (
        <div className={styles.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) setPublishOpen(false); }}>
          <div className={styles.publishModal} role="dialog" aria-modal="true" aria-label="发布看板">
            <div className={styles.publishHeader}>
              <span>发布为看板</span>
              <button type="button" className={styles.closeBtn} onClick={() => setPublishOpen(false)} aria-label="关闭">✕</button>
            </div>
            <div className={styles.publishBody}>
              <label className={styles.label} htmlFor="report-panel-title">看板标题</label>
              <input
                id="report-panel-title"
                className={styles.input}
                value={title}
                maxLength={120}
                placeholder="给看板起个名字"
                onChange={(e) => setTitle(e.target.value)}
                disabled={publishing || !!publishedId}
                autoFocus
              />
              {error && <div className={styles.errorTip}>{error}</div>}
            </div>
            <div className={styles.publishFooter}>
              <button type="button" className={styles.btn} onClick={() => setPublishOpen(false)}>
                {publishedId ? '关闭' : '取消'}
              </button>
              {publishedId ? (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSuccess}`}
                  onClick={() => navigate(`/reports/${encodeURIComponent(publishedId)}`)}
                >
                  已发布，点击查看
                </button>
              ) : (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  onClick={() => void handlePublish()}
                  disabled={publishing}
                >
                  {publishing ? '发布中...' : '确认发布'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
