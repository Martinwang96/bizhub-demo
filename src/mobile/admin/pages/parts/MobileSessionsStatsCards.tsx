import { SkeletonStack } from '@shared/components';
import type { SessionStats } from '../../../../admin/api/adminConsole';
import styles from './MobileSessionsStatsCards.module.css';

interface MobileSessionsStatsCardsProps {
  stats: SessionStats | null;
  loading: boolean;
}

interface CardCellsProps {
  messages: number;
  users: number;
  sessions: number;
}

function fmt(n: number | undefined): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return '0';
  if (n >= 10000) {
    return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}w`;
  }
  return String(n);
}

function CardCells({ messages, users, sessions }: CardCellsProps) {
  return (
    <div className={styles.cells}>
      <div className={`${styles.cell} ${styles.cellPrimary}`}>
        <span className={styles.cellLabel}>消息</span>
        <span className={`${styles.cellNum} ${styles.cellNumLg}`} title={String(messages)}>{fmt(messages)}</span>
      </div>
      <div className={styles.cell}>
        <span className={styles.cellLabel}>用户</span>
        <span className={styles.cellNum} title={String(users)}>{fmt(users)}</span>
      </div>
      <div className={styles.cell}>
        <span className={styles.cellLabel}>会话</span>
        <span className={styles.cellNum} title={String(sessions)}>{fmt(sessions)}</span>
      </div>
    </div>
  );
}

/**
 * 移动端 Session 查询页统计双大卡。
 * - 累计卡（左 / 上）：var(--card) 白底
 * - 今日卡（右 / 下）：var(--primary-soft) 弱底，强调时效
 * - 每卡内三行：消息（主位大字）/ 用户 / 会话；label 与数字行内对齐，数字右侧自适应缩放，避免大数溢出
 * - loading 时显示 SkeletonStack
 */
export default function MobileSessionsStatsCards({ stats, loading }: MobileSessionsStatsCardsProps) {
  if (loading && !stats) {
    return (
      <div className={styles.skeletonWrap}>
        <SkeletonStack widths={[88, 92]} rows={2} />
      </div>
    );
  }

  const total = stats?.total;
  const today = stats?.today;

  return (
    <div className={styles.grid}>
      <article className={`${styles.card} ${styles.cardTotal}`} aria-label="累计统计">
        <header className={styles.cardHead}>
          <span className={styles.cardTitle}>累计</span>
          <span className={styles.cardHint}>历史聚合</span>
        </header>
        <CardCells
          messages={total?.messages ?? 0}
          users={total?.users ?? 0}
          sessions={total?.sessions ?? 0}
        />
      </article>

      <article className={`${styles.card} ${styles.cardToday}`} aria-label="今日统计">
        <header className={styles.cardHead}>
          <span className={styles.cardTitle}>今日</span>
          <span className={`${styles.cardHint} ${styles.cardHintActive}`}>实时</span>
        </header>
        <CardCells
          messages={today?.messages ?? 0}
          users={today?.users ?? 0}
          sessions={today?.sessions ?? 0}
        />
      </article>
    </div>
  );
}
