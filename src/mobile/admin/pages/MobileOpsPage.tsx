/**
 * MobileOpsPage — 移动端「系统日志告警」单列版
 *
 * 与 PC OpsPage 完全一致的状态机与 API（fetchAlerts / fetchOpsSummary /
 * fetchHealth / fetchMetrics / fetchLogs + queryDataAclAudit + skill-hub audit）
 * 仅渲染层替换为 mobile parts：
 *  - MobilePageHeader（sticky，右上 ghost「刷新」按钮）
 *  - MobileOpsStatsRow（2x2：服务状态 / Sessions / LLM Errors / Tool Errors）
 *  - MobileOpsAlertCenter（左竖条列表 + tap → BottomSheet）
 *  - MobileOpsLogTerminal（深色 shell + mono；level + keyword + 「筛选」独立触发）
 *  - MobileOpsAuditSection × 2（DataACL / SkillHub，<details> 折叠）
 *  - MobileAdminNavDrawer（左侧抽屉导航；触发器嵌入 Header leading 槽）
 *  - MobileOpsAlertSheet（基于 MobileBottomSheet：suggestion + raw JSON + 复制）
 */
import { useCallback, useEffect, useState } from 'react';
import {
  fetchLogs,
  fetchAlerts,
  fetchOpsSummary,
  fetchHealth,
  fetchMetrics,
} from '../../../admin/api/adminConsole';
import type { LogEntry, AlertItem } from '../../../admin/api/adminConsole';
import { queryAudit as queryDataAclAudit } from '../../../admin/api/dataAcl';
import { getJson } from '@shared/api/httpClient';
import { Notice, SkeletonStack, useToast } from '@shared/components';
import type { Me } from '@shared/types/user';
import MobileOpsHeader from './parts/MobileOpsHeader';
import MobileAdminNavDrawer, { MobileAdminNavTrigger } from './parts/MobileAdminNavDrawer';
import MobileOpsStatsRow from './parts/MobileOpsStatsRow';
import MobileOpsAlertCenter from './parts/MobileOpsAlertCenter';
import MobileOpsLogTerminal from './parts/MobileOpsLogTerminal';
import MobileOpsAuditSection from './parts/MobileOpsAuditSection';
import MobileOpsAlertSheet from './parts/MobileOpsAlertSheet';
import styles from './MobileOpsPage.module.css';

export interface AuditItem {
  action?: string;
  user?: string;
  message?: string;
  level?: string;
  ts?: number;
  reasonCode?: string;
  policyVersion?: string;
  resource?: string;
  status?: string;
  details?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface LogFilterState {
  source: string;
  level: string;
  keyword: string;
}

interface MobileOpsPageProps {
  me?: Me | null;
}

export default function MobileOpsPage({ me }: MobileOpsPageProps = {}) {
  const toast = useToast();

  // 与 PC 版 OpsPage 保持完全一致的状态机
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [audit, setAudit] = useState<{ dataAcl: AuditItem[]; skillHub: AuditItem[] }>({ dataAcl: [], skillHub: [] });
  const [logFilter, setLogFilter] = useState<LogFilterState>({ source: 'server', level: '', keyword: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 告警详情 BottomSheet 状态
  const [sheetAlert, setSheetAlert] = useState<AlertItem | null>(null);
  // 左侧抽屉导航
  const [navOpen, setNavOpen] = useState(false);

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

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 拼装 stats 数据（与 PC 版同口径，metrics 兼容多种 envelope 形态）
  const m = (metrics?.data as Record<string, unknown>) || metrics || (summary?.metrics as Record<string, unknown>) || {};
  const sessionsCount = Number(health?.sessions_count ?? m?.sessions_count ?? 0);
  const llmErrors = Number(m?.llm_errors ?? 0);
  const toolErrors = Number(m?.tool_errors ?? 0);
  const healthStatus = String(health?.status ?? 'ok');

  const handleAlertSelect = (alert: AlertItem) => setSheetAlert(alert);
  const handleSheetClose = () => setSheetAlert(null);

  const handleCopyAlert = async () => {
    if (!sheetAlert) return;
    const text = JSON.stringify(sheetAlert, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // legacy fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast.success('已复制告警 JSON');
    } catch (err) {
      console.error('copy alert failed', err);
      toast.error('复制失败，请重试');
    }
  };

  return (
    <>
      <MobileOpsHeader
        me={me}
        onRefresh={() => void load()}
        refreshing={loading}
        leading={<MobileAdminNavTrigger onClick={() => setNavOpen(true)} />}
      />

      <main className={styles.main} role="main">
        {error && (
          <Notice tone="danger" title="加载失败">{error}</Notice>
        )}

        <MobileOpsStatsRow
          healthStatus={healthStatus}
          sessions={sessionsCount}
          llmErrors={llmErrors}
          toolErrors={toolErrors}
        />

        <section className={styles.section} aria-label="告警中心">
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>告警中心</h2>
            {!loading && alerts.length > 0 && (
              <span className={styles.activeBadge}>{alerts.length} Active</span>
            )}
          </header>
          {loading ? (
            <div className={styles.skeletonWrap}>
              <SkeletonStack widths={[78, 92, 70]} />
            </div>
          ) : (
            <MobileOpsAlertCenter alerts={alerts} onSelect={handleAlertSelect} />
          )}
        </section>

        <section className={styles.section} aria-label="实时日志">
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>日志摘要</h2>
            <span className={styles.sectionMeta}>limit 100</span>
          </header>
          <MobileOpsLogTerminal
            logs={logs}
            loading={loading}
            filter={logFilter}
            onFilterChange={setLogFilter}
            onApply={() => void loadLogs()}
          />
        </section>

        <section className={styles.section} aria-label="审计聚合">
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>审计聚合</h2>
            <span className={styles.sectionMeta}>最近 10 条</span>
          </header>
          <div className={styles.auditStack}>
            <MobileOpsAuditSection
              title="Data ACL Audit"
              kind="acl"
              items={audit.dataAcl}
              defaultOpen
            />
            <MobileOpsAuditSection
              title="Skill Hub Audit"
              kind="skill"
              items={audit.skillHub}
            />
          </div>
        </section>
      </main>

      <MobileAdminNavDrawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        activeId="ops"
      />

      <MobileOpsAlertSheet
        alert={sheetAlert}
        open={!!sheetAlert}
        onClose={handleSheetClose}
        onCopy={() => void handleCopyAlert()}
      />
    </>
  );
}
