import type { LogEntry } from '../../../../admin/api/adminConsole';
import type { LogFilterState } from '../MobileOpsPage';
import styles from './MobileOpsLogTerminal.module.css';

interface MobileOpsLogTerminalProps {
  logs: LogEntry[];
  loading: boolean;
  filter: LogFilterState;
  onFilterChange(next: LogFilterState): void;
  onApply(): void;
}

function levelClass(level: string): string {
  if (level === 'ERROR') return styles.levelError;
  if (level === 'WARN') return styles.levelWarn;
  return styles.levelInfo;
}

function levelTag(level: string): string {
  if (level === 'ERROR') return '[ERR] ';
  if (level === 'WARN') return '[WARN]';
  return '[INFO]';
}

/**
 * 深色终端外观日志查看器：
 * - Toolbar（深色稍亮）：level select + keyword input + 「筛选」primary btn
 * - Body（shell-bg-deep + mono）：每行 [LEVEL] [module] message
 * - 「筛选」独立调用 onApply（与 PC OpsPage 一致），不做 onChange 即时拉取
 * - 装饰性 Live 圆点（pulse 动效，reduced-motion 自动降级）
 *
 * 仅本组件使用 --shell-bg-deep / mono 字体，符合 DESIGN.md「深色 shell 仅给 code/terminal」。
 */
export default function MobileOpsLogTerminal({
  logs,
  loading,
  filter,
  onFilterChange,
  onApply,
}: MobileOpsLogTerminalProps) {
  return (
    <div className={styles.shell}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarTop}>
          <span className={styles.label}>
            <span className={styles.dot} aria-hidden="true" />
            Live
          </span>
          <span className={styles.count}>{logs.length} logs</span>
        </div>
        <div className={styles.toolbarRow}>
          <select
            className={styles.select}
            value={filter.level}
            onChange={(e) => onFilterChange({ ...filter, level: e.target.value })}
            aria-label="日志级别"
          >
            <option value="">ALL LEVELS</option>
            <option value="ERROR">ERROR</option>
            <option value="WARN">WARN</option>
            <option value="INFO">INFO</option>
          </select>
          <input
            type="text"
            className={styles.input}
            value={filter.keyword}
            onChange={(e) => onFilterChange({ ...filter, keyword: e.target.value })}
            placeholder="Filter keyword..."
            aria-label="关键字过滤"
          />
          <button
            type="button"
            className={styles.btnApply}
            onClick={onApply}
            disabled={loading}
            aria-label="应用筛选条件"
          >
            筛选
          </button>
        </div>
      </div>

      <div
        className={styles.body}
        role="log"
        aria-live="polite"
        aria-busy={loading || undefined}
      >
        {loading ? (
          <div className={styles.empty}>loading...</div>
        ) : logs.length === 0 ? (
          <div className={styles.empty}>暂无日志</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className={styles.line}>
              <span className={`${styles.level} ${levelClass(log.level)}`}>{levelTag(log.level)}</span>
              {log.module && <span className={styles.module}>[{log.module}]</span>}
              <span className={styles.message}>{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
