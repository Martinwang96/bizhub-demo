import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EllipsisIcon } from 'tdesign-icons-react';
import { Dropdown } from 'tdesign-react';
import type { DropdownProps } from 'tdesign-react';
import {
  deleteReport,
  listReports,
  reportViewUrl,
  type ReportMeta,
} from '../../api/reports';
import BatchShareModal from './BatchShareModal';
import ShareReportModal from './ShareReportModal';
import styles from './ReportsPage.module.css';

type Tab = 'owned' | 'shared';

function fmtTime(ts: number): string {
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 卡片「更多操作」下拉菜单：仅分享 / 删除，样式与报表详情页 toolbar 下拉一致
const shareIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.7 10.6l6.6-3.8M8.7 13.4l6.6 3.8" />
  </svg>
);
const trashIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);
const cardMenuOptions: NonNullable<DropdownProps['options']> = [
  { content: '分享', value: 'share', prefixIcon: shareIcon },
  { content: '删除', value: 'delete', prefixIcon: trashIcon },
];

export default function ReportsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get('focus') ?? '';

  const [tab, setTab] = useState<Tab>('owned');
  const [owned, setOwned] = useState<ReportMeta[]>([]);
  const [shared, setShared] = useState<ReportMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 多选（仅「我创建的」支持分享 / 删除）
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [shareOpen, setShareOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // 单卡操作：右上角下拉菜单的分享目标
  const [singleShare, setSingleShare] = useState<ReportMeta | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listReports();
      setOwned(data.owned);
      setShared(data.shared);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // 兼容旧链接 `?focus=id` → 跳转到独立详情页
  useEffect(() => {
    if (!focusId) return;
    searchParams.delete('focus');
    setSearchParams(searchParams, { replace: true });
    navigate(encodeURIComponent(focusId), { replace: true });
  }, [focusId, navigate, searchParams, setSearchParams]);

  const list = tab === 'owned' ? owned : shared;

  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  // 切换 tab 时退出多选
  const switchTab = useCallback((next: Tab) => {
    setTab(next);
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const allSelected = list.length > 0 && selectedIds.size === list.length;
  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => (prev.size === list.length ? new Set() : new Set(list.map((r) => r.reportId))));
  }, [list]);

  const selectedReports = useMemo(
    () => owned.filter((r) => selectedIds.has(r.reportId)),
    [owned, selectedIds],
  );

  const handleCardClick = useCallback((r: ReportMeta) => {
    if (selectMode) toggleSelect(r.reportId);
    else navigate(encodeURIComponent(r.reportId));
  }, [selectMode, toggleSelect, navigate]);

  // 单卡删除（右上角下拉菜单）
  const handleSingleDelete = useCallback(async (r: ReportMeta) => {
    if (!window.confirm(`确认删除看板「${r.title}」？此操作不可恢复。`)) return;
    setError('');
    try {
      await deleteReport(r.reportId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    }
  }, [refresh]);

  const handleCardMenu = useCallback((r: ReportMeta): NonNullable<DropdownProps['onClick']> => (data) => {
    if (data.value === 'share') setSingleShare(r);
    else if (data.value === 'delete') void handleSingleDelete(r);
  }, [handleSingleDelete]);

  const handleBatchDelete = useCallback(async () => {
    if (deleting || selectedReports.length === 0) return;
    if (!window.confirm(`确认删除选中的 ${selectedReports.length} 个看板？此操作不可恢复。`)) return;
    setDeleting(true);
    setError('');
    try {
      for (const r of selectedReports) {
        await deleteReport(r.reportId);
      }
      exitSelect();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  }, [deleting, selectedReports, exitSelect, refresh]);

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>报表</h1>
          <div className={styles.pageSub}>承接你生成的看板，以及被授权查看的他人报表</div>
        </div>
        {tab === 'owned' && list.length > 0 && (
          selectMode ? (
            <div className={styles.selectBar}>
              <span className={styles.selectCount}>已选 {selectedIds.size} 项</span>
              <button type="button" className={styles.smallBtn} onClick={toggleSelectAll}>
                {allSelected ? '取消全选' : '全选'}
              </button>
              <button
                type="button"
                className={styles.smallBtn}
                onClick={() => setShareOpen(true)}
                disabled={selectedIds.size === 0}
              >
                分享
              </button>
              <button
                type="button"
                className={`${styles.smallBtn} ${styles.smallBtnDanger}`}
                onClick={() => void handleBatchDelete()}
                disabled={selectedIds.size === 0 || deleting}
              >
                {deleting ? '删除中...' : '删除'}
              </button>
              <button type="button" className={styles.smallBtn} onClick={exitSelect}>取消</button>
            </div>
          ) : (
            <button type="button" className={styles.smallBtn} onClick={() => setSelectMode(true)}>
              多选
            </button>
          )
        )}
      </div>

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'owned' ? styles.tabActive : ''}`}
          onClick={() => switchTab('owned')}
        >
          我创建的 <span className={styles.tabCount}>{owned.length}</span>
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'shared' ? styles.tabActive : ''}`}
          onClick={() => switchTab('shared')}
        >
          可查看的 <span className={styles.tabCount}>{shared.length}</span>
        </button>
      </div>

      {loading ? (
        <div className={styles.hint}>加载中...</div>
      ) : error ? (
        <div className={styles.errorTip}>{error}</div>
      ) : list.length === 0 ? (
        <div className={styles.hint}>{tab === 'owned' ? '还没有创建看板，去对话里生成并发布吧' : '暂无他人分享给你的看板'}</div>
      ) : (
        <div className={styles.grid}>
          {list.map((r) => {
            const checked = selectedIds.has(r.reportId);
            return (
              <div
                key={r.reportId}
                className={`${styles.card} ${selectMode && checked ? styles.cardSelected : ''}`}
                onClick={() => handleCardClick(r)}
              >
                {/* 常态下右上角「更多操作」下拉：分享 / 删除（仅本人创建的报表） */}
                {!selectMode && r.isOwner && (
                  <div className={styles.cardMenu} onClick={(e) => e.stopPropagation()}>
                    <Dropdown trigger="click" minColumnWidth={88} options={cardMenuOptions} onClick={handleCardMenu(r)}>
                      <button type="button" className={styles.cardMenuBtn} title="更多操作" aria-label="更多操作">
                        <EllipsisIcon
                          fillColor={['transparent', 'transparent']}
                          strokeColor={['currentColor', 'currentColor']}
                          strokeWidth={2}
                        />
                      </button>
                    </Dropdown>
                  </div>
                )}
                <div className={styles.thumb}>
                  <iframe
                    className={styles.thumbFrame}
                    src={reportViewUrl(r.reportId)}
                    sandbox="allow-scripts allow-same-origin"
                    title={r.title}
                    scrolling="no"
                    tabIndex={-1}
                  />
                  <div className={styles.thumbMask} />
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.cardTitleRow}>
                    {selectMode && (
                      <input
                        type="checkbox"
                        className={styles.cardCheckbox}
                        checked={checked}
                        onChange={() => toggleSelect(r.reportId)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <div className={styles.cardTitle}>{r.title}</div>
                  </div>
                  <div className={styles.cardMeta}>
                    <span>{r.isOwner ? '我创建' : r.owner}</span>
                    <span>{fmtTime(r.updatedAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {shareOpen && selectedReports.length > 0 && (
        <BatchShareModal
          reports={selectedReports}
          onClose={() => setShareOpen(false)}
          onDone={() => { setShareOpen(false); exitSelect(); void refresh(); }}
        />
      )}

      {singleShare && (
        <ShareReportModal
          report={singleShare}
          onClose={() => setSingleShare(null)}
          onUpdated={() => { void refresh(); }}
        />
      )}
    </div>
  );
}
