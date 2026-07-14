import type { AlertItem } from '../../../../admin/api/adminConsole';
import styles from './MobileOpsAlertCenter.module.css';

interface MobileOpsAlertCenterProps {
  alerts: AlertItem[];
  onSelect(alert: AlertItem): void;
}

function toneClass(level: string): string {
  if (level === 'critical') return styles.tonecritical;
  if (level === 'warning') return styles.tonewarning;
  return styles.toneinfo;
}

function tagClass(level: string): string {
  if (level === 'critical') return styles.tagDanger;
  if (level === 'warning') return styles.tagWarn;
  return styles.tagPrimary;
}

function levelLabel(level: string): string {
  return (level || 'INFO').toUpperCase();
}

/**
 * 移动端告警中心列表：
 * - 每条告警：左竖条按 level 上色（critical=danger / warning=warn / info=primary）
 * - 顶部：level tag + count（如有）；底行：title + suggestion 摘要
 * - 整卡可点（按钮语义），抛 onSelect 给容器开 BottomSheet
 * - 空态：accent 文本「系统正常运行，无派生告警」
 */
export default function MobileOpsAlertCenter({ alerts, onSelect }: MobileOpsAlertCenterProps) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className={styles.empty} role="status">
        系统正常运行，无派生告警
      </div>
    );
  }

  return (
    <ul className={styles.list} role="list">
      {alerts.map((alert, i) => {
        const level = String(alert.level ?? 'info');
        const count = typeof alert.count === 'number' ? alert.count : 0;
        return (
          <li key={`${alert.title}-${i}`} className={styles.item}>
            <button
              type="button"
              className={`${styles.card} ${toneClass(level)}`}
              onClick={() => onSelect(alert)}
              aria-label={`查看告警详情：${alert.title}`}
            >
              <div className={styles.head}>
                <span className={`${styles.tag} ${tagClass(level)}`}>{levelLabel(level)}</span>
                {count > 0 && <span className={styles.count}>×{count}</span>}
                <span className={styles.action}>查看详情 →</span>
              </div>
              <h3 className={styles.title}>{alert.title}</h3>
              {alert.suggestion && (
                <p className={styles.desc}>{alert.suggestion}</p>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
