/**
 * MobileDataAclPage — 移动端「用户数据权限管理 (Data ACL)」单列版
 *
 * 与 PC 版 DataAclPage 共享同一组 admin api（fetchActive / fetchLayerValues / listUsers /
 * listHistory / fetchSkillTableIndex / updateProducts / updateUserBindings /
 * rollbackConfig / simulateIntent / simulateQuery），动线一致：
 *   ① 顶部 2×2 stats（active version / 节点数 / 用户产品绑定 / 用户表绑定）
 *   ② 用户列表（bypass 自动置灰，user 角色可点击「编辑」打开 UserBindingsSheet）
 *   ③ 产业树（折叠展开 + 长按 / 点行打开 EditNodeSheet，支持「+ 子节点 / 编辑 / 删除」）
 *   ④ 权限验证模拟（loginName + 问题/SQL，按 intent / query 触发）
 *   ⑤ 历史版本回滚
 *   ⑥ 三个 BottomSheet：编辑节点 / 批量导入 TSV / 用户绑定（产品 / Skill / 层级 / 行权限 4 segment）
 *
 * 删除节点采用 v2 双击确认；保存均经 toast 反馈成功/失败。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Me } from '@shared/types/user';
import { Notice, SkeletonStack, TriCheckbox, type TriState, useToast } from '@shared/components';
import {
  addGroupMembers,
  createGroup,
  deleteGroup,
  discoveryColumns,
  discoveryEnumValues,
  fetchActive,
  fetchLayerValues,
  fetchSkillTableIndex,
  fetchUserRowScopes,
  fetchUserTemplate,
  listGroups,
  listHistory,
  listUsers,
  removeGroupMember,
  rollbackConfig,
  simulateIntent,
  simulateQuery,
  updateGroup,
  updateProducts,
  updateUserBindings,
  type DataAclTemplate,
  type DiscoveryColumn,
  type DiscoveryEnumValue,
  type LayerValues,
  type RowScopeBinding,
  type TemplateSnapshot,
  type UserGroup,
} from '../../../admin/api/dataAcl';
import MobileBottomSheet from '../../shared/MobileBottomSheet';
import MobilePageHeader from './parts/MobilePageHeader';
import MobileDataAclUserCard from './parts/MobileDataAclUserCard';
import MobileAdminNavDrawer, { MobileAdminNavTrigger } from './parts/MobileAdminNavDrawer';
import {
  canToggleSkill,
  useUnavailableSkillIds,
  visibleSkillCount,
  visibleSkills,
} from '../../../admin/utils/skillAvailability';
import styles from './MobileDataAclPage.module.css';

type AnyRecord = Record<string, unknown>;

interface ProductNodeRaw {
  product_id: string;
  parent_id?: string;
  level?: string;
  name?: string;
  aliases?: string[];
  standard_product_name?: string;
  standard_product_id?: string;
}

interface DataAclUserRaw {
  login_name?: string;
  loginName?: string;
  role?: string;
  product_ids?: string[];
  productIds?: string[];
  business_roles?: string[];
  businessRoles?: string[];
  /** auth-mod 用 skills 替代了原 tables 维度。 */
  skills?: string[];
  /** v2.8：按聚合层订阅授权（产品聚合维度） */
  agg_layers?: string[];
  aggLayers?: string[];
  /** v2.8：按组织架构层订阅授权 */
  org_layers?: string[];
  orgLayers?: string[];
}

interface SkillTableEntry {
  table: string;
  skill: string;
  datasource?: string;
  /**
   * 后端 v3.x 起回填：
   * - "active"：上线 skill 的真实表条目（``table`` 非空）；
   * - "unavailable"：下线 skill 的占位行（``table=""``），仅用于让前端
   *   展示该 sid（灰显 + 不可新增勾选）；行权限消费方需按 ``table != ''`` 过滤。
   */
  status?: 'active' | 'unavailable';
  brief?: string;
  /** v3.3：访问级别。"public" = 系统自带公共 skill。 */
  access?: string;
}

interface HistoryEntry {
  version?: string;
  updated_by?: string;
  updated_at?: number;
  updatedAt?: number;
}

/* ─── helpers（与 PC 端 DataAclPage 完全一致，保证数据一致性） ─── */
function uname(u: DataAclUserRaw): string {
  return String(u.login_name ?? u.loginName ?? '');
}
function uproductIds(u: DataAclUserRaw): string[] {
  return (u.product_ids ?? u.productIds ?? []) as string[];
}
function uskills(u: DataAclUserRaw): string[] {
  return (u.skills ?? []) as string[];
}
function uagglayers(u: DataAclUserRaw): string[] {
  return (u.agg_layers ?? u.aggLayers ?? []) as string[];
}
function uorglayers(u: DataAclUserRaw): string[] {
  return (u.org_layers ?? u.orgLayers ?? []) as string[];
}
function ubypass(u: DataAclUserRaw): boolean {
  const role = u.role || 'user';
  return role === 'admin' || role === 'manager';
}
function dataAclTemplateSummary(tpl: DataAclTemplate): {
  productCount: number;
  aggCount: number;
  orgCount: number;
  skillCount: number;
  rowCount: number;
} {
  return {
    productCount: tpl.product_ids?.length ?? 0,
    aggCount: tpl.agg_layers?.length ?? 0,
    orgCount: tpl.org_layers?.length ?? 0,
    skillCount: tpl.skills?.length ?? 0,
    rowCount: tpl.row_scopes?.length ?? 0,
  };
}
/**
 * 行权限并集合并（与 PC 端 DataAclGroupsTab.mergeRowScopes / DataAclPage.mergeRowScopes 完全一致）。
 * 同 (skill_id, source, schema, table) 的 scope 视为同一桶；列粒度按 column 名归并 values。
 */
function mergeRowScopes(a: RowScopeBinding[], b: RowScopeBinding[]): RowScopeBinding[] {
  const buckets = new Map<string, RowScopeBinding>();
  [...(a || []), ...(b || [])].forEach((scope) => {
    const key = `${scope.skill_id}|${scope.source || 'mysql'}|${scope.schema || ''}|${scope.table}`;
    const existing = buckets.get(key) || {
      skill_id: scope.skill_id,
      source: scope.source || 'mysql',
      schema: scope.schema || '',
      table: scope.table,
      enabled: scope.enabled !== false,
      columns: [],
    };
    const byColumn = new Map(existing.columns.map((c) => [c.column, new Set(c.values || [])]));
    (scope.columns || []).forEach((column) => {
      const name = String(column.column || '').trim();
      if (!name) return;
      const values = byColumn.get(name) || new Set<string>();
      (column.values || []).forEach((value) => {
        const v = String(value || '').trim();
        if (v) values.add(v);
      });
      byColumn.set(name, values);
    });
    buckets.set(key, {
      ...existing,
      enabled: existing.enabled !== false || scope.enabled !== false,
      columns: Array.from(byColumn.entries())
        .map(([column, values]) => ({ column, values: Array.from(values).sort() }))
        .sort((x, y) => x.column.localeCompare(y.column)),
    });
  });
  return Array.from(buckets.values()).sort((x, y) => `${x.skill_id}:${x.table}`.localeCompare(`${y.skill_id}:${y.table}`));
}
/**
 * 把两份模板（base + source）做并集，返回完整 DataAclTemplate。
 * 与 PC 端 DataAclGroupsTab.handleCopyTemplate 语义一致：4 维度数组取并集 + 排序，
 * 行权限走 mergeRowScopes 按列归并。
 *
 * 注意：返回值用于写入「组模板」（updateGroup），而不是用户个人 binding；
 * 这样组成员的真实权限在运行时由后端 GroupStore.merged_template_for(login)
 * 与个人 AclUser 模板做并集计算，移出组 / 删除组后组贡献部分自动失效，
 * 个人 binding 永远独立保留 —— 满足「组权限消失时保留成组之前的个人权限」契约。
 */
function mergeTemplates(base: DataAclTemplate, source: DataAclTemplate): DataAclTemplate {
  return {
    product_ids: Array.from(new Set([...(base.product_ids ?? []), ...(source.product_ids ?? [])])).sort(),
    agg_layers: Array.from(new Set([...(base.agg_layers ?? []), ...(source.agg_layers ?? [])])).sort(),
    org_layers: Array.from(new Set([...(base.org_layers ?? []), ...(source.org_layers ?? [])])).sort(),
    skills: Array.from(new Set([...(base.skills ?? []), ...(source.skills ?? [])])).sort(),
    row_scopes: mergeRowScopes(base.row_scopes ?? [], source.row_scopes ?? []),
  };
}
function buildChildrenMap(nodes: ProductNodeRaw[]): Record<string, string[]> {
  const m: Record<string, string[]> = {};
  for (const n of nodes) {
    if (n.parent_id) (m[n.parent_id] = m[n.parent_id] || []).push(n.product_id);
  }
  return m;
}
function isLeaf(nodes: ProductNodeRaw[], pid: string): boolean {
  return !nodes.some((n) => n.parent_id === pid);
}
function expandSubtreeIds(nodes: ProductNodeRaw[], rootId: string): Set<string> {
  const out = new Set<string>([rootId]);
  let frontier = [rootId];
  while (frontier.length) {
    const next: string[] = [];
    for (const f of frontier) {
      for (const n of nodes) {
        if (n.parent_id === f && !out.has(n.product_id)) {
          out.add(n.product_id);
          next.push(n.product_id);
        }
      }
    }
    frontier = next;
  }
  return out;
}
function effectiveLeafCount(nodes: ProductNodeRaw[], productIds: string[]): number {
  if (!productIds.length || !nodes.length) return 0;
  const valid = new Set(nodes.map((n) => n.product_id));
  const leaves = new Set<string>();
  for (const pid of productIds) {
    if (!valid.has(pid)) continue;
    for (const x of expandSubtreeIds(nodes, pid)) {
      if (isLeaf(nodes, x)) leaves.add(x);
    }
  }
  return leaves.size;
}
function ancestorsOf(nodes: ProductNodeRaw[], pid: string): string[] {
  const out: string[] = [];
  let cur = nodes.find((x) => x.product_id === pid);
  while (cur && cur.parent_id) {
    out.push(cur.parent_id);
    cur = nodes.find((x) => x.product_id === cur!.parent_id);
  }
  return out;
}
function computeTriState(nodes: ProductNodeRaw[], selected: Set<string>, pid: string): TriState {
  if (selected.has(pid)) return 'checked';
  for (const a of ancestorsOf(nodes, pid)) if (selected.has(a)) return 'checked';
  const sub = expandSubtreeIds(nodes, pid);
  for (const x of sub) if (x !== pid && selected.has(x)) return 'indeterminate';
  return 'unchecked';
}

/**
 * 「打散祖先覆盖」工具：见 desktop DataAclPage.tsx 同名函数注释。
 * 用户点击 pid 想取消、但 pid 是被祖先 A 覆盖时：
 *   - 移除路径上的显式祖先；
 *   - 沿 A → pid 路径，把每层非路径兄弟显式加入（保留它们继承的 checked）；
 *   - pid 自身不加入 → 实现 leaf 单点取消。
 * 模型不变（仍是集合 / 包含语义），仅把祖先覆盖等价展开为更细粒度的兄弟集合。
 */
function breakAncestorOverrideForUncheck(
  nodes: ProductNodeRaw[],
  selected: Set<string>,
  pid: string,
): Set<string> {
  const next = new Set(selected);
  const ancs = ancestorsOf(nodes, pid); // [parent, grandparent, ..., root]
  const explicitAncs = ancs.filter((a) => next.has(a));
  if (explicitAncs.length === 0) return next;
  const topAnc = explicitAncs[explicitAncs.length - 1];
  for (const a of explicitAncs) next.delete(a);
  const topIdx = ancs.indexOf(topAnc);
  const pathNodes = new Set<string>([pid, ...ancs.slice(0, topIdx + 1)]);
  for (const n of pathNodes) {
    if (n === pid) continue;
    for (const child of nodes) {
      if (child.parent_id === n && !pathNodes.has(child.product_id)) {
        next.add(child.product_id);
      }
    }
  }
  return next;
}

/* ============================================
   Component
   ============================================ */

type ProductDrawerAction =
  | { mode: 'create-root' }
  | { mode: 'create-child'; parentId: string }
  | { mode: 'edit'; productId: string };

export interface MobileDataAclPageProps {
  me: Me | null;
}

export default function MobileDataAclPage({ me }: MobileDataAclPageProps) {
  const toast = useToast();
  const readonly = me?.adminConsoleRole === 'readonly';

  const [active, setActive] = useState<AnyRecord | null>(null);
  const [users, setUsers] = useState<DataAclUserRaw[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [skillIndex, setSkillIndex] = useState<SkillTableEntry[]>([]);
  // v2.8：当前 active 的两个层级维度全部取值（与 PC DataAclPage 同款数据源）
  const [layerValues, setLayerValues] = useState<LayerValues>({ agg_layers: [], org_layers: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 树折叠
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // 节点删除双击确认
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 模拟鉴权
  const [simLogin, setSimLogin] = useState('');
  const [simInput, setSimInput] = useState('');
  const [simResult, setSimResult] = useState('');

  // 三个 sheet
  const [productSheet, setProductSheet] = useState<ProductDrawerAction | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [userSheet, setUserSheet] = useState<string | null>(null);

  // 用户区视图切换：用户列表 / 用户组
  const [userView, setUserView] = useState<'users' | 'groups'>('users');

  // 用户组数据
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState('');
  // 「用户组」视图是否已加载过一次：用 ref 而非 groups.length 等会回弹的状态作为触发闸门，
  // 避免「空列表 → 条件再次成立 → 反复 reloadGroups」的无限请求循环（移动端疯狂请求根因）。
  const groupsLoadedOnceRef = useRef(false);
  // reloadGroups 并发串行化：上一次未完成时不再发新请求（对齐 PC DataAclGroupsTab.inflightRef）。
  const groupsInflightRef = useRef(false);

  // 新建组浮层
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  // 组管理 Sheet（loginName-style：当前选中的 groupId）
  const [groupSheet, setGroupSheet] = useState<string | null>(null);

  // 树节点 actions popover（行级"+/编辑/删除"在移动端通过 ActionSheet 触发）
  const [actionTarget, setActionTarget] = useState<string | null>(null);

  // 左侧抽屉导航
  const [navOpen, setNavOpen] = useState(false);

  const productNodes = useMemo<ProductNodeRaw[]>(() => {
    const raw = active?.product_nodes;
    return Array.isArray(raw) ? (raw as ProductNodeRaw[]) : [];
  }, [active]);

  const childrenMap = useMemo(() => buildChildrenMap(productNodes), [productNodes]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [activeEnv, usersEnv, historyEnv, skillEnv, layerEnv] = await Promise.all([
        fetchActive().catch(() => null),
        listUsers().catch(() => null),
        listHistory().catch(() => null),
        fetchSkillTableIndex().catch(() => null),
        fetchLayerValues().catch(() => null),
      ]);
      if (activeEnv?.success && activeEnv.data) setActive(activeEnv.data as AnyRecord);
      else setActive({ product_nodes: [], version: '' });
      setUsers((usersEnv?.success ? (usersEnv.data ?? []) : []) as DataAclUserRaw[]);
      setHistory((historyEnv?.success ? (historyEnv.data ?? []) : []) as HistoryEntry[]);
      setSkillIndex((skillEnv?.success ? (skillEnv.data ?? []) : []) as SkillTableEntry[]);
      setLayerValues(
        (layerEnv?.success ? (layerEnv.data ?? { agg_layers: [], org_layers: [] }) : { agg_layers: [], org_layers: [] }) as LayerValues,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /* ─── 用户组：加载 / 增删 / 成员管理 ─── */
  const reloadGroups = useCallback(async () => {
    if (groupsInflightRef.current) return; // 已有请求在跑：复用，不再发新请求
    groupsInflightRef.current = true;
    setGroupsLoading(true);
    setGroupsError('');
    const env = await listGroups().catch((e) => {
      console.error('[MobileDataAclPage] listGroups failed', e);
      return { success: false, error: e instanceof Error ? e.message : '请求失败' };
    });
    groupsInflightRef.current = false;
    setGroupsLoading(false);
    if (!env.success || !('data' in env)) {
      // 加载失败：放开一次闸门，允许用户重新进入「用户组」视图时再触发一次加载（而非死循环重试）。
      groupsLoadedOnceRef.current = false;
      setGroupsError(('error' in env && env.error) || '加载用户组失败');
      setGroups([]);
      return;
    }
    setGroups((env.data as UserGroup[]) ?? []);
  }, []);

  // 切换到「用户组」视图时加载一次。用 groupsLoadedOnceRef 做闸门：
  // 空列表 / 加载完成都不会再让本 effect 重新触发 reloadGroups，
  // 彻底消除「条件回弹 → 反复请求」的无限循环（PC 端用挂载期 [] 依赖 + inflight 守卫达成同样效果）。
  useEffect(() => {
    if (userView === 'groups' && !groupsLoadedOnceRef.current) {
      groupsLoadedOnceRef.current = true;
      void reloadGroups();
    }
  }, [userView, reloadGroups]);

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) { toast.error('请填写组名'); return; }
    setCreatingGroup(true);
    const env = await createGroup({
      name,
      description: newGroupDesc.trim(),
      members: [],
      template: { product_ids: [], agg_layers: [], org_layers: [], skills: [], row_scopes: [] },
    }).catch((e) => {
      console.error('[MobileDataAclPage] createGroup failed', e);
      return { success: false, error: e instanceof Error ? e.message : '创建失败' };
    });
    setCreatingGroup(false);
    if (!env.success || !('data' in env)) {
      toast.error(('error' in env && env.error) || '创建组失败');
      return;
    }
    setCreateGroupOpen(false);
    setNewGroupName('');
    setNewGroupDesc('');
    toast.success(`组「${name}」已创建`);
    await reloadGroups();
  };

  const handleDeleteGroup = async (groupId: string, name: string, memberCount: number) => {
    if (readonly) { toast.warning('只读角色无权执行此操作'); return; }
    if (!confirm(
      `确定删除分组「${name}」？该组当前有 ${memberCount} 位成员，删除后组模板将被移除（成员的个人权限不受影响）。此操作不可撤销。`,
    )) return;
    const env = await deleteGroup(groupId).catch((e) => {
      console.error('[MobileDataAclPage] deleteGroup failed', e);
      return { success: false, error: e instanceof Error ? e.message : '删除失败' };
    });
    if (!env.success) {
      toast.error(('error' in env && env.error) || '删除分组失败');
      return;
    }
    toast.success(`分组「${name}」已删除`);
    if (groupSheet === groupId) setGroupSheet(null);
    await reloadGroups();
  };

  /**
   * 已下线 sid 集合（与 PC 端口径一致）。
   * skillIndex 里 status==='unavailable' 的占位行（table === ''）。
   * 用户绑定中遗留的下线 sid 不计入"已绑定数量"统计 ——
   * 与 UserBindingsSheet 内禁选态、PermissionDetailSheet 的展示同口径，
   * 避免出现"列表里看不到却仍然计数"的视觉错位。
   */
  const unavailableSkillIds = useUnavailableSkillIds(skillIndex);
  /** 过滤掉下线 sid 后的有效 skill id 列表（与 stats / badge 计数同口径）。 */
  const activeUserSkills = useCallback(
    (u: DataAclUserRaw) => visibleSkills(uskills(u), unavailableSkillIds),
    [unavailableSkillIds],
  );

  /* ─── stats 计算（auth-mod：products + skills 两维度） ─── */
  const userBindings = useMemo(() => {
    return users.reduce(
      (acc, u) => {
        if (!ubypass(u)) {
          acc.products += effectiveLeafCount(productNodes, uproductIds(u));
          // 下线 sid 不计入累计
          acc.skills += activeUserSkills(u).length;
        }
        return acc;
      },
      { products: 0, skills: 0 },
    );
  }, [users, productNodes, activeUserSkills]);

  /* ─── 删除节点（双击确认） ─── */
  const armDeleteNode = (pid: string) => {
    if (readonly) {
      toast.warning('只读角色无权执行此操作');
      return;
    }
    if (childrenMap[pid]?.length) {
      toast.warning('请先删除其子节点');
      return;
    }
    if (pendingDelete === pid) {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
      setPendingDelete(null);
      void doDeleteNode(pid);
      return;
    }
    setPendingDelete(pid);
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = setTimeout(() => {
      setPendingDelete(null);
      pendingTimerRef.current = null;
    }, 2400);
  };

  const doDeleteNode = async (pid: string) => {
    const next = productNodes.filter((n) => n.product_id !== pid);
    const env = await updateProducts(next).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : '删除失败');
      return null;
    });
    if (env?.success) {
      toast.success('已删除');
      setActionTarget(null);
      await load();
    } else if (env) {
      toast.error(env.error ?? '删除失败');
    }
  };

  /* ─── 模拟鉴权 ─── */
  const handleSimIntent = async () => {
    if (!simLogin.trim() || !simInput.trim()) {
      toast.warning('请填写 loginName 与问题');
      return;
    }
    const env = await simulateIntent(simInput, simLogin).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : '模拟失败');
      return null;
    });
    setSimResult(env?.data ? JSON.stringify(env.data, null, 2) : env?.error || '请求失败');
  };
  const handleSimQuery = async () => {
    if (!simLogin.trim() || !simInput.trim()) {
      toast.warning('请填写 loginName 与 SQL');
      return;
    }
    const env = await simulateQuery(simInput, simLogin).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : '模拟失败');
      return null;
    });
    setSimResult(env?.data ? JSON.stringify(env.data, null, 2) : env?.error || '请求失败');
  };

  /* ─── 历史回滚 ─── */
  const handleRollback = async (version: string) => {
    if (readonly) {
      toast.warning('只读角色无权执行此操作');
      return;
    }
    if (!window.confirm(`确认回滚到版本 ${version}？当前 active 会自动备份。`)) return;
    const env = await rollbackConfig(version).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : '回滚失败');
      return null;
    });
    if (env?.success) {
      toast.success('已回滚');
      await load();
    } else if (env) {
      toast.error(env.error ?? '回滚失败');
    }
  };

  /* ─── 产业树渲染 ─── */
  const toggleCollapse = (pid: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const renderTreeRows = () => {
    if (!productNodes.length) {
      return <div className={styles.treeEmpty}>产业树为空，点击右上「+」开始录入</div>;
    }
    const rootIds = productNodes
      .filter((n) => !n.parent_id || !productNodes.some((p) => p.product_id === n.parent_id))
      .map((n) => n.product_id);
    const rows: JSX.Element[] = [];
    const isHidden = (path: string[]) => path.some((id) => collapsed.has(id));

    const walk = (pid: string, depth: number, ancestors: string[]) => {
      const node = productNodes.find((n) => n.product_id === pid);
      if (!node) return;
      const kids = childrenMap[pid] || [];
      const hasKids = kids.length > 0;
      const isCol = collapsed.has(pid);
      const leaf = !hasKids;
      const hidden = isHidden(ancestors);

      if (!hidden) {
        rows.push(
          <div
            key={pid}
            className={leaf ? `${styles.treeNode} ${styles.treeNodeLeaf}` : styles.treeNode}
            style={{ paddingLeft: 8 + depth * 16 }}
          >
            <button
              type="button"
              className={hasKids ? styles.treeToggle : `${styles.treeToggle} ${styles.treeToggleEmpty}`}
              onClick={() => hasKids && toggleCollapse(pid)}
              tabIndex={hasKids ? 0 : -1}
              aria-label={hasKids ? (isCol ? '展开' : '收起') : ''}
            >
              {hasKids ? (isCol ? '▸' : '▾') : '·'}
            </button>
            <span className={leaf ? styles.treeIconLeaf : styles.treeIconBranch} aria-hidden="true">
              {leaf ? (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              )}
            </span>
            <span className={styles.treeName}>{node.name || pid}</span>
            {leaf && (node.standard_product_name || node.standard_product_id) && (
              <span className={`${styles.treeTag} ${styles.treeTagMuted}`} title="标品">
                {node.standard_product_id || node.standard_product_name}
              </span>
            )}
            {leaf && !(node.standard_product_name || node.standard_product_id) && (
              <span className={`${styles.treeTag} ${styles.treeTagDanger}`} title="叶子节点必须填写标品">
                缺标品
              </span>
            )}
            <button
              type="button"
              className={styles.treeAction}
              onClick={() => setActionTarget(pid)}
              aria-label={`${node.name || pid} 的操作`}
              title="节点操作"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="19" cy="12" r="1.6" />
              </svg>
            </button>
          </div>
        );
      }
      if (!isCol) {
        for (const kid of kids) walk(kid, depth + 1, [...ancestors, pid]);
      }
    };
    for (const r of rootIds) walk(r, 0, []);
    return <div className={styles.tree}>{rows}</div>;
  };

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => uname(a).localeCompare(uname(b))),
    [users],
  );

  const activeNode = actionTarget
    ? productNodes.find((n) => n.product_id === actionTarget)
    : null;

  return (
    <>
      <MobilePageHeader
        me={me}
        title="用户数据权限管理"
        addDisabled={!!readonly}
        onAdd={() => setProductSheet({ mode: 'create-root' })}
        onOpenGuide={() => setBulkOpen(true)}
        leading={<MobileAdminNavTrigger onClick={() => setNavOpen(true)} />}
      />

      <main className={styles.main}>
        {readonly && (
          <Notice tone="warning" title="只读角色">
            当前账号为只读角色，写操作已被禁用。
          </Notice>
        )}
        {error && (
          <Notice tone="danger" title="加载失败">{error}</Notice>
        )}

        {/* ── ① Stats 2x2 ── */}
        <section className={styles.stats} aria-label="Data ACL 概览">
          <div className={styles.statCard}>
            <span className={styles.statLabel}>当前活跃版本</span>
            <span className={styles.statValue} title={String(active?.version ?? '未发布')}>
              {String(active?.version ?? '未发布')}
            </span>
            <span className={styles.statHint}>active config</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>产业树节点</span>
            <span className={styles.statValue}>{productNodes.length}</span>
            <span className={styles.statHint}>聚合 + 叶子共计</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>用户产品绑定</span>
            <span className={styles.statValue}>{userBindings.products}</span>
            <span className={styles.statHint}>按叶子累计</span>
          </div>
          <div className={`${styles.statCard} ${styles.statCardWarn}`}>
            <span className={styles.statLabel}>用户 Skill 绑定</span>
            <span className={styles.statValue}>{userBindings.skills}</span>
            <span className={styles.statHint}>跨用户累计</span>
          </div>
        </section>

        {/* ── ② 用户权限绑定 / 用户组 ── */}
        <section className={styles.section} aria-label="用户权限绑定">
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              {userView === 'users' ? '用户权限绑定' : '用户组'}
            </h2>
            <span className={styles.sectionMeta}>
              {userView === 'users'
                ? `${sortedUsers.length} 位`
                : groupsLoading ? '加载中…' : `${groups.length} 组`}
            </span>
          </header>

          {/* 用户区视图 segment */}
          <div className={styles.segment} role="tablist" aria-label="切换用户视图">
            <button
              type="button"
              role="tab"
              aria-selected={userView === 'users'}
              className={`${styles.segmentBtn} ${userView === 'users' ? styles.segmentBtnActive : ''}`}
              onClick={() => setUserView('users')}
            >
              用户列表
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={userView === 'groups'}
              className={`${styles.segmentBtn} ${userView === 'groups' ? styles.segmentBtnActive : ''}`}
              onClick={() => setUserView('groups')}
            >
              用户组
            </button>
          </div>

          {userView === 'users' ? (
            loading ? (
              <div className={styles.skeletonWrap}><SkeletonStack widths={[88, 72, 96]} /></div>
            ) : sortedUsers.length === 0 ? (
              <div className={styles.empty}>暂无 ACL 用户</div>
            ) : (
              <div className={styles.cardList}>
                {sortedUsers.map((u) => {
                  const login = uname(u);
                  const role = u.role || 'user';
                  const bypass = ubypass(u);
                  return (
                    <MobileDataAclUserCard
                      key={login}
                      loginName={login}
                      role={role}
                      bypass={bypass}
                      businessRoles={(u.business_roles ?? u.businessRoles ?? []) as string[]}
                      productCount={bypass ? 0 : effectiveLeafCount(productNodes, uproductIds(u))}
                      skillCount={bypass ? 0 : activeUserSkills(u).length}
                      readonly={readonly}
                      onEdit={setUserSheet}
                    />
                  );
                })}
              </div>
            )
          ) : (
            <>
              {/* 组视图工具条：新建组按钮 */}
              <div className={styles.groupToolbar}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => setCreateGroupOpen((v) => !v)}
                  disabled={readonly}
                  title={readonly ? '只读角色无法新建组' : '新建分组'}
                >
                  {createGroupOpen ? '取消新建' : '+ 新建分组'}
                </button>
              </div>

              {/* 新建组浮层 */}
              {createGroupOpen && (
                <div className={styles.createGroupBox}>
                  <label className={styles.formLabel}>组名</label>
                  <input
                    className={styles.input}
                    placeholder="必填，例如：业务分析组"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                  />
                  <label className={styles.formLabel}>描述</label>
                  <input
                    className={styles.input}
                    placeholder="可选"
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                  />
                  {/* 取消 / 创建分组：对齐同页「模拟 intent / 模拟 query」按钮样式
                      （simBtnRow 等宽 flex 行 + btn btnGhost / btn btnPrimary）。 */}
                  <div className={styles.simBtnRow}>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnGhost}`}
                      onClick={() => {
                        setCreateGroupOpen(false);
                        setNewGroupName('');
                        setNewGroupDesc('');
                      }}
                      disabled={creatingGroup}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      onClick={() => void handleCreateGroup()}
                      disabled={creatingGroup || !newGroupName.trim()}
                    >
                      {creatingGroup ? '创建中…' : '创建分组'}
                    </button>
                  </div>
                  <div className={styles.formHint}>
                    创建后可点击组卡片管理成员。组模板（产品 / Skill / 行权限）请到桌面端编辑，移动端仅做查看与成员管理。
                  </div>
                </div>
              )}

              {groupsError && <Notice tone="danger" title="加载失败">{groupsError}</Notice>}

              {groupsLoading ? (
                <div className={styles.skeletonWrap}><SkeletonStack widths={[80, 92, 70]} /></div>
              ) : groups.length === 0 ? (
                <div className={styles.empty}>
                  {groupsError ? '加载失败，下拉重试' : '暂无用户组，点击「+ 新建分组」开始'}
                </div>
              ) : (
                <div className={styles.cardList}>
                  {groups.map((g) => {
                    const tpl = g.template;
                    // 已下线 sid 不计数（与 stats / 用户列表 badge 同口径）
                    const skillCount = visibleSkillCount(tpl.skills, unavailableSkillIds);
                    const dimSummary = [
                      tpl.product_ids.length ? `${tpl.product_ids.length} 产品` : null,
                      skillCount ? `${skillCount} Skill` : null,
                      tpl.row_scopes?.length ? `${tpl.row_scopes.length} 行权限` : null,
                    ].filter(Boolean).join(' · ') || '空模板';
                    return (
                      <article key={g.groupId} className={styles.groupCard}>
                        <button
                          type="button"
                          className={styles.groupCardMain}
                          onClick={() => setGroupSheet(g.groupId)}
                          aria-label={`管理分组「${g.name}」`}
                        >
                          <div className={styles.groupCardHead}>
                            <span className={styles.groupCardName}>{g.name}</span>
                            <span className={styles.groupCardCount}>{g.memberCount} 人</span>
                          </div>
                          {g.description && (
                            <div className={styles.groupCardDesc}>{g.description}</div>
                          )}
                          <div className={styles.groupCardMeta}>{dimSummary}</div>
                        </button>
                        <button
                          type="button"
                          className={styles.groupCardDelete}
                          onClick={() => void handleDeleteGroup(g.groupId, g.name, g.memberCount)}
                          disabled={readonly}
                          title={readonly ? '只读角色无法删除' : `删除分组「${g.name}」`}
                          aria-label={`删除分组「${g.name}」`}
                        >
                          删除
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>

        {/* ── ③ 产业树 ── */}
        <section className={styles.section} aria-label="产业树管理">
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>产业树 (Industry Tree)</h2>
            <span className={styles.sectionMeta}>
              {productNodes.length
                ? `${productNodes.length} 节点 · ${productNodes.filter((n) => isLeaf(productNodes, n.product_id)).length} 叶子`
                : '尚未配置'}
            </span>
          </header>
          <div className={styles.treeBox}>
            {loading ? <SkeletonStack widths={[76, 88, 64, 92]} /> : renderTreeRows()}
          </div>
        </section>

        {/* ── ④ 权限验证模拟 ── */}
        <section className={styles.section} aria-label="权限验证模拟">
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>权限验证模拟</h2>
          </header>
          <div className={styles.simBox}>
            <label className={styles.formLabel}>登录账号</label>
            <input
              className={styles.input}
              placeholder="e.g. zhangsan_dev"
              value={simLogin}
              onChange={(e) => setSimLogin(e.target.value)}
              autoComplete="off"
            />
            <label className={styles.formLabel}>问题或 SQL</label>
            <textarea
              className={`${styles.input} ${styles.textarea}`}
              rows={3}
              placeholder={'SELECT * FROM ... 或 自然语言问题'}
              value={simInput}
              onChange={(e) => setSimInput(e.target.value)}
            />
            <div className={styles.simBtnRow}>
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => void handleSimIntent()}>
                模拟 intent
              </button>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void handleSimQuery()}>
                模拟 query
              </button>
            </div>
            {simResult ? (
              <pre className={styles.codeBlock}>{simResult}</pre>
            ) : (
              <div className={styles.simPlaceholder}>
                填写账号与问题/SQL 后点击「模拟 intent / query」查看 hook 链路结果
              </div>
            )}
          </div>
        </section>

        {/* ── ⑤ 历史版本回滚 ── */}
        <section className={styles.section} aria-label="历史版本回滚">
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>历史版本回滚</h2>
            <span className={styles.sectionMeta}>{history.length} 个</span>
          </header>
          {history.length === 0 ? (
            <div className={styles.empty}>暂无历史版本</div>
          ) : (
            <div className={styles.historyList}>
              {history.slice(0, 12).map((h, i) => {
                const ts = h.updated_at ?? h.updatedAt;
                const dateText = ts ? new Date(ts * 1000).toLocaleString('zh-CN') : '-';
                const isCurrent = String(h.version ?? '') === String(active?.version ?? '');
                return (
                  <div key={`${h.version}-${i}`} className={styles.historyRow}>
                    <div className={styles.historyInfo}>
                      <div className={styles.historyVerLine}>
                        <span className={styles.historyVer}>{h.version || '-'}</span>
                        {isCurrent && <span className={styles.historyCurrent}>当前</span>}
                      </div>
                      <div className={styles.historyMeta}>{dateText} · {h.updated_by || '-'}</div>
                    </div>
                    <button
                      type="button"
                      className={styles.historyRollback}
                      onClick={() => void handleRollback(String(h.version ?? ''))}
                      disabled={readonly || isCurrent}
                      aria-label={isCurrent ? '当前版本无需回滚' : `回滚到 ${h.version}`}
                      title={isCurrent ? '当前版本无需回滚' : `回滚到 ${h.version}`}
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 12a9 9 0 1 0 3-6.7" />
                        <polyline points="3 4 3 10 9 10" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <MobileAdminNavDrawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        activeId="data-acl"
      />

      {/* ── 节点操作 ActionSheet（移动端"+/编辑/删除"通过此处分发） ── */}
      <MobileBottomSheet
        open={!!actionTarget}
        title={activeNode ? `节点：${activeNode.name || activeNode.product_id}` : '节点操作'}
        onClose={() => { setActionTarget(null); setPendingDelete(null); }}
      >
        {activeNode && (
          <div className={styles.actionList}>
            <button
              type="button"
              className={styles.actionItem}
              disabled={readonly}
              onClick={() => {
                setProductSheet({ mode: 'create-child', parentId: activeNode.product_id });
                setActionTarget(null);
              }}
            >
              <span className={styles.actionIcon} aria-hidden="true">+</span>
              添加子节点
            </button>
            <button
              type="button"
              className={styles.actionItem}
              disabled={readonly}
              onClick={() => {
                setProductSheet({ mode: 'edit', productId: activeNode.product_id });
                setActionTarget(null);
              }}
            >
              <span className={styles.actionIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </span>
              编辑节点
            </button>
            <button
              type="button"
              className={`${styles.actionItem} ${pendingDelete === activeNode.product_id ? styles.actionDanger : ''}`}
              disabled={readonly || (childrenMap[activeNode.product_id]?.length ?? 0) > 0}
              onClick={() => armDeleteNode(activeNode.product_id)}
              title={
                (childrenMap[activeNode.product_id]?.length ?? 0) > 0
                  ? '请先删除其子节点'
                  : pendingDelete === activeNode.product_id
                    ? '再次点击确认删除'
                    : '点击两次以删除'
              }
            >
              <span className={styles.actionIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                </svg>
              </span>
              {pendingDelete === activeNode.product_id ? '再次点击确认删除' : '删除节点'}
            </button>
          </div>
        )}
      </MobileBottomSheet>

      {/* ── 产品节点编辑 Sheet ── */}
      <ProductEditSheet
        open={!!productSheet}
        action={productSheet}
        nodes={productNodes}
        readonly={!!readonly}
        onClose={() => setProductSheet(null)}
        onSaved={() => { setProductSheet(null); void load(); }}
      />

      {/* ── 批量导入 TSV Sheet ── */}
      <BulkImportSheet
        open={bulkOpen}
        readonly={!!readonly}
        onClose={() => setBulkOpen(false)}
        onImported={() => { setBulkOpen(false); void load(); }}
      />

      {/* ── 用户绑定 Sheet ── */}
      <UserBindingsSheet
        open={!!userSheet}
        loginName={userSheet ?? ''}
        readonly={!!readonly}
        nodes={productNodes}
        users={users}
        skillIndex={skillIndex}
        layerValues={layerValues}
        onClose={() => setUserSheet(null)}
        onSaved={() => { setUserSheet(null); void load(); }}
      />

      {/* ── 用户组管理 Sheet ── */}
      <GroupManageSheet
        open={!!groupSheet}
        groupId={groupSheet ?? ''}
        groups={groups}
        users={users}
        readonly={!!readonly}
        unavailableSkillIds={unavailableSkillIds}
        onClose={() => setGroupSheet(null)}
        onChanged={() => { void reloadGroups(); void load(); }}
        onOpenUserBinding={(login) => { setGroupSheet(null); setUserSheet(login); }}
      />
    </>
  );
}

/* ============================================
   Sheet: 产品节点编辑（新增/编辑；叶子节点必填标品）
   ============================================ */
function ProductEditSheet({
  open,
  action,
  nodes,
  readonly,
  onClose,
  onSaved,
}: {
  open: boolean;
  action: ProductDrawerAction | null;
  nodes: ProductNodeRaw[];
  readonly: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const editing = action?.mode === 'edit';
  const editingNode = editing && action?.productId
    ? nodes.find((n) => n.product_id === action.productId) ?? null
    : null;
  const parentId = action?.mode === 'create-child' ? (action.parentId ?? '') : (editingNode?.parent_id ?? '');
  const willBeLeaf = editing
    ? (editingNode ? isLeaf(nodes, editingNode.product_id) : true)
    : true;

  const [form, setForm] = useState({
    product_id: '',
    level: '',
    name: '',
    aliases: '',
    standard_product_name: '',
    standard_product_id: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing && editingNode) {
      setForm({
        product_id: editingNode.product_id,
        level: editingNode.level || '',
        name: editingNode.name || '',
        aliases: (editingNode.aliases || []).join(', '),
        standard_product_name: editingNode.standard_product_name || '',
        standard_product_id: editingNode.standard_product_id || '',
      });
    } else {
      setForm({ product_id: '', level: '', name: '', aliases: '', standard_product_name: '', standard_product_id: '' });
    }
  }, [open, editing, editingNode]);

  const parentName = parentId
    ? (nodes.find((n) => n.product_id === parentId)?.name || parentId)
    : '（顶层节点）';
  const title = editing ? '编辑节点' : (parentId ? '新增子节点' : '新增顶层节点');

  const handleSave = async () => {
    if (readonly) { toast.warning('只读角色无权执行此操作'); return; }
    const id = form.product_id.trim();
    const name = form.name.trim();
    if (!id) { toast.warning('product_id 必填'); return; }
    if (!name) { toast.warning('中文名 name 必填'); return; }
    let stdName = '', stdId = '';
    if (willBeLeaf) {
      stdName = form.standard_product_name.trim();
      stdId = form.standard_product_id.trim();
      if (!stdName || !stdId) {
        toast.warning('叶子节点的标准产品名和 id 都必须填写');
        return;
      }
    }
    const aliases = form.aliases.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    const newNode: ProductNodeRaw = {
      product_id: id,
      parent_id: editing ? (editingNode?.parent_id || '') : (parentId || ''),
      level: form.level.trim(),
      name,
      aliases,
      standard_product_name: stdName,
      standard_product_id: stdId,
    };
    const next = nodes.map((n) => ({ ...n }));
    if (editing) {
      const idx = next.findIndex((n) => n.product_id === id);
      if (idx < 0) { toast.error('节点已被删除'); return; }
      newNode.parent_id = next[idx].parent_id;
      next[idx] = newNode;
    } else {
      if (next.some((n) => n.product_id === id)) { toast.error('product_id 已存在'); return; }
      next.push(newNode);
    }
    setSaving(true);
    const env = await updateProducts(next).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : '保存失败');
      return null;
    });
    setSaving(false);
    if (env?.success) {
      toast.success(editing ? '已保存' : '已添加');
      onSaved();
    } else if (env) {
      toast.error(env.error ?? '保存失败');
    }
  };

  return (
    <MobileBottomSheet
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onClose} disabled={saving}>取消</button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => void handleSave()}
            disabled={readonly || saving}
          >
            {saving ? '保存中…' : editing ? '保存' : '添加'}
          </button>
        </>
      }
    >
      <div className={styles.formGroup}>
        <label className={styles.formLabel}>父节点 (Parent)</label>
        <input className={`${styles.input} ${styles.inputDisabled}`} value={parentName} disabled />

        <label className={styles.formLabel}>product_id <span className={styles.req}>*</span></label>
        <input
          className={editing ? `${styles.input} ${styles.inputDisabled}` : styles.input}
          value={form.product_id}
          disabled={editing}
          placeholder="如 it_eom / mc_iotcs"
          onChange={(e) => setForm({ ...form, product_id: e.target.value })}
          autoComplete="off"
        />
        <span className={styles.formHint}>保存后不可修改</span>

        <label className={styles.formLabel}>层级 level</label>
        <input
          className={styles.input}
          value={form.level}
          placeholder="如 ft / class3 / class4（可选）"
          onChange={(e) => setForm({ ...form, level: e.target.value })}
          autoComplete="off"
        />

        <label className={styles.formLabel}>中文名 name <span className={styles.req}>*</span></label>
        <input
          className={styles.input}
          value={form.name}
          placeholder="如 物联终端"
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          autoComplete="off"
        />

        <label className={styles.formLabel}>别名 aliases</label>
        <input
          className={styles.input}
          value={form.aliases}
          placeholder="多个用半角逗号分隔"
          onChange={(e) => setForm({ ...form, aliases: e.target.value })}
          autoComplete="off"
        />

        {willBeLeaf ? (
          <>
            <div className={styles.formDivider} />
            <label className={styles.formLabel}>
              标准产品名 standard_product_name <span className={styles.req}>*</span>
            </label>
            <input
              className={styles.input}
              value={form.standard_product_name}
              placeholder="叶子节点必填"
              onChange={(e) => setForm({ ...form, standard_product_name: e.target.value })}
              autoComplete="off"
            />
            <label className={styles.formLabel}>
              标准产品 id standard_product_id <span className={styles.req}>*</span>
            </label>
            <input
              className={styles.input}
              value={form.standard_product_id}
              placeholder="如 ioteom / eom"
              onChange={(e) => setForm({ ...form, standard_product_id: e.target.value })}
              autoComplete="off"
            />
          </>
        ) : (
          <>
            <div className={styles.formDivider} />
            <div className={styles.muted}>该节点已有子节点，按聚合层处理；无需填写标品。</div>
          </>
        )}
      </div>
    </MobileBottomSheet>
  );
}

/* ============================================
   Sheet: 批量导入 TSV（聚合 / 细类 / 叶子 5 列）
   ============================================ */
function djb2Hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36).padStart(8, '0').slice(0, 8);
}
function slugId(prefix: string, raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return prefix + 'empty';
  if (/^[\x00-\x7F]+$/.test(s)) {
    const slug = s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (slug) return prefix + slug.slice(0, 40);
  }
  return prefix + djb2Hash(s);
}
function parseBulkTSV(text: string): {
  rows: { agg: string; cls: string; leaf: string; stdName: string; stdId: string }[];
  errors: string[];
} {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length);
  if (!lines.length) return { rows: [], errors: ['粘贴内容为空'] };
  let start = 0;
  if (/标准产品/.test(lines[0]) || /standard_product/i.test(lines[0])) start = 1;
  const rows: { agg: string; cls: string; leaf: string; stdName: string; stdId: string }[] = [];
  const errors: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const raw = lines[i];
    const cols = raw.includes('\t') ? raw.split('\t') : raw.split(/\s{2,}/);
    const cells = cols.map((c) => c.trim());
    if (cells.length < 5) { errors.push(`第 ${i + 1} 行字段不足 5 列：${raw}`); continue; }
    const [agg, cls, leaf, stdName, stdId] = cells;
    if (!agg || !cls || !leaf || !stdName || !stdId) {
      errors.push(`第 ${i + 1} 行存在空字段：${raw}`); continue;
    }
    rows.push({ agg, cls, leaf, stdName, stdId });
  }
  return { rows, errors };
}
function buildTreeFromTSV(rows: { agg: string; cls: string; leaf: string; stdName: string; stdId: string }[]): ProductNodeRaw[] {
  const nodes: ProductNodeRaw[] = [];
  const aggMap = new Map<string, string>();
  const classMap = new Map<string, string>();
  const used = new Set<string>();
  const reserve = (raw: string) => {
    let id = raw, n = 1;
    while (used.has(id)) id = raw + '_' + (++n);
    used.add(id);
    return id;
  };
  for (const r of rows) {
    if (!aggMap.has(r.agg)) {
      const id = reserve(slugId('agg_', r.agg));
      aggMap.set(r.agg, id);
      nodes.push({ product_id: id, parent_id: '', level: 'ft', name: r.agg, aliases: [], standard_product_name: '', standard_product_id: '' });
    }
    const ck = `${r.agg}\t${r.cls}`;
    if (!classMap.has(ck)) {
      const id = reserve(slugId('class_', r.cls));
      classMap.set(ck, id);
      nodes.push({ product_id: id, parent_id: aggMap.get(r.agg)!, level: 'class3', name: r.cls, aliases: [], standard_product_name: '', standard_product_id: '' });
    }
  }
  const leafSeen = new Set<string>();
  for (const r of rows) {
    const k = `${r.agg}\t${r.cls}\t${r.leaf}`;
    if (leafSeen.has(k)) continue;
    leafSeen.add(k);
    const id = reserve(slugId('leaf_', r.leaf));
    nodes.push({
      product_id: id,
      parent_id: classMap.get(`${r.agg}\t${r.cls}`)!,
      level: 'class4',
      name: r.leaf,
      aliases: r.leaf !== r.stdName ? [r.stdName] : [],
      standard_product_name: r.stdName,
      standard_product_id: r.stdId,
    });
  }
  return nodes;
}

function BulkImportSheet({
  open,
  readonly,
  onClose,
  onImported,
}: {
  open: boolean;
  readonly: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const toast = useToast();
  const [tsv, setTsv] = useState('');
  const [parsed, setParsed] = useState<ProductNodeRaw[] | null>(null);
  const [previewMeta, setPreviewMeta] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (open) { setTsv(''); setParsed(null); setPreviewMeta(''); setErrors([]); }
  }, [open]);

  const handlePreview = () => {
    const { rows, errors: errs } = parseBulkTSV(tsv);
    if (errs.length || !rows.length) {
      setErrors(errs);
      setParsed(null);
      setPreviewMeta('');
      return;
    }
    const nodes = buildTreeFromTSV(rows);
    setParsed(nodes);
    const aggN = nodes.filter((n) => n.level === 'ft').length;
    const classN = nodes.filter((n) => n.level === 'class3').length;
    const leafN = nodes.filter((n) => n.level === 'class4').length;
    setPreviewMeta(`共 ${rows.length} 行 → ${nodes.length} 节点（聚合 ${aggN} / 细类 ${classN} / 叶子 ${leafN}）`);
    setErrors([]);
  };

  const handleConfirm = async () => {
    if (readonly) { toast.warning('只读角色无权执行此操作'); return; }
    if (!parsed?.length) { toast.warning('请先点击「解析预览」'); return; }
    if (!window.confirm(`将整树替换为 ${parsed.length} 个节点。当前产业树会被覆盖（自动写入 history 可回滚）。确认继续？`)) return;
    setImporting(true);
    const env = await updateProducts(parsed).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : '导入失败');
      return null;
    });
    setImporting(false);
    if (env?.success) {
      toast.success(`已导入 ${parsed.length} 个节点`);
      onImported();
    } else if (env) {
      toast.error(env.error ?? '导入失败');
    }
  };

  return (
    <MobileBottomSheet
      open={open}
      title="批量导入产业树（TSV）"
      onClose={onClose}
      footer={
        <>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onClose} disabled={importing}>取消</button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => void handleConfirm()}
            disabled={readonly || importing || !parsed?.length}
          >
            {importing ? '导入中…' : '确认导入（整树替换）'}
          </button>
        </>
      }
    >
      <div className={styles.formGroup}>
        <Notice tone="warning" title="整树替换">
          确认导入会<b>整树替换</b>当前产业树。已绑定用户的 product_ids 中若指向被删节点，下次保存时校验失败；建议先发布以便回滚。
        </Notice>
        <label className={styles.formLabel}>粘贴 TSV（5 列：聚合 / 细类 / 叶子 / 标准产品名 / 标准产品 id）</label>
        <textarea
          className={`${styles.input} ${styles.textarea} ${styles.textareaMono}`}
          rows={10}
          value={tsv}
          placeholder={'二级产业树聚合\t产业树细类\t产业树子类\t标准产品名\t标准产品id\n音视频PaaS\t实时互动\t实时音视频\t实时音视频\ttrtc'}
          onChange={(e) => setTsv(e.target.value)}
        />
        <span className={styles.formHint}>支持 TAB 或 ≥2 空格分隔；首行可为表头。</span>
        <div className={styles.simBtnRow}>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={handlePreview}>解析预览</button>
        </div>
        {errors.length > 0 && (
          <Notice tone="danger" title="解析错误">
            <div className={styles.errList}>
              {errors.slice(0, 20).map((e, i) => <div key={i}>{e}</div>)}
            </div>
          </Notice>
        )}
        {parsed?.length ? (
          <div className={styles.previewBox}>
            <div className={styles.previewMeta}>{previewMeta}</div>
            {Array.from(parsed.filter((n) => n.level === 'class4').reduce((acc, n) => {
              const cls = parsed.find((x) => x.product_id === n.parent_id);
              const agg = cls ? parsed.find((x) => x.product_id === cls.parent_id) : null;
              const key = `${agg?.name ?? '(未知)'} / ${cls?.name ?? '(未知)'}`;
              if (!acc.has(key)) acc.set(key, [] as string[]);
              acc.get(key)!.push(`${n.name} → ${n.standard_product_name} / ${n.standard_product_id}`);
              return acc;
            }, new Map<string, string[]>()).entries()).slice(0, 6).map(([k, leaves]) => (
              <div key={k} className={styles.previewGroup}>
                <b>{k}</b>
                <div className={styles.previewLeaves}>
                  {leaves.slice(0, 6).map((l, i) => <div key={i}>{l}</div>)}
                  {leaves.length > 6 && <div className={styles.muted}>… 还有 {leaves.length - 6} 条</div>}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </MobileBottomSheet>
  );
}

/* ============================================
   Sheet: 用户绑定（产品 / Skill / 层级 / 行权限 4 segment）

   - 产品：保留产业树 N 级勾选（覆盖语义同 PC）。
   - Skill：按 skill_id 多选，复用 skillIndex 中的 owner / 表统计。
   - 层级：按 active 当前 agg_layers / org_layers 取值多选订阅。
   - 行权限：在「当前已选 Skill」声明的表上按字段+枚举值多选。
     · 读取仍用 fetchUserRowScopes 独立加载（不阻塞产品/Skill tab）；
     · 字段探测（discoveryColumns）与枚举值探测（discoveryEnumValues）按需懒加载；
     · 分区表（discoveryEnumValues 报错 PARTITION_REQUIRED）由 PC 端配置 —— 移动端给提示，不再嵌套二级 Popover。
   - 保存：updateUserBindings 一次性提交 product_ids / skills / agg_layers / org_layers / row_scopes
     5 个字段（与 PC DataAclPage 单用户保存路径完全一致），不再走 updateUserRowScopes。
   ============================================ */
type BindingTab = 'products' | 'skills' | 'layers' | 'rows';

function rowScopeKey(s: Pick<RowScopeBinding, 'skill_id' | 'source' | 'schema' | 'table'>): string {
  return `${s.skill_id}|${s.source || 'mysql'}|${s.schema || ''}|${s.table}`;
}

function UserBindingsSheet({
  open,
  loginName,
  readonly,
  nodes,
  users,
  skillIndex,
  layerValues,
  onClose,
  onSaved,
}: {
  open: boolean;
  loginName: string;
  readonly: boolean;
  nodes: ProductNodeRaw[];
  users: DataAclUserRaw[];
  skillIndex: SkillTableEntry[];
  layerValues: LayerValues;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<BindingTab>('products');
  const [products, setProducts] = useState<Set<string>>(new Set());
  const [skills, setSkills] = useState<Set<string>>(new Set());
  const [aggLayers, setAggLayers] = useState<Set<string>>(new Set());
  const [orgLayers, setOrgLayers] = useState<Set<string>>(new Set());
  const [rowScopes, setRowScopes] = useState<RowScopeBinding[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [skillSearch, setSkillSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // 行权限专用：字段探测缓存（按 table 名）+ 枚举值缓存（按 scopeKey|column）+ 各种 loading 状态
  const [columnsCache, setColumnsCache] = useState<Record<string, DiscoveryColumn[]>>({});
  const [enumCache, setEnumCache] = useState<Record<string, DiscoveryEnumValue[]>>({});
  const [enumErrors, setEnumErrors] = useState<Record<string, string>>({});
  const [columnsLoading, setColumnsLoading] = useState<Record<string, boolean>>({});
  const [enumLoading, setEnumLoading] = useState<Record<string, boolean>>({});
  const [rowsLoading, setRowsLoading] = useState(false);

  const childrenMap = useMemo(() => buildChildrenMap(nodes), [nodes]);

  // 打开 Sheet 时同步初值；关闭时不清，便于切换 tab 不丢探测缓存。
  useEffect(() => {
    if (!open) return;
    const u = users.find((x) => uname(x) === loginName);
    setProducts(new Set(uproductIds(u || {})));
    setSkills(new Set(uskills(u || {})));
    setAggLayers(new Set(uagglayers(u || {})));
    setOrgLayers(new Set(uorglayers(u || {})));
    setRowScopes([]); // 行权限走独立 GET 接口，下面 useEffect 异步加载（保存时合并进 PUT）
    setTab('products');
    setProductSearch('');
    setSkillSearch('');
    // 产品树默认收起：把所有「根节点」放进 collapsed，让用户进入 tab 看到的是
    // 一级类目列表（与 PC 端「产品」一级根默认折叠语义一致）。
    setCollapsed(() => {
      const rootIds = nodes
        .filter((n) => !n.parent_id || !nodes.some((p) => p.product_id === n.parent_id))
        .map((n) => n.product_id);
      return new Set(rootIds);
    });
    setColumnsCache({});
    setEnumCache({});
    setEnumErrors({});
  }, [open, loginName, users]);

  // 打开 Sheet 后异步加载用户当前行权限（独立接口，不阻塞产品/Skill tab）。
  useEffect(() => {
    if (!open || !loginName) return;
    let cancelled = false;
    setRowsLoading(true);
    fetchUserRowScopes(loginName)
      .then((env) => {
        if (cancelled) return;
        if (env.success && env.data) {
          setRowScopes(env.data.row_scopes || []);
        }
      })
      .catch(() => { /* 忽略：行权限读失败不影响产品/Skill 编辑 */ })
      .finally(() => { if (!cancelled) setRowsLoading(false); });
    return () => { cancelled = true; };
  }, [open, loginName]);

  /* ─── products ─── */
  const toggleCollapse = (pid: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const toggleProduct = (pid: string) => {
    setProducts((prev) => {
      const cur = computeTriState(nodes, prev, pid);
      // pid 因祖先继承呈 checked（自身未显式选）：直接把覆盖关系等价展开为差集，
      // 让用户能在 leaf 单点取消，而不必先取消祖先（与 desktop 行为一致）。
      if (cur === 'checked' && !prev.has(pid)) {
        return breakAncestorOverrideForUncheck(nodes, prev, pid);
      }
      const next = new Set(prev);
      const sub = expandSubtreeIds(nodes, pid);
      if (cur === 'checked') {
        for (const x of sub) next.delete(x);
      } else {
        for (const x of sub) next.delete(x);
        next.add(pid);
      }
      return next;
    });
  };

  /* ─── skills ─── */
  /**
   * 下线 sid 集合：用于 toggleSkill 防御 + renderSkillList 渲染禁选态。
   * 与 PermissionTree 同一约定 —— skillIndex 里 status==unavailable 的占位行（table=""）。
   */
  const unavailableSkillIds = useUnavailableSkillIds(skillIndex);
  const toggleSkill = (skillId: string) => {
    // 单点：与 PC `DataAclPage::toggleSkill` 共用 canToggleSkill。
    const action = canToggleSkill({
      isUnavailable: unavailableSkillIds.has(skillId),
      currentlyChecked: skills.has(skillId),
    });
    if (action === 'denied') return;
    setSkills((prev) => {
      const next = new Set(prev);
      if (action === 'remove') {
        next.delete(skillId);
        // 取消勾选 Skill 时，连带清掉它名下的行权限规则（避免越权数据残留）。
        setRowScopes((rs) => rs.filter((r) => r.skill_id !== skillId));
      } else {
        next.add(skillId);
      }
      return next;
    });
  };

  /* ─── row scopes ─── */
  /**
   * 当前已选 Skill 在 skillIndex 中声明的所有表。
   * 过滤占位行（table=""）：下线 sid 即便残留在 skills 里，也不会暴露任何可编辑的行权限目标。
   */
  const authorizedTables = useMemo(() => {
    return skillIndex
      .filter((e) => e.table && skills.has(e.skill))
      .map((e) => ({ ...e, datasource: e.datasource || 'mysql' }));
  }, [skillIndex, skills]);

  const probeColumns = async (table: string, source: string) => {
    if (columnsCache[table] || columnsLoading[table]) return;
    setColumnsLoading((prev) => ({ ...prev, [table]: true }));
    const env = await discoveryColumns(table, source).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : '字段探测失败');
      return null;
    });
    setColumnsLoading((prev) => ({ ...prev, [table]: false }));
    if (env?.success) {
      setColumnsCache((prev) => ({ ...prev, [table]: (env.data || []) as DiscoveryColumn[] }));
    } else if (env) {
      toast.error(env.error || '字段探测失败');
    }
  };

  const probeEnums = async (key: string, table: string, column: string) => {
    if (enumLoading[key]) return;
    setEnumLoading((prev) => ({ ...prev, [key]: true }));
    setEnumErrors((prev) => ({ ...prev, [key]: '' }));
    // 移动端不暴露分区选择器：直接尝试无分区探测；
    // 若后端要求分区（PARTITION_REQUIRED 等），按错误返回提示去 PC 端配置。
    const env = await discoveryEnumValues({ table, column }).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : '枚举值探测失败';
      setEnumErrors((prev) => ({ ...prev, [key]: msg }));
      return null;
    });
    setEnumLoading((prev) => ({ ...prev, [key]: false }));
    if (env?.success && env.data) {
      setEnumCache((prev) => ({ ...prev, [key]: env.data?.values || [] }));
    } else if (env) {
      const msg = env.error || '枚举值探测失败';
      const friendly = /partition/i.test(msg)
        ? '该表为分区表，移动端暂不支持选择分区，请到桌面端配置后再来调整。'
        : msg;
      setEnumErrors((prev) => ({ ...prev, [key]: friendly }));
    }
  };

  const findScope = (skillId: string, source: string, table: string): RowScopeBinding | undefined => {
    return rowScopes.find((r) => rowScopeKey(r) === rowScopeKey({ skill_id: skillId, source, schema: '', table }));
  };

  const updateScope = (next: RowScopeBinding | null, prevKey: string) => {
    setRowScopes((rs) => {
      const without = rs.filter((r) => rowScopeKey(r) !== prevKey);
      return next ? [...without, next] : without;
    });
  };

  const toggleColumn = (skillId: string, source: string, table: string, column: string) => {
    if (readonly) return;
    const key = rowScopeKey({ skill_id: skillId, source, schema: '', table });
    const cur = findScope(skillId, source, table);
    const base: RowScopeBinding = cur || {
      skill_id: skillId, source, schema: '', table, enabled: true, columns: [],
    };
    const exists = base.columns.some((c) => c.column === column);
    const nextColumns = exists
      ? base.columns.filter((c) => c.column !== column)
      : [...base.columns, { column, values: [] }];
    updateScope(nextColumns.length ? { ...base, columns: nextColumns } : null, key);
  };

  const toggleValue = (skillId: string, source: string, table: string, column: string, value: string) => {
    if (readonly) return;
    const key = rowScopeKey({ skill_id: skillId, source, schema: '', table });
    const cur = findScope(skillId, source, table);
    if (!cur) return;
    const nextColumns = cur.columns.map((c) => {
      if (c.column !== column) return c;
      const set = new Set(c.values || []);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...c, values: [...set] };
    });
    updateScope({ ...cur, columns: nextColumns }, key);
  };

  /* ─── save ───
     与 PC DataAclPage 单用户保存路径严格一致：4 维度 + row_scopes 一次性 PUT。
     后端按全量替换语义处理（含 row_scopes 清空 = 传 []）。 */
  const handleSave = async () => {
    if (readonly) { toast.warning('只读角色无权执行此操作'); return; }
    if (!loginName) return;
    setSaving(true);

    const env = await updateUserBindings(loginName, {
      product_ids: [...products],
      skills: [...skills],
      agg_layers: [...aggLayers],
      org_layers: [...orgLayers],
      row_scopes: rowScopes,
    }).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : '保存失败');
      return null;
    });

    setSaving(false);
    if (env?.success) {
      toast.success('已保存');
      onSaved();
    } else if (env) {
      toast.error(env.error ?? '保存失败');
    }
  };

  /* ─── renderers ─── */
  const renderProductTree = () => {
    if (!nodes.length) {
      return <div className={styles.empty}>产业树为空，请先在「产业树」录入节点</div>;
    }
    const rootIds = nodes
      .filter((n) => !n.parent_id || !nodes.some((p) => p.product_id === n.parent_id))
      .map((n) => n.product_id);
    const rows: JSX.Element[] = [];
    const kw = productSearch.trim().toLowerCase();
    const isHidden = (path: string[]) => path.some((id) => collapsed.has(id));
    const matchHay = (n: ProductNodeRaw) => {
      const hay = ((n.name || '') + ' ' + (n.aliases || []).join(' ') + ' ' + n.product_id).toLowerCase();
      return hay.includes(kw);
    };
    const walk = (pid: string, depth: number, ancestors: string[]) => {
      const node = nodes.find((n) => n.product_id === pid);
      if (!node) return;
      const kids = childrenMap[pid] || [];
      const isCol = collapsed.has(pid);
      const tri = computeTriState(nodes, products, pid);
      const matched = !kw || matchHay(node);
      const hidden = isHidden(ancestors) || (!!kw && !matched);
      if (!hidden) {
        rows.push(
          <div key={pid} className={styles.bindRow} style={{ paddingLeft: 4 + depth * 16 }}>
            <button
              type="button"
              className={kids.length ? styles.bindToggle : `${styles.bindToggle} ${styles.bindToggleEmpty}`}
              onClick={() => kids.length && toggleCollapse(pid)}
              tabIndex={kids.length ? 0 : -1}
              aria-label={kids.length ? (isCol ? '展开' : '收起') : ''}
            >
              {kids.length ? (isCol ? '▸' : '▾') : ''}
            </button>
            <TriCheckbox
              state={tri}
              ariaLabel={`选择 ${node.name || pid}`}
              onChange={() => toggleProduct(pid)}
              disabled={readonly}
            />
            <span className={kw && matched ? `${styles.bindName} ${styles.bindNameMatch}` : styles.bindName}>
              {node.name || pid}
            </span>
          </div>
        );
      }
      if (!isCol) {
        for (const kid of kids) walk(kid, depth + 1, [...ancestors, pid]);
      }
    };
    for (const r of rootIds) walk(r, 0, []);
    return <div className={styles.bindTree}>{rows}</div>;
  };

  const renderSkillList = () => {
    // skillIndex 一行一表，按 skill 聚合：每个 skill 取其下声明的表数。
    // 下线 sid 仅有 status==unavailable 的占位行（table=""）：
    //   - 不计入 tablesCount（保持显示 0 张表）；
    //   - 仍出现在列表中（"展示但不可选"），方便 admin 看到残留绑定。
    const groups = new Map<string, { count: number; datasource: string; unavailable: boolean; isPublic: boolean }>();
    for (const e of skillIndex) {
      const cur = groups.get(e.skill) || {
        count: 0,
        datasource: e.datasource || 'mysql',
        unavailable: false,
        isPublic: false,
      };
      if (e.access === 'public') cur.isPublic = true;
      if (e.status === 'unavailable') {
        cur.unavailable = true;
      } else if (e.table) {
        cur.count += 1;
        // 用首条真实条目的 datasource，避免被占位行的空值覆盖
        if (!cur.datasource || cur.datasource === 'mysql') {
          cur.datasource = e.datasource || cur.datasource || 'mysql';
        }
      }
      groups.set(e.skill, cur);
    }
    const kw = skillSearch.trim().toLowerCase();
    const items = [...groups.entries()]
      .filter(([id]) => !kw || id.toLowerCase().includes(kw))
      .sort((a, b) => a[0].localeCompare(b[0]));
    if (items.length === 0) {
      return <div className={styles.empty}>暂无可用 Skill</div>;
    }
    return (
      <div className={styles.skillGroup}>
        {items.map(([id, info]) => {
          const checked = skills.has(id);
          // 下线 sid：未勾时整行 disabled；已勾仍可取消（与后端 _allowed_skill_ids 闭环）。
          const interactionDisabled = readonly || (info.unavailable && !checked);
          return (
            <label
              key={id}
              className={styles.skillTableRow}
              aria-label={`${checked ? '取消' : '勾选'} Skill ${id}${info.unavailable ? '（已下线）' : ''}`}
              title={info.unavailable ? (checked ? '该 Skill 已下线，可取消但不可重新勾选' : '该 Skill 已下线，暂不可勾选') : undefined}
              style={info.unavailable ? { opacity: 0.7 } : undefined}
            >
              <TriCheckbox
                state={checked ? 'checked' : 'unchecked'}
                ariaLabel={`选择 ${id}`}
                onChange={() => toggleSkill(id)}
                disabled={interactionDisabled}
              />
              <div className={styles.skillTableInfo}>
                <code className={styles.skillTableName}>
                  {id}
                  {info.isPublic && (
                    <span style={{
                      marginLeft: 6,
                      padding: '1px 6px',
                      fontSize: 11,
                      fontWeight: 500,
                      color: '#1d6bff',
                      background: 'rgba(29,107,255,0.08)',
                      border: '1px solid rgba(29,107,255,0.24)',
                      borderRadius: 9999,
                      whiteSpace: 'nowrap',
                    }}>公共</span>
                  )}
                  {info.unavailable && (
                    <span style={{
                      marginLeft: 6,
                      padding: '1px 6px',
                      fontSize: 11,
                      lineHeight: '16px',
                      color: 'var(--warning, #c08a00)',
                      background: 'var(--warning-soft, rgba(255, 178, 0, 0.12))',
                      border: '1px solid var(--warning-border, rgba(255, 178, 0, 0.32))',
                      borderRadius: 9999,
                      fontWeight: 500,
                      fontFamily: 'inherit',
                    }}>已下线</span>
                  )}
                </code>
                <div className={styles.skillTableDesc}>
                  {info.count} 张表{info.datasource ? ` · ${info.datasource}` : ''}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    );
  };

  /** 层级 chip 行：与 PC tagLeaf / tagMuted 等价，受 readonly 控制。 */
  const renderLayerTagRow = (
    title: string,
    values: string[],
    selected: Set<string>,
    onToggle: (v: string) => void,
    emptyHint: string,
  ) => (
    <div className={styles.layerSection}>
      <div className={styles.layerSectionLabel}>{title}</div>
      {values.length === 0 ? (
        <div className={styles.formHint}>{emptyHint}</div>
      ) : (
        <div className={styles.layerChipRow}>
          {values.map((v) => {
            const active = selected.has(v);
            return (
              <button
                key={v}
                type="button"
                className={active ? `${styles.layerChip} ${styles.layerChipOn}` : styles.layerChip}
                disabled={readonly}
                onClick={() => onToggle(v)}
                aria-pressed={active}
              >
                {active ? '✓ ' : ''}{v}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const toggleAggLayer = (v: string) => {
    if (readonly) return;
    setAggLayers((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  };
  const toggleOrgLayer = (v: string) => {
    if (readonly) return;
    setOrgLayers((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  };

  const renderLayers = () => (
    <div className={styles.layerWrap}>
      <div className={styles.formHint}>
        v2.8：按「产品聚合层」/「组织架构层」订阅授权，鉴权运行时反查为产品 id 集合并入用户的 allowed_products。
        active 调整后授权自动跟随，与上方「产品权限」叠加（取并集）。空选表示该维度未订阅。
      </div>
      {renderLayerTagRow(
        '产品聚合层 agg_layers',
        layerValues.agg_layers,
        aggLayers,
        toggleAggLayer,
        '当前 active 未配置任何 agg_layer 取值',
      )}
      {renderLayerTagRow(
        '组织架构层 org_layers',
        layerValues.org_layers,
        orgLayers,
        toggleOrgLayer,
        '当前 active 未配置任何 org_layer 取值',
      )}
      <div className={styles.formHint}>提示：保存时会校验取值 ⊆ 当前 active；越界会返回 400。</div>
    </div>
  );

  const renderRowScopes = () => {
    if (rowsLoading) {
      return <div className={styles.skeletonWrap}><SkeletonStack widths={[88, 76, 92]} /></div>;
    }
    if (skills.size === 0) {
      return <div className={styles.empty}>请先在「Skill」勾选授权，行权限只在已授权 Skill 的声明表上生效</div>;
    }
    if (authorizedTables.length === 0) {
      return <div className={styles.empty}>已选 Skill 暂未声明任何表</div>;
    }
    return (
      <div>
        {authorizedTables.map((it) => {
          const source = it.datasource || 'mysql';
          const key = rowScopeKey({ skill_id: it.skill, source, schema: '', table: it.table });
          const scope = findScope(it.skill, source, it.table);
          const cols = columnsCache[it.table] || [];
          const colsLoading = !!columnsLoading[it.table];
          const ruleSummary = scope
            ? `${scope.columns.length} 字段 / ${scope.columns.reduce((s, c) => s + c.values.length, 0)} 值`
            : '默认全表可查';
          return (
            <details key={key} className={styles.rowScopeCard}>
              <summary className={styles.rowScopeSummary}>
                <span>
                  <code className={styles.skillTableName}>{it.table}</code>
                  {it.brief && <small className={styles.muted}> {it.brief}</small>}
                  <small className={styles.muted}> · {it.skill}</small>
                </span>
                <small className={scope ? styles.rowScopeBadgeOn : styles.rowScopeBadgeOff}>{ruleSummary}</small>
              </summary>
              <div className={styles.rowScopeBody}>
                <div className={styles.rowScopeActions}>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnGhost}`}
                    onClick={() => void probeColumns(it.table, source)}
                    disabled={colsLoading}
                  >
                    {colsLoading ? '探测中…' : cols.length ? '重新探测字段' : '探测字段'}
                  </button>
                  {scope && (
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnGhost}`}
                      onClick={() => updateScope(null, key)}
                      disabled={readonly}
                    >
                      清空规则
                    </button>
                  )}
                </div>
                {cols.length === 0 ? (
                  <div className={styles.formHint}>点击「探测字段」加载字段列表</div>
                ) : cols.map((c) => {
                  const colKey = `${key}|${c.name}`;
                  const active = scope?.columns.some((x) => x.column === c.name) ?? false;
                  const colScope = scope?.columns.find((x) => x.column === c.name);
                  const enumLoaded = Object.prototype.hasOwnProperty.call(enumCache, colKey);
                  const eLoading = !!enumLoading[colKey];
                  const values = enumCache[colKey] || [];
                  const err = enumErrors[colKey] || '';
                  return (
                    <div key={c.name} className={styles.rowScopeColumn}>
                      <label className={styles.rowScopeColumnHead}>
                        <input
                          type="checkbox"
                          checked={active}
                          disabled={readonly}
                          onChange={() => toggleColumn(it.skill, source, it.table, c.name)}
                        />
                        <code>{c.name}</code>
                        <small className={styles.muted}>{c.type}{c.suggested_for_scope ? ' · 推荐' : ''}</small>
                      </label>
                      {active && (
                        <div className={styles.rowScopeValues}>
                          {!enumLoaded && !err && (
                            <button
                              type="button"
                              className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`}
                              onClick={() => void probeEnums(colKey, it.table, c.name)}
                              disabled={eLoading}
                            >
                              {eLoading ? '探测中…' : '探测枚举值'}
                            </button>
                          )}
                          {err && <div className={styles.rowScopeError}>{err}</div>}
                          {enumLoaded && values.length === 0 && (
                            <div className={styles.formHint}>未发现枚举值；请到桌面端按分区探测</div>
                          )}
                          {enumLoaded && values.length > 0 && values.map((v) => {
                            const checked = (colScope?.values || []).includes(v.value);
                            return (
                              <label key={v.value} className={styles.rowScopeValueRow}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={readonly}
                                  onChange={() => toggleValue(it.skill, source, it.table, c.name, v.value)}
                                />
                                <span>{v.value}</span>
                                <small>{v.row_count.toLocaleString('zh-CN')} 行</small>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    );
  };

  const pickedIds = [...products];
  const leaves = effectiveLeafCount(nodes, pickedIds);
  const ruleCount = rowScopes.length;
  const layerCount = aggLayers.size + orgLayers.size;
  const productSegment = pickedIds.length === leaves
    ? `${pickedIds.length} 产品`
    : `${pickedIds.length}/${leaves} 叶子`;
  const summary = `${productSegment} · ${skills.size} Skill · ${layerCount} 层级 · ${ruleCount} 行规则`;

  return (
    <MobileBottomSheet
      open={open}
      title={`编辑绑定 · ${loginName}`}
      onClose={onClose}
      footer={
        <>
          <span className={styles.sheetSummary}>{summary}</span>
          {/*
            footer 三段式（summary + 取消 + 保存）在窄屏极易换行，给两个按钮叠
            .btnSlim 修饰类：缩小 padding/min-width，与 summary 共享一行，
            行为/语义不变（disabled / 文案 / onClick 全保留）。
          */}
          <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnSlim}`} onClick={onClose} disabled={saving}>取消</button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSlim}`}
            onClick={() => void handleSave()}
            disabled={readonly || saving}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </>
      }
    >
      <div className={styles.tabBar} role="tablist" aria-label="绑定类型">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'products'}
          className={tab === 'products' ? `${styles.tabBtn} ${styles.tabBtnActive}` : styles.tabBtn}
          onClick={() => setTab('products')}
        >
          产品
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'skills'}
          className={tab === 'skills' ? `${styles.tabBtn} ${styles.tabBtnActive}` : styles.tabBtn}
          onClick={() => setTab('skills')}
        >
          Skill
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'layers'}
          className={tab === 'layers' ? `${styles.tabBtn} ${styles.tabBtnActive}` : styles.tabBtn}
          onClick={() => setTab('layers')}
        >
          层级
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'rows'}
          className={tab === 'rows' ? `${styles.tabBtn} ${styles.tabBtnActive}` : styles.tabBtn}
          onClick={() => setTab('rows')}
        >
          行权限
        </button>
      </div>

      {tab === 'products' && (
        <>
          <input
            className={`${styles.input} ${styles.searchInput}`}
            placeholder="搜索产品名 / 别名 / id"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            autoComplete="off"
          />
          {renderProductTree()}
        </>
      )}
      {tab === 'skills' && (
        <>
          <input
            className={`${styles.input} ${styles.searchInput}`}
            placeholder="搜索 Skill ID"
            value={skillSearch}
            onChange={(e) => setSkillSearch(e.target.value)}
            autoComplete="off"
          />
          {renderSkillList()}
        </>
      )}
      {tab === 'layers' && renderLayers()}
      {tab === 'rows' && renderRowScopes()}
    </MobileBottomSheet>
  );
}

/* ============================================
   Sheet: 用户组管理（移动端轻量版）
   - segment: 成员 / 模板预览
   - 成员段：搜索 / 添加 / 移除 / 跳转个人 Binding
   - 模板段：只读展示组模板四维度概览，引导到 PC 端编辑
   ============================================ */
function GroupManageSheet({
  open,
  groupId,
  groups,
  users,
  readonly,
  unavailableSkillIds,
  onClose,
  onChanged,
  onOpenUserBinding,
}: {
  open: boolean;
  groupId: string;
  groups: UserGroup[];
  users: DataAclUserRaw[];
  readonly: boolean;
  /** 已下线 sid 集合，用于"共享 Skill 数 / chip 列表"的过滤展示 */
  unavailableSkillIds: Set<string>;
  onClose: () => void;
  onChanged: () => void;
  onOpenUserBinding: (loginName: string) => void;
}) {
  const toast = useToast();
  const group = useMemo(
    () => groups.find((g) => g.groupId === groupId) ?? null,
    [groups, groupId],
  );

  const [tab, setTab] = useState<'members' | 'template' | 'copy'>('members');
  const [memberSearch, setMemberSearch] = useState('');
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [selectedAdd, setSelectedAdd] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [copyLogin, setCopyLogin] = useState('');
  const [copySnapshot, setCopySnapshot] = useState<TemplateSnapshot | null>(null);
  const [copyBusy, setCopyBusy] = useState(false);

  // 切换 sheet / 切换组 时重置局部状态
  useEffect(() => {
    if (!open) return;
    setTab('members');
    setMemberSearch('');
    setShowAddPanel(false);
    setAddSearch('');
    setSelectedAdd([]);
    setCopyLogin('');
    setCopySnapshot(null);
  }, [open, groupId]);

  const filteredMembers = useMemo(() => {
    if (!group) return [];
    const kw = memberSearch.trim().toLowerCase();
    if (!kw) return group.members;
    return group.members.filter((m) => m.toLowerCase().includes(kw));
  }, [group, memberSearch]);

  const candidateOptions = useMemo(() => {
    if (!group) return [];
    const memberSet = new Set(group.members);
    const selectedSet = new Set(selectedAdd);
    const kw = addSearch.trim().toLowerCase();
    return users
      .map((u) => ({ login: uname(u), role: u.role || 'user' }))
      .filter((u) => u.login && !memberSet.has(u.login) && !selectedSet.has(u.login))
      .filter((u) => !kw || `${u.login} ${u.role}`.toLowerCase().includes(kw))
      .sort((a, b) => a.login.localeCompare(b.login))
      .slice(0, 60);
  }, [group, users, addSearch, selectedAdd]);

  const copyUserOptions = useMemo(
    () => Array.from(new Set(users.map((u) => uname(u)).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [users],
  );

  const copySummary = copySnapshot ? dataAclTemplateSummary(copySnapshot.template) : null;

  const handleFetchCopyTemplate = async () => {
    const login = copyLogin.trim();
    if (!login) {
      toast.error('请先填写参考用户 loginName');
      return;
    }
    setCopyBusy(true);
    setCopySnapshot(null);
    const env = await fetchUserTemplate(login).catch((e) => {
      console.error('[GroupManageSheet] fetchUserTemplate failed', e);
      return { success: false, error: e instanceof Error ? e.message : '拉取失败' };
    });
    setCopyBusy(false);
    if (!env.success || !('data' in env) || !env.data) {
      toast.error(('error' in env && env.error) || '拉取参考用户权限失败');
      return;
    }
    setCopySnapshot(env.data as TemplateSnapshot);
    toast.success('已拉取参考用户权限');
  };

  const handleApplyCopyTemplate = async () => {
    if (!group || !copySnapshot) return;
    const sourceLabel = copySnapshot.loginName || copyLogin.trim();
    const memberCount = group.members.length;
    if (!confirm(
      `把 ${sourceLabel} 的个人数据权限合并到组「${group.name}」的组模板？\n`
      + `合并后该组 ${memberCount} 位成员在运行时将额外继承这些权限（与个人权限取并集），`
      + '但不会改写任何成员的个人 binding —— 删除组或移除成员时这部分组权限自动失效，'
      + '成员保留成组之前的个人权限。',
    )) return;
    setCopyBusy(true);
    // 关键契约：写入「组模板」而不是逐人写个人 binding。后端 GroupStore.merged_template_for
    // 在运行时把组模板与成员个人 AclUser 取并集；这样组解散/成员移出时，组贡献部分自动失效，
    // 个人 binding 永远独立保留，满足「组权限消失时保留成组之前的个人权限」契约。
    const merged = mergeTemplates(group.template, copySnapshot.template);
    const env = await updateGroup(group.groupId, { template: merged }).catch((e) => {
      console.error('[GroupManageSheet] updateGroup failed', e);
      return { success: false, error: e instanceof Error ? e.message : '保存失败' } as const;
    });
    setCopyBusy(false);
    if (!env.success) {
      const msg = ('error' in env && env.error) || '合并到组模板失败';
      toast.error(msg);
      return;
    }
    toast.success(`已合并到组模板（${memberCount} 位成员运行时生效，个人权限不受影响）`);
    onChanged();
  };

  const handleAddMembers = async () => {
    if (!group || selectedAdd.length === 0) return;
    setBusy(true);
    const env = await addGroupMembers(group.groupId, selectedAdd).catch((e) => {
      console.error('[GroupManageSheet] addGroupMembers failed', e);
      return { success: false, error: e instanceof Error ? e.message : '添加失败' };
    });
    setBusy(false);
    if (!env.success) {
      toast.error(('error' in env && env.error) || '添加成员失败');
      return;
    }
    const count = selectedAdd.length;
    setSelectedAdd([]);
    setAddSearch('');
    setShowAddPanel(false);
    toast.success(`已添加 ${count} 位成员`);
    onChanged();
  };

  const handleRemoveMember = async (login: string) => {
    if (!group) return;
    if (!confirm(`从组「${group.name}」中移除 ${login}？该用户的个人权限不会受影响。`)) return;
    setBusy(true);
    const env = await removeGroupMember(group.groupId, login).catch((e) => {
      console.error('[GroupManageSheet] removeGroupMember failed', e);
      return { success: false, error: e instanceof Error ? e.message : '移除失败' };
    });
    setBusy(false);
    if (!env.success) {
      toast.error(('error' in env && env.error) || '移除成员失败');
      return;
    }
    toast.success(`${login} 已移除`);
    onChanged();
  };

  const renderMembers = () => {
    if (!group) return null;
    return (
      <>
        <div className={styles.formRow}>
          <input
            className={styles.input}
            placeholder="搜索成员…"
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            autoComplete="off"
          />
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost} ${styles.compactBtn}`}
            onClick={() => setShowAddPanel((v) => !v)}
            disabled={readonly}
          >
            {showAddPanel ? '取消' : '+ 添加'}
          </button>
        </div>

        {showAddPanel && (
          <div className={styles.addMemberMobilePanel}>
            {selectedAdd.length > 0 && (
              <div className={styles.selectedChipsRow}>
                {selectedAdd.map((login) => (
                  <button
                    key={login}
                    type="button"
                    className={styles.selectedChip}
                    onClick={() => setSelectedAdd((prev) => prev.filter((x) => x !== login))}
                    title="点击移除"
                  >
                    {login} ×
                  </button>
                ))}
              </div>
            )}
            <input
              className={styles.input}
              placeholder="搜索用户后点击添加…"
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              autoComplete="off"
            />
            <div className={styles.addCandidateList}>
              {candidateOptions.length === 0 ? (
                <div className={styles.empty}>没有可添加的用户</div>
              ) : candidateOptions.map((opt) => (
                <button
                  key={opt.login}
                  type="button"
                  className={styles.addCandidateRow}
                  onClick={() => {
                    setSelectedAdd((prev) => [...prev, opt.login]);
                    setAddSearch('');
                  }}
                >
                  <span>{opt.login}</span>
                  <small>{opt.role}</small>
                </button>
              ))}
            </div>
            <div className={styles.formRow}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => void handleAddMembers()}
                disabled={busy || selectedAdd.length === 0}
              >
                {busy ? '提交中…' : `添加 ${selectedAdd.length || ''} 位成员`}
              </button>
            </div>
          </div>
        )}

        {filteredMembers.length === 0 ? (
          <div className={styles.empty}>
            {group.members.length === 0 ? '此组暂无成员，点击「+ 添加」' : '当前筛选条件下无成员'}
          </div>
        ) : (
          <ul className={styles.memberList}>
            {filteredMembers.map((login) => (
              <li key={login} className={styles.memberRow}>
                <button
                  type="button"
                  className={styles.memberRowMain}
                  onClick={() => onOpenUserBinding(login)}
                  title="打开该用户的个人绑定"
                >
                  <span className={styles.avatar} aria-hidden>{login.slice(0, 2).toUpperCase()}</span>
                  <span className={styles.memberLogin}>{login}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSm} ${styles.btnGhost}`}
                  onClick={() => void handleRemoveMember(login)}
                  disabled={readonly || busy}
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  };

  const renderTemplate = () => {
    if (!group) return null;
    const tpl = group.template;
    // 已下线 sid 不计入 Skill 数 / chip 列表（与 stats / 用户列表 / 组列表同口径）
    const displaySkills = visibleSkills(tpl.skills, unavailableSkillIds);
    return (
      <div className={styles.templatePreview}>
        <div className={styles.templateGrid}>
          <div className={styles.templateCell}>
            <span className={styles.templateLabel}>产品</span>
            <span className={styles.templateValue}>{tpl.product_ids.length}</span>
          </div>
          <div className={styles.templateCell}>
            <span className={styles.templateLabel}>Skill</span>
            <span className={styles.templateValue}>{displaySkills.length}</span>
          </div>
          <div className={styles.templateCell}>
            <span className={styles.templateLabel}>行权限</span>
            <span className={styles.templateValue}>{tpl.row_scopes?.length ?? 0}</span>
          </div>
          <div className={styles.templateCell}>
            <span className={styles.templateLabel}>层级</span>
            <span className={styles.templateValue}>
              {(tpl.agg_layers?.length ?? 0) + (tpl.org_layers?.length ?? 0)}
            </span>
          </div>
        </div>
        {displaySkills.length > 0 && (
          <div className={styles.templateChips}>
            <div className={styles.templateChipsLabel}>已选 Skill</div>
            <div className={styles.templateChipsRow}>
              {displaySkills.slice(0, 20).map((s) => (
                <span key={s} className={styles.templateChip}>{s}</span>
              ))}
              {displaySkills.length > 20 && (
                <span className={styles.muted}>+{displaySkills.length - 20}</span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCopy = () => {
    if (!group) return null;
    return (
      <div className={styles.copyPanel}>
        <Notice tone="info">
          移动端仅支持复制权限，更多操作请使用PC端。
        </Notice>

        <div className={styles.formLabel}>参考用户</div>
        <div className={styles.formRow}>
          <input
            className={styles.input}
            placeholder="输入参考用户 loginName"
            list={`group-copy-users-${group.groupId}`}
            value={copyLogin}
            onChange={(e) => { setCopyLogin(e.target.value); setCopySnapshot(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleFetchCopyTemplate(); }}
            autoComplete="off"
          />
          <datalist id={`group-copy-users-${group.groupId}`}>
            {copyUserOptions.map((login) => <option key={login} value={login} />)}
          </datalist>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost} ${styles.compactBtn}`}
            onClick={() => void handleFetchCopyTemplate()}
            disabled={copyBusy || !copyLogin.trim()}
          >
            {copyBusy && !copySnapshot ? '拉取中…' : '预览'}
          </button>
        </div>

        {copySnapshot && copySummary && (
          <>
            <div className={styles.templateGrid}>
              <div className={styles.templateCell}>
                <span className={styles.templateLabel}>产品</span>
                <span className={styles.templateValue}>{copySummary.productCount}</span>
              </div>
              <div className={styles.templateCell}>
                <span className={styles.templateLabel}>Skill</span>
                <span className={styles.templateValue}>{copySummary.skillCount}</span>
              </div>
              <div className={styles.templateCell}>
                <span className={styles.templateLabel}>行权限</span>
                <span className={styles.templateValue}>{copySummary.rowCount}</span>
              </div>
              <div className={styles.templateCell}>
                <span className={styles.templateLabel}>层级</span>
                <span className={styles.templateValue}>{copySummary.aggCount + copySummary.orgCount}</span>
              </div>
            </div>

            <div className={styles.copyTargetBox}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary} ${styles.copyApplyBtn}`}
                onClick={() => void handleApplyCopyTemplate()}
                disabled={readonly || copyBusy}
              >
                {copyBusy ? '合并中…' : '合并到组模板'}
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <MobileBottomSheet
      open={open}
      title={group ? `分组 · ${group.name}` : '分组'}
      onClose={onClose}
    >
      {!group ? (
        <div className={styles.empty}>分组不存在或已被删除</div>
      ) : (
        <>
          <div className={styles.tabBar} role="tablist" aria-label="分组管理">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'members'}
              className={`${styles.tabBtn} ${tab === 'members' ? styles.tabBtnActive : ''}`}
              onClick={() => setTab('members')}
            >
              成员 · {group.memberCount}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'template'}
              className={`${styles.tabBtn} ${tab === 'template' ? styles.tabBtnActive : ''}`}
              onClick={() => setTab('template')}
            >
              模板预览
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'copy'}
              className={`${styles.tabBtn} ${tab === 'copy' ? styles.tabBtnActive : ''}`}
              onClick={() => setTab('copy')}
            >
              并集合并
            </button>
          </div>
          {tab === 'members' ? renderMembers() : tab === 'template' ? renderTemplate() : renderCopy()}
        </>
      )}
    </MobileBottomSheet>
  );
}
