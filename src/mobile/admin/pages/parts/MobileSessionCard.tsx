import type { SessionItem } from '../../../../admin/api/adminConsole';
import { mapRiskLevel, riskLevelLabel } from './sessionRisk';
import styles from './MobileSessionCard.module.css';

interface MobileSessionCardProps {
  item: SessionItem;
  onOpenDetail: (sessionId: string) => void;
}

function fmtTime(ts?: number): string {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false });
}

function shortSid(sid: string): string {
  if (!sid) return '-';
  if (sid.length <= 12) return sid;
  return `${sid.slice(0, 8)}…${sid.slice(-4)}`;
}

/**
 * 单条会话卡片（移动端列表项）。
 * - 标题（line-clamp-2）+ 状态徽标（mapRiskLevel 三档）
 * - 元信息行：用户、SID 截断、消息数、更新时间
 * - 整卡可点（触发详情）
 */
export default function MobileSessionCard({ item, onOpenDetail }: MobileSessionCardProps) {
  const level = mapRiskLevel(item.riskTags);
  const levelClass =
    level === 'critical' ? styles.badgeCritical
    : level === 'attention' ? styles.badgeAttention
    : styles.badgeNormal;

  const handleOpen = () => onOpenDetail(item.sessionId);

  return (
    <article
      className={styles.card}
      onClick={handleOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleOpen();
        }
      }}
      aria-label={`查看会话 ${item.sessionId} 详情`}
    >
      <header className={styles.head}>
        <h3 className={styles.title}>{item.title || '新对话'}</h3>
        <span className={`${styles.badge} ${levelClass}`}>{riskLevelLabel(level)}</span>
      </header>

      {item.riskTags?.length ? (
        <div className={styles.tagRow}>
          {item.riskTags.slice(0, 4).map((t) => (
            <span key={t} className={styles.tag}>{t}</span>
          ))}
          {item.riskTags.length > 4 && (
            <span className={styles.tagMore}>+{item.riskTags.length - 4}</span>
          )}
        </div>
      ) : null}

      <dl className={styles.meta}>
        <div className={styles.metaItem}>
          <dt>用户</dt>
          <dd>{item.user || '-'}</dd>
        </div>
        <div className={styles.metaItem}>
          <dt>Session</dt>
          <dd>
            <code className={styles.code} title={item.sessionId}>{shortSid(item.sessionId)}</code>
          </dd>
        </div>
        <div className={styles.metaItem}>
          <dt>消息</dt>
          <dd className={styles.num}>{item.messageCount}</dd>
        </div>
        <div className={styles.metaItem}>
          <dt>更新</dt>
          <dd className={styles.time}>{fmtTime(item.updatedAt)}</dd>
        </div>
      </dl>
    </article>
  );
}
