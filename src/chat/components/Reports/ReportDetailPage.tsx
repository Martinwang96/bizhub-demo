import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EditIcon } from 'tdesign-icons-react';
import { MessagePlugin } from 'tdesign-react';
import {
  deleteReport,
  getReportMeta,
  reportViewUrl,
  type ReportMeta,
} from '../../api/reports';
import ShareReportModal from './ShareReportModal';
import ReportViewer from './ReportViewer';
import styles from './ReportsPage.module.css';

/**
 * 报表详情页：挂在 `/reports/:reportId` 下。
 * 编辑看板 / 分享看板 / 删除作为独立图标按钮，作为报表 toolbar actions 挂在报表自身上。
 */
export default function ReportDetailPage() {
  const { reportId = '' } = useParams();
  const navigate = useNavigate();

  const [meta, setMeta] = useState<ReportMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shareTarget, setShareTarget] = useState<ReportMeta | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!reportId) return;
    setLoading(true);
    setError('');
    getReportMeta(reportId)
      .then((m) => { if (!cancelled) setMeta(m); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : '加载失败'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reportId]);

  const handleDelete = useCallback(async () => {
    if (!meta) return;
    if (!window.confirm(`确认删除看板「${meta.title}」？此操作不可恢复。`)) return;
    try {
      await deleteReport(meta.reportId);
      navigate('/reports', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    }
  }, [meta, navigate]);

  if (loading) {
    return <div className={styles.page}><div className={styles.hint}>加载中...</div></div>;
  }
  if (error || !meta) {
    return <div className={styles.page}><div className={styles.errorTip}>{error || '报表不存在'}</div></div>;
  }

  const shareIcon = (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.7 10.6l6.6-3.8M8.7 13.4l6.6 3.8" />
    </svg>
  );

  const handleEdit = () => {
    if (meta.sourceSessionId) navigate(`/c/${encodeURIComponent(meta.sourceSessionId)}`);
    else void MessagePlugin.info('未找到来源对话');
  };

  /**
   * owner：编辑看板 / 分享看板 / 删除三个独立图标按钮，删除在最右。
   * 非 owner：不展示 actions，也不提供下载入口。
   */
  const actions = meta.isOwner
    ? () => (
        <>
          <button
            type="button"
            className={styles.detailIconBtn}
            onClick={handleEdit}
            title="编辑看板"
            aria-label="编辑看板"
          >
            <EditIcon
              fillColor={['transparent', 'transparent']}
              strokeColor={['currentColor', 'currentColor']}
              strokeWidth={2}
            />
          </button>
          <button
            type="button"
            className={styles.detailIconBtn}
            onClick={() => setShareTarget(meta)}
            title="分享看板"
            aria-label="分享看板"
          >
            {shareIcon}
          </button>
          <button
            type="button"
            className={`${styles.detailIconBtn} ${styles.detailIconBtnDanger}`}
            onClick={() => void handleDelete()}
            title="删除报表"
            aria-label="删除报表"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </>
      )
    : undefined;

  return (
    <div className={styles.detailPage}>
      <ReportViewer
        key={meta.reportId}
        src={reportViewUrl(meta.reportId)}
        fileName={`${meta.title || 'report'}.html`}
        hideDownload
        actions={actions}
      />
      {shareTarget && (
        <ShareReportModal
          report={shareTarget}
          onClose={() => setShareTarget(null)}
          onUpdated={(m) => setMeta(m)}
        />
      )}
    </div>
  );
}
