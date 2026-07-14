/**
 * useSkillHubAdmin — Skill Hub 管理员配置 + Registry reload 业务流。
 *
 * 抽自 PC 端 `tabs/AdminTab.tsx`，移动端与 PC 端共用同一份状态机和接口语义。
 *
 * 暴露：
 *   config              /skill-hub/api/config 返回的快照
 *   reloadResult        最近一次 reload-skills 接口返回值
 *   loading             首次/手动 reload config 的进行中标记
 *   reloading           reload-skills 接口进行中标记
 *   error
 *   reload()            重新拉取 config（不触发 reload-skills）
 *   reloadRegistry()    POST /admin/reload-skills 后再 reload config
 *   clearError()
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getJson, postJson } from '@shared/api/httpClient';

export interface SkillHubConfig {
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

export interface SkillHubAdminApi {
  config: SkillHubConfig | null;
  reloadResult: Record<string, unknown> | null;
  loading: boolean;
  reloading: boolean;
  error: string;
  reload: () => Promise<void>;
  reloadRegistry: () => Promise<void>;
  clearError: () => void;
}

export function useSkillHubAdmin(): SkillHubAdminApi {
  const [config, setConfig] = useState<SkillHubConfig | null>(null);
  const [reloadResult, setReloadResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const env = await getJson<SkillHubConfig>('/skill-hub/api/config');
      if (env.success && env.data) {
        setConfig(env.data);
      } else {
        setError(env.error ?? '配置加载失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '配置加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const reloadRegistry = useCallback(async () => {
    setReloading(true);
    setError('');
    try {
      const env = await postJson<Record<string, unknown>>('/skill-hub/api/admin/reload-skills');
      if (env.success && env.data) {
        setReloadResult(env.data);
        await reload();
      } else {
        setError(env.error ?? 'Registry reload 失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registry reload 失败');
    } finally {
      setReloading(false);
    }
  }, [reload]);

  const clearError = useCallback(() => setError(''), []);

  return useMemo(
    () => ({
      config,
      reloadResult,
      loading,
      reloading,
      error,
      reload,
      reloadRegistry,
      clearError,
    }),
    [config, reloadResult, loading, reloading, error, reload, reloadRegistry, clearError],
  );
}
