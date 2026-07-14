import type { AuditItem } from '../MobileOpsPage';
import styles from './MobileOpsAuditSection.module.css';

interface MobileOpsAuditSectionProps {
  title: string;
  /** 决定第三行 meta 渲染 reasonCode（acl）还是 status（skill） */
  kind: 'acl' | 'skill';
  items: AuditItem[];
  defaultOpen?: boolean;
}

function fmtTime(ts?: number): string {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false });
}

function actionTag(action: string, kind: 'acl' | 'skill'): string {
  const a = (action || '').toUpperCase();
  if (kind === 'skill') {
    if (a === 'DEPLOY' || a === 'PUBLISH' || a === 'APPROVE') return 'tagSuccess';
    if (a === 'REJECT' || a === 'DELETE') return 'tagDanger';
    if (a === 'UPDATE') return 'tagWarn';
    return 'tagPrimary';
  }
  // acl
  if (a === 'UPDATE' || a === 'PUBLISH') return 'tagWarn';
  if (a === 'DELETE' || a === 'REVOKE') return 'tagDanger';
  return 'tagPrimary';
}

function actionVerb(action: string, kind: 'acl' | 'skill'): string {
  const a = (action || '').toUpperCase();
  if (kind === 'skill') {
    if (a === 'DEPLOY') return 'deployed';
    if (a === 'PUBLISH') return 'published';
    if (a === 'APPROVE') return 'approved';
    if (a === 'REJECT') return 'rejected';
    if (a === 'DELETE') return 'deleted';
    return 'updated';
  }
  if (a === 'READ') return 'accessed';
  if (a === 'UPDATE') return 'updated';
  if (a === 'DELETE') return 'deleted';
  if (a === 'PUBLISH') return 'published';
  if (a === 'REVOKE') return 'revoked';
  return 'acted on';
}

/**
 * 单分区可折叠的审计列表，使用原生 <details>：
 * - summary：title + 计数 chip
 * - 内容：每条审计 row 显示 action tag / time / user-verb-resource / reason 或 status
 * - 空态：「暂无审计记录」
 */
export default function MobileOpsAuditSection({ title, kind, items, defaultOpen }: MobileOpsAuditSectionProps) {
  const empty = !items || items.length === 0;

  return (
    <details className={styles.section} open={defaultOpen}>
      <summary className={styles.summary}>
        <span className={styles.summaryTitle}>{title}</span>
        <span className={styles.summaryMeta}>
          {empty ? '0' : items.length} 条
          <svg
            className={styles.chevron}
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </summary>

      {empty ? (
        <div className={styles.empty}>暂无审计记录</div>
      ) : (
        <ul className={styles.list}>
          {items.map((item, i) => {
            const action = String(item.action ?? 'event');
            const user = String(item.user ?? '-');
            const ts = typeof item.ts === 'number' ? item.ts : 0;
            const resource = String(item.resource ?? '');
            const reason = kind === 'acl'
              ? String(item.reasonCode ?? '')
              : String(item.status ?? '');
            const reasonLabel = kind === 'acl' ? 'Reason' : 'Status';
            const tagKey = actionTag(action, kind);
            const verb = actionVerb(action, kind);
            return (
              <li key={i} className={styles.row}>
                <div className={styles.rowHead}>
                  <span className={`${styles.tag} ${styles[tagKey] ?? styles.tagPrimary}`}>
                    {action.toUpperCase() || 'EVENT'}
                  </span>
                  <span className={styles.time}>{fmtTime(ts)}</span>
                </div>
                <div className={styles.desc}>
                  <span className={styles.user}>{user}</span>
                  <span className={styles.verb}> {verb} </span>
                  {resource ? (
                    <span className={styles.resource}>{resource}</span>
                  ) : (
                    <span className={styles.muted}>—</span>
                  )}
                </div>
                {reason && (
                  <div className={styles.meta}>
                    {reasonLabel}: <span className={styles.metaValue}>{reason}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
