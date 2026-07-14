/**
 * 移动端技能卡片：
 * - skillId（mono 字体）+ 状态徽标
 * - meta：owner · v3.2 · 2026-05-26
 * - 描述 2 行省略
 * - tables chip（最多展示前 2 个 + "+N"）
 * - 底部 Source / Export 双按钮（与 PC 等价）
 */
import type { SkillItem } from '@skillhub/apiAdapters';
import styles from './skills.module.css';

interface Props {
  skill: SkillItem;
  onSource: (skill: SkillItem) => void;
  onExport: (skill: SkillItem) => void;
  /** 切换上下线（approver 才传入；不传则不渲染按钮） */
  onToggleAvailability?: (skill: SkillItem) => void;
  /** 当前是否处于切换中（按钮 loading） */
  togglePending?: boolean;
}

const TableIcon = (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={styles.tablesChipIcon}
    aria-hidden="true"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18" />
    <path d="M3 15h18" />
    <path d="M9 3v18" />
  </svg>
);

function formatDate(updatedAt: number | undefined): string | null {
  if (!updatedAt) return null;
  const d = new Date(updatedAt * 1000);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function statusClass(status: string | undefined): string {
  if (status === 'active') return styles.statusBadgeActive;
  if (status === 'degraded') return styles.statusBadgeWarn;
  if (status === 'unavailable') return styles.statusBadgeDanger;
  return '';
}

function statusLabel(status: string | undefined): string {
  if (status === 'active') return 'Normal';
  if (status === 'degraded') return 'Degraded';
  if (status === 'unavailable') return 'Unavailable';
  return status ? status : 'Unknown';
}

export default function SkillCard({ skill, onSource, onExport, onToggleAvailability, togglePending }: Props) {
  const date = formatDate(skill.updatedAt);
  const tables = skill.tables ?? [];
  const tablePreview = tables.slice(0, 2).join(', ');
  const tableExtra = tables.length > 2 ? ` +${tables.length - 2}` : '';
  const isDown = skill.status === 'unavailable';
  const cardClass = isDown ? `${styles.card} ${styles.cardUnavailable}` : styles.card;

  return (
    <article className={cardClass}>
      <header className={styles.cardHead}>
        <h2 className={styles.cardTitle} title={skill.skillId}>
          {skill.skillId}
        </h2>
        <span className={`${styles.statusBadge} ${statusClass(skill.status)}`}>
          [{statusLabel(skill.status)}]
        </span>
      </header>

      <div className={styles.metaLine}>
        <span>{skill.owner || '_'}</span>
        {skill.version && (
          <>
            <span className={styles.metaDot} aria-hidden="true" />
            <span>v{skill.version.replace(/^v/, '')}</span>
          </>
        )}
        {date && (
          <>
            <span className={styles.metaDot} aria-hidden="true" />
            <span>{date}</span>
          </>
        )}
      </div>

      {skill.description && <p className={styles.cardDesc}>{skill.description}</p>}

      {tables.length > 0 && (
        <div className={styles.tablesChip} title={tables.join(', ')}>
          {TableIcon}
          <span>
            Table: {tablePreview}
            {tableExtra}
          </span>
        </div>
      )}

      <div className={styles.cardActions}>
        <button type="button" className={styles.actionBtn} onClick={() => onSource(skill)}>
          原文
        </button>
        <button type="button" className={styles.actionBtn} onClick={() => onExport(skill)}>
          导出
        </button>
        {onToggleAvailability && (
          <button
            type="button"
            className={`${styles.actionBtn} ${isDown ? styles.actionBtnPrimary : styles.actionBtnDanger}`}
            disabled={!!togglePending}
            onClick={() => onToggleAvailability(skill)}
          >
            {togglePending ? '处理中…' : isDown ? '上线' : '下线'}
          </button>
        )}
      </div>
    </article>
  );
}
