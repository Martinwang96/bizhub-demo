import type { PermissionsSummary } from '../../../../admin/api/permissions';
import styles from './MobileStatsGrid.module.css';

interface MobileStatsGridProps {
  summary: PermissionsSummary;
  onCardClick?: () => void;
}

interface StatItem {
  key: string;
  label: string;
  value: number;
  hint: string;
  tone?: 'primary' | 'warn';
}

export default function MobileStatsGrid({ summary, onCardClick }: MobileStatsGridProps) {
  const items: StatItem[] = [
    { key: 'biz-admin', label: 'Biz Admin', value: summary.bizHub.admin, hint: '环境变量保护', tone: 'primary' },
    { key: 'biz-manager', label: 'Biz Manager', value: summary.bizHub.manager, hint: '跳过 Data ACL' },
    { key: 'skill-approval', label: 'Skill Approval', value: summary.skillHub.approval, hint: '可审批发布', tone: 'warn' },
    { key: 'console-readonly', label: 'Console Readonly', value: summary.adminConsole.readonly, hint: '只读后台' },
  ];

  return (
    <div className={styles.grid} role="list" aria-label="权限概览">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`${styles.card} ${item.tone === 'warn' ? styles.cardWarn : ''} ${item.tone === 'primary' ? styles.cardPrimary : ''}`}
          onClick={onCardClick}
          aria-label={`${item.label}: ${item.value} - ${item.hint}`}
          role="listitem"
        >
          <span className={styles.label}>{item.label}</span>
          <span className={styles.value}>{item.value}</span>
          <span className={styles.hint}>{item.hint}</span>
        </button>
      ))}
    </div>
  );
}
