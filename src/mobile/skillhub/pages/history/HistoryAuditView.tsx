/**
 * 历史页 · Audit 段（视图层）。
 *
 * - 顶部工具栏：Filter 按钮（带数字徽标）+ 列表/时间线切换
 * - 列表模式：动作徽标 + 相对时间 + skill + 操作人 + 详情（2 行省略）
 * - 时间线模式：左侧色点（普通=primary / 警告=muted / rollback=danger）+ 文字流
 * - 筛选弹层：AuditFilterSheet（编辑临时值后再应用回 hook）
 *
 * 业务流由 useAuditLogs 提供，本组件只负责呈现。
 */
import { useMemo, useState } from 'react';
import type { AuditLogsApi } from '@skillhub/hooks/useAuditLogs';
import type { SkillItem, AuditLogItem } from '@skillhub/apiAdapters';
import AuditFilterSheet from './AuditFilterSheet';
import styles from './history.module.css';

interface Props {
  audit: AuditLogsApi;
  /** 用于 filter sheet skill 下拉的可选项 */
  skills: SkillItem[];
}

const FilterIcon = (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={styles.filterBtnIcon}
    aria-hidden="true"
  >
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="7" y1="12" x2="17" y2="12" />
    <line x1="10" y1="18" x2="14" y2="18" />
  </svg>
);

function formatRelative(ts: number): string {
  if (!ts) return '';
  const now = Date.now() / 1000;
  const diff = now - ts;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 2) return '昨天';
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  return new Date(ts * 1000).toLocaleDateString('zh-CN');
}

function formatAbsoluteTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatTimelineWhen(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  const time = d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  if (sameDay) return `今天 · ${time}`;
  if (isYesterday) return `昨天 · ${time}`;
  return `${d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })} · ${time}`;
}

function actionBadgeClass(action: string): string {
  const a = action.toLowerCase();
  if (a.includes('rollback')) return styles.actionBadgeDanger ?? '';
  if (a === 'reject' || a.includes('error') || a.includes('fail')) return styles.actionBadgeDanger ?? '';
  if (a.includes('withdraw') || a.includes('warn')) return styles.actionBadgeWarn ?? '';
  return '';
}

function timelineDotClass(action: string): string {
  const a = action.toLowerCase();
  if (a.includes('rollback') || a === 'reject') return styles.timelineDotDanger ?? '';
  if (a === 'edit' || a.includes('withdraw') || a.includes('update')) return styles.timelineDotMuted ?? '';
  return '';
}

function isDangerAction(action: string): boolean {
  const a = action.toLowerCase();
  return a.includes('rollback') || a === 'reject';
}

export default function HistoryAuditView({ audit, skills }: Props) {
  const { logs, actions, filter, setFilter, loading, error } = audit;

  const [view, setView] = useState<'list' | 'timeline'>('list');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filter.skill_id) n += 1;
    if (filter.user) n += 1;
    if (filter.action) n += 1;
    if (filter.since) n += 1;
    if (filter.until) n += 1;
    return n;
  }, [filter]);

  const renderListItem = (log: AuditLogItem) => (
    <article key={log.id} className={styles.auditCard}>
      <div className={styles.auditCardHead}>
        <span className={`${styles.actionBadge} ${actionBadgeClass(log.action)}`}>
          [{log.action}]
        </span>
        <span className={styles.auditTime} title={new Date(log.createdAt * 1000).toLocaleString('zh-CN')}>
          {formatRelative(log.createdAt)}
        </span>
      </div>
      <h3 className={styles.auditSkill} title={log.skillId ?? ''}>
        {log.skillId || '—'}
      </h3>
      <span className={styles.auditOperator}>
        {log.operator || '—'}
        {log.createdAt ? ` · ${formatAbsoluteTime(log.createdAt)}` : ''}
      </span>
      {log.detail && <p className={styles.auditDetail}>"{log.detail}"</p>}
    </article>
  );

  const renderTimelineItem = (log: AuditLogItem) => {
    const danger = isDangerAction(log.action);
    return (
      <li key={log.id} className={styles.timelineItem}>
        <span
          className={`${styles.timelineDot} ${timelineDotClass(log.action)}`}
          aria-hidden="true"
        />
        <p className={styles.timelineLine}>
          <strong>{log.operator || '—'}</strong>{' '}
          <span className={danger ? styles.timelineActionDanger : ''}>
            {log.action}
          </span>
          {log.skillId && (
            <>
              {' '}
              <span className={styles.timelineSkill}>{log.skillId}</span>
            </>
          )}
        </p>
        <span className={styles.timelineMeta}>
          {formatTimelineWhen(log.createdAt)}
        </span>
      </li>
    );
  };

  return (
    <section className={styles.section} aria-label="审计日志">
      <div className={styles.auditToolbar}>
        <button
          type="button"
          className={styles.filterBtn}
          onClick={() => setFilterSheetOpen(true)}
          aria-label="筛选日志"
        >
          {FilterIcon}
          <span>Filter</span>
          {activeFilterCount > 0 && (
            <span
              className={styles.filterCount}
              aria-label={`已应用 ${activeFilterCount} 项过滤`}
            >
              {activeFilterCount}
            </span>
          )}
        </button>

        <div className={styles.viewToggle} role="tablist" aria-label="审计视图模式">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'list'}
            className={`${styles.viewToggleBtn} ${view === 'list' ? styles.viewToggleBtnActive : ''}`}
            onClick={() => setView('list')}
          >
            List
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'timeline'}
            className={`${styles.viewToggleBtn} ${view === 'timeline' ? styles.viewToggleBtnActive : ''}`}
            onClick={() => setView('timeline')}
          >
            Timeline
          </button>
        </div>
      </div>

      {error && <div className={styles.errorNotice}>{error}</div>}

      {loading ? (
        <div className={styles.skeletonStack}>
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
        </div>
      ) : logs.length === 0 ? (
        <div className={styles.emptyState}>
          <h3 className={styles.emptyTitle}>暂无审计记录</h3>
          <p className={styles.emptyDesc}>
            完成审批、发布或回滚后，关键操作会自动沉淀在这里。
          </p>
        </div>
      ) : view === 'list' ? (
        <div className={styles.auditList}>
          {logs.map(renderListItem)}
        </div>
      ) : (
        <ul className={styles.timeline}>
          {logs.map(renderTimelineItem)}
        </ul>
      )}

      <AuditFilterSheet
        open={filterSheetOpen}
        initialFilter={filter}
        actions={actions}
        skills={skills}
        onClose={() => setFilterSheetOpen(false)}
        onApply={(next) => {
          setFilter(next);
          setFilterSheetOpen(false);
        }}
      />
    </section>
  );
}
