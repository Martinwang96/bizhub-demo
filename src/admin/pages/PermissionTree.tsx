/**
 * PermissionTree — 通用 N 级权限树（统一虚拟根）
 *
 * 一级根（按计划文档）：
 *   ├─ 产品（来自 active.product_nodes，天然 N 级）
 *   ├─ 层级
 *   │   ├─ 聚合层（agg_layers 多选）
 *   │   └─ 组织层（org_layers 多选）
 *   └─ Skill（直接平铺去重 skill_id，不再按 datasource 二级聚合）
 *
 * 行权限由外层 RowScopePanel 编辑；本组件接收 row_scopes 用于展示数量，
 * 并在产品 / 层级 / Skill 变更时原样透传。
 *
 * 复刻产业树勾选语义：
 *   - 父勾选 = 全选所有可见叶子
 *   - 子全选 → 父显示 checked；部分选 → 父显示 indeterminate
 *   - 点击 indeterminate 父 = 全部取消（与现有 UserBindingsModal 一致）
 *
 * 受控 API：
 *   value = { product_ids, agg_layers, org_layers, skills, row_scopes }
 *   onChange(next) → 仅在用户操作产生新 value 时触发。
 *   注意：取消 Skill 时会同步裁剪 value.row_scopes（仅保留仍授权的 skill_id），
 *   避免后端 ROW_SCOPE_INVALID 校验失败。其它字段变更不动 row_scopes。
 */
import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from 'tdesign-icons-react';
import { TriCheckbox, type TriState } from '@shared/components';
import { canToggleSkill } from '../utils/skillAvailability';
import type {
  DataAclTemplate,
  ProductNode,
  RowScopeBinding,
} from '../api/dataAcl';
import styles from './PermissionTree.module.css';

interface SkillIndexEntry {
  table: string;
  skill: string;
  datasource?: string;
  brief?: string;
  /**
   * 后端 v3.x 起回填：
   * - "active"：正常上线 skill 的真实表条目（``table`` 非空）；
   * - "unavailable"：下线 skill 的占位行（``table=""``），仅用于让前端
   *   展示该 sid（灰显 + 不可新增勾选）；行权限消费方需按 ``table != ''`` 过滤。
   * 老接口未返回该字段时按 "active" 处理（向后兼容）。
   */
  status?: 'active' | 'unavailable';
}

export interface PermissionTreeData {
  productNodes: ProductNode[];
  aggLayers: string[];
  orgLayers: string[];
  skillIndex: SkillIndexEntry[];
}

export interface PermissionTreeValue {
  product_ids: string[];
  agg_layers: string[];
  org_layers: string[];
  skills: string[];
  /** 仅展示用，不参与树编辑；保留以便 onChange 时原样返回。 */
  row_scopes: RowScopeBinding[];
}

export interface PermissionTreeProps {
  data: PermissionTreeData;
  value: PermissionTreeValue;
  onChange: (next: PermissionTreeValue) => void;
  readOnly?: boolean;
  rowScopeEditor?: ReactNode;
}

// 把任意 ProductNode（含 children 嵌套或 parent_id 平铺）规整为「平铺数组 + 父子关系」。
function flattenProductNodes(nodes: ProductNode[]): { all: Array<ProductNode & { parent_id?: string | null }>; childrenMap: Map<string, string[]> } {
  const all: Array<ProductNode & { parent_id?: string | null }> = [];
  const childrenMap = new Map<string, string[]>();
  const walk = (list: ProductNode[], parentId: string | null) => {
    list.forEach((n) => {
      const id = n.id;
      const merged = { ...n, parent_id: parentId } as ProductNode & { parent_id?: string | null };
      all.push(merged);
      if (parentId) {
        const arr = childrenMap.get(parentId) ?? [];
        arr.push(id);
        childrenMap.set(parentId, arr);
      }
      if (n.children && n.children.length > 0) walk(n.children, id);
    });
  };
  // 兼容两种结构：ProductNode 嵌套 children；或扁平含 parentId
  const hasChildren = nodes.some((n) => n.children && n.children.length > 0);
  if (hasChildren) {
    walk(nodes, null);
  } else {
    nodes.forEach((n) => {
      const parent = n.parentId ?? null;
      all.push({ ...n, parent_id: parent });
      if (parent) {
        const arr = childrenMap.get(parent) ?? [];
        arr.push(n.id);
        childrenMap.set(parent, arr);
      }
    });
  }
  return { all, childrenMap };
}

function expandSubtreeIds(childrenMap: Map<string, string[]>, rootId: string): string[] {
  const out: string[] = [rootId];
  const stack = [rootId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const kids = childrenMap.get(cur) ?? [];
    kids.forEach((k) => { out.push(k); stack.push(k); });
  }
  return out;
}

function computeProductTriState(
  childrenMap: Map<string, string[]>,
  selected: Set<string>,
  pid: string,
): TriState {
  const ids = expandSubtreeIds(childrenMap, pid);
  if (ids.every((i) => selected.has(i))) return 'checked';
  if (ids.some((i) => selected.has(i))) return 'indeterminate';
  return 'unchecked';
}

export function PermissionTree(props: PermissionTreeProps) {
  const { data, value, onChange, readOnly, rowScopeEditor } = props;
  const { all: flatNodes, childrenMap } = useMemo(
    () => flattenProductNodes(data.productNodes),
    [data.productNodes],
  );
  const rootIds = useMemo(
    () => flatNodes.filter((n) => !n.parent_id).map((n) => n.id),
    [flatNodes],
  );
  const productMap = useMemo(() => {
    const m = new Map<string, ProductNode & { parent_id?: string | null }>();
    flatNodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [flatNodes]);

  const productSelected = useMemo(() => new Set(value.product_ids), [value.product_ids]);

  // 各一级根折叠态
  // 注：四个一级根（产品 / 层级 / Skill / 行权限）默认全部收起，弹窗打开即为紧凑收拢态
  // （每行 chevron-right 图标 + 标题 + 计数徽章）；用户点击单个根头部或顶部「全部展开」可逐个 / 一键打开。
  const [expandedRoots, setExpandedRoots] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const toggleRoot = (key: string) => {
    setExpandedRoots((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const expandAll = () => {
    setExpandedRoots(new Set(['products', 'layers', 'skills', 'rows']));
    setCollapsedProducts(new Set());
  };

  // 产品节点折叠态
  // 默认：除一级根外，所有 depth ≥ 1 的节点都加入折叠集合；
  // 用户主动展开「产品」一级根后，第一层只展开到 agg 节点（如「音视频 PaaS」），
  // class（实时互动 / 媒体处理）及更深 leaf 仍保持 ▸ 收起，需逐级手动 ▸ 展开。
  const [collapsedProducts, setCollapsedProducts] = useState<Set<string>>(() => {
    const s = new Set<string>();
    flatNodes.forEach((n) => {
      if (n.parent_id) s.add(n.id);
    });
    return s;
  });
  const toggleProductCollapse = (pid: string) => {
    setCollapsedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid); else next.add(pid);
      return next;
    });
  };

  // ── helpers：触发 onChange 时保留 row_scopes ──
  const updateProducts = (next: Set<string>) => {
    onChange({ ...value, product_ids: Array.from(next).sort() });
  };
  const updateAggLayers = (next: Set<string>) => {
    onChange({ ...value, agg_layers: Array.from(next).sort() });
  };
  const updateOrgLayers = (next: Set<string>) => {
    onChange({ ...value, org_layers: Array.from(next).sort() });
  };
  const updateSkills = (next: Set<string>) => {
    // 取消 Skill 时同步裁剪 row_scopes，仅保留仍授权的 skill_id；
    // 否则保存时后端 _validate_row_scopes_for_user 会按 skill_not_authorized 返回 400 ROW_SCOPE_INVALID。
    // 与移动端 MobileDataAclPage::toggleSkill（1632-1644）逻辑一致。
    const prunedRowScopes = value.row_scopes.filter((r) => next.has(r.skill_id));
    onChange({
      ...value,
      skills: Array.from(next).sort(),
      row_scopes: prunedRowScopes,
    });
  };

  // ── 产品节点渲染（递归） ──
  const renderProductNode = (pid: string, depth: number) => {
    const node = productMap.get(pid);
    if (!node) return null;
    const kids = childrenMap.get(pid) ?? [];
    const tri = computeProductTriState(childrenMap, productSelected, pid);
    const collapsed = collapsedProducts.has(pid);
    const onTri = (next: 'checked' | 'unchecked') => {
      if (readOnly) return;
      const subtree = expandSubtreeIds(childrenMap, pid);
      const merged = new Set(productSelected);
      if (next === 'checked') {
        subtree.forEach((s) => merged.add(s));
      } else {
        subtree.forEach((s) => merged.delete(s));
      }
      updateProducts(merged);
    };
    return (
      <div key={pid} className={styles.treeNode}>
        <div className={styles.treeRow} style={{ paddingLeft: depth * 16 }}>
          {kids.length > 0 ? (
            <button
              type="button"
              className={styles.collapseBtn}
              onClick={() => toggleProductCollapse(pid)}
              aria-label={collapsed ? '展开' : '收起'}
            >
              {collapsed
                ? <ChevronRightIcon fillColor="transparent" strokeColor="currentColor" strokeWidth={1.5} />
                : <ChevronDownIcon fillColor="transparent" strokeColor="currentColor" strokeWidth={1.5} />}
            </button>
          ) : <span className={styles.collapsePlaceholder} />}
          <TriCheckbox
            state={tri}
            onChange={onTri}
            disabled={readOnly}
            ariaLabel={`选择产品 ${node.name}`}
            indeterminateClickAs="unchecked"
          />
          <span className={styles.nodeName}>
            {node.name}
            <span className={styles.nodeId}>{pid}</span>
          </span>
        </div>
        {!collapsed && kids.length > 0 && (
          <div className={styles.treeChildren}>
            {kids.map((k) => renderProductNode(k, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // ── 层级（聚合层 + 组织层） ──
  const aggSet = useMemo(() => new Set(value.agg_layers), [value.agg_layers]);
  const orgSet = useMemo(() => new Set(value.org_layers), [value.org_layers]);
  const layersExpanded = expandedRoots.has('layers');

  // ── Skill ──
  // 设计：不再按 datasource（mysql/MYSQL 等"挂载引擎"）做二级分类，
  // 直接平铺成一个去重后的 skill 列表，避免引入额外一层框/标题，
  // 让"共享权限"区域更清爽（产品/层级/Skill/行 四个一级块）。
  //
  // 下线 skill 处理（与后端 _build_skill_table_index 占位行约定配合）：
  // - 后端为每个 status==unavailable 的 sid 追加一条 ``table=""`` 占位行；
  // - 前端聚合时按"是否存在 status=unavailable 的占位行"判定该 sid 已下线；
  // - tablesCount 仅统计真实表条目（``table != ''``），下线 sid 显示 0；
  // - 下线 sid 仍出现在列表里，但"已勾保留 / 未勾不可新增"（见下方 disabled 逻辑），
  //   与后端 _allowed_skill_ids 写路径校验闭环。
  const skillFlatList = useMemo(() => {
    const tableCount = new Map<string, number>();
    const unavailable = new Set<string>();
    const publicSkills = new Set<string>();
    data.skillIndex.forEach((e: any) => {
      if (e.status === 'unavailable') {
        unavailable.add(e.skill);
        if (e.access === 'public') publicSkills.add(e.skill);
        return; // 占位行不计入 tablesCount
      }
      if (!e.table) return; // 兜底：未声明 status 但 table 为空的异常行也不计
      tableCount.set(e.skill, (tableCount.get(e.skill) ?? 0) + 1);
      if ((e as any).access === 'public') publicSkills.add(e.skill);
    });
    // 合并所有出现过的 sid（含仅出现在占位行的下线 sid）
    const allSkills = new Set<string>([...tableCount.keys(), ...unavailable]);
    return Array.from(allSkills)
      .map((skill) => ({
        skill,
        tablesCount: tableCount.get(skill) ?? 0,
        unavailable: unavailable.has(skill),
        isPublic: publicSkills.has(skill),
      }))
      .sort((a, b) => a.skill.localeCompare(b.skill));
  }, [data.skillIndex]);
  const skillSelected = useMemo(() => new Set(value.skills), [value.skills]);
  const skillsExpanded = expandedRoots.has('skills');
  const toggleSkill = (skill: string, opts: { unavailable: boolean; checked: boolean }) => {
    // 「下线 sid 未勾不可新增 / 已勾仍可取消」单点逻辑收口在 canToggleSkill，
    // 与后端 _validate_skills_in_registry 写路径校验闭环。
    const action = canToggleSkill({
      isUnavailable: opts.unavailable,
      currentlyChecked: opts.checked,
      readOnly,
    });
    if (action === 'denied') return;
    const next = new Set(skillSelected);
    if (action === 'remove') next.delete(skill);
    else next.add(skill);
    updateSkills(next);
  };

  const productsExpanded = expandedRoots.has('products');
  const rowsExpanded = expandedRoots.has('rows');

  // 一级根 tri 计算（产品）
  const rootProductTri: TriState = useMemo(() => {
    if (rootIds.length === 0) return 'unchecked';
    const triList = rootIds.map((id) => computeProductTriState(childrenMap, productSelected, id));
    if (triList.every((t) => t === 'checked')) return 'checked';
    if (triList.some((t) => t !== 'unchecked')) return 'indeterminate';
    return 'unchecked';
  }, [rootIds, childrenMap, productSelected]);

  const onRootProductTri = (next: 'checked' | 'unchecked') => {
    if (readOnly) return;
    if (next === 'checked') {
      const allIds = new Set(productSelected);
      flatNodes.forEach((n) => allIds.add(n.id));
      updateProducts(allIds);
    } else {
      updateProducts(new Set());
    }
  };

  return (
    <div className={styles.tree}>
      <div className={styles.treeToolbar}>
        <span>权限配置</span>
        <button type="button" className={styles.toolbarBtn} onClick={expandAll}>全部展开</button>
      </div>
      {/* ── 产品 ── */}
      <div className={styles.rootBlock}>
        <div className={styles.rootHead}>
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={() => toggleRoot('products')}
            aria-label={productsExpanded ? '收起产品' : '展开产品'}
          >
            {productsExpanded
              ? <ChevronDownIcon fillColor="transparent" strokeColor="currentColor" strokeWidth={1.5} />
              : <ChevronRightIcon fillColor="transparent" strokeColor="currentColor" strokeWidth={1.5} />}
          </button>
          <TriCheckbox
            state={rootProductTri}
            onChange={onRootProductTri}
            disabled={readOnly || flatNodes.length === 0}
            ariaLabel="产品全选"
            indeterminateClickAs="unchecked"
          />
          <span className={styles.rootTitle}>产品</span>
          <span className={styles.rootCount}>
            {value.product_ids.length}/{flatNodes.length}
          </span>
        </div>
        {productsExpanded && (
          flatNodes.length === 0 ? (
            <div className={styles.empty}>产业树为空，请先在「产业树」Tab 中维护节点</div>
          ) : (
            <div className={styles.rootBody}>{rootIds.map((id) => renderProductNode(id, 0))}</div>
          )
        )}
      </div>

      {/* ── 层级 ── */}
      <div className={styles.rootBlock}>
        <div className={styles.rootHead}>
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={() => toggleRoot('layers')}
            aria-label={layersExpanded ? '收起层级' : '展开层级'}
          >
            {layersExpanded
              ? <ChevronDownIcon fillColor="transparent" strokeColor="currentColor" strokeWidth={1.5} />
              : <ChevronRightIcon fillColor="transparent" strokeColor="currentColor" strokeWidth={1.5} />}
          </button>
          <span className={styles.collapsePlaceholder} />
          <span className={styles.rootTitle}>层级</span>
          <span className={styles.rootCount}>
            {value.agg_layers.length + value.org_layers.length}/{data.aggLayers.length + data.orgLayers.length}
          </span>
        </div>
        {layersExpanded && (
          <div className={styles.rootBody}>
            <LayerGroup
              title="产品聚合层"
              options={data.aggLayers}
              selected={aggSet}
              readOnly={readOnly}
              onChange={(s) => updateAggLayers(s)}
            />
            <LayerGroup
              title="组织架构层"
              options={data.orgLayers}
              selected={orgSet}
              readOnly={readOnly}
              onChange={(s) => updateOrgLayers(s)}
            />
          </div>
        )}
      </div>

      {/* ── Skill ── */}
      <div className={styles.rootBlock}>
        <div className={styles.rootHead}>
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={() => toggleRoot('skills')}
            aria-label={skillsExpanded ? '收起 Skill' : '展开 Skill'}
          >
            {skillsExpanded
              ? <ChevronDownIcon fillColor="transparent" strokeColor="currentColor" strokeWidth={1.5} />
              : <ChevronRightIcon fillColor="transparent" strokeColor="currentColor" strokeWidth={1.5} />}
          </button>
          <span className={styles.collapsePlaceholder} />
          <span className={styles.rootTitle}>Skill</span>
          <span className={styles.rootCount}>
            {/*
             * 分母：去重后的 skill 总数（含已下线 sid）——下线后总数不会塌缩，
             * admin 直观看到"被禁用而非消失"。分子：value.skills.length，含
             * 残留下线 sid（admin 取消勾选后即时 -1，与「权限配置」徽标 Skill N 一致）。
             */}
            {value.skills.length}/{skillFlatList.length}
          </span>
        </div>
        {skillsExpanded && (
          skillFlatList.length === 0 ? (
            <div className={styles.empty}>暂无 Skill</div>
          ) : (
            <div className={styles.rootBody}>
              <div className={styles.skillList}>
                {skillFlatList.map(({ skill, tablesCount, unavailable, isPublic }) => {
                  const checked = skillSelected.has(skill);
                  // 下线 sid：仅当"已勾"时才允许交互（取消）；未勾时整行 disabled。
                  const interactionDisabled = readOnly || (unavailable && !checked);
                  return (
                    <label
                      key={skill}
                      className={`${styles.skillItem} ${checked ? styles.skillItemActive : ''} ${interactionDisabled ? styles.skillItemDisabled : ''}`}
                      title={unavailable ? (checked ? '该 Skill 已下线，可取消但不可重新勾选' : '该 Skill 已下线，暂不可勾选') : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSkill(skill, { unavailable, checked })}
                        disabled={interactionDisabled}
                        className={styles.hiddenInput}
                      />
                      <span className={styles.skillName}>
                        {skill}
                        {isPublic && <span className={styles.skillBadgePublic}>公共</span>}
                        {unavailable && <span className={styles.skillBadgeOff}>已下线</span>}
                      </span>
                      <span className={styles.skillMeta}>{tablesCount} 张表</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )
        )}
      </div>

      {/* ── 行权限 ── */}
      {rowScopeEditor && (
        <div className={styles.rootBlock}>
          <div className={styles.rootHead}>
            <button
              type="button"
              className={styles.collapseBtn}
              onClick={() => toggleRoot('rows')}
              aria-label={rowsExpanded ? '收起行权限' : '展开行权限'}
            >
              {rowsExpanded
                ? <ChevronDownIcon fillColor="transparent" strokeColor="currentColor" strokeWidth={1.5} />
                : <ChevronRightIcon fillColor="transparent" strokeColor="currentColor" strokeWidth={1.5} />}
            </button>
            <span className={styles.collapsePlaceholder} />
            <span className={styles.rootTitle}>行权限</span>
            <span className={styles.rootCount}>{value.row_scopes.length} 条规则</span>
          </div>
          {rowsExpanded && <div className={styles.rootBody}>{rowScopeEditor}</div>}
        </div>
      )}

    </div>
  );
}

// ── 内部子组件：层级多选块 ─────────────────────────────────────────────────
interface LayerGroupProps {
  title: string;
  options: string[];
  selected: Set<string>;
  readOnly?: boolean;
  onChange: (next: Set<string>) => void;
}
function LayerGroup({ title, options, selected, readOnly, onChange }: LayerGroupProps) {
  if (options.length === 0) {
    return (
      <div className={styles.layerBlock}>
        <div className={styles.layerTitle}>{title}</div>
        <div className={styles.emptySm}>无可选项</div>
      </div>
    );
  }
  const allChecked = options.every((o) => selected.has(o));
  const someChecked = options.some((o) => selected.has(o));
  const tri: TriState = allChecked ? 'checked' : someChecked ? 'indeterminate' : 'unchecked';
  const toggleAll = (next: 'checked' | 'unchecked') => {
    if (readOnly) return;
    const merged = new Set(selected);
    if (next === 'checked') options.forEach((o) => merged.add(o));
    else options.forEach((o) => merged.delete(o));
    onChange(merged);
  };
  const toggle = (opt: string) => {
    if (readOnly) return;
    const next = new Set(selected);
    if (next.has(opt)) next.delete(opt); else next.add(opt);
    onChange(next);
  };
  return (
    <div className={styles.layerBlock}>
      <div className={styles.layerHead}>
        <TriCheckbox state={tri} onChange={toggleAll} disabled={readOnly} ariaLabel={`${title} 全选`} indeterminateClickAs="unchecked" />
        <span className={styles.layerTitle}>{title}</span>
        <span className={styles.layerCount}>{options.filter((o) => selected.has(o)).length}/{options.length}</span>
      </div>
      <div className={styles.layerOptions}>
        {options.map((o) => (
          <label
            key={o}
            className={`${styles.layerChip} ${selected.has(o) ? styles.layerChipActive : ''} ${readOnly ? styles.layerChipDisabled : ''}`}
          >
            <input
              type="checkbox"
              checked={selected.has(o)}
              onChange={() => toggle(o)}
              disabled={readOnly}
              className={styles.hiddenInput}
            />
            {o}
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * 把一个 DataAclTemplate 转成 PermissionTreeValue（直接拷贝，row_scopes 原样保留）。
 */
export function templateToTreeValue(tpl: Partial<DataAclTemplate>): PermissionTreeValue {
  return {
    product_ids: [...(tpl.product_ids ?? [])],
    agg_layers: [...(tpl.agg_layers ?? [])],
    org_layers: [...(tpl.org_layers ?? [])],
    skills: [...(tpl.skills ?? [])],
    row_scopes: [...(tpl.row_scopes ?? [])],
  };
}

export default PermissionTree;
