import { memo, useState } from 'react';
import type { Step } from '../../types/session';
import { toolLabel } from './ProcessPanel';
import styles from './ToolStep.module.css';

interface Props {
  step: Extract<Step, { type: 'tool' }>;
}

function fmtMs(ms?: number): string {
  if (!ms) return '';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function ToolStep({ step }: Props) {
  const [open, setOpen] = useState(false);
  const status = step.status ?? 'done';
  const hasDetail = !!(step.args && Object.keys(step.args).length) || !!step.output;
  const dur = fmtMs(step.durationMs);
  const zhName = toolLabel(step.name);
  const label = `${zhName}${status === 'done' && dur ? ` (${dur})` : status === 'running' ? '...' : ''}`;

  const stepClass = [
    styles.step,
    status === 'done' ? styles.stepDone : '',
    status === 'denied' ? styles.stepDenied : '',
  ].filter(Boolean).join(' ');

  const iconClass = [
    styles.icon,
    status === 'running' ? styles.iconRunning : '',
    status === 'done' ? styles.iconDone : '',
    status === 'denied' ? styles.iconDenied : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <div
        className={stepClass}
        onClick={hasDetail ? () => setOpen((p) => !p) : undefined}
      >
        {status === 'done' ? (
          <svg className={iconClass} viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm3.41 5.41L7 9.83 4.59 7.41 3.17 8.83l3.83 3.83 5.83-5.83-1.42-1.42z"/>
          </svg>
        ) : status === 'denied' ? (
          <svg className={iconClass} viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0a8 8 0 110 16A8 8 0 018 0zM5.35 5.35a.5.5 0 01.7 0L8 7.29l1.95-1.94a.5.5 0 01.7.7L8.71 8l1.94 1.95a.5.5 0 01-.7.7L8 8.71l-1.95 1.94a.5.5 0 01-.7-.7L7.29 8 5.35 6.05a.5.5 0 010-.7z"/>
          </svg>
        ) : (
          <svg className={iconClass} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="8" cy="8" r="6"/>
            <path d="M8 4v4"/>
          </svg>
        )}
        <span className={styles.label}>{label}</span>
        {hasDetail && (
          <span className={`${styles.expandArrow} ${open ? styles.expandArrowOpen : ''}`}>▸</span>
        )}
      </div>

      {hasDetail && (
        <div className={`${styles.detail} ${open ? styles.detailExpanded : styles.detailCollapsed}`}>
          {step.args && Object.keys(step.args).length > 0 && (
            <div className={styles.detailSection}>
              <div className={styles.detailTitle}>参数</div>
              <pre className={styles.detailPre}>{JSON.stringify(step.args, null, 2)}</pre>
            </div>
          )}
          {step.output && (
            <div className={styles.detailSection}>
              <div className={styles.detailTitle}>输出</div>
              <pre className={styles.detailPre}>{step.output}</pre>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default memo(ToolStep);
