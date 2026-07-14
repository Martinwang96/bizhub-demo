import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listShareCandidates,
  shareReport,
  type ReportMeta,
  type ShareCandidate,
} from '../../api/reports';
import styles from './ShareReportModal.module.css';

interface Props {
  /** 待批量分享的报表（均为当前用户创建）。 */
  reports: ReportMeta[];
  onClose: () => void;
  /** 全部分享完成后回调（用于刷新列表 / 退出多选）。 */
  onDone: () => void;
}

/**
 * 批量分享弹窗：把选中的多个看板追加分享给所选用户。
 * 为避免覆盖各报表已有的分享名单，保存时对每个报表取「原名单 ∪ 新选用户」。
 */
export default function BatchShareModal({ reports, onClose, onDone }: Props) {
  const [candidates, setCandidates] = useState<ShareCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rejected, setRejected] = useState<string[]>([]);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => c.loginName.toLowerCase().includes(q));
  }, [candidates, query]);

  const toggle = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (saving || selected.size === 0) return;
    setSaving(true);
    setError('');
    setRejected([]);
    try {
      const add = Array.from(selected);
      const rejectedAll = new Set<string>();
      for (const r of reports) {
        const union = Array.from(new Set([...(r.sharedTo ?? []), ...add]));
        const { rejected: rej } = await shareReport(r.reportId, union);
        rej.forEach((x) => rejectedAll.add(x));
      }
      if (rejectedAll.size) {
        setRejected(Array.from(rejectedAll));
      } else {
        onDone();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '分享失败');
    } finally {
      setSaving(false);
    }
  }, [reports, selected, saving, onDone]);

  return (
    <div className={styles.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="批量分享看板">
        <div className={styles.header}>
          <span>分享 {reports.length} 个看板</span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="关闭">✕</button>
        </div>
        <div className={styles.body}>
          <input
            className={styles.search}
            placeholder="搜索用户"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
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
          {error && <div className={styles.errorTip}>{error}</div>}
        </div>
        <div className={styles.footer}>
          <span className={styles.count}>已选 {selected.size} 人 · {reports.length} 个看板</span>
          <div className={styles.footerBtns}>
            <button type="button" className={styles.btn} onClick={onClose}>取消</button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => void handleSave()}
              disabled={saving || selected.size === 0}
            >
              {saving ? '分享中...' : '确认分享'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
