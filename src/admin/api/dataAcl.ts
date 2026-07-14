import { del, getJson, postJson, putJson } from '@shared/api/httpClient';

export interface RowScopeColumn {
  column: string;
  values: string[];
}

export interface RowScopeBinding {
  skill_id: string;
  source: string;
  schema?: string;
  table: string;
  enabled?: boolean;
  columns: RowScopeColumn[];
}

export interface DataAclUser {
  loginName: string;
  productIds: string[];
  skills: string[];
  businessRoles: string[];
  /** v2.8：按聚合层订阅授权（产品聚合维度） */
  aggLayers?: string[];
  /** v2.8：按组织架构层订阅授权 */
  orgLayers?: string[];
  /** v3.1：用户级行权限配置 */
  rowScopes?: RowScopeBinding[];
}

/**
 * v2.8：当前 active 下两个层级维度的全部取值。
 * 供 DataAclPage 概览展示与 UserEditPage 多选下拉数据源使用。
 */
export interface LayerValues {
  agg_layers: string[];
  org_layers: string[];
}

export interface ProductNode {
  id: string;
  name: string;
  parentId?: string;
  children?: ProductNode[];
}

export interface AuditEntry {
  action: string;
  user: string;
  result: string;
  reasonCode: string;
  policyVersion?: string;
  details?: Record<string, unknown>;
  ts: number;
}

export function fetchActive() {
  return getJson<Record<string, unknown>>('/admin/api/data-acl/active');
}

/**
 * v2.8：获取当前 active 的产品聚合层 / 组织架构层全量取值。
 * 后端实现见 ``data_acl/routes.py`` 的 GET ``/layer-values``。
 */
export function fetchLayerValues() {
  return getJson<LayerValues>('/admin/api/data-acl/layer-values');
}

export function validateConfig(config: unknown) {
  return postJson<{ valid: boolean; issues: string[] }>(
    '/admin/api/data-acl/validate',
    { config },
  );
}

export function listHistory() {
  return getJson<unknown[]>('/admin/api/data-acl/history');
}

export function publishConfig(config: unknown) {
  return postJson<Record<string, unknown>>('/admin/api/data-acl/publish', { config });
}

export function rollbackConfig(version: string) {
  return postJson<Record<string, unknown>>('/admin/api/data-acl/rollback', { version });
}

export function listCandidates() {
  return getJson<unknown[]>('/admin/api/data-acl/candidates');
}

/**
 * Skill 表索引返回结构。
 *
 * - 上线 skill：每张表一条，``table`` 非空，``status="active"``。
 * - 下线 skill：仅一条占位行（``table=""``、``status="unavailable"``），
 *   用于让前端「展示但不可选」该 sid（PermissionTree / 移动端绑定 Sheet）。
 *   行权限消费方（DataAclRowScopePanel / authorizedTables）需按 ``table != ''`` 过滤。
 */
export interface SkillTableIndexEntry {
  table: string;
  skill: string;
  datasource: string;
  brief: string;
  status?: 'active' | 'unavailable';
}

export function fetchSkillTableIndex() {
  return getJson<SkillTableIndexEntry[]>('/admin/api/data-acl/tables/skill-index');
}

export interface ListUsersParams {
  /** 仅返回属于该权限组的用户（后端按 GroupStore._member_index 反向索引过滤）。 */
  groupId?: string;
}

export function listUsers(params?: ListUsersParams) {
  const qs = new URLSearchParams();
  if (params?.groupId) qs.set('group_id', params.groupId);
  const q = qs.toString();
  return getJson<DataAclUser[]>(
    `/admin/api/data-acl/users${q ? '?' + q : ''}`,
  );
}

export interface ValidateLoginsResp {
  valid: string[];
  invalid: string[];
  counts: { requested: number; deduped: number; valid: number; invalid: number };
}

/**
 * 批量校验登录名是否在 ACL 白名单中。
 * 输入将经过 trim、去重、长度上限（500 条）保护。
 */
export function validateLogins(logins: string[]) {
  return postJson<ValidateLoginsResp>('/admin/api/data-acl/users/_validate', {
    logins,
  });
}

export interface UserBindingsPatch {
  product_ids?: string[];
  skills?: string[];
  business_roles?: string[];
  /** v2.8：按聚合层授权；缺省（undefined）表示不更新该字段；空数组表示清空 */
  agg_layers?: string[];
  /** v2.8：按组织架构层授权；缺省/空数组语义同 agg_layers */
  org_layers?: string[];
  /** v3.1：用户级行权限配置；缺省表示不更新 */
  row_scopes?: RowScopeBinding[];
}

export interface BatchUserBindingsRequest {
  loginNames: string[];
  patch: UserBindingsPatch;
}

export interface BatchUserBindingsItemError {
  loginName: string;
  error?: string;
  reason?: string;
  code?: string;
}

export interface BatchUserBindingsResult {
  updated: DataAclUser[];
  failed: BatchUserBindingsItemError[];
  skipped: BatchUserBindingsItemError[];
  counts: { requested: number; updated: number; failed: number; skipped: number };
}

export function updateUserBindings(
  loginName: string,
  body: Required<Pick<UserBindingsPatch, 'product_ids' | 'skills'>> & UserBindingsPatch,
) {
  return putJson<unknown>(
    `/admin/api/data-acl/users/${encodeURIComponent(loginName)}/bindings`,
    body,
  );
}

export function updateUserBindingsBatch(body: BatchUserBindingsRequest) {
  return putJson<BatchUserBindingsResult>('/admin/api/data-acl/users/batch/bindings', body);
}

export function updateProducts(nodes: unknown[]) {
  return putJson<Record<string, unknown>>('/admin/api/data-acl/products', { nodes });
}

export function fetchUserRowScopes(loginName: string) {
  return getJson<{ row_scopes: RowScopeBinding[]; summary: unknown[] }>(
    `/admin/api/data-acl/users/${encodeURIComponent(loginName)}/row-scopes`,
  );
}

export function updateUserRowScopes(loginName: string, rowScopes: RowScopeBinding[]) {
  return putJson<unknown>(
    `/admin/api/data-acl/users/${encodeURIComponent(loginName)}/row-scopes`,
    { row_scopes: rowScopes },
  );
}

export function simulateIntent(question: string, loginName: string) {
  return postJson<Record<string, unknown>>('/admin/api/data-acl/simulate/intent', {
    question,
    login_name: loginName,
  });
}

export function simulateQuery(sql: string, loginName: string, extra?: Record<string, unknown>) {
  return postJson<Record<string, unknown>>('/admin/api/data-acl/simulate/query', {
    sql,
    login_name: loginName,
    ...(extra || {}),
  });
}

export function queryAudit(params: {
  user?: string;
  action?: string;
  reason_code?: string;
  since?: number;
  until?: number;
  cursor?: number;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  });
  const q = qs.toString();
  return getJson<{ items: AuditEntry[]; total: number }>(
    `/admin/api/data-acl/audit${q ? '?' + q : ''}`,
  );
}

// Discovery APIs
export function discoverySources() {
  return getJson<unknown[]>('/admin/api/data-acl/discovery/sources');
}

export function discoveryTables(source = 'mysql', schema = '') {
  const qs = new URLSearchParams({ source });
  if (schema) qs.set('schema', schema);
  return getJson<unknown[]>(`/admin/api/data-acl/discovery/tables?${qs}`);
}

export function discoveryColumns(table: string, source = 'mysql', schema = '') {
  const qs = new URLSearchParams({ source });
  if (schema) qs.set('schema', schema);
  return getJson<unknown[]>(
    `/admin/api/data-acl/discovery/tables/${encodeURIComponent(table)}/columns?${qs}`,
  );
}

export interface DiscoveryColumn {
  name: string;
  type: string;
  nullable: boolean;
  suggested_for_scope?: boolean;
}

export interface DiscoveryEnumValue {
  value: string;
  row_count: number;
}

export interface DiscoveryPartition {
  applied?: boolean;
  column?: string;
  latest?: string;
}

export interface DiscoveryLatestPartition {
  table: string;
  partition_column: string;
  latest: string;
  ok: boolean;
  warning?: string;
}

export function discoveryLatestPartition(body: {
  table: string;
  partition_column: string;
  schema?: string;
}) {
  return postJson<DiscoveryLatestPartition>(
    '/admin/api/data-acl/discovery/latest-partition',
    body,
  );
}

export function discoveryEnumValues(body: {
  table: string;
  column: string;
  schema?: string;
  filters?: unknown[];
  partition_column?: string;
  partition_value?: string;
}) {
  return postJson<{
    table: string;
    column: string;
    values: DiscoveryEnumValue[];
    truncated?: boolean;
    partition?: DiscoveryPartition;
    warnings?: string[];
  }>(
    '/admin/api/data-acl/discovery/enum-values',
    body,
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// v3.2：用户组 / 权限申请 / 模板复制
//
// 字段命名约定：
// - 模板四维度字段沿用 snake_case（与 UserBindingsPatch / DataAclUser 保持一致），
//   方便前端在「个人配置 / 组模板 / 申请模板」之间直接互相赋值。
// - 元字段（id/loginName/createdAt 等）使用 camelCase，与 DataAclUser 一致。
// ──────────────────────────────────────────────────────────────────────────────

/** 数据权限模板（仅四维度，不含页面权限）。复用于用户/组/申请三处。 */
export interface DataAclTemplate {
  product_ids: string[];
  agg_layers: string[];
  org_layers: string[];
  skills: string[];
  row_scopes: RowScopeBinding[];
}

export interface UserGroup {
  groupId: string;
  name: string;
  description: string;
  members: string[];
  memberCount: number;
  template: DataAclTemplate;
  updatedBy: string;
  updatedAt: number;
}

/** TemplateCopyPicker 拉模板时的统一返回。 */
export interface TemplateSnapshot {
  source: 'user' | 'group';
  loginName?: string;
  groupId?: string;
  name?: string;
  template: DataAclTemplate;
}

// ── 用户组 ────────────────────────────────────────────────────────────────────

export function listGroups() {
  return getJson<UserGroup[]>('/admin/api/data-acl/groups');
}

export function getGroup(groupId: string) {
  return getJson<UserGroup>(
    `/admin/api/data-acl/groups/${encodeURIComponent(groupId)}`,
  );
}

export function fetchGroupTemplate(groupId: string) {
  return getJson<TemplateSnapshot>(
    `/admin/api/data-acl/groups/${encodeURIComponent(groupId)}/template`,
  );
}

export interface CreateGroupRequest {
  name: string;
  description?: string;
  members?: string[];
  template?: Partial<DataAclTemplate>;
  /** 可选：指定 groupId（默认后端自动生成）。 */
  groupId?: string;
}

export function createGroup(body: CreateGroupRequest) {
  return postJson<UserGroup>('/admin/api/data-acl/groups', body);
}

export interface UpdateGroupRequest {
  name?: string;
  description?: string;
  members?: string[];
  template?: Partial<DataAclTemplate>;
}

export function updateGroup(groupId: string, body: UpdateGroupRequest) {
  return putJson<UserGroup>(
    `/admin/api/data-acl/groups/${encodeURIComponent(groupId)}`,
    body,
  );
}

export function deleteGroup(groupId: string) {
  return del<{ groupId: string }>(
    `/admin/api/data-acl/groups/${encodeURIComponent(groupId)}`,
  );
}

export function addGroupMembers(groupId: string, members: string[]) {
  return postJson<UserGroup>(
    `/admin/api/data-acl/groups/${encodeURIComponent(groupId)}/members`,
    { members },
  );
}

export function removeGroupMember(groupId: string, loginName: string) {
  return del<UserGroup>(
    `/admin/api/data-acl/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(loginName)}`,
  );
}

export interface ApplyGroupTemplateResult {
  groupId: string;
  updated: DataAclUser[];
  failed: { loginName: string; error: string }[];
  counts: { updated: number; failed: number };
}

/**
 * @deprecated 组模板现在只做动态继承，不再写入成员个人权限。
 * 后端会返回 GROUP_TEMPLATE_DYNAMIC_ONLY。
 */
export function applyGroupTemplate(groupId: string) {
  return postJson<ApplyGroupTemplateResult>(
    `/admin/api/data-acl/groups/${encodeURIComponent(groupId)}/apply-template`,
  );
}

// ── 模板复制（参考用户）──────────────────────────────────────────────────────

export function fetchUserTemplate(loginName: string) {
  return getJson<TemplateSnapshot>(
    `/admin/api/data-acl/users/${encodeURIComponent(loginName)}/template`,
  );
}


