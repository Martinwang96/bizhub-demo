/**
 * 校验结果面板。
 *
 * - 状态徽标：ok / warning / error 三色
 * - Skill ID（等宽字体）
 * - 「潜在问题 (N)」折叠列表（issues）
 * - 「查看差异」按钮触发 DiffModal（仅当 result.diff 存在时显示）
 * - 提交动作不在此面板，由底部 StickyActionBar 承担
 */
import { useState } from 'react';
import type { ValidationResultView } from '../../../../skillhub/uploadHelpers';
import DiffModal from './DiffModal';
import styles from './parts.module.css';

interface Props {
  result: ValidationResultView;
}

const STATUS_LABEL: Record<ValidationResultView['status'], string> = {
  ok: '校验通过',
  warning: '存在警告',
  error: '校验失败',
};

export default function ValidationResultPanel({ result }: Props) {
  const [issuesOpen, setIssuesOpen] = useState(true);
  const [diffOpen, setDiffOpen] = useState(false);

  const statusClass =
    result.status === 'ok'
      ? styles.statusOk
      : result.status === 'warning'
        ? styles.statusWarn
        : styles.statusError;

  return (
    <div className={styles.resultBlock}>
      <div className={styles.resultHeader}>
        <span className={`${styles.statusBadge} ${statusClass}`}>
          {STATUS_LABEL[result.status]}
        </span>
        {result.stagingId && (
          <span className={styles.stagingHint} title={`Staging: ${result.stagingId}`}>
            已暂存
          </span>
        )}
      </div>

      <div className={styles.resultRow}>
        <span className={styles.resultLabel}>Skill ID</span>
        <code className={styles.skillIdValue}>{result.skillId || '—'}</code>
      </div>

      {result.issues.length > 0 ? (
        <div className={styles.issuesGroup}>
          <button
            type="button"
            className={styles.issuesToggle}
            aria-expanded={issuesOpen}
            onClick={() => setIssuesOpen((v) => !v)}
          >
            <span>潜在问题 ({result.issues.length})</span>
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={issuesOpen ? styles.iconRotated : ''}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {issuesOpen && (
            <ul className={styles.issuesList}>
              {result.issues.map((issue, i) => (
                <li key={`${issue.message}-${i}`} className={styles.issueItem}>
                  <span
                    className={`${styles.issueLevel} ${
                      issue.level === 'error'
                        ? styles.issueLevelError
                        : issue.level === 'warning'
                          ? styles.issueLevelWarn
                          : styles.issueLevelInfo
                    }`}
                  >
                    {issue.level}
                  </span>
                  <span className={styles.issueMsg}>{issue.message}</span>
                  {issue.code && <span className={styles.issueCode}>{issue.code}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className={styles.issuesEmpty}>未发现阻塞问题，可以提交审批。</div>
      )}

      {result.diff && (
        <button
          type="button"
          className={styles.diffBtn}
          onClick={() => setDiffOpen(true)}
        >
          查看差异
        </button>
      )}

      {result.scripts && result.scripts.length > 0 && (
        <div className={styles.scriptsGroup}>
          <span className={styles.resultLabel}>脚本（scripts/）</span>
          <ul className={styles.fileList} aria-label="脚本清单">
            {result.scripts.map((f) => (
              <li key={f.path} className={styles.fileItem}>
                <span className={`${styles.fileBadge} ${styles.fileBadgeScript}`} aria-label="script">
                  script
                </span>
                <span className={styles.fileName}>{f.path}</span>
                <span className={styles.fileSize}>{(f.size / 1024).toFixed(1)} KB</span>
              </li>
            ))}
          </ul>
          <p className={styles.scriptsWarn} role="note">
            这些脚本随包发布后可被 AI 在沙箱中执行，请确认内容无误后再提交审批。
          </p>
        </div>
      )}

      {result.diff && (
        <DiffModal open={diffOpen} diff={result.diff} onClose={() => setDiffOpen(false)} />
      )}
    </div>
  );
}
