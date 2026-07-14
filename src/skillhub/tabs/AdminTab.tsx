/**
 * AdminTab — 管理员 Tab
 *
 * 对齐 v2：展示 Skill Hub 配置快照并提供 Registry reload；不调用不存在的裸删除接口。
 */
import { memo, useCallback, useEffect, useState } from 'react';
import type { Me } from '@shared/types/user';
import { getJson, postJson } from '@shared/api/httpClient';
import { CountPill, EmptyState, Notice, SectionCard } from '@shared/components';
import type { RegisterRefresh } from '../SkillHubApp';
import styles from '@shared/components/common.module.css';

interface Props { me: Me | null; onRegisterRefresh?: RegisterRefresh; }

interface SkillHubConfig {
  ok?: boolean;
  login_name?: string;
  role?: string;
  skill_hub_roles?: string[];
  is_approver?: boolean;
  approvers?: string[];
  self_approval_enabled?: boolean;
  approval_ttl?: number | null;
  skill_roots?: string[];
  skill_count?: number;
}

function AdminTab({ me, onRegisterRefresh }: Props) {
  const [config, setConfig] = useState<SkillHubConfig | null>(null);
  const [reloadResult, setReloadResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const env = await getJson<SkillHubConfig>('/skill-hub/api/config');
      if (env.success && env.data) setConfig(env.data);
      else setError(env.error ?? '配置加载失败');
    } catch (e) {
      setError(e instanceof Error ? e.message : '配置加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    onRegisterRefresh?.(load);
    return () => onRegisterRefresh?.(null);
  }, [onRegisterRefresh, load]);

  const isAdmin = config?.role === 'admin' || me?.adminConsoleRole === 'admin';

  const handleReload = useCallback(async () => {
    setReloading(true);
    setError('');
    try {
      const env = await postJson<Record<string, unknown>>('/skill-hub/api/admin/reload-skills');
      if (env.success && env.data) {
        setReloadResult(env.data);
        await load();
      } else {
        setError(env.error ?? 'Registry reload 失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registry reload 失败');
    } finally {
      setReloading(false);
    }
  }, [load]);

  if (loading) {
    return <SectionCard eyebrow="Admin" title="管理员"><p>加载中...</p></SectionCard>;
  }

  if (!isAdmin) {
    return (
      <SectionCard eyebrow="Admin" title="管理员">
        <EmptyState title="仅管理员可执行 Registry 控制" description="审批人可查看审计与审批；Registry reload 需要管理后台权限。" />
        {config && <pre className={styles.codeBlock}>{JSON.stringify(config, null, 2)}</pre>}
      </SectionCard>
    );
  }

  return (
    <SectionCard
      eyebrow="Admin"
      title="Registry 控制与审批配置"
      description="展示当前 Skill Hub 配置快照，并支持重新扫描技能注册表。"
      meta={<CountPill>{config?.skill_count ?? 0}</CountPill>}
    >
      {error && <Notice tone="danger" title="操作失败">{error}</Notice>}

      <div className={styles.metricGrid}>
        <div className={styles.metricCard}><span>当前用户</span><strong>{config?.login_name ?? me?.loginName ?? '-'}</strong></div>
        <div className={styles.metricCard}><span>角色</span><strong>{config?.role ?? '-'}</strong></div>
        <div className={styles.metricCard}><span>技能数</span><strong>{config?.skill_count ?? 0}</strong></div>
        <div className={styles.metricCard}><span>Self Approval</span><strong>{config?.self_approval_enabled ? '启用' : '关闭'}</strong></div>
      </div>

      <div className={styles.actionsRow}>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={reloading} onClick={() => void handleReload()}>
          {reloading ? '重新扫描中...' : '重新扫描并热刷新 Registry'}
        </button>
      </div>

      <h3 className={styles.subTitle}>审批人配置</h3>
      <pre className={styles.codeBlock}>{JSON.stringify({
        approvers: config?.approvers ?? [],
        skillHubRoles: config?.skill_hub_roles ?? [],
        approvalTtl: config?.approval_ttl ?? null,
        skillRoots: config?.skill_roots ?? [],
      }, null, 2)}</pre>

      {reloadResult && (
        <>
          <h3 className={styles.subTitle}>最近 Reload 结果</h3>
          <pre className={styles.codeBlock}>{JSON.stringify(reloadResult, null, 2)}</pre>
        </>
      )}
    </SectionCard>
  );
}

export default memo(AdminTab);
