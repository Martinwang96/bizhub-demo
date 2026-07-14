/**
 * useSkillsList — Skill Hub 已注册技能列表业务流。
 *
 * 抽自 PC 端 `tabs/SkillsTab.tsx`，移动端与 PC 端共用同一份状态机和接口语义。
 *
 * 暴露：
 *   list                所有技能（normalized，未过滤）
 *   filtered            按 owner / status / q 过滤后的视图
 *   owners              基于 list 抽出的 owner 集合（去空）
 *   filterOwner / filterStatus / filterQ  受控筛选状态
 *   loading / error
 *   reload()            手动刷新
 *   exportZip(skill)    打开 /export 下载链接
 *   clearError()
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getJson, postJson } from '@shared/api/httpClient';
import {
  normalizeSkillsResponse,
  skillApiBasePathFromSkill,
  type SkillItem,
} from '../apiAdapters';

export interface SkillsListApi {
  list: SkillItem[];
  filtered: SkillItem[];
  owners: string[];
  filterOwner: string;
  filterStatus: string;
  filterQ: string;
  setFilterOwner: (v: string) => void;
  setFilterStatus: (v: string) => void;
  setFilterQ: (v: string) => void;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  exportZip: (skill: SkillItem) => void;
  /**
   * 切换 skill 上下线（approver / admin 才可见入口；后端鉴权兜底）。
   *
   * - 不在 hook 内弹确认框：UI 层各自决定（PC 用 confirm，移动端可用 sheet）；
   * - 成功后乐观更新 list 中对应 skill 的 status，并异步触发一次 reload；
   * - 抛出的 Error.message 由调用方决定如何呈现（toast / inline notice）。
   */
  toggleAvailability: (skill: SkillItem, next: 'active' | 'unavailable', reason?: string) => Promise<void>;
  /** 当前正在切换中的 skillId，用于按钮 loading 状态 */
  pendingSkillId: string;
  /** 当前用户是否具备 approval / admin 权限（决定下线按钮是否可见） */
  isApprover: boolean;
  clearError: () => void;
}

export const SKILL_STATUS_FILTERS: ReadonlyArray<string> = ['', 'active', 'degraded', 'unavailable'];

export function useSkillsList(): SkillsListApi {
  const [list, setList] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterOwner, setFilterOwner] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterQ, setFilterQ] = useState('');
  const [pendingSkillId, setPendingSkillId] = useState('');
  const [isApprover, setIsApprover] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const env = await getJson<unknown>('/skill-hub/api/skills');
      if (env.success) {
        setList(normalizeSkillsResponse(env.data));
      } else {
        setError(env.error ?? '技能列表加载失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '技能列表加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const owners = useMemo(() => {
    const set = new Set(list.map((s) => s.owner ?? '').filter(Boolean));
    return Array.from(set);
  }, [list]);

  const filtered = useMemo(() => {
    return list.filter((s) => {
      if (filterOwner && (s.owner ?? '') !== filterOwner) return false;
      if (filterStatus && s.status !== filterStatus) return false;
      if (filterQ) {
        const q = filterQ.toLowerCase();
        return (
          s.skillId.toLowerCase().includes(q) ||
          (s.description ?? '').toLowerCase().includes(q) ||
          (s.tables ?? []).some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [list, filterOwner, filterStatus, filterQ]);

  const exportZip = useCallback((skill: SkillItem) => {
    window.open(`${skillApiBasePathFromSkill(skill)}/export`, '_blank', 'noopener,noreferrer');
  }, []);

  // 拉一次 config 判定 approver 角色；失败静默（默认 false 即可，按钮不显示）
  useEffect(() => {
    let alive = true;
    void getJson<{ is_approver?: boolean; role?: string; skill_hub_roles?: string[] }>('/skill-hub/api/config')
      .then((env) => {
        if (!alive) return;
        const data = env.success ? env.data : undefined;
        const role = data?.role ?? '';
        const roles = data?.skill_hub_roles ?? [];
        setIsApprover(
          !!data?.is_approver
            || role === 'admin'
            || role === 'approver'
            || roles.includes('approval'),
        );
      })
      .catch(() => { /* 静默 */ });
    return () => { alive = false; };
  }, []);

  const toggleAvailability = useCallback(
    async (skill: SkillItem, next: 'active' | 'unavailable', reason: string = '') => {
      setPendingSkillId(skill.skillId);
      setError('');
      try {
        const env = await postJson<{ status?: string }>(
          `${skillApiBasePathFromSkill(skill)}/availability`,
          { status: next, reason },
        );
        if (!env.success) {
          const msg = env.error ?? '操作失败';
          setError(msg);
          throw new Error(msg);
        }
        const finalStatus = env.data?.status ?? next;
        setList((prev) => prev.map((s) => (s.skillId === skill.skillId ? { ...s, status: finalStatus } : s)));
        // 后台再 reload 一次，拿到 availability_overlay / 时间戳等元数据
        void reload();
      } finally {
        setPendingSkillId('');
      }
    },
    [reload],
  );

  const clearError = useCallback(() => setError(''), []);

  return useMemo(
    () => ({
      list,
      filtered,
      owners,
      filterOwner,
      filterStatus,
      filterQ,
      setFilterOwner,
      setFilterStatus,
      setFilterQ,
      loading,
      error,
      reload,
      exportZip,
      toggleAvailability,
      pendingSkillId,
      isApprover,
      clearError,
    }),
    [
      list,
      filtered,
      owners,
      filterOwner,
      filterStatus,
      filterQ,
      loading,
      error,
      reload,
      exportZip,
      toggleAvailability,
      pendingSkillId,
      isApprover,
      clearError,
    ],
  );
}
