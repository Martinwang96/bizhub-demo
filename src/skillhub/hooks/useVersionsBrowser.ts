/**
 * useVersionsBrowser — Skill Hub 版本浏览 / 回滚业务流。
 *
 * 抽自 PC 端 `tabs/VersionsTab.tsx`，PC + 移动端共用同一份状态机。
 *
 * 暴露：
 *   skills              所有技能（normalized）
 *   filteredSkills      按 search 过滤后的技能视图
 *   search / setSearch  搜索词
 *   selected            当前选中 skillId（null 表示未选）
 *   versions            选中技能的版本列表
 *   loadingSkills / loadingVersions / error
 *   rolling             { [version]: boolean }，表示该版本回滚 in-flight
 *   reloadSkills()                技能列表
 *   selectSkill(id)               选中技能并加载版本
 *   clearSelected()               回到技能列表（移动端"返回"用）
 *   rollback(version)             触发回滚 + 重新拉版本
 *   clearError()
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getJson, postJson } from '@shared/api/httpClient';
import {
  normalizeSkillsResponse,
  normalizeVersionsResponse,
  skillApiBasePath,
  type SkillItem,
  type VersionItem,
} from '../apiAdapters';

export interface VersionsBrowserApi {
  skills: SkillItem[];
  filteredSkills: SkillItem[];
  search: string;
  setSearch: (v: string) => void;
  selected: string | null;
  versions: VersionItem[];
  loadingSkills: boolean;
  loadingVersions: boolean;
  error: string;
  rolling: Record<string, boolean>;
  reloadSkills: () => Promise<void>;
  selectSkill: (skillId: string) => Promise<void>;
  clearSelected: () => void;
  rollback: (version: string) => Promise<void>;
  clearError: () => void;
}

export function useVersionsBrowser(): VersionsBrowserApi {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [search, setSearch] = useState('');
  const [loadingSkills, setLoadingSkills] = useState(true);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [error, setError] = useState('');
  const [rolling, setRolling] = useState<Record<string, boolean>>({});

  const reloadSkills = useCallback(async () => {
    setLoadingSkills(true);
    setError('');
    try {
      const env = await getJson<unknown>('/skill-hub/api/skills');
      if (env.success) {
        setSkills(normalizeSkillsResponse(env.data));
      } else {
        setError(env.error ?? '技能列表加载失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '技能列表加载失败');
    } finally {
      setLoadingSkills(false);
    }
  }, []);

  useEffect(() => {
    void reloadSkills();
  }, [reloadSkills]);

  const selectSkill = useCallback(async (skillId: string) => {
    setSelected(skillId);
    setLoadingVersions(true);
    setError('');
    try {
      const env = await getJson<unknown>(`${skillApiBasePath(skillId)}/versions`);
      if (env.success) {
        setVersions(normalizeVersionsResponse(env.data));
      } else {
        setVersions([]);
        setError(env.error ?? '版本记录加载失败');
      }
    } catch (e) {
      setVersions([]);
      setError(e instanceof Error ? e.message : '版本记录加载失败');
    } finally {
      setLoadingVersions(false);
    }
  }, []);

  const clearSelected = useCallback(() => {
    setSelected(null);
    setVersions([]);
    setError('');
  }, []);

  const rollback = useCallback(async (version: string) => {
    if (!selected) return;
    setRolling((s) => ({ ...s, [version]: true }));
    setError('');
    try {
      const env = await postJson(
        `${skillApiBasePath(selected)}/rollback`,
        { target_version: version },
      );
      if (!env.success) setError(env.error ?? '回滚失败');
      await selectSkill(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : '回滚失败');
    } finally {
      setRolling((s) => ({ ...s, [version]: false }));
    }
  }, [selected, selectSkill]);

  const filteredSkills = useMemo(() => {
    if (!search) return skills;
    const q = search.toLowerCase();
    return skills.filter((s) => s.skillId.toLowerCase().includes(q));
  }, [skills, search]);

  const clearError = useCallback(() => setError(''), []);

  return useMemo(
    () => ({
      skills,
      filteredSkills,
      search,
      setSearch,
      selected,
      versions,
      loadingSkills,
      loadingVersions,
      error,
      rolling,
      reloadSkills,
      selectSkill,
      clearSelected,
      rollback,
      clearError,
    }),
    [
      skills,
      filteredSkills,
      search,
      selected,
      versions,
      loadingSkills,
      loadingVersions,
      error,
      rolling,
      reloadSkills,
      selectSkill,
      clearSelected,
      rollback,
      clearError,
    ],
  );
}
