import type { AlertItem } from '../../../../admin/api/adminConsole';
import MobileBottomSheet from '../../../shared/MobileBottomSheet';
import styles from './MobileOpsAlertSheet.module.css';

interface MobileOpsAlertSheetProps {
  alert: AlertItem | null;
  open: boolean;
  onClose: () => void;
  onCopy: () => void;
}

function levelLabel(level: string): string {
  return (level || 'INFO').toUpperCase();
}

function levelClass(level: string): string {
  if (level === 'critical') return styles.tagDanger;
  if (level === 'warning') return styles.tagWarn;
  return styles.tagPrimary;
}

/**
 * 告警详情 Bottom Sheet：
 * - 顶部：level tag + count + 标题
 * - suggestion 全文（如有）
 * - 原始 JSON（mono code block）
 * - footer：「复制 JSON」「关闭」
 *
 * keepMounted=false：关闭时卸载，避免空 alert 时残留 DOM。
 */
export default function MobileOpsAlertSheet({ alert, open, onClose, onCopy }: MobileOpsAlertSheetProps) {
  const safeAlert = alert ?? { level: 'info', title: '', count: 0, suggestion: '' };
  const level = String(safeAlert.level ?? 'info');
  const count = typeof safeAlert.count === 'number' ? safeAlert.count : 0;

  return (
    <MobileBottomSheet
      open={open}
      title="告警详情"
      onClose={onClose}
      keepMounted={false}
      footer={
        <>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={onClose}
          >
            关闭
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={onCopy}
            disabled={!alert}
          >
            复制 JSON
          </button>
        </>
      }
    >
      {!alert ? (
        <div className={styles.empty}>无告警数据</div>
      ) : (
        <div className={styles.body}>
          <div className={styles.head}>
            <span className={`${styles.tag} ${levelClass(level)}`}>{levelLabel(level)}</span>
            {count > 0 && <span className={styles.count}>×{count}</span>}
          </div>
          <h3 className={styles.title}>{alert.title || '（无标题）'}</h3>

          {alert.suggestion && (
            <section className={styles.section} aria-label="告警建议">
              <h4 className={styles.sectionTitle}>Suggestion</h4>
              <p className={styles.sectionText}>{alert.suggestion}</p>
            </section>
          )}

          <section className={styles.section} aria-label="原始字段">
            <h4 className={styles.sectionTitle}>Raw</h4>
            <pre className={styles.code}>{JSON.stringify(alert, null, 2)}</pre>
          </section>
        </div>
      )}
    </MobileBottomSheet>
  );
}
