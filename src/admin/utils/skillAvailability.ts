/**
 * Skill 可用性相关的共享 helper（前端唯一来源）。
 *
 * 设计动机：
 * - 「skillIndex 里 status==unavailable 的占位行 → 下线 sid 集合」这一步
 *   原本在 DataAclPage / DataAclGroupsTab / MobileDataAclPage 三个文件各
 *   写过一次（共 ≥7 处 useMemo 复制），口径完全一致但易漂移。
 * - 收口为 `useUnavailableSkillIds`/`buildUnavailableSkillIds`，所有视图
 *   只调函数，不再独立解析 `entry.status === 'unavailable'`。
 *
 * 与后端的对齐：
 * - 后端 `skills/registry.py::is_skill_unavailable` 是字面量 'unavailable'
 *   的唯一判定点；本文件作为前端镜像，亦把字符串字面量收敛到这里。
 *
 * 入参契约：
 * - 任意「至少含 `skill` 字段，可选 `status` 字段」的对象都可作为元素，
 *   不强绑某个 `SkillTableEntry`/`SkillIndexEntry` 局部 interface。
 */
import { useMemo } from 'react';

export interface SkillAvailabilityEntryLike {
  skill: string;
  status?: string;
}

/** 纯函数版：从 skillIndex 派生下线 sid 集合（测试 / 非组件场景调用）。 */
export function buildUnavailableSkillIds(
  skillIndex: ReadonlyArray<SkillAvailabilityEntryLike> | null | undefined,
): Set<string> {
  const s = new Set<string>();
  if (!skillIndex) return s;
  for (const e of skillIndex) {
    if (e && e.status === 'unavailable' && e.skill) s.add(e.skill);
  }
  return s;
}

/** Hook 版：在组件中按 skillIndex 引用稳定派生下线 sid 集合。 */
export function useUnavailableSkillIds(
  skillIndex: ReadonlyArray<SkillAvailabilityEntryLike> | null | undefined,
): Set<string> {
  return useMemo(() => buildUnavailableSkillIds(skillIndex), [skillIndex]);
}

/**
 * 过滤掉下线 sid 后的 skill 列表（不改顺序）。
 *
 * 用途：用户/组列表 badge、Stats 卡、组详情 chip、加入分组面板共享数等
 * 「展示口径」过滤——与后端 `_filtered_table_entries` 在配置侧做的"剔除
 * 下线占位行"语义对齐。
 */
export function visibleSkills<T extends string>(
  skills: ReadonlyArray<T> | null | undefined,
  unavailable: ReadonlySet<string>,
): T[] {
  if (!skills || skills.length === 0) return [];
  if (!unavailable || unavailable.size === 0) return [...skills];
  return skills.filter((s) => !unavailable.has(s));
}

/** `visibleSkills(...).length` 的快捷方式，避免在 JSX 内拼计数表达式。 */
export function visibleSkillCount(
  skills: ReadonlyArray<string> | null | undefined,
  unavailable: ReadonlySet<string>,
): number {
  return visibleSkills(skills, unavailable).length;
}

/**
 * 编辑面板「下线 sid 切换规则」单点：
 *
 * - 已勾的下线 sid：允许取消（让 admin 主动清理残留），即返回 'remove'；
 * - 未勾的下线 sid：禁止新增勾选，即返回 'denied'；
 * - 其它情况：根据当前是否已勾 → 'remove'/'add'。
 *
 * 与后端 `_validate_skills_in_registry`（SKILL_NOT_IN_REGISTRY）写路径
 * 校验闭环；PC `PermissionTree`/`DataAclPage` 与移动端 `MobileDataAclPage`
 * 三处共用此 helper，避免规则演进时三端漂移。
 */
export type SkillToggleAction = 'add' | 'remove' | 'denied';

export function canToggleSkill(params: {
  isUnavailable: boolean;
  currentlyChecked: boolean;
  readOnly?: boolean;
}): SkillToggleAction {
  if (params.readOnly) return 'denied';
  if (params.currentlyChecked) return 'remove';
  if (params.isUnavailable) return 'denied';
  return 'add';
}
