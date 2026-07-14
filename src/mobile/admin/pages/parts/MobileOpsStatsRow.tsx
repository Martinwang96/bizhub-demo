import styles from './MobileOpsStatsRow.module.css';

interface MobileOpsStatsRowProps {
  healthStatus: string;     // 'ok' | 其它视为异常
  sessions: number;
  llmErrors: number;
  toolErrors: number;
}

interface StatItem {
  key: string;
  label: string;
  value: string;
  hint: string;
  tone: 'primary' | 'accent' | 'warn' | 'danger';
}

/**
 * 移动端 Ops Stats 2x2：
 * - 服务状态（OK = accent / 其它 = danger）
 * - Active Sessions（primary）
 * - LLM Errors（warn，最近 1h）
 * - Tool Errors（warn，最近 1h）
 *
 * 与 MobileStatsGrid 的视觉一致：左竖条 + label/value/hint 三段，背景 var(--card)。
 * 不复用 MobileStatsGrid 是因为 ops 字段语义与 PermissionsSummary 不一致，
 * 自渲染更直观，token 完全对齐。
 */
export default function MobileOpsStatsRow({
  healthStatus,
  sessions,
  llmErrors,
  toolErrors,
}: MobileOpsStatsRowProps) {
  const isOk = healthStatus.toLowerCase() === 'ok';

  const items: StatItem[] = [
    {
      key: 'health',
      label: 'Service Status',
      value: isOk ? 'OK' : 'ERR',
      hint: isOk ? 'All systems nominal' : 'Systems degraded',
      tone: isOk ? 'accent' : 'danger',
    },
    {
      key: 'sessions',
      label: 'Active Sessions',
      value: sessions.toLocaleString(),
      hint: 'Live',
      tone: 'primary',
    },
    {
      key: 'llm-errors',
      label: 'LLM Errors',
      value: String(llmErrors),
      hint: 'Last 1h',
      tone: 'warn',
    },
    {
      key: 'tool-errors',
      label: 'Tool Errors',
      value: String(toolErrors),
      hint: 'Last 1h',
      tone: 'warn',
    },
  ];

  return (
    <div className={styles.grid} role="list" aria-label="系统运行概览">
      {items.map((item) => (
        <div
          key={item.key}
          className={`${styles.card} ${styles[`card-${item.tone}`] ?? ''}`}
          role="listitem"
          aria-label={`${item.label}: ${item.value} - ${item.hint}`}
        >
          <span className={styles.label}>{item.label}</span>
          <span className={`${styles.value} ${styles[`value-${item.tone}`] ?? ''}`}>{item.value}</span>
          <span className={styles.hint}>{item.hint}</span>
        </div>
      ))}
    </div>
  );
}
