/**
 * DataAclGroupsTab — 用户组管理（单表布局 + 行展开详情 + 编辑弹窗）
 *
 * 顶部：组 chips 横向滚动 + 「+ 新建分组」+「删除分组」
 * 主体：组列表表格，每行包含「组名 / 成员数 / 共享权限 chips / 编辑组」。
 *      单击"成员数"或"共享权限 chips" → 行展开内联只读详情：
 *        · 成员列表（avatar + loginName + 个人配置入口）
 *        · 共享权限明细（产品 ids / Skills / 行权限 table:column → values）
 *      所有"添加/移除/修改"动作集中到「编辑组」按钮 → GroupEditDialog。
 *
 * 与个人 Modal 配合：
 *  - 详情中点击成员 → 调用 props.openUserBinding(login)
 *    → DataAclPage 顶层把 bindingModal 状态切到该用户的 single 编辑模式
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Notice, useToast } from '@shared/components';
import {
  createGroup,
  deleteGroup,
  listGroups,
  updateGroup,
  type LayerValues,
  type ProductNode,
  type RowScopeBinding,
  type UserGroup,
} from '../api/dataAcl';
import PermissionTree, { type PermissionTreeData, type PermissionTreeValue, templateToTreeValue } from './PermissionTree';
import DataAclRowScopePanel from './DataAclRowScopePanel';
import { PermissionSummaryButton, PermissionSummaryGroup } from './PermissionSummaryButton';
import { useUnavailableSkillIds, visibleSkillCount, visibleSkills } from '../utils/skillAvailability';
import styles from './DataAclGroupsTab.module.css';

interface SkillIndexEntry {
  table: string;
  skill: string;
  datasource?: string;
  brief?: string;
  /** 后端 v3.x 起回填，"unavailable" 表示下线 skill 占位行（table=""）。 */
  status?: 'active' | 'unavailable';
}

interface DataAclUserRaw {
  login_name?: string;
  loginName?: string;
  product_ids?: string[];
  productIds?: string[];
  skills?: string[];
  agg_layers?: string[];
  aggLayers?: string[];
  org_layers?: string[];
  orgLayers?: string[];
  row_scopes?: RowScopeBinding[];
  rowScopes?: RowScopeBinding[];
  role?: string;
}

function uname(u: DataAclUserRaw): string {
  return String(u.login_name ?? u.loginName ?? '');
}

// 把后端 ProductNode 列表（来自 active.product_nodes）转成 PermissionTree 期望的 ProductNode[]
function adaptProductNodes(rawNodes: unknown): ProductNode[] {
  const arr = Array.isArray(rawNodes) ? rawNodes : [];
  return arr.map((n) => {
    const node = n as Record<string, unknown>;
    return {
      id: String(node.product_id ?? node.id ?? ''),
      name: String(node.name ?? node.product_id ?? ''),
      parentId: (node.parent_id ?? node.parentId) as string | undefined,
    } as ProductNode;
  }).filter((n) => n.id);
}

/**
 * 把 product_ids 中所有节点向下展开成「最终生效叶子」集合：
 *   - 若 id 本身是 leaf（树中无子节点）→ 直接收入；
 *   - 若 id 是非 leaf（class/agg）→ 递归收集其所有后代 leaf；
 *   - 若 id 不在树中（脏 id）→ 按 leaf 兜底原样保留。
 * 用于：
 *   1) GroupsTab 表格里「产品 N」按钮的 N（与最终生效叶子数量一致）；
 *   2) GroupDetailInline 展开区里「最终生效叶子」chip 列表。
 * 同源同口径，避免「按钮显示 12 但展开看到 9 个 leaf」的不一致。
 */
function computeEffectiveLeafIds(productIds: string[], productNodes: ProductNode[]): string[] {
  if (!productIds || productIds.length === 0) return [];
  const byId = new Map(productNodes.map((n) => [n.id, n]));
  const childrenMap: Record<string, string[]> = {};
  for (const n of productNodes) {
    if (n.parentId) (childrenMap[n.parentId] = childrenMap[n.parentId] || []).push(n.id);
  }
  const collected = new Set<string>();
  const collectLeaves = (id: string) => {
    const node = byId.get(id);
    if (!node) { collected.add(id); return; } // 脏 id：兜底当 leaf
    const kids = childrenMap[id];
    if (!kids || kids.length === 0) { collected.add(id); return; }
    for (const c of kids) collectLeaves(c);
  };
  for (const id of productIds) collectLeaves(id);
  return Array.from(collected);
}

export interface DataAclGroupsTabProps {
  readonly: boolean;
  users: DataAclUserRaw[];
  productNodes: unknown[];
  skillIndex: SkillIndexEntry[];
  layerValues: LayerValues;
  /** 点击成员行时：弹出个人 UserBindingsModal。 */
  openUserBinding: (loginName: string) => void;
  /**
   * 组创建/编辑/删除/成员变更后回调父组件 — 让父级触发 users + groups 静默刷新。
   * 后端 update_group 在 template 变更时会对全体成员执行个人权限并集写入，因此
   * 这里 *必须* 让父级重拉 users，否则用户列表行的 chip 数会停留在旧数据上。
   */
  onMembersChanged?: () => void | Promise<void>;
}

export default function DataAclGroupsTab(props: DataAclGroupsTabProps) {
  const { readonly: ro, users, productNodes, skillIndex, layerValues, openUserBinding, onMembersChanged } = props;
  const toast = useToast();

  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // activeGroupId：chip 选中态（顶部 chips bar 的 ✓ 状态、删除分组按钮的目标）
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  // expandedGroupId：表格行展开态（独立于 chip 选中：用户可在不切换 active 的情况下查看其他组详情）
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  // 组编辑弹窗：mode='create' 表示新建，mode='edit' 表示编辑现有组
  type GroupDialogState =
    | { mode: 'create' }
    | { mode: 'edit'; groupId: string }
    | null;
  const [groupDialog, setGroupDialog] = useState<GroupDialogState>(null);

  // ── 并发 / 卸载防护（修复"一直加载中..." + 重复 GET /admin/api/data-acl/groups 现象） ──
  // 1) inflightRef：防止 reload 在上一次未完成时被并发触发（StrictMode 双调、父组件
  //    多次 mount/unmount 都可能触发多个 reload；这里串行化）。
  // 2) mountedRef：组件已 unmount 时丢弃 setState，避免"陈旧 fetch 把 loading 又设回 true / false"
  //    导致页面状态错乱。
  // 3) reqSeqRef：每次 reload 递增，回调时只有当 seq 匹配最新一次才允许更新 state，
  //    避免老请求的 stale 数据覆盖新请求结果（即便上面两道防线都漏掉也不会污染状态）。
  const inflightRef = useRef(false);
  const mountedRef = useRef(true);
  const reqSeqRef = useRef(0);

  // 加载组列表
  const reload = async () => {
    if (inflightRef.current) return; // 已有请求在跑：直接复用，不再发新请求
    inflightRef.current = true;
    const seq = ++reqSeqRef.current;
    if (mountedRef.current) {
      setLoading(true);
      setError('');
    }
    const env = await listGroups().catch((e) => {
      console.error('[DataAclGroupsTab] listGroups failed', e);
      return { success: false, error: e instanceof Error ? e.message : '请求失败' };
    });
    inflightRef.current = false;
    // 仅当本次仍是「最新一次请求」且组件仍 mount 时，才把结果写回 state
    if (!mountedRef.current || seq !== reqSeqRef.current) return;
    setLoading(false);
    if (!env.success || !('data' in env)) {
      setError(('error' in env && env.error) || '加载用户组失败');
      return;
    }
    const list = (env.data as UserGroup[]) ?? [];
    setGroups(list);
    if (!activeGroupId && list.length > 0) {
      setActiveGroupId(list[0].groupId);
    } else if (activeGroupId && !list.some((g) => g.groupId === activeGroupId)) {
      setActiveGroupId(list[0]?.groupId ?? null);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    void reload();
    return () => {
      mountedRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeGroup = useMemo(
    () => groups.find((g) => g.groupId === activeGroupId) ?? null,
    [groups, activeGroupId],
  );

  // 仅供 GroupEditDialog 使用的产品树数据
  const productTreeData = useMemo(() => {
    return {
      productNodes: adaptProductNodes(productNodes),
      aggLayers: layerValues.agg_layers,
      orgLayers: layerValues.org_layers,
      skillIndex,
    };
  }, [productNodes, layerValues, skillIndex]);

  /**
   * 已下线 sid 集合（与 DataAclPage / MobileDataAclPage 同口径）。
   * 用于组列表 / 组详情中"共享 Skill 数"展示位的过滤——下线 sid 不计数，
   * 但仍保留在 template 数据本身（编辑表单、保存载荷不受影响）。
   */
  const unavailableSkillIds = useUnavailableSkillIds(skillIndex);

  // 产品 ID → 显示名（用于行展开详情）
  const productNameById = useMemo(() => {
    const m = new Map<string, string>();
    const collect = (nodes: ProductNode[]) => {
      nodes.forEach((n) => {
        m.set(n.id, n.name || n.id);
        if (n.children?.length) collect(n.children);
      });
    };
    collect(productTreeData.productNodes);
    return m;
  }, [productTreeData]);

  // ── 操作（仅保留删除组：chip bar 上的「删除分组」按钮入口） ──

  const handleDeleteGroup = async () => {
    if (!activeGroup) return;
    const memberCount = activeGroup.memberCount ?? activeGroup.members.length;
    if (!confirm(
      `确定删除分组「${activeGroup.name}」？该组当前有 ${memberCount} 位成员，删除后组模板将被移除（成员的个人权限不受影响）。此操作不可撤销。`,
    )) return;
    const env = await deleteGroup(activeGroup.groupId).catch((e) => {
      console.error('[DataAclGroupsTab] deleteGroup failed', e);
      return { success: false, error: e instanceof Error ? e.message : '删除失败' };
    });
    if (!env.success) {
      toast.error(('error' in env && env.error) || '删除分组失败');
      return;
    }
    toast.success(`分组「${activeGroup.name}」已删除`);
    setActiveGroupId(null);
    setExpandedGroupId(null);
    await reload();
    // 通知父组件刷新 users（删组本身不改个人权限，但保持父子状态一致）。
    await onMembersChanged?.();
  };

  return (
    <div className={styles.tab}>
      {error && <Notice tone="danger" title="加载失败">{error}</Notice>}

      {/* ── 顶部 chips（参考 mockup：Active Group: …chips… + 末尾 + 新建分组） ── */}
      <div className={styles.chipsBar}>
        <span className={styles.chipsLabel}>Active Group:</span>
        <div className={styles.chipsScroll}>
          {loading ? (
            <span className={styles.muted}>加载中...</span>
          ) : groups.length === 0 ? (
            <span className={styles.muted}>暂无用户组，点击右侧「+ 新建分组」开始</span>
          ) : (
            groups.map((g) => {
              const active = activeGroupId === g.groupId;
              return (
                <button
                  key={g.groupId}
                  type="button"
                  className={`${styles.chip} ${active ? styles.chipActive : ''}`}
                  onClick={() => {
                    if (active) {
                      // 再次点击当前激活组 → 取消激活（与 mockup 中 × 行为一致）
                      setActiveGroupId(null);
                    } else {
                      setActiveGroupId(g.groupId);
                    }
                  }}
                  title={active ? '点击取消选中' : `切换到「${g.name}」`}
                >
                  {active && <span className={styles.chipCheck} aria-hidden>✓</span>}
                  <span>{g.name}</span>
                  <span className={styles.chipBadge}>{g.memberCount}</span>
                </button>
              );
            })
          )}
        </div>
        <button
          type="button"
          className={`${styles.chip} ${styles.chipNew}`}
          onClick={() => setGroupDialog({ mode: 'create' })}
          disabled={ro}
          title={ro ? '只读角色无法新建组' : '新建分组'}
        >
          + 新建分组
        </button>
        <button
          type="button"
          className={`${styles.chip} ${styles.chipDelete}`}
          onClick={() => void handleDeleteGroup()}
          disabled={ro || !activeGroup}
          title={
            ro
              ? '只读角色无法删除组'
              : !activeGroup
                ? '请先选中要删除的分组'
                : `删除分组「${activeGroup.name}」`
          }
        >
          删除分组
        </button>
      </div>

      {/* ── 组列表表格（5 列：组名 / 描述 / 成员 / 共享权限 / 操作 —— 复用用户绑定页面同款 PermissionSummaryButton） ── */}
      {groups.length > 0 && (
        <div className={styles.groupsListCanvas}>
          <table className={styles.groupsTable}>
            <thead>
              <tr>
                <th className={styles.gColName}>组名</th>
                <th className={styles.gColDesc}>描述</th>
                <th className={styles.gColMembers}>成员</th>
                <th className={styles.gColCounts}>共享权限</th>
                <th className={styles.gColActions}>操作</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const tpl = g.template;
                // 「产品」数量与「最终生效叶子」数量保持一致（用户要求）：
                // 把 product_ids 向下展开成 leaf 集合再计数，避免按钮上显示
                // class 节点数（例如 12）但展开后只看到 9 个 leaf 的不一致体验。
                const productCount = computeEffectiveLeafIds(
                  tpl.product_ids || [],
                  productTreeData.productNodes,
                ).length;
                // 与列表 badge 同口径：已下线 sid 不计入 Skill 数量
                const skillCount = visibleSkillCount(tpl.skills, unavailableSkillIds);
                const rowCount = (tpl.row_scopes || []).length;
                const memberCount = g.memberCount ?? (g.members || []).length;
                const isActive = activeGroupId === g.groupId;
                const isExpanded = expandedGroupId === g.groupId;
                const toggleExpand = () => setExpandedGroupId(isExpanded ? null : g.groupId);
                return (
                  <Fragment key={g.groupId}>
                    <tr
                      className={`${styles.groupRow} ${isActive ? styles.groupRowActive : ''} ${isExpanded ? styles.groupRowExpanded : ''}`}
                    >
                      {/* 组名列：仅名字（点击 = 切换选中态，用于「删除分组」按钮） */}
                      <td className={styles.gColName}>
                        <button
                          type="button"
                          className={styles.groupNameBtn}
                          onClick={() => setActiveGroupId(isActive ? null : g.groupId)}
                          title={isActive ? '取消选中' : `选中分组「${g.name}」（用于「删除分组」按钮）`}
                        >
                          <span className={styles.groupNameText}>{g.name}</span>
                        </button>
                      </td>
                      {/* 描述列：独立成列（与组名解耦），空描述显示为 "—" */}
                      <td className={styles.gColDesc}>
                        {g.description
                          ? <span className={styles.gDescText} title={g.description}>{g.description}</span>
                          : <span className={styles.muted}>—</span>}
                      </td>
                      {/* 成员列：复用 PermissionSummaryButton（与共享权限同款视觉），单击展开看名单 */}
                      <td className={styles.gColMembers}>
                        <div className={styles.singleSummaryWrap}>
                          <PermissionSummaryButton
                            label="成员"
                            count={memberCount}
                            muted={memberCount === 0}
                            onClick={toggleExpand}
                            title={isExpanded ? '点击收起详情' : `成员 ${memberCount} 人（点击查看名单）`}
                          />
                        </div>
                      </td>
                      {/* 共享权限列：复用 PermissionSummaryButton（与「用户绑定」表完全一致的视觉 + 跨行列对齐）。
                          点击 = 展开/收起本行详情区，展示产品节点 / Skills / 行权限明细（GroupDetailInline）。 */}
                      <td className={styles.gColCounts}>
                        <PermissionSummaryGroup>
                          <PermissionSummaryButton
                            label="产品"
                            count={productCount}
                            muted={productCount === 0}
                            onClick={toggleExpand}
                            title={isExpanded ? '点击收起共享权限明细' : `产品 ${productCount}（点击展开明细）`}
                          />
                          <PermissionSummaryButton
                            label="Skill"
                            count={skillCount}
                            muted={skillCount === 0}
                            onClick={toggleExpand}
                            title={isExpanded ? '点击收起共享权限明细' : `Skill ${skillCount}（点击展开明细）`}
                          />
                          <PermissionSummaryButton
                            label="行"
                            count={rowCount}
                            muted={rowCount === 0}
                            onClick={toggleExpand}
                            title={isExpanded ? '点击收起共享权限明细' : `行权限 ${rowCount}（点击展开明细）`}
                          />
                        </PermissionSummaryGroup>
                      </td>
                      <td className={styles.gColActions}>
                        <div className={styles.opsRow}>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => setGroupDialog({ mode: 'edit', groupId: g.groupId })}
                            disabled={ro}
                            title={ro ? '只读角色无法编辑组' : `编辑组「${g.name}」（成员 + 共享权限）`}
                          >
                            编辑组
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className={styles.groupDetailRow}>
                        <td colSpan={5} className={styles.groupDetailCell}>
                          <GroupDetailInline
                            group={g}
                            productNameById={productNameById}
                            productNodes={productTreeData.productNodes}
                            skillIndex={skillIndex}
                            onClickMember={openUserBinding}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 新建/编辑组弹窗：组名描述 + 共享权限编辑 + 成员选择 */}
      {groupDialog && (
        <GroupEditDialog
          mode={groupDialog.mode}
          existing={
            groupDialog.mode === 'edit'
              ? groups.find((g) => g.groupId === groupDialog.groupId) ?? null
              : null
          }
          users={users}
          productTreeData={productTreeData}
          skillIndex={skillIndex}
          readonly={ro}
          onClose={() => setGroupDialog(null)}
          onSaved={(savedGroup) => {
            setGroupDialog(null);
            setActiveGroupId(savedGroup.groupId);
            // 同时刷新自身组列表 + 父组件 users（后端 update_group 在 template
            // 变更时会对全体成员同步并集写入个人权限，这里必须触发父级重拉
            // users，否则「权限配置」chip 不会反映最新数据）。
            void reload();
            void onMembersChanged?.();
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   GroupDetailInline — 组列表行展开详情（只读）
   --------------------------------------------------------------
   触发：表格行的「成员数」徽章 / 「共享权限」chip 单击 → 该组下方插入此行。
   内容：
     · 成员名单（avatar + loginName，点击 → 打开个人 Modal 查看个人权限）
     · 权限明细：产品 ids（解析为名称）/ Skills / 行权限（按 skill→table→column→values 折叠展示）
   编辑：所有"添加/移除/修改"集中到本行的「编辑组」按钮 → GroupEditDialog。
   ============================================================ */
interface GroupDetailInlineProps {
  group: UserGroup;
  productNameById: Map<string, string>;
  /** 产品树（已 adapt 成 { id, name, parentId }），用于按层级去重 chip。 */
  productNodes: ProductNode[];
  skillIndex: SkillIndexEntry[];
  onClickMember: (login: string) => void;
}

function GroupDetailInline({ group, productNameById, productNodes, skillIndex, onClickMember }: GroupDetailInlineProps) {
  const tpl = group.template;
  // 与「用户绑定 → 直接配置的产品节点」保持一致的展示口径：
  // 自底向上「满覆盖上卷」—— 当 class 下所有 leaf 都被选中则折叠成 class，
  // 当 agg 下所有 class 都被覆盖则再折叠成 agg；其余情况展示选中的最低层级。
  // 形式化：effective(id) = selected.has(id) || (有子节点 且 每个子都 effective)；
  //        展示集 = { id | effective(id) 且 (无父 或 父非 effective) }。
  // 树里查不到的脏 id 走"无父"分支会原样保留 → 渲染时通过 productNameById
  // 兜底为 id 文案。
  // ── 上卷后展示节点（产品 chip 区，与「用户绑定 → 直接配置的产品节点」口径一致） ──
  const productItems = useMemo(() => {
    const ids = tpl.product_ids || [];
    if (ids.length === 0) return [] as { id: string; name: string }[];
    const selected = new Set(ids);
    const byId = new Map(productNodes.map((n) => [n.id, n]));
    const childrenMap: Record<string, string[]> = {};
    for (const n of productNodes) {
      if (n.parentId) (childrenMap[n.parentId] = childrenMap[n.parentId] || []).push(n.id);
    }
    const memo = new Map<string, boolean>();
    const isEffective = (id: string): boolean => {
      const cached = memo.get(id);
      if (cached !== undefined) return cached;
      if (selected.has(id)) { memo.set(id, true); return true; }
      const kids = childrenMap[id];
      if (!kids || kids.length === 0) { memo.set(id, false); return false; }
      let all = true;
      for (const c of kids) {
        if (!isEffective(c)) { all = false; break; }
      }
      memo.set(id, all);
      return all;
    };
    // 候选 = selected ∪ 各 selected 节点的祖先链（这些祖先才有可能被上卷出来）。
    const candidates = new Set<string>(selected);
    for (const id of selected) {
      let cur = byId.get(id);
      while (cur && cur.parentId) {
        candidates.add(cur.parentId);
        cur = byId.get(cur.parentId);
      }
    }
    const kept: string[] = [];
    for (const id of candidates) {
      if (!isEffective(id)) continue;
      const parentId = byId.get(id)?.parentId;
      if (!parentId || !isEffective(parentId)) kept.push(id);
    }
    return kept.map((id) => ({ id, name: productNameById.get(id) || id }));
  }, [tpl.product_ids, productNodes, productNameById]);

  // ── 最终生效叶子（与「用户绑定 → 最终生效叶子」口径一致） ──
  // 复用模块级 computeEffectiveLeafIds，与「产品 N」按钮数量同源同口径。
  const effectiveLeafItems = useMemo(() => {
    return computeEffectiveLeafIds(tpl.product_ids || [], productNodes)
      .map((id) => ({ id, name: productNameById.get(id) || id }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  }, [tpl.product_ids, productNodes, productNameById]);
  const skillTableMap = useMemo(() => {
    const m = new Map<string, string>();
    skillIndex.forEach((s) => { m.set(s.skill, s.table || ''); });
    return m;
  }, [skillIndex]);
  // 下线 sid 集合：用于在 chip 上打"已下线"标记，与编辑面板"展示但不可选"语义一致。
  const unavailableSkillIds = useUnavailableSkillIds(skillIndex);

  return (
    <div className={styles.groupDetailInline}>
      {/* ── 成员区（跨满两列） ── */}
      <section className={`${styles.detailSection} ${styles.detailSectionFull}`}>
        <h4 className={styles.detailHeading}>
          成员
          <span className={styles.detailCount}>{group.members.length}</span>
        </h4>
        {group.members.length === 0 ? (
          <div className={styles.detailEmpty}>该组暂无成员，点击「编辑组」添加</div>
        ) : (
          <div className={styles.detailMemberGrid}>
            {group.members.map((login) => {
              return (
                <button
                  key={login}
                  type="button"
                  className={styles.detailMemberCard}
                  onClick={() => onClickMember(login)}
                  title={`查看 ${login} 的个人权限配置`}
                >
                  <span className={styles.detailMemberLogin}>{login}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 共享权限：产品（左列） ── */}
      <section className={styles.detailSection}>
        <h4 className={styles.detailHeading}>
          产品
          <span className={styles.detailCount}>{productItems.length}</span>
        </h4>
        {productItems.length === 0 ? (
          <div className={styles.detailEmpty}>未授权任何产品</div>
        ) : (
          <div className={styles.detailChipWrap}>
            {productItems.map((p) => (
              <span key={p.id} className={styles.detailChip} title={p.id}>{p.name}</span>
            ))}
          </div>
        )}
      </section>

      {/* ── 共享权限：Skills（右列） ──
          已下线 sid（skillIndex.status==='unavailable'）不计入数量、不展示 chip：
          运行时不参与校验，列表里又看不到，留着只会误导管理员。
          清理入口走「编辑分组」（编辑面板里仍能看到完整 template 与禁选态）。 */}
      <section className={styles.detailSection}>
        {(() => {
          const displaySkills = visibleSkills(tpl.skills, unavailableSkillIds);
          return (
            <>
              <h4 className={styles.detailHeading}>
                Skills
                <span className={styles.detailCount}>{displaySkills.length}</span>
              </h4>
              {displaySkills.length === 0 ? (
                <div className={styles.detailEmpty}>未绑定任何 Skill</div>
              ) : (
                <div className={styles.detailChipWrap}>
                  {displaySkills.map((s) => (
                    <span
                      key={s}
                      className={styles.detailChip}
                      title={skillTableMap.get(s) ? `表：${skillTableMap.get(s)}` : s}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </>
          );
        })()}
      </section>

      {/* ── 最终生效叶子（跨满两列）：把 product_ids 向下展开成 leaf 集合 ──
           展示真正被授权的最低粒度产品；与「用户绑定 → 最终生效叶子」口径对齐。 */}
      <section className={`${styles.detailSection} ${styles.detailSectionFull}`}>
        <h4 className={styles.detailHeading}>
          最终生效叶子
          <span className={styles.detailCount}>{effectiveLeafItems.length}</span>
        </h4>
        {effectiveLeafItems.length === 0 ? (
          <div className={styles.detailEmpty}>无生效产品叶子</div>
        ) : (
          <div className={styles.detailChipWrap}>
            {effectiveLeafItems.map((p) => (
              <span key={p.id} className={styles.detailChip} title={p.id}>{p.name}</span>
            ))}
          </div>
        )}
      </section>

      {/* ── 共享权限：行权限（跨满两列） ── */}
      <section className={`${styles.detailSection} ${styles.detailSectionFull}`}>
        <h4 className={styles.detailHeading}>
          行权限
          <span className={styles.detailCount}>{(tpl.row_scopes || []).length}</span>
        </h4>
        {(tpl.row_scopes || []).length === 0 ? (
          <div className={styles.detailEmpty}>未配置行权限（默认全表可查）</div>
        ) : (
          <ul className={styles.detailRowScopeList}>
            {(tpl.row_scopes || []).map((scope) => {
              const key = `${scope.skill_id}|${scope.source || 'mysql'}|${scope.schema || ''}|${scope.table}`;
              return (
                <li key={key} className={styles.detailRowScopeItem}>
                  <div className={styles.detailRowScopeHead}>
                    <code className={styles.detailRowScopeTable}>{scope.table}</code>
                    <span className={styles.detailRowScopeMeta}>
                      Skill: {scope.skill_id}
                      {scope.source && scope.source !== 'mysql' ? ` · ${scope.source}` : ''}
                    </span>
                  </div>
                  {(scope.columns || []).length === 0 ? (
                    <div className={styles.detailRowScopeEmpty}>未限定列范围</div>
                  ) : (
                    <ul className={styles.detailRowScopeColumns}>
                      {(scope.columns || []).map((col) => (
                        <li key={col.column}>
                          <code>{col.column}</code>
                          <span className={styles.detailChipWrap}>
                            {(col.values || []).slice(0, 12).map((v) => (
                              <span key={v} className={styles.detailChipSm}>{v}</span>
                            ))}
                            {(col.values || []).length > 12 && (
                              <span className={styles.detailChipSm}>+{(col.values || []).length - 12}</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ============================================================
   GroupEditDialog — 新建 / 编辑用户组（弹窗式，统一动线）
   --------------------------------------------------------------
   动线：组名 + 描述 → 共享权限（PermissionTree + RowScopePanel）→ 成员
   - mode='create'：调 createGroup（携带 template + members 一次写入；
                    members 非空时后端自动并集写入个人权限）
   - mode='edit'  ：调 updateGroup；新增成员同样会触发并集写入。
   ============================================================ */
interface GroupEditDialogProps {
  mode: 'create' | 'edit';
  existing: UserGroup | null;
  users: DataAclUserRaw[];
  productTreeData: PermissionTreeData;
  skillIndex: SkillIndexEntry[];
  readonly: boolean;
  onClose: () => void;
  onSaved: (group: UserGroup) => void;
}

function GroupEditDialog(props: GroupEditDialogProps) {
  const { mode, existing, users, productTreeData, skillIndex, readonly: ro, onClose, onSaved } = props;
  const toast = useToast();

  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [tpl, setTpl] = useState<PermissionTreeValue>(
    existing
      ? templateToTreeValue(existing.template)
      : { product_ids: [], agg_layers: [], org_layers: [], skills: [], row_scopes: [] },
  );
  const [members, setMembers] = useState<string[]>(existing?.members ?? []);
  const [memberSearch, setMemberSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const memberSet = useMemo(() => new Set(members), [members]);

  // ── 批量分隔符解析：中英文逗号 ,， / 分号 ;； / 顿号 、 / 空格类（含全角 \u3000） / 换行 / 制表 ──
  // 用户场景：从 Excel/聊天/邮件粘贴一串 loginName，期望直接批量加入组（而不是逐个点选）。
  const SEP_RE = /[,，;；、\s\u3000]+/;
  const parseTokens = (s: string): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of s.split(SEP_RE)) {
      const t = raw.trim();
      if (!t) continue;
      const lc = t.toLowerCase();
      if (seen.has(lc)) continue;
      seen.add(lc);
      out.push(t);
    }
    return out;
  };
  const tokens = useMemo(() => parseTokens(memberSearch), [memberSearch]);
  const isBulkMode = tokens.length >= 2;

  // 单 token 模式：维持原"过滤候选下拉"行为
  const userOptions = useMemo(() => {
    if (isBulkMode) return [];
    const kw = memberSearch.trim().toLowerCase();
    return users
      .map((u) => ({ login: uname(u), role: u.role || 'user' }))
      .filter((u) => u.login)
      .filter((u) => !kw || `${u.login} ${u.role}`.toLowerCase().includes(kw))
      .sort((a, b) => a.login.localeCompare(b.login));
  }, [users, memberSearch, isBulkMode]);

  // 批量预览：把 tokens 与全集 loginName 做大小写不敏感精确匹配，分类成 matched / unknown / dup（已在组内）
  const bulkPreview = useMemo(() => {
    if (!isBulkMode) return null;
    const loginByLc = new Map<string, string>();
    users.forEach((u) => {
      const ln = uname(u);
      if (ln) loginByLc.set(ln.toLowerCase(), ln);
    });
    const matched: string[] = [];
    const dup: string[] = [];
    const unknown: string[] = [];
    tokens.forEach((t) => {
      const real = loginByLc.get(t.toLowerCase());
      if (!real) unknown.push(t);
      else if (memberSet.has(real)) dup.push(real);
      else matched.push(real);
    });
    return { matched, dup, unknown };
  }, [isBulkMode, tokens, users, memberSet]);

  const handleBulkAdd = () => {
    if (!bulkPreview) return;
    const { matched, dup, unknown } = bulkPreview;
    if (matched.length === 0) {
      toast.error(unknown.length > 0 ? `没有匹配的用户：${unknown.slice(0, 5).join('、')}${unknown.length > 5 ? ` 等 ${unknown.length} 个` : ''}` : '所有用户已在组内');
      return;
    }
    setMembers((prev) => Array.from(new Set([...prev, ...matched])).sort());
    setMemberSearch('');
    const parts = [`已加入 ${matched.length} 位`];
    if (dup.length > 0) parts.push(`跳过 ${dup.length} 位已在组内`);
    if (unknown.length > 0) parts.push(`未找到 ${unknown.length} 位（${unknown.slice(0, 3).join('、')}${unknown.length > 3 ? '…' : ''}）`);
    toast.success(parts.join('；'));
  };

  const toggleMember = (login: string) => {
    setMembers((prev) => prev.includes(login) ? prev.filter((x) => x !== login) : [...prev, login].sort());
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) { toast.error('请填写组名'); return; }
    setSubmitting(true);
    const payload = {
      name: trimmedName,
      description: description.trim(),
      members,
      template: {
        product_ids: tpl.product_ids,
        agg_layers: tpl.agg_layers,
        org_layers: tpl.org_layers,
        skills: tpl.skills,
        row_scopes: tpl.row_scopes,
      },
    };
    const env = mode === 'create'
      ? await createGroup(payload).catch((e) => {
          console.error('[GroupEditDialog] createGroup failed', e);
          return { success: false, error: e instanceof Error ? e.message : '创建失败' };
        })
      : await updateGroup(existing!.groupId, payload).catch((e) => {
          console.error('[GroupEditDialog] updateGroup failed', e);
          return { success: false, error: e instanceof Error ? e.message : '保存失败' };
        });
    setSubmitting(false);
    if (!env.success || !('data' in env)) {
      toast.error(('error' in env && env.error) || (mode === 'create' ? '创建组失败' : '保存组失败'));
      return;
    }
    const saved = env.data as UserGroup;
    toast.success(mode === 'create' ? `组「${saved.name}」已创建` : `组「${saved.name}」已保存`);
    onSaved(saved);
  };

  const title = mode === 'create' ? '新建权限组' : `编辑权限组 · ${existing?.name ?? ''}`;

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      width={1080}
      meta={
        <span className={styles.muted}>
          组名 → 共享权限 → 成员；保存后新增成员的「个人权限」会取与组共享权限的并集。
        </span>
      }
    >
      <div className={styles.dialogStack}>
        {/* Step 1: 组名 + 描述 */}
        <section className={styles.dialogSection}>
          <h4 className={styles.dialogSectionTitle}>1. 组名与描述</h4>
          <div className={styles.dialogFormRow}>
            <input
              className={styles.input}
              placeholder="组名（必填）"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={ro || submitting}
            />
            <input
              className={styles.input}
              placeholder="描述（可选）"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={ro || submitting}
            />
          </div>
        </section>

        {/* Step 2: 共享权限编辑 */}
        <section className={styles.dialogSection}>
          <h4 className={styles.dialogSectionTitle}>2. 共享权限（组内成员动态继承）</h4>
          <div className={styles.dialogTreeBox}>
            <PermissionTree
              data={productTreeData}
              value={tpl}
              onChange={setTpl}
              readOnly={ro || submitting}
              rowScopeEditor={(
                <>
                  {tpl.skills.length === 0 && (
                    <Notice tone="warning" title="先选择 Skill">
                      行权限必须绑定到 Skill 声明表。请先在上方 Skill 区域选择至少一个 Skill。
                    </Notice>
                  )}
                  <DataAclRowScopePanel
                    readonly={ro || submitting || tpl.skills.length === 0}
                    skillIndex={skillIndex}
                    selectedSkills={new Set(tpl.skills)}
                    rowScopes={tpl.row_scopes}
                    onChange={(next) => setTpl({ ...tpl, row_scopes: next })}
                    toast={toast}
                  />
                </>
              )}
            />
          </div>
        </section>

        {/* Step 3: 成员选择 */}
        <section className={styles.dialogSection}>
          <h4 className={styles.dialogSectionTitle}>
            3. 成员（{members.length} 人）
          </h4>
          {members.length > 0 && (
            <div className={styles.dialogChipList}>
              {members.map((login) => (
                <button
                  key={login}
                  type="button"
                  className={styles.dialogChipSelected}
                  onClick={() => toggleMember(login)}
                  disabled={ro || submitting}
                  title="点击移除"
                >
                  {login} ×
                </button>
              ))}
            </div>
          )}
          {/* 单 token 模式 → 过滤下拉；多 token 模式（粘贴多个 loginName，
              用 ,，;；、 / 空格 / 换行 / 全角空格分隔）→ 出现「批量加入 N 项」按钮 + Enter 触发 */}
          <div className={styles.bulkSearchRow}>
            <input
              className={styles.input}
              placeholder="搜索用户 loginName 或 role；支持批量粘贴（用逗号、分号、顿号或空格分隔）"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isBulkMode) {
                  e.preventDefault();
                  handleBulkAdd();
                }
              }}
              disabled={ro || submitting}
            />
            {isBulkMode && bulkPreview && (
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleBulkAdd}
                disabled={ro || submitting || bulkPreview.matched.length === 0}
                title={
                  `匹配 ${bulkPreview.matched.length} 位`
                  + (bulkPreview.dup.length ? ` / 已在组 ${bulkPreview.dup.length}` : '')
                  + (bulkPreview.unknown.length ? ` / 未找到 ${bulkPreview.unknown.length}` : '')
                }
              >
                批量加入 {bulkPreview.matched.length} 项
              </button>
            )}
          </div>
          {isBulkMode && bulkPreview && (
            <div className={styles.bulkHint}>
              <span className={styles.muted}>
                解析 {tokens.length} 个 token：
                {bulkPreview.matched.length > 0 && <> 待加入 <strong>{bulkPreview.matched.length}</strong></>}
                {bulkPreview.dup.length > 0 && <>，已在组内 <strong>{bulkPreview.dup.length}</strong></>}
                {bulkPreview.unknown.length > 0 && (
                  <>
                    ，未找到 <strong>{bulkPreview.unknown.length}</strong>（
                    {bulkPreview.unknown.slice(0, 5).join('、')}
                    {bulkPreview.unknown.length > 5 ? '…' : ''}
                    ）
                  </>
                )}
              </span>
            </div>
          )}
          {!isBulkMode && (
            <div className={styles.dialogMemberList}>
              {userOptions.length === 0 ? (
                <div className={styles.dialogEmpty}>无匹配用户</div>
              ) : userOptions.map((u) => {
                const checked = memberSet.has(u.login);
                return (
                  <label key={u.login} className={styles.dialogMemberRow}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMember(u.login)}
                      disabled={ro || submitting}
                    />
                    <span className={styles.dialogMemberLogin}>{u.login}</span>
                    <span className={styles.dialogMemberRole}>{u.role}</span>
                  </label>
                );
              })}
            </div>
          )}
        </section>

        {/* Footer：「取消」+「创建组/保存修改」复用同页「模拟 intent / 模拟 query」样式
            （透明底 + 主色描边/文字，hover 时浅蓝填充）。 */}
        <footer className={styles.dialogFooter}>
          <button type="button" className={styles.dialogBtnGhost} onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button
            type="button"
            className={styles.dialogBtnGhost}
            onClick={() => void handleSubmit()}
            disabled={ro || submitting || !name.trim()}
          >
            {submitting ? '保存中...' : (mode === 'create' ? '创建组' : '保存修改')}
          </button>
        </footer>
      </div>
    </Modal>
  );
}
