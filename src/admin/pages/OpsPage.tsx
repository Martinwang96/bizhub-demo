/**
 * OpsPage — 运维与日志告警（对齐 v2 admin.html ops）
 *
 * 设计：
 *  - stats 4 卡（服务状态 / Sessions / LLM Errors / Tool Errors）
 *  - 告警卡片栅格（左边色条 critical/warning/info）+ 无告警空状态 accent
 *  - 日志查看器（深色 shell-bg-deep + mono + level tag）
 *  - 审计聚合：dataAcl 与 skillHub 分类列表（mono message + level tag）
 */
import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  fetchLogs,
  fetchAlerts,
  fetchOpsSummary,
  fetchHealth,
  fetchMetrics,
} from '../api/adminConsole';
import type { LogEntry, AlertItem } from '../api/adminConsole';
import { queryAudit as queryDataAclAudit } from '../api/dataAcl';
import { getJson } from '@shared/api/httpClient';
import { Notice, SelectInput, SkeletonStack } from '@shared/components';
import type { AdminOutletContext } from '../components/AdminShell';
import styles from './OpsPage.module.css';

interface AuditItem {
  action?: string;
  user?: string;
  message?: string;
  level?: string;
  ts?: number;
  reasonCode?: string;
  policyVersion?: string;
  details?: Record<string, unknown>;
  [k: string]: unknown;
}

function fmtTime(ts?: number): string {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString('zh-CN');
}

function alertToneClass(level: string): string {
  if (level === 'critical') return styles.alertCritical;
  if (level === 'warning') return styles.alertWarning;
  return styles.alertInfo;
}

function logLevelClass(level: string): string {
  if (level === 'ERROR') return styles.logLevelError;
  if (level === 'WARN') return styles.logLevelWarn;
  return styles.logLevelInfo;
}

export default function OpsPage() {
  const { setTopbar } = useOutletContext<AdminOutletContext>();

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [audit, setAudit] = useState<{ dataAcl: AuditItem[]; skillHub: AuditItem[] }>({ dataAcl: [], skillHub: [] });
  const [logFilter, setLogFilter] = useState({ source: 'server', level: '', keyword: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadLogs = useCallback(async () => {
    const env = await fetchLogs({ ...logFilter, limit: 100 }).catch(() => null);
    if (env?.success && env.data) setLogs(env.data.items ?? []);
  }, [logFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [alertsEnv, summaryEnv, healthEnv, metricsEnv, dataAclAuditEnv, skillHubAuditEnv] = await Promise.all([
        fetchAlerts().catch(() => null),
        fetchOpsSummary().catch(() => null),
        fetchHealth().catch(() => null),
        fetchMetrics().catch(() => null),
        queryDataAclAudit({ limit: 10 }).catch(() => null),
        getJson<{ items: AuditItem[] }>('/skill-hub/api/audit?limit=10').catch(() => null),
      ]);
      if (alertsEnv?.success && alertsEnv.data) setAlerts(alertsEnv.data.alerts ?? []);
      else setAlerts([]);
      if (summaryEnv?.success && summaryEnv.data) setSummary(summaryEnv.data);
      if (healthEnv?.success && healthEnv.data) setHealth(healthEnv.data);
      if (metricsEnv?.success && metricsEnv.data) setMetrics(metricsEnv.data);
      setAudit({
        dataAcl: (dataAclAuditEnv?.success ? dataAclAuditEnv.data?.items ?? [] : []) as unknown as AuditItem[],
        skillHub: (skillHubAuditEnv?.success ? skillHubAuditEnv.data?.items ?? [] : []) as AuditItem[],
      });
      await loadLogs();
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [loadLogs]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setTopbar({
      title: '系统日志告警',
      description: '查看健康状态、运行指标、审计日志、日志摘要和派生告警。',
      actions: (
        <button type="button" className={styles.btnGhost} onClick={() => void load()}>刷新</button>
      ),
    });
    return () => setTopbar(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setTopbar, load]);

  // 拼装 stats 4 卡
  const m = (metrics?.data as Record<string, unknown>) || metrics || (summary?.metrics as Record<string, unknown>) || {};
  const sessionsCount = Number(health?.sessions_count ?? m?.sessions_count ?? 0);
  const llmErrors = Number(m?.llm_errors ?? 0);
  const toolErrors = Number(m?.tool_errors ?? 0);
  const healthStatus = String(health?.status ?? 'ok');

  return (
    <div className={styles.page}>
      {error && <Notice tone="danger" title="加载失败">{error}</Notice>}

      {/* stats */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>服务状态</span>
          <span className={styles.statNum}>{healthStatus}</span>
          <span className={styles.statHint}>健康检查</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Sessions</span>
          <span className={styles.statNum}>{sessionsCount}</span>
          <span className={styles.statHint}>当前加载</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardWarn}`}>
          <span className={styles.statLabel}>LLM Errors</span>
          <span className={styles.statNum}>{llmErrors}</span>
          <span className={styles.statHint}>累计错误</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardWarn}`}>
          <span className={styles.statLabel}>Tool Errors</span>
          <span className={styles.statNum}>{toolErrors}</span>
          <span className={styles.statHint}>工具失败</span>
        </div>
      </div>

      {/* split: alerts + logs */}
      <div className={styles.splitRow}>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3 className={styles.cardTitle}>告警中心</h3>
          </div>
          {loading ? (
            <SkeletonStack widths={[80, 60]} />
          ) : alerts.length === 0 ? (
            <div className={styles.alertEmpty}>系统正常运行，无派生告警</div>
          ) : (
            <div className={styles.alertList}>
              {alerts.map((a, i) => (
                <article key={i} className={`${styles.alertCard} ${alertToneClass(a.level)}`}>
                  <div className={styles.alertHead}>
                    <span className={styles.alertCount}>{a.count}</span>
                    <span className={`${styles.tag} ${alertTagClass(a.level)}`}>{a.level}</span>
                    <strong className={styles.alertTitle}>{a.title}</strong>
                  </div>
                  {a.suggestion && <p className={styles.alertSugg}>{a.suggestion}</p>}
                </article>
              ))}
            </div>
          )}
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3 className={styles.cardTitle}>日志摘要</h3>
          </div>
          <div className={styles.toolbar}>
            <SelectInput
              className={`${styles.input} ${styles.logLevelSelect}`}
              value={logFilter.level}
              onChange={(next) => setLogFilter({ ...logFilter, level: next })}
              allowInput={false}
              clearable={false}
              options={[
                { value: '', label: '全部级别' },
                { value: 'ERROR', label: 'ERROR' },
                { value: 'WARN', label: 'WARN' },
                { value: 'INFO', label: 'INFO' },
              ]}
            />
            <input
              className={styles.input}
              placeholder="关键字"
              value={logFilter.keyword}
              onChange={(e) => setLogFilter({ ...logFilter, keyword: e.target.value })}
            />
            <button type="button" className={styles.btnGhost} onClick={() => void loadLogs()}>筛选</button>
          </div>
          <div className={styles.logViewer}>
            {logs.length === 0 ? (
              <div className={styles.emptyLogs}>暂无日志</div>
            ) : (
              logs.map((l, i) => (
                <div key={i} className={styles.logLine}>
                  <span className={`${styles.logLevel} ${logLevelClass(l.level)}`}>[{l.level}]</span>
                  {l.module && <span className={styles.logModule}>[{l.module}]</span>}
                  <span className={styles.logMessage}>{l.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* audit aggregation */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>审计聚合</h3>
          <span className={styles.muted}>最近 10 条 · Data ACL / Skill Hub</span>
        </div>
        <div className={styles.auditGrid}>
          <AuditList
            title="Data ACL"
            items={audit.dataAcl}
            exportUrl="/admin/api/data-acl/audit/export?format=jsonl"
            exportFilename="data-acl-audit.jsonl"
          />
          <AuditList
            title="Skill Hub"
            items={audit.skillHub}
            exportUrl="/skill-hub/api/audit/export?format=jsonl"
            exportFilename="skill-hub-audit.jsonl"
          />
        </div>
      </div>
    </div>
  );
}

function alertTagClass(level: string): string {
  if (level === 'critical') return styles.tagDanger;
  if (level === 'warning') return styles.tagWarn;
  return styles.tagPrimary;
}

function AuditList({
  title,
  items,
  exportUrl,
  exportFilename,
}: {
  title: string;
  items: AuditItem[];
  exportUrl?: string;
  exportFilename?: string;
}) {
  return (
    <section className={styles.auditCol}>
      <div className={styles.auditColHead}>
        <h4 className={styles.auditColTitle}>{title}</h4>
        {exportUrl && (
          <a
            className={styles.auditExportBtn}
            href={exportUrl}
            download={exportFilename || ''}
            title="导出当前审计原始 JSONL（每行一条 JSON 记录）"
          >
            导出 JSONL
          </a>
        )}
      </div>
      {items.length === 0 ? (
        <div className={styles.empty}>暂无审计记录</div>
      ) : (
        <ul className={styles.auditList}>
          {items.map((it, i) => {
            const action = String(it.action ?? '');
            const user = String(it.user ?? '');
            const ts = typeof it.ts === 'number' ? it.ts : 0;
            const reason = String(it.reasonCode ?? '');
            return (
              <li key={i} className={styles.auditRow}>
                <span className={`${styles.tag} ${styles.tagPrimary}`}>{action || 'event'}</span>
                <span className={styles.auditUser}>{user || '-'}</span>
                <span className={styles.auditMeta}>{fmtTime(ts)}</span>
                {reason && <span className={`${styles.tag} ${styles.tagMuted}`}>{reason}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
