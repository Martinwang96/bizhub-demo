/**
 * DataAclPage — 用户数据权限管理（对齐 v2 admin.html）
 *
 * 核心交互：
 *  - stats 4 卡（active version / 节点数 / 用户产品绑定 / 用户 Skill 绑定）
 *  - 用户列表（产品/Skill binding 数 badge + admin/manager bypass 标识 + 编辑绑定）
 *  - 产业树管理（展开/收起 + 悬浮 actions：+子节点 / 编辑 / 删除 + 批量导入 TSV）
 *  - 模拟鉴权（intent / query）+ History 版本（回滚）
 *  - 产品节点编辑 Drawer（新增/编辑；叶子节点必填 standard_product_*）
 *  - 用户绑定 Modal（tab-bar 切换：产品权限三态 checkbox / Skill 权限分组 + 搜索）
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import {
  Drawer,
  EmptyState,
  Modal,
  Notice,
  SectionCard,
  SelectInput,
  SkeletonStack,
  TriCheckbox,
  type TriState,
  useToast,
} from '@shared/components';
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from 'tdesign-icons-react';
import {
  addGroupMembers,
  fetchActive,
  fetchLayerValues,
  fetchSkillTableIndex,
  listGroups,
  listHistory,
  listUsers,
  removeGroupMember,
  rollbackConfig,
  simulateIntent,
  simulateQuery,
  updateProducts,
  updateUserBindings,
  updateUserBindingsBatch,
} from '../api/dataAcl';
import type { BatchUserBindingsResult, DataAclTemplate, DataAclUser, LayerValues, RowScopeBinding, UserBindingsPatch, UserGroup } from '../api/dataAcl';
import type { AdminOutletContext } from '../components/AdminShell';
import { type TabItem } from '../components/TabBar';
import DataAclRowScopePanel from './DataAclRowScopePanel';
import DataAclGroupsTab from './DataAclGroupsTab';
import TemplateCopyPicker from './TemplateCopyPicker';
import { PermissionSummaryButton, PermissionSummaryGroup } from './PermissionSummaryButton';
import {
  buildUnavailableSkillIds,
  canToggleSkill,
  useUnavailableSkillIds,
  visibleSkillCount,
  visibleSkills,
} from '../utils/skillAvailability';
import styles from './DataAclPage.module.css';

// ── 子页面 Tab 定义 ────────────────────────────────────────────────────────
type DataAclTabKey = 'users' | 'groups' | 'tree' | 'simulate';

const DATA_ACL_TABS: ReadonlyArray<TabItem<DataAclTabKey>> = [
  { key: 'users', label: '用户绑定' },
  { key: 'groups', label: '用户组' },
  { key: 'tree', label: '产业树' },
  { key: 'simulate', label: '模拟 & 历史' },
];

const DATA_ACL_TAB_KEYS = new Set<DataAclTabKey>(DATA_ACL_TABS.map((t) => t.key));

function pickTabFromHash(rawHash: string): DataAclTabKey {
  const raw = rawHash.replace(/^#/, '').trim() as DataAclTabKey;
  return DATA_ACL_TAB_KEYS.has(raw) ? raw : 'users';
}

type AnyRecord = Record<string, unknown>;

interface ProductNodeRaw {
  product_id: string;
  parent_id?: string;
  level?: string;
  name?: string;
  aliases?: string[];
  standard_product_name?: string;
  standard_product_id?: string;
  agg_layer?: string;
  org_layer?: string;
}

interface DataAclUserRaw {
  login_name?: string;
  loginName?: string;
  role?: string;
  product_ids?: string[];
  productIds?: string[];
  skills?: string[];
  skillIds?: string[];
  business_roles?: string[];
  businessRoles?: string[];
  /** v2.8：按聚合层订阅授权（产品聚合维度） */
  agg_layers?: string[];
  aggLayers?: string[];
  /** v2.8：按组织架构层订阅授权 */
  org_layers?: string[];
  orgLayers?: string[];
  /** v3.1：用户级行权限配置 */
  row_scopes?: RowScopeBinding[];
  rowScopes?: RowScopeBinding[];
}

interface SkillTableEntry {
  table: string;
  skill: string;
  datasource?: string;
  brief?: string;
  /**
   * 后端 v3.x 起回填：
   * - "active"：上线 skill 的真实表条目（``table`` 非空）；
   * - "unavailable"：下线 skill 的占位行（``table=""``），仅用于让前端
   *   展示该 sid（灰显 + 不可新增勾选）；行权限消费方需按 ``table != ''`` 过滤。
   */
  status?: 'active' | 'unavailable';
}

interface HistoryEntry {
  version?: string;
  updated_by?: string;
  updated_at?: number;
  updatedAt?: number;
}

type PermissionDetailKind = 'products' | 'skills' | 'rows';

interface PermissionDetailState {
  loginName: string;
  kind: PermissionDetailKind;
}

type BindingModalState =
  | { mode: 'single'; loginName: string }
  | { mode: 'configure' | 'patch'; loginNames: string[] }
  | null;

interface ParsedLoginNames {
  names: string[];
  duplicates: string[];
}

function parseLoginNames(text: string): ParsedLoginNames {
  const seen = new Set<string>();
  const names: string[] = [];
  const duplicates: string[] = [];
  text.replace(/，/g, ',').split(/[\n,]+/).forEach((raw) => {
    const name = raw.trim();
    if (!name) return;
    if (seen.has(name)) {
      duplicates.push(name);
      return;
    }
    seen.add(name);
    names.push(name);
  });
  return { names, duplicates };
}

interface ProductPermissionDetail {
  configuredProductIds: string[];
  /** 用户显式勾选的全部节点（含 agg_/class_/leaf_ 任意层级），未做折叠，
   *  通常用于「计数/原始配置」口径。 */
  directNodes: ProductNodeRaw[];
  /** chip 列表展示口径：自底向上「满覆盖上卷」——
   *  当某父节点（如 class）下所有子节点都被选中时，折叠展示成父节点本身；
   *  以此类推可继续上卷到 agg。算法见 `rollupFullCoveredIds`。 */
  directDisplayNodes: ProductNodeRaw[];
  missingProductIds: string[];
  directLeaves: ProductNodeRaw[];
  layerLeaves: ProductNodeRaw[];
  effectiveLeaves: ProductNodeRaw[];
  aggLayers: string[];
  orgLayers: string[];
}

function uname(u: DataAclUserRaw): string {
  return String(u.login_name ?? u.loginName ?? '');
}

function uproductIds(u: DataAclUserRaw): string[] {
  return (u.product_ids ?? u.productIds ?? []) as string[];
}

function uskills(u: DataAclUserRaw): string[] {
  return (u.skills ?? u.skillIds ?? []) as string[];
}

function uagglayers(u: DataAclUserRaw): string[] {
  return (u.agg_layers ?? u.aggLayers ?? []) as string[];
}

function uorglayers(u: DataAclUserRaw): string[] {
  return (u.org_layers ?? u.orgLayers ?? []) as string[];
}

function urowScopes(u: DataAclUserRaw): RowScopeBinding[] {
  return (u.row_scopes ?? u.rowScopes ?? []) as RowScopeBinding[];
}

function ubypass(u: DataAclUserRaw): boolean {
  const role = u.role || 'user';
  return role === 'admin' || role === 'manager';
}

/* ────────────────────────────────────────────
   Tree helpers
   ─────────────────────────────────────────── */

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

/**
 * 计算「编辑用户绑定 - 产品权限」树的默认折叠集合（collapsed 里的节点会收起其子树）。
 *
 * 规则（按 selected 勾选态决定，而非统一层级）：
 * - 选中的分支展开：若某节点的子孙中存在已勾选（在 selected 里）的节点，则该节点保持展开，
 *   使得勾选的项一路可见。
 * - 未选中的分支收起：其余有子节点的节点一律折叠，最终只展示到最高一级节点。
 *
 * 即默认只把「包含已勾选项」的路径展开，其它分支保持收起在顶层。
 * 其余交互不变：用户仍可手动 ▸ 展开 / ▾ 收起任意有子节点。
 */
function computeDefaultCollapsed(nodes: ProductNodeRaw[], selected: Set<string>): Set<string> {
  const collapsed = new Set<string>();
  if (!nodes.length) return collapsed;
  const childrenOf = new Map<string, ProductNodeRaw[]>();
  for (const n of nodes) {
    if (!n.parent_id) continue;
    if (!childrenOf.has(n.parent_id)) childrenOf.set(n.parent_id, []);
    childrenOf.get(n.parent_id)!.push(n);
  }
  // 记忆化：子树（含自身）是否包含被勾选的节点。
  const memo = new Map<string, boolean>();
  const subtreeHasSelected = (pid: string): boolean => {
    const cached = memo.get(pid);
    if (cached !== undefined) return cached;
    let hit = selected.has(pid);
    for (const k of childrenOf.get(pid) || []) {
      if (subtreeHasSelected(k.product_id)) hit = true;
    }
    memo.set(pid, hit);
    return hit;
  };
  for (const n of nodes) {
    const kids = childrenOf.get(n.product_id) || [];
    if (!kids.length) continue; // 叶子无需折叠
    // 子孙中存在已勾选项 → 展开；否则折叠（收起到该节点）。
    const descendantSelected = kids.some((k) => subtreeHasSelected(k.product_id));
    if (!descendantSelected) collapsed.add(n.product_id);
  }
  return collapsed;
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

/**
 * 「自底向上满覆盖上卷」展示节点计算。
 *
 * 业务规则（来自用户）：「leaf → class → agg 由低到高」——
 *   当某个父节点（如 class）下「所有」子节点都被选中时，把这一组子节点折叠
 *   展示成它们的父节点；继续往上看，如果该父节点的所有兄弟在它们各自的父
 *   下也都被覆盖，再上卷一层，直到顶。
 *
 * 形式化：定义 effective(id):
 *   - 若 id 在显式 selected 中           → effective
 *   - 若 id 在树中且有子节点，且每个子    → effective
 *   - 否则                                → 非 effective
 * 展示集合 = { id | effective(id) 且 (id 无父 或 父非 effective) }
 *
 * 例 1：class_h692fb3 下只有一个 leaf_h692fb3，用户勾了 leaf_h692fb3
 *      → leaf effective → class 的所有子（仅这一个）都 effective → class effective
 *      → class 无父或父非 effective → 展示 class，隐藏 leaf。
 * 例 2：class 下有 leaf_a / leaf_b，仅勾了 leaf_a
 *      → leaf_b 非 effective → class 非 effective → 仅展示 leaf_a。
 * 例 3：用户既显式勾了 class 又勾了它下面某个 leaf
 *      → class 自身 selected → effective → 子节点都被 class 覆盖（父 effective）→ 仅展示 class。
 *
 * 脏 id 兼容：`selected` 里可能含树中不存在的 id（导入残留）。它们 selected
 *           为 true → effective 为 true；它们在树中无 parent 信息 → 视为
 *           "无父"→ 仍会被展示（调用方再以"未匹配节点"chip 兜底渲染）。
 */
function rollupFullCoveredIds(nodes: ProductNodeRaw[], ids: Iterable<string>): Set<string> {
  const selected = new Set<string>();
  for (const id of ids) selected.add(id);
  if (selected.size === 0) return selected;

  const byId = new Map(nodes.map((n) => [n.product_id, n]));
  const childrenMap: Record<string, string[]> = {};
  for (const n of nodes) {
    if (n.parent_id) (childrenMap[n.parent_id] = childrenMap[n.parent_id] || []).push(n.product_id);
  }

  // memoized effective(id) — 树是 DAG-free 的（parent 只有一个），递归即可。
  const effectiveMemo = new Map<string, boolean>();
  const isEffective = (id: string): boolean => {
    const cached = effectiveMemo.get(id);
    if (cached !== undefined) return cached;
    if (selected.has(id)) { effectiveMemo.set(id, true); return true; }
    const kids = childrenMap[id];
    if (!kids || kids.length === 0) { effectiveMemo.set(id, false); return false; }
    // 必须所有子都 effective 才上卷。
    let all = true;
    for (const c of kids) {
      if (!isEffective(c)) { all = false; break; }
    }
    effectiveMemo.set(id, all);
    return all;
  };

  // 展示候选 = 显式 selected ∪ 通过子节点上卷出的祖先。
  // 上卷祖先：从所有 selected 节点出发向上走，遇到第一个 isEffective(parent) 为 false
  // 的祖先时停（到那一层的祖先就是"被该子树上卷出的展示节点"），但这并不直接给我们
  // 展示集——更直接的做法是枚举所有 selected 与其所有 ancestor 作为候选，再保留
  // 「effective 自身 且 父非 effective」的。
  const candidates = new Set<string>(selected);
  for (const id of selected) {
    let cur = byId.get(id);
    while (cur && cur.parent_id) {
      candidates.add(cur.parent_id);
      cur = byId.get(cur.parent_id);
    }
  }

  const display = new Set<string>();
  for (const id of candidates) {
    if (!isEffective(id)) continue;
    const node = byId.get(id);
    const parentId = node?.parent_id;
    // 无父（顶层 / 脏 id）→ 直接展示；有父但父非 effective → 展示；父 effective → 被上卷掉，跳过。
    if (!parentId || !isEffective(parentId)) display.add(id);
  }
  // 兜底：selected 里若有完全不在树中、且 byId 也找不到的脏 id，没有 parent 链，
  // 上面循环中作为 candidates 仍会被加入；但 isEffective 走的是 selected.has(id) 分支
  // 也会返回 true，display 也会加入它（parentId 为 undefined 走"无父"分支）。OK。
  return display;
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

function normalizeKey(v: string | undefined): string {
  return String(v || '').trim().toLowerCase();
}

function sortProductNodes(nodes: ProductNodeRaw[]): ProductNodeRaw[] {
  return [...nodes].sort((a, b) => (a.name || a.product_id).localeCompare(b.name || b.product_id));
}

function productText(node: ProductNodeRaw): string {
  const std = node.standard_product_name || node.standard_product_id
    ? ` · 标品 ${node.standard_product_name || '-'} / ${node.standard_product_id || '-'}`
    : '';
  return `${node.name || node.product_id}${std}`;
}

function rowScopeIsEffective(scope: RowScopeBinding): boolean {
  return scope.enabled !== false && (scope.columns || []).some(
    (c) => Boolean(c.column) && (c.values || []).length > 0,
  );
}

function effectiveRowScopes(scopes: RowScopeBinding[]): RowScopeBinding[] {
  return scopes.filter(rowScopeIsEffective);
}

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

function buildProductPermissionDetail(user: DataAclUserRaw, nodes: ProductNodeRaw[]): ProductPermissionDetail {
  const configuredProductIds = uproductIds(user);
  const aggLayers = uagglayers(user);
  const orgLayers = uorglayers(user);
  const byId = new Map(nodes.map((n) => [n.product_id, n]));
  const directIds = new Set<string>();
  const layerIds = new Set<string>();
  const missingProductIds: string[] = [];

  for (const pid of configuredProductIds) {
    if (!byId.has(pid)) {
      missingProductIds.push(pid);
      continue;
    }
    for (const expanded of expandSubtreeIds(nodes, pid)) {
      if (isLeaf(nodes, expanded)) directIds.add(expanded);
    }
  }

  const aggSet = new Set(aggLayers.map(normalizeKey).filter(Boolean));
  const orgSet = new Set(orgLayers.map(normalizeKey).filter(Boolean));
  if (aggSet.size || orgSet.size) {
    for (const node of nodes) {
      if (!isLeaf(nodes, node.product_id)) continue;
      if ((node.agg_layer && aggSet.has(normalizeKey(node.agg_layer)))
        || (node.org_layer && orgSet.has(normalizeKey(node.org_layer)))) {
        layerIds.add(node.product_id);
      }
    }
  }

  const effectiveIds = new Set([...directIds, ...layerIds]);
  // 用于「直接配置的产品节点」chip 区：自底向上「满覆盖上卷」展示，
  // 当 class 下所有 leaf 都被选中则展示成 class，以此类推继续上卷到 agg。
  const displayIdSet = rollupFullCoveredIds(nodes, configuredProductIds.filter((pid) => byId.has(pid)));
  return {
    configuredProductIds,
    directNodes: sortProductNodes(configuredProductIds.map((pid) => byId.get(pid)).filter(Boolean) as ProductNodeRaw[]),
    directDisplayNodes: sortProductNodes([...displayIdSet].map((pid) => byId.get(pid)).filter(Boolean) as ProductNodeRaw[]),
    missingProductIds,
    directLeaves: sortProductNodes([...directIds].map((pid) => byId.get(pid)).filter(Boolean) as ProductNodeRaw[]),
    layerLeaves: sortProductNodes([...layerIds].map((pid) => byId.get(pid)).filter(Boolean) as ProductNodeRaw[]),
    effectiveLeaves: sortProductNodes([...effectiveIds].map((pid) => byId.get(pid)).filter(Boolean) as ProductNodeRaw[]),
    aggLayers,
    orgLayers,
  };
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
 * 「打散祖先覆盖」工具：当 pid 是因为某个祖先 A 显式勾选而呈 checked 状态时，
 * 用户点击想取消 pid，需要把 A 的覆盖语义"展开"成等价的差集集合：
 *   1. 从 selected 里移除路径上所有显式勾选的祖先；
 *   2. 沿路径从最高的显式祖先一路下降到 pid，每经过一个节点 N（含 A、不含 pid），
 *      把 N 的所有「不在通往 pid 路径上」的直接子节点都显式加入 selected
 *      （它们整棵子树仍然保持 checked，等价于原来从 A 继承）；
 *   3. pid 本身不加入，从而实现"在 leaf 单点取消"。
 *
 * 模型保持不变（仍是 product_ids 集合 / 包含语义），只是把"祖先覆盖"等价
 * 重写为更细粒度的兄弟集合，避免引入 product_ids 的"差集/排除"语义。
 *
 * 注意：调用方需先确认 pid 当前是因为祖先继承而 checked（即
 * computeTriState===checked && !selected.has(pid)），否则不应调用本函数。
 */
function breakAncestorOverrideForUncheck(
  nodes: ProductNodeRaw[],
  selected: Set<string>,
  pid: string,
): Set<string> {
  const next = new Set(selected);
  // ancestorsOf 返回从直接父到根的顺序：[parent, grandparent, ..., root]
  const ancs = ancestorsOf(nodes, pid);
  // 找到所有"显式勾选"的祖先（一般只会有一个，但兼容多重）
  const explicitAncs = ancs.filter((a) => next.has(a));
  if (explicitAncs.length === 0) return next; // 没有显式祖先：调用方误用，直接返回
  // 取最高的那个作为展开起点（路径覆盖范围最大）
  // ancs 是自底向上，所以最后一个是最高的
  const topAnc = explicitAncs[explicitAncs.length - 1];
  // 移除路径上所有显式祖先
  for (const a of explicitAncs) next.delete(a);
  // 构造从 topAnc 到 pid 的"路径节点集合"（含 topAnc，含 pid）
  // ancs 中位于 [0, indexOf(topAnc)] 这段（包含 topAnc）+ pid 自己即为路径节点
  const topIdx = ancs.indexOf(topAnc);
  const pathNodes = new Set<string>([pid, ...ancs.slice(0, topIdx + 1)]);
  // 沿路径下降：对路径上"非 pid"的每个节点 N，把 N 的不在路径上的直接子节点显式加进去
  // 这些子节点整棵子树继承 checked，与原来 A 覆盖效果等价（除被取消的 pid 之外）
  for (const n of pathNodes) {
    if (n === pid) continue;
    for (const child of nodes) {
      if (child.parent_id === n && !pathNodes.has(child.product_id)) {
        next.add(child.product_id);
      }
    }
  }
  // pid 本身不加入 → 实现"取消" pid
  return next;
}

/* ────────────────────────────────────────────
   Component
   ─────────────────────────────────────────── */

export default function DataAclPage() {
  const { me, setTopbar } = useOutletContext<AdminOutletContext>();
  const location = useLocation();
  const toast = useToast();
  const readonly = me?.adminConsoleRole === 'readonly';

  const [active, setActive] = useState<AnyRecord | null>(null);
  const [users, setUsers] = useState<DataAclUserRaw[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [skillIndex, setSkillIndex] = useState<SkillTableEntry[]>([]);
  // v2.8：当前 active 下两个层级维度的全量取值，供节点编辑/概览展示与用户编辑页多选下拉使用
  const [layerValues, setLayerValues] = useState<LayerValues>({ agg_layers: [], org_layers: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 树折叠状态
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // 模拟鉴权
  const [simLogin, setSimLogin] = useState('');
  const [simInput, setSimInput] = useState('');
  const [simResult, setSimResult] = useState('');

  // 删除节点双击
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 产品编辑 drawer
  const [productDrawer, setProductDrawer] = useState<
    | null
    | { mode: 'create-root' }
    | { mode: 'create-child'; parentId: string }
    | { mode: 'edit'; productId: string }
  >(null);

  // 批量导入 TSV
  const [bulkOpen, setBulkOpen] = useState(false);

  // 用户绑定 modal
  const [bindingModal, setBindingModal] = useState<BindingModalState>(null);

  // 用户批量选择
  const [selectedLogins, setSelectedLogins] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [pasteSelectOpen, setPasteSelectOpen] = useState(false);
  // 用户组：列表共享、按组筛选、所属权限组列、加入/移出组操作
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [groupFilter, setGroupFilter] = useState<string>(''); // 空 = 不筛选
  // 「加入组」操作弹窗：选中目标 login 后弹出，多选目标组
  const [joinDialog, setJoinDialog] = useState<{ login: string } | null>(null);

  // 用户列表客户端分页（仅前端切片，不动 API）
  const [usersPage, setUsersPage] = useState(1);
  const USERS_PAGE_SIZE = 20;

  // 用户权限只读详情 modal
  const [permissionDetail, setPermissionDetail] = useState<PermissionDetailState | null>(null);

  // 当前 Tab：从 react-router 的 location.hash 派生
  // —— 不再监听 window 的 hashchange，因为 react-router 的 navigate 不一定触发该事件，
  // 之前导致点击 sidebar 子菜单需要刷新页面才能切换 tab。
  const activeTab = useMemo<DataAclTabKey>(() => pickTabFromHash(location.hash), [location.hash]);

  const productNodes = useMemo<ProductNodeRaw[]>(() => {
    const raw = active?.product_nodes;
    return Array.isArray(raw) ? (raw as ProductNodeRaw[]) : [];
  }, [active]);

  const childrenMap = useMemo(() => buildChildrenMap(productNodes), [productNodes]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [activeEnv, usersEnv, historyEnv, skillEnv, layerEnv, groupsEnv] = await Promise.all([
        fetchActive().catch(() => null),
        listUsers().catch(() => null),
        listHistory().catch(() => null),
        fetchSkillTableIndex().catch(() => null),
        fetchLayerValues().catch(() => null),
        listGroups().catch(() => null),
      ]);
      if (activeEnv?.success && activeEnv.data) setActive(activeEnv.data as AnyRecord);
      else setActive({ product_nodes: [], version: '' });

      setUsers((usersEnv?.success ? (usersEnv.data ?? []) : []) as DataAclUserRaw[]);
      setHistory((historyEnv?.success ? (historyEnv.data ?? []) : []) as HistoryEntry[]);
      setSkillIndex((skillEnv?.success ? (skillEnv.data ?? []) : []) as SkillTableEntry[]);
      setLayerValues(
        (layerEnv?.success ? (layerEnv.data ?? { agg_layers: [], org_layers: [] }) : { agg_layers: [], org_layers: [] }) as LayerValues,
      );
      setGroups((groupsEnv?.success ? (groupsEnv.data ?? []) : []) as UserGroup[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 静默 reload：不切 loading 态，仅刷新 users + groups。
   * 用于「保存组」「调整组归属」等子操作完成后的实时同步——避免整页骨架闪烁。
   * 后端 update_group/add_members 会把组共享权限并集写入个人权限（template 变更时
   * 对全体现有成员），这里必须重拉 users 才能让用户列表行 chip 数及时反映新数据。
   */
  const reloadUsersAndGroups = useCallback(async () => {
    const [usersEnv, groupsEnv] = await Promise.all([
      listUsers().catch(() => null),
      listGroups().catch(() => null),
    ]);
    if (usersEnv?.success) setUsers((usersEnv.data ?? []) as DataAclUserRaw[]);
    if (groupsEnv?.success) setGroups((groupsEnv.data ?? []) as UserGroup[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    // 按 Tab 动态切换右上角 actions：
    // - users: 刷新
    // - groups: 刷新（新建组在 GroupsTab 内自带）
    // - tree: 刷新 / 批量导入 TSV / 添加顶层节点
    // - simulate: 刷新
    let actions: ReactNode;
    if (activeTab === 'tree') {
      actions = (
        <>
          <button type="button" className={styles.btnGhost} onClick={() => void load()}>刷新</button>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => setBulkOpen(true)}
            disabled={readonly}
            title={readonly ? '只读角色无权执行此操作' : '批量导入 TSV'}
          >
            批量导入 TSV
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => setProductDrawer({ mode: 'create-root' })}
            disabled={readonly}
            title={readonly ? '只读角色无权执行此操作' : '新增顶层节点'}
          >
            添加顶层节点
          </button>
        </>
      );
    } else {
      actions = (
        <button type="button" className={styles.btnGhost} onClick={() => void load()}>刷新</button>
      );
    }
    setTopbar({
      title: '用户数据权限管理',
      description: '维护用户数据权限配置、策略绑定、发布、回滚和模拟鉴权。',
      actions,
    });
    return () => setTopbar(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setTopbar, readonly, load, activeTab]);

  /**
   * 已下线 sid 集合。
   * skillIndex 里 status==='unavailable' 的占位行（table === ''）。
   * 用户绑定中遗留的下线 sid 不计入任何"已绑定数量"统计 —— 与 Modal 内
   * `renderSkillList` 的禁选态、PermissionDetailDrawer 的"已下线"标记同口径，
   * 避免出现"列表里看不到却仍然计数"的视觉错位。
   */
  const unavailableSkillIds = useUnavailableSkillIds(skillIndex);
  /** 过滤掉下线 sid 后的有效 skill id 列表（与 stats / badge 计数同口径）。 */
  const activeUserSkills = useCallback(
    (u: DataAclUserRaw) => visibleSkills(uskills(u), unavailableSkillIds),
    [unavailableSkillIds],
  );

  /* ─── Stats ─── */
  const userBindings = useMemo(() => {
    return users.reduce(
      (acc, u) => {
        if (!ubypass(u)) {
          acc.products += effectiveLeafCount(productNodes, uproductIds(u));
          // 下线 sid 不计入累计，避免 stats 与列表 badge 不一致
          acc.skills += activeUserSkills(u).length;
        }
        return acc;
      },
      { products: 0, skills: 0 },
    );
  }, [users, productNodes, activeUserSkills]);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => uname(a).localeCompare(uname(b))),
    [users],
  );
  const selectableLogins = useMemo(
    () => sortedUsers.filter((u) => !ubypass(u)).map((u) => uname(u)),
    [sortedUsers],
  );
  // login → 所属用户组的反向索引；用于「所属权限组」列、按组筛选、加入/移出组判断
  const groupsByLogin = useMemo(() => {
    const m = new Map<string, UserGroup[]>();
    groups.forEach((g) => {
      (g.members || []).forEach((login) => {
        if (!login) return;
        if (!m.has(login)) m.set(login, []);
        m.get(login)!.push(g);
      });
    });
    return m;
  }, [groups]);

  const filteredUsers = useMemo(() => {
    const kw = userSearch.trim().toLowerCase();
    const selectedSet = new Set(selectedLogins);
    const filterGroup = groupFilter
      ? groups.find((g) => g.groupId === groupFilter)
      : null;
    const memberSet = filterGroup ? new Set(filterGroup.members || []) : null;
    return sortedUsers.filter((u) => {
      const login = uname(u);
      if (showSelectedOnly && !selectedSet.has(login)) return false;
      if (memberSet && !memberSet.has(login)) return false;
      return !kw || login.toLowerCase().includes(kw);
    });
  }, [sortedUsers, selectedLogins, showSelectedOnly, userSearch, groupFilter, groups]);
  // 分页：搜索/筛选/按组筛选变化时回到第 1 页
  useEffect(() => { setUsersPage(1); }, [userSearch, showSelectedOnly, groupFilter]);
  const usersTotalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PAGE_SIZE));
  const usersCurrentPage = Math.min(usersPage, usersTotalPages);
  const usersPageStart = (usersCurrentPage - 1) * USERS_PAGE_SIZE;
  const pagedUsers = filteredUsers.slice(usersPageStart, usersPageStart + USERS_PAGE_SIZE);

  useEffect(() => {
    const valid = new Set(selectableLogins);
    setSelectedLogins((prev) => prev.filter((login) => valid.has(login)));
  }, [selectableLogins]);

  // 注：表格已不渲染复选框（仅单用户配置），故无需 toggleUserSelect/toggleVisibleUsers；
  // 但 selectedLogins 保留作为 PasteSelect Modal 的可选数据通路，clearSelection 仍被它使用。
  const clearSelection = () => {
    setSelectedLogins([]);
    setShowSelectedOnly(false);
  };

  /* ─── Tree render ─── */
  const toggleCollapse = (pid: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

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
      await load();
    } else if (env) {
      toast.error(env.error ?? '删除失败');
    }
  };

  const renderTreeRows = () => {
    if (!productNodes.length) {
      return <div className={styles.treeEmpty}>产业树为空，点击「添加顶层节点」开始录入</div>;
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
      const isCollapsed = collapsed.has(pid);
      const leaf = !hasKids;
      const lvlTag = node.level ? <span className={`${styles.tag} ${styles.tagMuted}`}>{node.level}</span> : null;
      const leafTag = leaf
        ? (node.standard_product_name || node.standard_product_id)
          ? <span className={styles.tagLeaf} title="标准产品">标品: {node.standard_product_name || '-'} / {node.standard_product_id || '-'}</span>
          : <span className={`${styles.tag} ${styles.tagDanger}`} title="叶子节点必须填写标品信息">缺标品</span>
        : null;
      // v2.8：叶子节点附带 agg_layer / org_layer 标签内联展示，便于运营核对
      const aggTag = leaf && node.agg_layer
        ? <span className={`${styles.tag} ${styles.tagMuted}`} title="产品聚合层">{node.agg_layer}</span>
        : null;
      const orgTag = leaf && node.org_layer
        ? <span className={`${styles.tag} ${styles.tagMuted}`} title="组织架构层">{node.org_layer}</span>
        : null;
      const aliasText = (node.aliases?.length ? `[${node.aliases.slice(0, 3).join(' / ')}]` : '');
      const hidden = isHidden(ancestors);

      if (!hidden) {
        rows.push(
          <div
            key={pid}
            className={styles.treeNode}
            style={{ paddingLeft: 12 + depth * 18 }}
          >
            <button
              type="button"
              className={hasKids ? styles.treeToggle : `${styles.treeToggle} ${styles.treeToggleEmpty}`}
              onClick={() => hasKids && toggleCollapse(pid)}
              tabIndex={hasKids ? 0 : -1}
              aria-label={hasKids ? (isCollapsed ? '展开' : '收起') : ''}
            >
              {hasKids ? (isCollapsed ? '▸' : '▾') : ''}
            </button>
            <span className={styles.treeName}>
              {node.name || pid}
              {lvlTag} {leafTag} {aggTag} {orgTag}
              {aliasText && <span className={styles.muted}> {aliasText}</span>}
            </span>
            <span className={styles.treeId}>{pid}</span>
            <span className={styles.treeActions}>
              <button
                type="button"
                onClick={() => setProductDrawer({ mode: 'create-child', parentId: pid })}
                disabled={readonly}
                className={styles.treeActionBtn}
              >
                + 子节点
              </button>
              <button
                type="button"
                onClick={() => setProductDrawer({ mode: 'edit', productId: pid })}
                disabled={readonly}
                className={styles.treeActionBtn}
              >
                编辑
              </button>
              <button
                type="button"
                onClick={() => armDeleteNode(pid)}
                disabled={readonly || hasKids}
                className={pendingDelete === pid ? `${styles.treeActionBtn} ${styles.treeActionDangerActive}` : `${styles.treeActionBtn} ${styles.treeActionDanger}`}
                title={hasKids ? '请先删除子节点' : pendingDelete === pid ? '再次点击确认删除' : '点击两次以删除'}
              >
                {pendingDelete === pid ? '确认?' : '删除'}
              </button>
            </span>
          </div>
        );
      }

      if (!isCollapsed) {
        for (const kid of kids) walk(kid, depth + 1, [...ancestors, pid]);
      }
    };

    for (const r of rootIds) walk(r, 0, []);
    return <div className={styles.tree}>{rows}</div>;
  };

  /* ─── Simulate ─── */
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

  /* ─── History ─── */
  const handleRollback = async (version: string) => {
    if (readonly) {
      toast.warning('只读角色无权执行此操作');
      return;
    }
    if (!confirm(`确认回滚到版本 ${version}？当前 active 会自动备份。`)) return;
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

  /* ─── Render ─── */
  return (
    <div className={styles.page}>
      {error && <Notice tone="danger" title="加载失败">{error}</Notice>}

      {/* 二级菜单已挪至全局 sidebar；此处仅渲染当前 hash 对应的 Tab 内容 */}

      {/* ─ users tab：stats + 用户列表（ViewHeader + Canvas + Members Table + Pagination） ─ */}
      {activeTab === 'users' && (
      <>
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Active version</span>
          <span className={styles.statNum}>{String(active?.version ?? '未发布')}</span>
          <span className={styles.statHint}>当前生效配置</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>产业树节点</span>
          <span className={styles.statNum}>{productNodes.length}</span>
          <span className={styles.statHint}>叶子+聚合层共计</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>用户产品绑定</span>
          <span className={styles.statNum}>{userBindings.products}</span>
          <span className={styles.statHint}>按叶子展开累计</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardWarn}`}>
          <span className={styles.statLabel}>用户 Skill 绑定</span>
          <span className={styles.statNum}>{userBindings.skills}</span>
          <span className={styles.statHint}>跨用户累计</span>
        </div>
      </div>

      {/* 用户绑定列表统一使用共享 SectionCard（与「用户页面权限管理」骨架一致） */}
      <SectionCard
        eyebrow="Data ACL"
        title="用户绑定"
        description="按用户维度维护产品、Skill 与行权限绑定。admin / manager 默认跳过校验，仅 user 角色需要勾选。"
      >
        {/* Toolbar：搜索 + 按权限组筛选 */}
        <div className={styles.canvasToolbar}>
          <div className={styles.searchField}>
            <span className={styles.searchIcon} aria-hidden>
              <SearchIcon fillColor="transparent" strokeColor="currentColor" strokeWidth={1.5} />
            </span>
            <input
              className={styles.searchInput}
              placeholder="按 loginName 搜索用户..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
          </div>
          {/* 工具栏右侧：按权限组筛选（紧凑 chip 样式，与搜索框同行；窄屏自动 wrap） */}
          <div className={styles.toolbarFilters}>
            <SelectInput
              className={`${styles.filterChip} ${groupFilter ? styles.filterChipActive : ''}`}
              value={groupFilter}
              onChange={setGroupFilter}
              allowInput={false}
              clearable={false}
              aria-label="按权限组筛选"
              title="按权限组筛选：仅展示属于该组的用户"
              options={[
                { value: '', label: '请选择权限组' },
                ...groups.map((g) => ({
                  value: g.groupId,
                  label: `${g.name}（${g.memberCount ?? (g.members || []).length} 人）`,
                })),
              ]}
            />
            {groupFilter && (
              <button
                type="button"
                className={styles.filterClear}
                onClick={() => setGroupFilter('')}
                aria-label="清除按组筛选"
                title="清除按组筛选"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Members Table：用户 / 所属权限组 / 校验状态 / 权限配置 / 操作 */}
        <div className={styles.canvasBody}>
          {loading ? (
            <SkeletonStack widths={[80, 92, 70]} />
          ) : users.length === 0 ? (
            <EmptyState title="暂无 ACL 用户" description="尚未有任何参与数据权限校验的用户。" />
          ) : filteredUsers.length === 0 ? (
            <EmptyState title="当前筛选条件下暂无用户" description="试试调整搜索关键字或清除按权限组筛选。" />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.userTable}>
                <thead>
                  <tr>
                    <th className={styles.colUser}>用户</th>
                    <th className={styles.colRole}>所属权限组</th>
                    <th className={styles.colStatus}>校验状态</th>
                    <th className={styles.colCounts}>权限配置</th>
                    <th className={styles.colActions}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedUsers.map((u) => {
                    const login = uname(u);
                    const role = u.role || 'user';
                    const bypass = ubypass(u);
                    const userGroups = groupsByLogin.get(login) ?? [];
                    // 用户列表行统计：直接按 user.json 中个人配置的权限展示，
                    // 不再合并所属用户组的共享权限（与「所属权限组」列分离，
                    // 让“个人权限”与“组共享权限”各自呈现，避免视觉混淆）。
                    const productDetail = buildProductPermissionDetail(u, productNodes);
                    // 「产品」chip 仅展示「直接配置的产品节点（展开子树后的叶子）」，
                    // 不计入「层级订阅（agg_layer / org_layer）」展开的叶子，与 Modal
                    // 中的「直接配置的产品节点」section 口径完全一致。
                    const productCount = productDetail.directLeaves.length;
                    // 与 stats 卡同口径：列表 badge 也不计算已下线 sid
                    const skillCount = activeUserSkills(u).length;
                    const rowCount = effectiveRowScopes(urowScopes(u)).length;
                    const trClass = `${styles.userTr}${bypass ? ` ${styles.userTrBypass}` : ''}`;
                    return (
                      <tr key={login} className={trClass}>
                        <td className={styles.colUser}>
                          <strong className={styles.userName}>{login}</strong>
                        </td>
                        <td className={styles.colRole}>
                          <div className={styles.roleCell}>
                            {/* 严格只展示真实「所属权限组」（来自 groups.json members）。
                                未加入任何组的用户显示「未加入」灰字，不再用 business_roles 兜底，
                                避免与"权限组"语义混淆。business_roles 作为业务角色标签仍保留在数据层，
                                参与鉴权但不再出现在这一列。 */}
                            {userGroups.length > 0 ? (
                              <>
                                {userGroups.slice(0, 2).map((g) => (
                                  <span
                                    key={g.groupId}
                                    className={`${styles.tag} ${styles.tagPrimary}`}
                                    title={`权限组：${g.name}（${(g.members || []).length} 人）`}
                                  >
                                    {g.name}
                                  </span>
                                ))}
                                {userGroups.length > 2 && (
                                  <span
                                    className={`${styles.tag} ${styles.tagMuted}`}
                                    title={userGroups.slice(2).map((g) => g.name).join('、')}
                                  >
                                    +{userGroups.length - 2}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className={styles.muted}>未加入</span>
                            )}
                          </div>
                        </td>
                        <td className={styles.colStatus}>
                          {bypass ? (
                            <span className={`${styles.statusPill} ${styles.statusPillBypass}`}>
                              <span className={styles.statusDot} />跳过校验
                            </span>
                          ) : (
                            <span className={`${styles.statusPill} ${styles.statusPillEnforce}`}>
                              <span className={styles.statusDot} />执行校验
                            </span>
                          )}
                        </td>
                        <td className={styles.colCounts}>
                          <PermissionSummaryGroup>
                            <PermissionSummaryButton
                              label="产品"
                              count={productCount}
                              muted={bypass || productCount === 0}
                              onClick={() => setPermissionDetail({ loginName: login, kind: 'products' })}
                            />
                            <PermissionSummaryButton
                              label="Skill"
                              count={skillCount}
                              muted={bypass || skillCount === 0}
                              onClick={() => setPermissionDetail({ loginName: login, kind: 'skills' })}
                            />
                            <PermissionSummaryButton
                              label="行"
                              count={rowCount}
                              muted={bypass || rowCount === 0}
                              onClick={() => setPermissionDetail({ loginName: login, kind: 'rows' })}
                            />
                          </PermissionSummaryGroup>
                        </td>
                        <td className={styles.colActions}>
                          <div className={styles.opsRow}>
                            <button
                              type="button"
                              className={styles.btnGhost}
                              onClick={() => setBindingModal({ mode: 'single', loginName: login })}
                              disabled={readonly || bypass}
                              title={bypass ? `${role} 自动跳过校验，无需绑定` : ''}
                            >
                              编辑绑定
                            </button>
                            <button
                              type="button"
                              className={styles.btnGhost}
                              onClick={() => setJoinDialog({ login })}
                              disabled={readonly || bypass}
                              title={
                                bypass
                                  ? `${role} 自动跳过校验，无需加入组`
                                  : userGroups.length > 0
                                    ? '编辑组（加入新组 / 移出组）'
                                    : '加入权限组'
                              }
                            >
                              {userGroups.length > 0 ? '编辑组' : '加入组'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination Footer */}
        {filteredUsers.length > 0 && (
          <div className={styles.canvasFooter}>
            <span className={styles.paginationInfo}>
              显示 {usersPageStart + 1}–{Math.min(usersPageStart + USERS_PAGE_SIZE, filteredUsers.length)} / 共 {filteredUsers.length} 个用户
              {filteredUsers.length !== users.length && <>（已筛选自 {users.length}）</>}
            </span>
            <div className={styles.paginationCtl}>
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
                disabled={usersCurrentPage <= 1}
                aria-label="上一页"
              >
                <ChevronLeftIcon fillColor="transparent" strokeColor="currentColor" strokeWidth={1.5} />
              </button>
              <span className={styles.pageLabel}>第 {usersCurrentPage} / {usersTotalPages} 页</span>
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => setUsersPage((p) => Math.min(usersTotalPages, p + 1))}
                disabled={usersCurrentPage >= usersTotalPages}
                aria-label="下一页"
              >
                <ChevronRightIcon fillColor="transparent" strokeColor="currentColor" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        )}
      </SectionCard>
      </>
      )}

      {/* ─ tree tab：产业树 ─ */}
      {activeTab === 'tree' && (
      <SectionCard
        eyebrow="Tree"
        title="产业树管理"
        description="手工维护产品层级；叶子节点必须填写「标准产品名 + 标准产品 id」。删除节点前需先清空其子节点。"
      >
        <div className={styles.treeMeta}>
          {productNodes.length
            ? `共 ${productNodes.length} 个节点，${productNodes.filter((n) => isLeaf(productNodes, n.product_id)).length} 个叶子`
            : '尚未配置任何节点'}
        </div>
        {(layerValues.agg_layers.length > 0 || layerValues.org_layers.length > 0) && (
          <div className={styles.treeMeta} style={{ marginTop: 4 }}>
            <span className={styles.muted}>标签维度：</span>
            {layerValues.agg_layers.length > 0 && (
              <>
                <span className={styles.muted}>产品聚合层 = </span>
                {layerValues.agg_layers.map((v) => (
                  <span key={`agg:${v}`} className={`${styles.tag} ${styles.tagMuted}`} style={{ marginRight: 4 }}>{v}</span>
                ))}
              </>
            )}
            {layerValues.org_layers.length > 0 && (
              <>
                <span className={styles.muted}>　组织架构层 = </span>
                {layerValues.org_layers.map((v) => (
                  <span key={`org:${v}`} className={`${styles.tag} ${styles.tagMuted}`} style={{ marginRight: 4 }}>{v}</span>
                ))}
              </>
            )}
          </div>
        )}
        {loading ? <SkeletonStack widths={[88, 76, 92, 64]} /> : renderTreeRows()}
      </SectionCard>
      )}

      {/* ─ groups tab：用户组 ─ */}
      {activeTab === 'groups' && (
        <DataAclGroupsTab
          readonly={readonly}
          users={users}
          productNodes={productNodes}
          skillIndex={skillIndex}
          layerValues={layerValues}
          openUserBinding={(login) => setBindingModal({ mode: 'single', loginName: login })}
          onMembersChanged={reloadUsersAndGroups}
        />
      )}

      {/* ─ simulate tab：Simulate + History ─ */}
      {activeTab === 'simulate' && (
      <div className={styles.splitRow}>
        <SectionCard
          eyebrow="Simulate"
          title="模拟鉴权"
          description="基于 active 配置与该用户的 product_ids / skills 执行 hook 链路。"
        >
          <div className={styles.simRow}>
            <input
              className={styles.input}
              placeholder="loginName"
              value={simLogin}
              onChange={(e) => setSimLogin(e.target.value)}
            />
            <input
              className={`${styles.input} ${styles.inputWide}`}
              placeholder="问题或 SQL"
              value={simInput}
              onChange={(e) => setSimInput(e.target.value)}
            />
            <button type="button" className={styles.btnGhost} onClick={() => void handleSimIntent()}>模拟 intent</button>
            <button type="button" className={styles.btnGhost} onClick={() => void handleSimQuery()}>模拟 query</button>
          </div>
          {simResult
            ? <pre className={styles.codeBlock}>{simResult}</pre>
            : <div className={styles.simPlaceholder}>填写 loginName 与问题/SQL 后点击「模拟 intent」或「模拟 query」查看结果</div>}
        </SectionCard>

        <SectionCard
          eyebrow="History"
          title="History 版本"
          description="每次发布自动备份；可选择版本进行回滚。"
        >
          {history.length === 0 ? (
            <div className={styles.empty}>暂无历史版本</div>
          ) : (
            <div className={styles.historyList}>
              {history.slice(0, 12).map((h, i) => (
                <div key={`${h.version}-${i}`} className={styles.historyRow}>
                  <span className={styles.historyVer}>{h.version || '-'}</span>
                  <span className={styles.historyWho}>
                    {h.updated_by || '-'} · {h.updated_at ? new Date(h.updated_at * 1000).toLocaleString('zh-CN') : (h.updatedAt ? new Date(h.updatedAt * 1000).toLocaleString('zh-CN') : '-')}
                  </span>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={() => void handleRollback(String(h.version ?? ''))}
                    disabled={readonly}
                  >
                    回滚
                  </button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
      )}

      {/* Drawer: 产品节点编辑 */}
      <ProductEditDrawer
        open={!!productDrawer}
        action={productDrawer}
        nodes={productNodes}
        readonly={readonly}
        onClose={() => setProductDrawer(null)}
        onSaved={() => {
          setProductDrawer(null);
          void load();
        }}
      />

      {/* Drawer: 批量导入 TSV */}
      <BulkImportDrawer
        open={bulkOpen}
        readonly={readonly}
        onClose={() => setBulkOpen(false)}
        onImported={() => {
          setBulkOpen(false);
          void load();
        }}
      />

      {/* Modal: 用户批量贴入选择 */}
      <BulkUserSelectModal
        open={pasteSelectOpen}
        users={users}
        currentSelected={selectedLogins}
        readonly={readonly}
        onClose={() => setPasteSelectOpen(false)}
        onApply={(next) => {
          setSelectedLogins(next);
          setShowSelectedOnly(true);
        }}
      />

      {/* Modal: 用户绑定 */}
      <UserBindingsModal
        modal={bindingModal}
        readonly={readonly}
        nodes={productNodes}
        users={users}
        skillIndex={skillIndex}
        layerValues={layerValues}
        onClose={() => setBindingModal(null)}
        onSaved={(clearSelected, close = true) => {
          if (close) setBindingModal(null);
          if (clearSelected) clearSelection();
          void load();
        }}
      />

      {permissionDetail && (
        <PermissionDetailModal
          detail={permissionDetail}
          users={users}
          nodes={productNodes}
          skillIndex={skillIndex}
          onClose={() => setPermissionDetail(null)}
        />
      )}

      {/* 编辑组（加入组 / 移出组）弹窗：从「用户绑定」行操作触发。
          后端 add_members 会自动把目标组的共享权限并集写入个人权限；移出组不回收。 */}
      {joinDialog && (
        <JoinGroupDialog
          login={joinDialog.login}
          allGroups={groups}
          currentGroupIds={(groupsByLogin.get(joinDialog.login) ?? []).map((g) => g.groupId)}
          unavailableSkillIds={unavailableSkillIds}
          onClose={() => setJoinDialog(null)}
          onChanged={() => {
            void load();
          }}
          toast={toast}
        />
      )}
    </div>
  );
}

/* ============================================
   Modal: 编辑组（加入组 / 移出组）
   ----------------------------------------
   用户绑定页行操作触发；后端 add_members 会自动把目标组的共享权限并集写入个人权限，
   移出组不回收个人权限（与 plan「加入即并集，移出不回收」语义一致）。
   ============================================ */
function JoinGroupDialog({
  login,
  allGroups,
  currentGroupIds,
  unavailableSkillIds,
  onClose,
  onChanged,
  toast,
}: {
  login: string;
  allGroups: UserGroup[];
  currentGroupIds: string[];
  /** 已下线 sid 集合，用于「共享 N 个 Skill」展示位过滤 */
  unavailableSkillIds: Set<string>;
  onClose: () => void;
  onChanged: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const currentSet = useMemo(() => new Set(currentGroupIds), [currentGroupIds]);
  // 选择目标状态集合：true = 应该属于；false = 不应该属于
  const [target, setTarget] = useState<Set<string>>(() => new Set(currentGroupIds));
  const [saving, setSaving] = useState(false);

  const toAdd = useMemo(
    () => Array.from(target).filter((gid) => !currentSet.has(gid)),
    [target, currentSet],
  );
  const toRemove = useMemo(
    () => Array.from(currentSet).filter((gid) => !target.has(gid)),
    [target, currentSet],
  );
  const dirty = toAdd.length > 0 || toRemove.length > 0;

  const handleToggle = (gid: string) => {
    setTarget((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!dirty) {
      toast.info('未做任何变更');
      return;
    }
    setSaving(true);
    const errors: string[] = [];
    // 先加入：组共享权限并集写入个人权限（后端语义）
    for (const gid of toAdd) {
      const env = await addGroupMembers(gid, [login]).catch((e) => {
        console.error('[JoinGroupDialog] addGroupMembers failed', e);
        return { success: false, error: e instanceof Error ? e.message : '加入组失败' };
      });
      if (!env.success) {
        const name = allGroups.find((g) => g.groupId === gid)?.name ?? gid;
        errors.push(`加入「${name}」失败：${('error' in env && env.error) || '未知错误'}`);
      }
    }
    // 再移出：不回收个人权限
    for (const gid of toRemove) {
      const env = await removeGroupMember(gid, login).catch((e) => {
        console.error('[JoinGroupDialog] removeGroupMember failed', e);
        return { success: false, error: e instanceof Error ? e.message : '移出组失败' };
      });
      if (!env.success) {
        const name = allGroups.find((g) => g.groupId === gid)?.name ?? gid;
        errors.push(`移出「${name}」失败：${('error' in env && env.error) || '未知错误'}`);
      }
    }
    setSaving(false);
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }
    const tips: string[] = [];
    if (toAdd.length > 0) tips.push(`加入 ${toAdd.length} 个组（已写入个人权限并集）`);
    if (toRemove.length > 0) tips.push(`移出 ${toRemove.length} 个组（个人权限保留）`);
    toast.success(`${login}：${tips.join('；')}`);
    onChanged();
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`编辑组 — ${login}`}
      width={560}
    >
      <div className={styles.joinGroupWrap}>
        <p className={styles.joinGroupHint}>
          勾选后保存：加入新组时，组共享权限会**并集写入个人权限**（已有权限保留）；
          移出组时，组共享权限立即失效，但已写入个人权限的部分会保留（如不需要请去「编辑绑定」清理）。
        </p>
        {allGroups.length === 0 ? (
          <div className={styles.joinGroupEmpty}>
            暂无可用权限组。请先在「用户组」标签页创建组。
          </div>
        ) : (
          <div className={styles.joinGroupList}>
            {allGroups.map((g) => {
              const isCurrent = currentSet.has(g.groupId);
              const checked = target.has(g.groupId);
              const willChange = isCurrent !== checked;
              const memberCount = g.memberCount ?? (g.members || []).length;
              return (
                <label
                  key={g.groupId}
                  className={willChange ? `${styles.joinGroupItem} ${styles.joinGroupItemActive}` : styles.joinGroupItem}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleToggle(g.groupId)}
                  />
                  <span className={styles.joinGroupName}>
                    <div className={styles.joinGroupNameMain}>
                      {g.name}
                      {isCurrent && <span className={styles.joinGroupBadge}>已属</span>}
                    </div>
                    <div className={styles.joinGroupMeta}>
                      {memberCount} 名成员 · 共享 {g.template?.product_ids?.length ?? 0} 个产品 ·{' '}
                      {/* 已下线 sid 不计入数量，与 stats / badge / 组列表同口径 */}
                      {visibleSkillCount(g.template?.skills, unavailableSkillIds)} 个 Skill ·{' '}
                      {g.template?.row_scopes?.length ?? 0} 项行权限
                    </div>
                  </span>
                </label>
              );
            })}
          </div>
        )}
        <div className={styles.joinGroupFooter}>
          <div className={styles.footerActions}>
            <button type="button" className={styles.btnGhost} onClick={onClose} disabled={saving}>
              取消
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleSubmit}
              disabled={saving || !dirty}
            >
              {saving ? '保存中…' : `确认（+${toAdd.length} / -${toRemove.length}）`}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ============================================
   Modal: 批量贴入用户名并选中
   ============================================ */
function BulkUserSelectModal({
  open,
  users,
  currentSelected,
  readonly,
  onClose,
  onApply,
}: {
  open: boolean;
  users: DataAclUserRaw[];
  currentSelected: string[];
  readonly: boolean;
  onClose: () => void;
  onApply: (nextSelected: string[]) => void;
}) {
  const [text, setText] = useState('');
  const [append, setAppend] = useState(false);
  const [result, setResult] = useState<null | {
    requested: number;
    matched: string[];
    missing: string[];
    skipped: string[];
    duplicates: string[];
  }>(null);

  useEffect(() => {
    if (!open) return;
    setText('');
    setAppend(false);
    setResult(null);
  }, [open]);

  if (!open) return null;

  const handleSelect = () => {
    const parsed = parseLoginNames(text);
    const byLogin = new Map(users.map((u) => [uname(u), u]));
    const matched: string[] = [];
    const missing: string[] = [];
    const skipped: string[] = [];
    parsed.names.forEach((login) => {
      const user = byLogin.get(login);
      if (!user) {
        missing.push(login);
      } else if (ubypass(user)) {
        skipped.push(`${login}（${user.role || 'manager'} 跳过 Data ACL）`);
      } else {
        matched.push(login);
      }
    });
    const next = append ? Array.from(new Set([...currentSelected, ...matched])) : matched;
    setResult({ requested: parsed.names.length, matched, missing, skipped, duplicates: parsed.duplicates });
    onApply(next);
  };

  return (
    <Modal open onClose={onClose} title="批量贴入用户名" meta="支持英文逗号或多行" width={640}>
      <div className={styles.bindingModalPanel}>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>用户名</label>
          <textarea
            className={`${styles.input} ${styles.textarea}`}
            rows={8}
            value={text}
            placeholder="alice,bob,charlie\ndavid"
            onChange={(e) => setText(e.target.value)}
          />
          <span className={styles.formHint}>系统会自动 trim、去重，并跳过 admin / manager 等不参与 Data ACL 的用户。</span>
        </div>
        <div className={styles.userPasteMode}>
          <label className={styles.checkLabel}>
            <input type="radio" checked={!append} onChange={() => setAppend(false)} />
            覆盖当前选择
          </label>
          <label className={styles.checkLabel}>
            <input type="radio" checked={append} onChange={() => setAppend(true)} />
            追加到当前选择
          </label>
        </div>
        {result && (
          <div className={styles.batchResultBox}>
            <b>输入 {result.requested} 个，命中 {result.matched.length} 个，已选 {append ? new Set([...currentSelected, ...result.matched]).size : result.matched.length} 个，跳过 {result.skipped.length} 个，未找到 {result.missing.length} 个</b>
            {result.missing.length > 0 && <div>未找到：{result.missing.join(', ')}</div>}
            {result.skipped.length > 0 && <div>不可选：{result.skipped.join(', ')}</div>}
            {result.duplicates.length > 0 && <div>重复忽略：{result.duplicates.join(', ')}</div>}
          </div>
        )}
        <div className={styles.drawerActions} style={{ justifyContent: 'flex-end' }}>
          <button type="button" className={styles.btnGhost} onClick={onClose}>关闭</button>
          <button type="button" className={styles.btnPrimary} onClick={handleSelect} disabled={readonly || !text.trim()}>查询并选中</button>
        </div>
      </div>
    </Modal>
  );
}

/* ============================================
   Readonly: 用户权限详情
   ============================================ */
function PermissionDetailModal({
  detail,
  users,
  nodes,
  skillIndex,
  onClose,
}: {
  detail: PermissionDetailState;
  users: DataAclUserRaw[];
  nodes: ProductNodeRaw[];
  skillIndex: SkillTableEntry[];
  onClose: () => void;
}) {
  const rawUser = users.find((u) => uname(u) === detail.loginName);
  if (!rawUser) return null;

  // 统一按 user.json 中的个人权限展示，不再与所属用户组的共享权限做并集；
  // 让「用户绑定」页/详情面板严格反映个人配置，避免与组权限混淆。
  const user = rawUser;

  const role = rawUser.role || 'user';
  const bypass = ubypass(rawUser);
  const productDetail = buildProductPermissionDetail(user, nodes);
  // 下线 sid 集合：与列表 badge / stats 卡同口径——
  // 已下线 sid 不计入"已绑定数量"，也不在详情面板里展示。
  // 想清理这些遗留 sid 请走「编辑绑定」Modal（那里有禁选态 + 下线标记）。
  const unavailableSkillIds = buildUnavailableSkillIds(skillIndex);
  const skillIds = visibleSkills(uskills(user), unavailableSkillIds)
    .slice()
    .sort((a, b) => a.localeCompare(b));
  const skillGroups = skillIds.map((sid) => ({
    skillId: sid,
    // 上面已过滤，这里恒为 false；保留字段以兼容下游渲染结构。
    unavailable: false,
    tables: skillIndex.filter((it) => it.skill === sid && it.table),
  }));
  const allRowScopes = urowScopes(user);
  const activeRowScopes = effectiveRowScopes(allRowScopes);
  const inactiveRowScopeCount = Math.max(0, allRowScopes.length - activeRowScopes.length);
  const titleMap: Record<PermissionDetailKind, string> = {
    products: '产品权限',
    skills: 'Skill 权限',
    rows: '行权限',
  };

  const renderProductDetail = () => (
    // PermissionDetailModal 完整展示「直接配置 / 层级订阅 / 最终生效」三段；
    // 用户列表行 chip 才按「只展示产品」口径计数（= directLeaves.length），二者
    // 是不同视图的不同诉求，不强求一致。
    <div className={styles.permissionDetailGrid}>
      <div className={styles.permissionMetricCard}>
        <span>直接配置节点</span>
        {/*
          口径与下方「直接配置的产品节点」chip 区严格一致：
          - chip 区先按「满覆盖上卷」折叠成 directDisplayNodes（class 满覆盖→显示成 class，
            agg 满覆盖→继续上卷到 agg），再附加未匹配脏 id（missingProductIds）。
          - 这里数字 = directDisplayNodes.length + missingProductIds.length，
            保证「卡片数字」永远 == 「chip 实际渲染数」，避免出现
            「直接配置节点 9」但 chip 区只看到 1 个 class 的视觉错位。
          - 不再使用 configuredProductIds.length（那是用户原始勾选的最低粒度数，
            折叠展示后自然对不上）。
        */}
        <b>{productDetail.directDisplayNodes.length + productDetail.missingProductIds.length}</b>
      </div>
      <div className={styles.permissionMetricCard}>
        <span>层级订阅产品</span>
        <b>{productDetail.layerLeaves.length}</b>
      </div>
      <div className={styles.permissionMetricCard}>
        <span>最终生效叶子</span>
        <b>{productDetail.effectiveLeaves.length}</b>
      </div>
      <section className={styles.permissionDetailSection}>
        <h4>直接配置的产品节点</h4>
        {/*
          展示口径（leaf → class → agg 由低到高的「满覆盖上卷」）：
          - 当 class 下「所有」leaf 都被选中 → 折叠展示成 class，不再列出 leaf；
          - 当 agg 下「所有」class 都满足上一条 → 继续折叠展示成 agg；
          - 其余情况展示用户实际选中的最低层级。
          算法见 `rollupFullCoveredIds`；原始 directNodes 仅用于上方计数。
        */}
        {productDetail.directDisplayNodes.length === 0 && productDetail.missingProductIds.length === 0 ? (
          <div className={styles.permissionEmpty}>未直接配置产品节点</div>
        ) : (
          <div className={styles.permissionChipList}>
            {productDetail.directDisplayNodes.map((node) => (
              <span key={node.product_id} className={styles.permissionChip} title={node.product_id}>
                {node.name || node.product_id}<small>{node.product_id}</small>
              </span>
            ))}
            {productDetail.missingProductIds.map((pid) => (
              <span key={`missing:${pid}`} className={`${styles.permissionChip} ${styles.permissionChipWarn}`}>
                未匹配节点<small>{pid}</small>
              </span>
            ))}
          </div>
        )}
      </section>
      <section className={styles.permissionDetailSection}>
        <h4>层级订阅</h4>
        {productDetail.aggLayers.length === 0 && productDetail.orgLayers.length === 0 ? (
          <div className={styles.permissionEmpty}>未配置产品聚合层或组织架构层订阅</div>
        ) : (
          <>
            <div className={styles.permissionChipList}>
              {productDetail.aggLayers.map((v) => <span key={`agg:${v}`} className={styles.permissionChip}>聚合层<small>{v}</small></span>)}
              {productDetail.orgLayers.map((v) => <span key={`org:${v}`} className={styles.permissionChip}>组织层<small>{v}</small></span>)}
            </div>
            <div className={styles.permissionSubTitle}>订阅匹配生效叶子产品：{productDetail.layerLeaves.length}</div>
          </>
        )}
      </section>
      <section className={styles.permissionDetailSectionWide}>
        <h4>最终生效产品范围</h4>
        {bypass && (
          <Notice tone="warning" title="跳过 Data ACL">
            该用户角色为 {role}，运行时默认跳过用户数据权限校验；下方为按 user 角色生效时的真实配置范围（DATA_ACL_FORCE_ENFORCE=true 时会强制生效）。
          </Notice>
        )}
        {productDetail.effectiveLeaves.length === 0 ? (
          <div className={styles.permissionEmpty}>暂无生效产品权限</div>
        ) : (
          <div className={styles.permissionList}>
            {productDetail.effectiveLeaves.map((node) => (
              <div key={node.product_id} className={styles.permissionListItem}>
                <div>
                  <b>{node.name || node.product_id}</b>
                  <p>{productText(node)}</p>
                </div>
                <code>{node.product_id}</code>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  const renderSkillDetail = () => (
    <div className={styles.permissionDetailStack}>
      {bypass && (
        <Notice tone="warning" title="跳过 Data ACL">
          该用户角色为 {role}，Skill 数据权限默认不会限制其查询范围；下方为真实配置，DATA_ACL_FORCE_ENFORCE=true 时强制生效。
        </Notice>
      )}
      {skillGroups.length === 0 ? (
        <div className={styles.permissionEmpty}>暂无授权 Skill</div>
      ) : skillGroups.map((group) => (
        <section key={group.skillId} className={styles.permissionDetailSectionWide}>
          <div className={styles.permissionSectionHead}>
            <h4>
              Skill: {group.skillId}
              {group.unavailable && (
                <span style={{
                  marginLeft: 8,
                  padding: '1px 6px',
                  fontSize: 11,
                  lineHeight: '16px',
                  fontWeight: 500,
                  color: 'var(--warning, #c08a00)',
                  background: 'var(--warning-soft, rgba(255, 178, 0, 0.12))',
                  border: '1px solid var(--warning-border, rgba(255, 178, 0, 0.32))',
                  borderRadius: 9999,
                }}>已下线</span>
              )}
            </h4>
            <span className={styles.permissionMiniBadge}>{group.tables.length} 张声明表</span>
          </div>
          {group.tables.length === 0 ? (
            <div className={styles.permissionEmpty}>
              {group.unavailable
                ? '该 Skill 已下线，运行时不参与权限校验；admin 可在编辑页取消勾选。'
                : '当前 Skill 表索引中未声明表'}
            </div>
          ) : (
            <div className={styles.permissionTableList}>
              {group.tables.map((table) => (
                <div key={`${group.skillId}:${table.datasource || 'mysql'}:${table.table}`} className={styles.permissionTableItem}>
                  <code>{table.table}</code>
                  <span>{table.brief || '未配置用途说明'}</span>
                  <small>{table.datasource || 'mysql'}</small>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );

  const renderRowDetail = () => (
    <div className={styles.permissionDetailStack}>
      {bypass && (
        <Notice tone="warning" title="跳过 Data ACL">
          该用户角色为 {role}，行权限配置默认不会参与运行时限制；下方为真实配置，DATA_ACL_FORCE_ENFORCE=true 时强制生效。
        </Notice>
      )}
      {inactiveRowScopeCount > 0 && (
        <div className={styles.permissionHint}>{inactiveRowScopeCount} 条行权限因禁用或未选择枚举值，当前不生效。</div>
      )}
      {activeRowScopes.length === 0 ? (
        <div className={styles.permissionEmpty}>暂无生效行权限配置</div>
      ) : activeRowScopes.map((scope) => (
        <section key={`${scope.skill_id}:${scope.source}:${scope.schema || ''}:${scope.table}`} className={styles.permissionDetailSectionWide}>
          <div className={styles.permissionSectionHead}>
            <h4>{scope.table}</h4>
            <span className={styles.permissionMiniBadge}>{scope.skill_id}</span>
          </div>
          <div className={styles.permissionScopeMeta}>{scope.source || 'mysql'}{scope.schema ? ` · ${scope.schema}` : ''}</div>
          <div className={styles.permissionColumnList}>
            {(scope.columns || []).filter((c) => c.column && (c.values || []).length > 0).map((column) => (
              <div key={column.column} className={styles.permissionColumnItem}>
                <code>{column.column}</code>
                <div className={styles.permissionChipList}>
                  {(column.values || []).map((v) => <span key={`${column.column}:${v}`} className={styles.permissionValueChip}>{v}</span>)}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`${titleMap[detail.kind]}详情 · ${detail.loginName}`}
      meta={`角色：${role}${bypass ? ' · 跳过 Data ACL 校验' : ' · 执行 Data ACL 校验'}`}
      width={960}
    >
      <div className={styles.permissionDetailModal}>
        {detail.kind === 'products' && renderProductDetail()}
        {detail.kind === 'skills' && renderSkillDetail()}
        {detail.kind === 'rows' && renderRowDetail()}
      </div>
    </Modal>
  );
}

/* ============================================
   Drawer: 产品节点编辑
   ============================================ */
interface ProductEditAction {
  mode: 'create-root' | 'create-child' | 'edit';
  parentId?: string;
  productId?: string;
}

function ProductEditDrawer({
  open,
  action,
  nodes,
  readonly,
  onClose,
  onSaved,
}: {
  open: boolean;
  action: ProductEditAction | null;
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
    agg_layer: '',
    org_layer: '',
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
        agg_layer: editingNode.agg_layer || '',
        org_layer: editingNode.org_layer || '',
      });
    } else {
      setForm({ product_id: '', level: '', name: '', aliases: '', standard_product_name: '', standard_product_id: '', agg_layer: '', org_layer: '' });
    }
  }, [open, editing, editingNode]);

  const parentName = parentId
    ? (nodes.find((n) => n.product_id === parentId)?.name || parentId)
    : '（顶层节点）';

  const title = editing ? '编辑产品节点' : (parentId ? '新增子节点' : '新增顶层节点');

  const handleSave = async () => {
    if (readonly) {
      toast.warning('只读角色无权执行此操作');
      return;
    }
    const id = (editing ? form.product_id : form.product_id).trim();
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
    // v2.8：仅叶子节点写入 agg_layer/org_layer；非叶子忽略，避免污染反向索引。
    const aggLayer = willBeLeaf ? form.agg_layer.trim() : '';
    const orgLayer = willBeLeaf ? form.org_layer.trim() : '';
    const newNode: ProductNodeRaw = {
      product_id: id,
      parent_id: editing ? (editingNode?.parent_id || '') : (parentId || ''),
      level: form.level.trim(),
      name,
      aliases,
      standard_product_name: stdName,
      standard_product_id: stdId,
      agg_layer: aggLayer,
      org_layer: orgLayer,
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
    <Drawer
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <span className={styles.drawerSummary}>{editing ? `编辑：${editingNode?.product_id ?? ''}` : '新增节点'}</span>
          <div className={styles.drawerActions}>
            <button type="button" className={styles.btnGhost} onClick={onClose} disabled={saving}>取消</button>
            <button type="button" className={styles.btnPrimary} onClick={() => void handleSave()} disabled={readonly || saving}>
              {saving ? '保存中…' : editing ? '保存' : '添加'}
            </button>
          </div>
        </>
      }
    >
      <div className={styles.formGrid}>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>父节点</label>
          <input className={styles.input} value={parentName} disabled />
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>product_id <span className={styles.req}>*</span></label>
          <input
            className={styles.input}
            value={form.product_id}
            disabled={editing}
            placeholder="如 it_eom 或 mc_iotcs"
            onChange={(e) => setForm({ ...form, product_id: e.target.value })}
          />
          <span className={styles.formHint}>作为节点稳定 id；保存后不可修改</span>
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>层级 level</label>
          <input
            className={styles.input}
            value={form.level}
            placeholder="如 ft / class3 / class4（可选）"
            onChange={(e) => setForm({ ...form, level: e.target.value })}
          />
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>中文名 name <span className={styles.req}>*</span></label>
          <input
            className={styles.input}
            value={form.name}
            placeholder="如 物联终端"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>别名 aliases</label>
          <input
            className={styles.input}
            value={form.aliases}
            placeholder="多个用半角逗号分隔"
            onChange={(e) => setForm({ ...form, aliases: e.target.value })}
          />
        </div>
        {willBeLeaf ? (
          <>
            <hr className={styles.formDivider} />
            <div className={styles.formRow}>
              <label className={styles.formLabel}>标准产品名 standard_product_name <span className={styles.req}>*</span></label>
              <input
                className={styles.input}
                value={form.standard_product_name}
                placeholder="如 物联终端"
                onChange={(e) => setForm({ ...form, standard_product_name: e.target.value })}
              />
              <span className={styles.formHint}>叶子节点必填；用于后续表-产品作用域映射</span>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>标准产品 id standard_product_id <span className={styles.req}>*</span></label>
              <input
                className={styles.input}
                value={form.standard_product_id}
                placeholder="如 ioteom / eom"
                onChange={(e) => setForm({ ...form, standard_product_id: e.target.value })}
              />
              <span className={styles.formHint}>叶子节点必填；业务上多对一不强制全局唯一</span>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>产品聚合层 agg_layer</label>
              <input
                className={styles.input}
                value={form.agg_layer}
                placeholder="如 MPaaS / CPaaS / 边缘平台（可选）"
                onChange={(e) => setForm({ ...form, agg_layer: e.target.value })}
              />
              <span className={styles.formHint}>v2.8 新增：业务包标签维度，用于跨树聚合查询；仅叶子可填</span>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>组织架构层 org_layer</label>
              <input
                className={styles.input}
                value={form.org_layer}
                placeholder="如 平台中心 / 通信中心 / 边缘中心（可选）"
                onChange={(e) => setForm({ ...form, org_layer: e.target.value })}
              />
              <span className={styles.formHint}>v2.8 新增：组织/事业部标签维度；仅叶子可填</span>
            </div>
          </>
        ) : (
          <>
            <hr className={styles.formDivider} />
            <span className={styles.muted}>该节点已有子节点，按聚合层处理；无需填写标品信息与层级标签（agg_layer / org_layer 仅叶子可填）。</span>
          </>
        )}
      </div>
    </Drawer>
  );
}

/* ============================================
   Drawer: 批量导入 TSV
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
/**
 * v2.8：TSV 列数嗅探 + 解析。
 * - 旧 5 列：``二级产业树聚合 / 产业树细类 / 产业树子类 / 标准产品名 / 标准产品id``
 * - 新 7 列：``二级产业树聚合 / 产品聚合 / 组织架构 / 产业树细类 / 产业树子类 / 标准产品名 / 标准产品id``
 *   新增 ``aggLayer`` / ``orgLayer`` 两个仅叶子写入的标签字段。
 *
 * 嗅探规则：表头存在 ``产品聚合`` 与 ``组织架构`` 关键字 → 7 列；否则 5 列。
 * 数据行按检测到的 schema 列数解构；缺列报错；新格式下 aggLayer/orgLayer 为空时仍允许（叶子可暂未归类）。
 */
function parseBulkTSV(text: string): { rows: { agg: string; aggLayer: string; orgLayer: string; cls: string; leaf: string; stdName: string; stdId: string }[]; errors: string[] } {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length);
  if (!lines.length) return { rows: [], errors: ['粘贴内容为空'] };
  let start = 0;
  let schemaWide = false;  // true=7 列（新）, false=5 列（旧）
  if (/标准产品/.test(lines[0]) || /standard_product/i.test(lines[0])) {
    start = 1;
    schemaWide = /产品聚合/.test(lines[0]) && /组织架构/.test(lines[0]);
  } else if (lines[0].split('\t').length >= 7) {
    // 无表头但首行 ≥7 列：按新格式处理（数据驱动嗅探）
    schemaWide = true;
  }
  const rows: { agg: string; aggLayer: string; orgLayer: string; cls: string; leaf: string; stdName: string; stdId: string }[] = [];
  const errors: string[] = [];
  const minCols = schemaWide ? 7 : 5;
  for (let i = start; i < lines.length; i++) {
    const raw = lines[i];
    const cols = raw.includes('\t') ? raw.split('\t') : raw.split(/\s{2,}/);
    const cells = cols.map((c) => c.trim());
    if (cells.length < minCols) { errors.push(`第 ${i + 1} 行字段不足 ${minCols} 列：${raw}`); continue; }
    let agg = '', aggLayer = '', orgLayer = '', cls = '', leaf = '', stdName = '', stdId = '';
    if (schemaWide) {
      [agg, aggLayer, orgLayer, cls, leaf, stdName, stdId] = cells;
    } else {
      [agg, cls, leaf, stdName, stdId] = cells;
    }
    // 关键 5 列必填
    if (!agg || !cls || !leaf || !stdName || !stdId) {
      errors.push(`第 ${i + 1} 行存在空字段（关键列）：${raw}`); continue;
    }
    rows.push({ agg, aggLayer, orgLayer, cls, leaf, stdName, stdId });
  }
  return { rows, errors };
}
function buildTreeFromTSV(rows: { agg: string; aggLayer: string; orgLayer: string; cls: string; leaf: string; stdName: string; stdId: string }[]): ProductNodeRaw[] {
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
      // 注意：聚合层 ft 节点不打 agg_layer / org_layer 标签（仅叶子打标）
      nodes.push({ product_id: id, parent_id: '', level: 'ft', name: r.agg, aliases: [], standard_product_name: '', standard_product_id: '', agg_layer: '', org_layer: '' });
    }
    const ck = `${r.agg}\t${r.cls}`;
    if (!classMap.has(ck)) {
      const id = reserve(slugId('class_', r.cls));
      classMap.set(ck, id);
      nodes.push({ product_id: id, parent_id: aggMap.get(r.agg)!, level: 'class3', name: r.cls, aliases: [], standard_product_name: '', standard_product_id: '', agg_layer: '', org_layer: '' });
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
      agg_layer: r.aggLayer || '',
      org_layer: r.orgLayer || '',
    });
  }
  return nodes;
}

function BulkImportDrawer({
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
  const [previewMeta, setPreviewMeta] = useState<string>('');
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (open) {
      setTsv('');
      setParsed(null);
      setPreviewMeta('');
      setErrors([]);
    }
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
    if (!parsed || !parsed.length) { toast.warning('请先点击「解析预览」'); return; }
    if (!confirm(`将整树替换为 ${parsed.length} 个节点。当前产业树会被覆盖（已自动写入 history 可回滚）。确认继续？`)) return;
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
    <Drawer
      open={open}
      title="批量导入产业树（TSV）"
      onClose={onClose}
      width={620}
      footer={
        <>
          <span className={styles.drawerSummary}>{previewMeta}</span>
          <div className={styles.drawerActions}>
            <button type="button" className={styles.btnGhost} onClick={onClose} disabled={importing}>取消</button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => void handleConfirm()}
              disabled={readonly || importing || !parsed?.length}
            >
              {importing ? '导入中…' : '确认导入（整树替换）'}
            </button>
          </div>
        </>
      }
    >
      <div className={styles.formGrid}>
        <Notice tone="warning" title="整树替换">
          「确认导入」会<b>整树替换</b>当前产业树。已绑定用户的 product_ids 中若指向被删节点，将在下次保存时校验失败；建议先在「History 版本」做一次发布以便回滚。
        </Notice>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>粘贴 TSV（首行表头）</label>
          <textarea
            className={`${styles.input} ${styles.textarea}`}
            rows={12}
            value={tsv}
            placeholder={'二级产业树聚合\t产品聚合\t组织架构\t产业树细类\t产业树子类\t标准产品名\t标准产品id\n音视频PaaS\tCPaaS\t通信中心\t实时互动\t实时音视频\t实时音视频\ttrtc\n\n# 兼容旧 5 列：二级产业树聚合\\t产业树细类\\t产业树子类\\t标准产品名\\t标准产品id'}
            onChange={(e) => setTsv(e.target.value)}
          />
          <span className={styles.formHint}>支持 TAB 或 ≥2 空格分隔。表头识别关键词「标准产品」可选。</span>
        </div>
        <div className={styles.simRow}>
          <button type="button" className={styles.btnGhost} onClick={handlePreview}>解析预览</button>
        </div>
        {errors.length > 0 && (
          <Notice tone="danger" title="解析错误">
            <div className={styles.errList}>
              {errors.slice(0, 20).map((e, i) => <div key={i}>{e}</div>)}
            </div>
          </Notice>
        )}
        {parsed && parsed.length > 0 && (
          <div className={styles.previewBox}>
            {Array.from(parsed.filter((n) => n.level === 'class4').reduce((acc, n) => {
              const cls = parsed.find((x) => x.product_id === n.parent_id);
              const agg = cls ? parsed.find((x) => x.product_id === cls.parent_id) : null;
              const key = `${agg?.name ?? '(未知)'} / ${cls?.name ?? '(未知)'}`;
              if (!acc.has(key)) acc.set(key, [] as string[]);
              acc.get(key)!.push(`${n.name}  →  ${n.standard_product_name} / ${n.standard_product_id}`);
              return acc;
            }, new Map<string, string[]>()).entries()).map(([k, leaves]) => (
              <div key={k} className={styles.previewGroup}>
                <b>{k}</b>
                <div className={styles.previewLeaves}>
                  {leaves.map((l, i) => <div key={i}>{l}</div>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}

/* ============================================
   Modal: 用户绑定（产品权限 / Skill 权限）
   ============================================ */
function UserBindingsModal({
  modal,
  readonly,
  nodes,
  users,
  skillIndex,
  layerValues,
  onClose,
  onSaved,
}: {
  modal: BindingModalState;
  readonly: boolean;
  nodes: ProductNodeRaw[];
  users: DataAclUserRaw[];
  skillIndex: SkillTableEntry[];
  layerValues: LayerValues;
  onClose: () => void;
  onSaved: (clearSelected?: boolean, close?: boolean) => void;
}) {
  const toast = useToast();
  const open = Boolean(modal);
  const singleMode = modal?.mode === 'single';
  const configureMode = modal?.mode === 'configure';
  const patchMode = modal?.mode === 'patch';
  const targetLogins = singleMode ? [modal.loginName] : (modal?.loginNames ?? []);
  const loginName = targetLogins[0] ?? '';
  const [tab, setTab] = useState<'products' | 'skills' | 'layers' | 'rows'>('products');
  const [products, setProducts] = useState<Set<string>>(new Set());
  const [skills, setSkills] = useState<Set<string>>(new Set());
  const [rowScopes, setRowScopes] = useState<RowScopeBinding[]>([]);
  // v2.8：按聚合层 / 组织架构层订阅授权（完整 β）
  const [aggLayers, setAggLayers] = useState<Set<string>>(new Set());
  const [orgLayers, setOrgLayers] = useState<Set<string>>(new Set());
  const [productSearch, setProductSearch] = useState('');
  const [skillSearch, setSkillSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchUserBindingsResult | null>(null);
  const [showCopyPicker, setShowCopyPicker] = useState(false);
  const [patchProducts, setPatchProducts] = useState(false);
  const [patchSkills, setPatchSkills] = useState(false);
  const [patchLayers, setPatchLayers] = useState(false);
  const [patchRows, setPatchRows] = useState(false);

  const childrenMap = useMemo(() => buildChildrenMap(nodes), [nodes]);
  /**
   * 下线 sid 集合：用于 toggleSkill 防御 + renderSkillList 渲染禁选态。
   * 与 PermissionTree 同一约定 —— skillIndex 里 status==unavailable 的占位行（table=""）。
   *
   * 必须放在所有早 return（`if (!open) return null`）之前声明，否则当 modal
   * 由关闭切换到打开时 hook 数量会变化，触发 React #310（Rendered more hooks
   * than during the previous render）。
   */
  const unavailableSkillIds = useUnavailableSkillIds(skillIndex);
  const productsReadonly = readonly || (patchMode && !patchProducts);
  const skillsReadonly = readonly || (patchMode && !patchSkills);
  const layersReadonly = readonly || (patchMode && !patchLayers);
  const rowsReadonly = readonly || (patchMode && !patchRows);
  const candidateUsers = useMemo<DataAclUser[]>(() => users.map((u) => ({
    loginName: uname(u),
    productIds: uproductIds(u),
    skills: uskills(u),
    businessRoles: (u.business_roles ?? u.businessRoles ?? []) as string[],
    aggLayers: uagglayers(u),
    orgLayers: uorglayers(u),
    rowScopes: urowScopes(u),
  })).filter((u) => u.loginName && !targetLogins.includes(u.loginName)), [targetLogins, users]);

  useEffect(() => {
    if (!open) return;
    setBatchResult(null);
    let initialProducts = new Set<string>();
    if (singleMode) {
      const u = users.find((x) => uname(x) === loginName);
      initialProducts = new Set(uproductIds(u || {}));
      setProducts(initialProducts);
      setSkills(new Set(uskills(u || {})));
      setRowScopes(urowScopes(u || {}));
      setAggLayers(new Set(uagglayers(u || {})));
      setOrgLayers(new Set(uorglayers(u || {})));
    } else {
      setProducts(new Set());
      setSkills(new Set());
      setRowScopes([]);
      setAggLayers(new Set());
      setOrgLayers(new Set());
    }
    setPatchProducts(configureMode);
    setPatchSkills(configureMode);
    setPatchLayers(configureMode);
    setPatchRows(configureMode);
    setTab('products');
    setProductSearch('');
    setSkillSearch('');
    setShowCopyPicker(false);
    // 默认折叠：只展开「包含已勾选项」的分支，未勾选分支仍收起到最高一级节点。
    setCollapsed(computeDefaultCollapsed(nodes, initialProducts));
  }, [configureMode, loginName, open, singleMode, users, nodes]);

  if (!open) return null;

  const toggleCollapse = (pid: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const toggleProduct = (pid: string) => {
    if (productsReadonly) return;
    setProducts((prev) => {
      const cur = computeTriState(nodes, prev, pid);
      // 场景 A：pid 当前因祖先继承而呈 checked（自身未显式选）。
      // 用户点击取消时，不再禁止 / 不再要求"先取消祖先"，而是把祖先覆盖
      // 等价展开成差集（移除祖先 + 把通往 pid 路径上每层的"非路径兄弟"显式选中），
      // 再不加入 pid 自身 → 实现"在 leaf 直接取消"。
      // 模型保持不变（product_ids 仍是集合 / 包含语义）。
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

  const toggleSkill = (skillId: string) => {
    // 「下线 sid 未勾不可新增 / 已勾仍可取消」单点逻辑收口在 canToggleSkill，
    // 与后端 _validate_skills_in_registry 写路径校验闭环，三端共用。
    const action = canToggleSkill({
      isUnavailable: unavailableSkillIds.has(skillId),
      currentlyChecked: skills.has(skillId),
      readOnly: skillsReadonly,
    });
    if (action === 'denied') return;
    const isRemoving = action === 'remove';
    setSkills((prev) => {
      const next = new Set(prev);
      if (isRemoving) next.delete(skillId);
      else next.add(skillId);
      return next;
    });
    // 取消 Skill 时同步清理其名下行权限，避免后端 _validate_row_scopes_for_user
    // 因 skill_not_authorized 返回 400 ROW_SCOPE_INVALID 拖累整次保存。
    // 与移动端 MobileDataAclPage::toggleSkill 逻辑一致。
    if (isRemoving) {
      setRowScopes((rs) => rs.filter((r) => r.skill_id !== skillId));
    }
  };

  const handleCopyTemplate = (tpl: DataAclTemplate) => {
    setProducts(new Set(tpl.product_ids || []));
    setAggLayers(new Set(tpl.agg_layers || []));
    setOrgLayers(new Set(tpl.org_layers || []));
    setSkills(new Set(tpl.skills || []));
    setRowScopes(mergeRowScopes([], tpl.row_scopes || []));
    if (patchMode) {
      setPatchProducts(true);
      setPatchSkills(true);
      setPatchLayers(true);
      setPatchRows(true);
    }
    setShowCopyPicker(false);
    toast.success('已复制到当前绑定表单，确认后请点击保存');
  };

  const handleSave = async () => {
    if (readonly) { toast.warning('只读角色无权执行此操作'); return; }
    if (targetLogins.length === 0) return;
    setSaving(true);
    setBatchResult(null);
    if (singleMode) {
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
        onSaved(false);
      } else if (env) {
        toast.error(env.error ?? '保存失败');
      }
      return;
    }

    const patch: UserBindingsPatch = {};
    if (configureMode || patchProducts) patch.product_ids = [...products];
    if (configureMode || patchSkills) patch.skills = [...skills];
    if (configureMode || patchLayers) {
      patch.agg_layers = [...aggLayers];
      patch.org_layers = [...orgLayers];
    }
    if (configureMode || patchRows) patch.row_scopes = rowScopes;
    if (Object.keys(patch).length === 0) {
      setSaving(false);
      toast.warning('请选择至少一项要变更的数据权限');
      return;
    }
    if (patch.row_scopes !== undefined && patch.skills === undefined) {
      setSaving(false);
      toast.warning('批量配置行权限时，请同时启用 Skill 权限变更并选择 Skill');
      return;
    }

    const env = await updateUserBindingsBatch({ loginNames: targetLogins, patch }).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : '保存失败');
      return null;
    });
    setSaving(false);
    if (env?.success && env.data) {
      setBatchResult(env.data);
      const { updated, failed, skipped } = env.data.counts;
      if (failed === 0 && skipped === 0) {
        toast.success(`已更新 ${updated} 个用户`);
        onSaved(true);
      } else {
        toast.warning(`已更新 ${updated} 个用户，${failed + skipped} 个需处理`);
        onSaved(false, false);
      }
    } else if (env) {
      toast.error(env.error ?? '保存失败');
    }
  };

  /* ─ Products tree render ─ */
  const renderProductTree = () => {
    if (!nodes.length) {
      return <div className={styles.empty}>产业树为空，请先在「产业树管理」录入节点</div>;
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
      const aliases = (node.aliases || []).slice(0, 2);
      const aliasText = aliases.length ? ` [${aliases.join(' / ')}]` : '';
      const tri = computeTriState(nodes, products, pid);
      const matched = !kw || matchHay(node);
      const hidden = isHidden(ancestors) || (kw && !matched);
      if (!hidden) {
        rows.push(
          <div key={pid} className={styles.productRow} style={{ paddingLeft: 4 + depth * 18 }}>
            <button
              type="button"
              className={kids.length ? styles.productToggle : `${styles.productToggle} ${styles.treeToggleEmpty}`}
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
              disabled={productsReadonly}
            />
            <span className={kw && matched ? `${styles.productName} ${styles.productNameMatch}` : styles.productName}>
              {node.name || pid}
              {aliasText && <span className={styles.muted}>{aliasText}</span>}
            </span>
            <span className={styles.productId}>{pid}</span>
          </div>
        );
      }
      if (!isCol) {
        for (const kid of kids) walk(kid, depth + 1, [...ancestors, pid]);
      }
    };
    for (const r of rootIds) walk(r, 0, []);
    return <div className={styles.productTree}>{rows}</div>;
  };

  /* ─ Skills list render ─ */
  const renderSkillList = () => {
    // skillIndex 一行一表；下线 sid 仅有 status==unavailable 的占位行（table=""）。
    // 聚合规则：占位行不进入 tables 列表，仅用于打"已下线"标记 + 禁选；
    //         真实条目正常分组。
    const groups: Record<string, SkillTableEntry[]> = {};
    for (const e of skillIndex) {
      const sk = e.skill || '其它';
      if (!groups[sk]) groups[sk] = [];
      if (e.status !== 'unavailable' && e.table) {
        groups[sk].push(e);
      }
    }
    const knownSkills = new Set(Object.keys(groups));
    for (const sid of skills) {
      if (!knownSkills.has(sid)) groups[sid] = [];
    }
    const skillIds = Object.keys(groups).sort((a, b) => a.localeCompare(b));
    if (!skillIds.length) {
      return <div className={styles.empty}>暂无可授权 Skill</div>;
    }
    const kw = skillSearch.trim().toLowerCase();
    return (
      <>
        {skillIds.map((sid) => {
          const items = groups[sid] || [];
          const hay = (sid + ' ' + items.map((it) => `${it.table} ${it.brief || ''}`).join(' ')).toLowerCase();
          if (kw && !hay.includes(kw)) return null;
          const active = skills.has(sid);
          const unavailable = unavailableSkillIds.has(sid);
          // 下线 sid：未勾整行 disabled；已勾仍可取消。
          const interactionDisabled = skillsReadonly || (unavailable && !active);
          return (
            <div key={sid} className={styles.skillGroup} style={unavailable ? { opacity: 0.7 } : undefined}>
              <div className={styles.skillGroupHead}>
                <TriCheckbox
                  state={active ? 'checked' : 'unchecked'}
                  ariaLabel={`选择 Skill ${sid}${unavailable ? '（已下线）' : ''}`}
                  onChange={() => toggleSkill(sid)}
                  disabled={interactionDisabled}
                />
                <span
                  className={styles.skillGroupTitle}
                  title={unavailable ? (active ? '该 Skill 已下线，可取消但不可重新勾选' : '该 Skill 已下线，暂不可勾选') : undefined}
                >
                  Skill: {sid}
                  {unavailable && (
                    <span style={{
                      marginLeft: 6,
                      padding: '1px 6px',
                      fontSize: 11,
                      lineHeight: '16px',
                      fontWeight: 500,
                      color: 'var(--warning, #c08a00)',
                      background: 'var(--warning-soft, rgba(255, 178, 0, 0.12))',
                      border: '1px solid var(--warning-border, rgba(255, 178, 0, 0.32))',
                      borderRadius: 9999,
                    }}>已下线</span>
                  )}
                  <span className={styles.muted}>({items.length} 表)</span>
                </span>
              </div>
              <div>
                {items.length === 0 ? (
                  <div className={styles.skillTableRow}>
                    <div className={styles.skillTableInfo}>
                      <div className={styles.skillTableDesc}>
                        {unavailable ? '该 Skill 已下线，运行时不参与权限校验。' : '当前 Skill 表索引中未声明表'}
                      </div>
                    </div>
                  </div>
                ) : items.map((it) => (
                  <div key={`${sid}:${it.table}`} className={styles.skillTableRow}>
                    <div className={styles.skillTableInfo}>
                      <div className={styles.skillTableName}>
                        <code>{it.table}</code>
                        {it.datasource && <span className={`${styles.tag} ${styles.tagMuted}`}>{it.datasource}</span>}
                      </div>
                      <div className={styles.skillTableDesc}>{it.brief || '-'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </>
    );
  };

  const pickedIds = [...products];
  const leaves = effectiveLeafCount(nodes, pickedIds);
  const enabledFields = [
    configureMode || patchProducts ? '产品权限' : '',
    configureMode || patchSkills ? 'Skill 权限' : '',
    configureMode || patchLayers ? '层级订阅' : '',
    configureMode || patchRows ? '行权限' : '',
  ].filter(Boolean);
  const summary = pickedIds.length === leaves
    ? `已选 ${pickedIds.length} 产品 · ${skills.size} Skill · ${rowScopes.length} 行权限`
    : `已选 ${pickedIds.length} 节点 / ${leaves} 叶子产品 · ${skills.size} Skill · ${rowScopes.length} 行权限`;
  const title = singleMode
    ? `编辑用户绑定 · ${loginName}`
    : configureMode
      ? '批量配置数据权限'
      : '批量变更数据权限';
  const meta = singleMode
    ? '产品权限 / Skill 权限 / 层级订阅 / 行权限'
    : `目标用户 ${targetLogins.length} 个 · ${configureMode ? '完整模板覆盖' : '仅更新启用维度'}`;

  return (
    <Modal
      open={open}
      title={title}
      meta={meta}
      onClose={onClose}
      width={1040}
      bodyBleed
    >
      <div className={styles.bindingModal}>
        <div className={styles.bindingModalBody}>
          {!singleMode && (
            <div className={styles.batchTargetBox}>
              <div>
                <b>目标用户 {targetLogins.length} 个</b>
                <div className={styles.formHint}>{configureMode ? '批量配置会用当前模板覆盖所有启用维度。' : '批量变更仅提交已启用的权限维度，未启用维度保持原样。'}</div>
              </div>
              <div className={styles.batchTargetList}>{targetLogins.map((login) => <span key={login} className={`${styles.tag} ${styles.tagMuted}`}>{login}</span>)}</div>
            </div>
          )}
          {/* 顶部 4 维度统计 chip 已移除；维度切换由下方 Tabs（产品权限/Skill 权限/层级订阅/行权限）承担 */}
          <div className={styles.bindingCopyRow}>
            <div>
              <b>权限模板</b>
              <div className={styles.formHint}>从参考用户或用户组复制产品、层级、Skill、行权限到当前表单；复制更弱模板会覆盖当前表单，形成权限收束。</div>
            </div>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => setShowCopyPicker((v) => !v)}
              disabled={readonly}
            >
              {showCopyPicker ? '关闭复制' : '复制权限'}
            </button>
          </div>
          {showCopyPicker && (
            <div className={styles.bindingCopyPanel}>
              <TemplateCopyPicker
                candidateUsers={candidateUsers}
                onConfirm={handleCopyTemplate}
                onCancel={() => setShowCopyPicker(false)}
                confirmLabel="复制到当前绑定"
              />
            </div>
          )}
          <div className={styles.tabBar} role="tablist" aria-label="用户绑定">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'products'}
              className={tab === 'products' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => setTab('products')}
            >
              产品权限
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'skills'}
              className={tab === 'skills' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => setTab('skills')}
            >
              Skill 权限
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'layers'}
              className={tab === 'layers' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => setTab('layers')}
              title="按聚合层 / 组织架构层订阅授权（v2.8 新增）"
            >
              层级订阅
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'rows'}
              className={tab === 'rows' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => setTab('rows')}
              title="对已授权 Skill 声明表配置行级枚举权限"
            >
              行权限
            </button>
          </div>

          {tab === 'products' && (
            <>
              {patchMode && (
                <label className={styles.dimensionSwitch}>
                  <input type="checkbox" checked={patchProducts} onChange={(e) => setPatchProducts(e.target.checked)} />
                  启用产品权限变更
                </label>
              )}
              {patchMode && !patchProducts && <Notice>当前未启用该维度，本页配置不会提交，目标用户原产品权限保持不变。</Notice>}
              <input
                className={`${styles.input} ${styles.searchInput}`}
                placeholder="搜索产品名 / 别名 / id..."
                value={productSearch}
                disabled={productsReadonly}
                onChange={(e) => setProductSearch(e.target.value)}
              />
              {renderProductTree()}
            </>
          )}
          {tab === 'skills' && (
            <>
              {patchMode && (
                <label className={styles.dimensionSwitch}>
                  <input type="checkbox" checked={patchSkills} onChange={(e) => setPatchSkills(e.target.checked)} />
                  启用 Skill 权限变更
                </label>
              )}
              {patchMode && !patchSkills && <Notice>当前未启用该维度，本页配置不会提交，目标用户原 Skill 权限保持不变。</Notice>}
              <input
                className={`${styles.input} ${styles.searchInput}`}
                placeholder="搜索 Skill / 表名 / 用途..."
                value={skillSearch}
                disabled={skillsReadonly}
                onChange={(e) => setSkillSearch(e.target.value)}
              />
              {renderSkillList()}
            </>
          )}
          {tab === 'rows' && (
            <>
              {patchMode && (
                <label className={styles.dimensionSwitch}>
                  <input type="checkbox" checked={patchRows} onChange={(e) => setPatchRows(e.target.checked)} />
                  启用行权限变更
                </label>
              )}
              {patchMode && !patchRows && <Notice>当前未启用该维度，本页配置不会提交，目标用户原行权限保持不变。</Notice>}
              {(configureMode || patchRows) && !patchSkills && !configureMode && (
                <Notice tone="warning" title="需要 Skill 范围">批量变更行权限时，请同时启用 Skill 权限变更并选择 Skill。</Notice>
              )}
              <DataAclRowScopePanel
                readonly={rowsReadonly}
                skillIndex={skillIndex}
                selectedSkills={skills}
                rowScopes={rowScopes}
                onChange={setRowScopes}
                toast={toast}
              />
            </>
          )}
          {tab === 'layers' && (
            <div className={styles.bindingModalPanel}>
              {patchMode && (
                <label className={styles.dimensionSwitch}>
                  <input type="checkbox" checked={patchLayers} onChange={(e) => setPatchLayers(e.target.checked)} />
                  启用层级订阅变更
                </label>
              )}
              {patchMode && !patchLayers && <Notice>当前未启用该维度，本页配置不会提交，目标用户原层级订阅保持不变。</Notice>}
              <div className={styles.formHint} style={{ marginBottom: 8 }}>
                v2.8：按「产品聚合层」/「组织架构层」订阅授权——
                鉴权运行时由系统反查为产品 id 集合并入用户的 allowed_products；
                active 调整后授权自动跟随，无需手动重新勾选。
                可与上方「产品权限」叠加使用，最终授权范围取并集。
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>产品聚合层 agg_layers</label>
                {layerValues.agg_layers.length === 0 ? (
                  <span className={styles.muted}>当前 active 未配置任何 agg_layer 取值</span>
                ) : (
                  <div className={styles.layerTagList}>
                    {layerValues.agg_layers.map((v) => {
                      const active = aggLayers.has(v);
                      return (
                        <button
                          key={`agg:${v}`}
                          type="button"
                          className={active ? `${styles.tag} ${styles.tagLeaf}` : `${styles.tag} ${styles.tagMuted}`}
                          disabled={layersReadonly}
                          onClick={() => {
                            if (layersReadonly) return;
                            setAggLayers((prev) => {
                              const next = new Set(prev);
                              if (next.has(v)) next.delete(v);
                              else next.add(v);
                              return next;
                            });
                          }}
                        >
                          {active ? '✓ ' : ''}{v}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>组织架构层 org_layers</label>
                {layerValues.org_layers.length === 0 ? (
                  <span className={styles.muted}>当前 active 未配置任何 org_layer 取值</span>
                ) : (
                  <div className={styles.layerTagList}>
                    {layerValues.org_layers.map((v) => {
                      const active = orgLayers.has(v);
                      return (
                        <button
                          key={`org:${v}`}
                          type="button"
                          className={active ? `${styles.tag} ${styles.tagLeaf}` : `${styles.tag} ${styles.tagMuted}`}
                          disabled={layersReadonly}
                          onClick={() => {
                            if (layersReadonly) return;
                            setOrgLayers((prev) => {
                              const next = new Set(prev);
                              if (next.has(v)) next.delete(v);
                              else next.add(v);
                              return next;
                            });
                          }}
                        >
                          {active ? '✓ ' : ''}{v}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className={styles.formHint}>
                提示：保存时会校验取值 ⊆ 当前 active；越界会返回 400。空选表示该维度未订阅。
              </div>
            </div>
          )}
        </div>
        {batchResult && (batchResult.failed.length > 0 || batchResult.skipped.length > 0) && (
          <div className={styles.batchResultBox}>
            <b>已更新 {batchResult.counts.updated} 个用户，失败 {batchResult.counts.failed} 个，跳过 {batchResult.counts.skipped} 个</b>
            {[...batchResult.failed, ...batchResult.skipped].slice(0, 30).map((item, index) => (
              <div key={`${item.loginName}-${index}`} className={styles.batchResultLine}>
                <code>{item.loginName || '空用户'}</code>
                <span>{item.error || item.reason || item.code || '处理失败'}</span>
              </div>
            ))}
          </div>
        )}
        <div className={styles.bindingModalFooter}>
          <span className={styles.drawerSummary}>{singleMode ? summary : `${summary} · ${configureMode ? '完整覆盖' : `将变更：${enabledFields.join('、') || '未选择维度'}`}`}</span>
          <div className={styles.footerActions}>
            {/* 清空权限：仅单用户编辑绑定显示。一次性把产品 / Skill / 层级订阅 / 行权限
                4 个维度的本地表单状态全部清空——只清编辑态，不直接落盘；用户再点
                「保存」才会真正写入（给一次撤销机会）。
                注：之前这里有一次 window.confirm 二次确认；按用户反馈点一次确定即生效，
                直接去掉 confirm（保存按钮本身已是落盘前的最后一步，不会破坏可撤销性，
                关闭抽屉即可放弃修改）。 */}
            {singleMode && !readonly && (
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => {
                  setProducts(new Set());
                  setSkills(new Set());
                  setAggLayers(new Set());
                  setOrgLayers(new Set());
                  setRowScopes([]);
                  toast.info('已清空当前编辑的权限，点「保存」生效');
                }}
                disabled={saving}
                title="清空产品 / Skill / 层级订阅 / 行权限四个维度（点保存后生效）"
              >
                清空权限
              </button>
            )}
            <button type="button" className={styles.btnGhost} onClick={onClose} disabled={saving}>取消</button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => void handleSave()}
              disabled={readonly || saving}
            >
              {saving ? '保存中…' : singleMode ? '保存' : configureMode ? `保存并覆盖 ${targetLogins.length} 个用户` : `保存变更到 ${targetLogins.length} 个用户`}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
