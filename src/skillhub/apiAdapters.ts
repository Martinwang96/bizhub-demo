type RawRecord = Record<string, unknown>;

export interface SkillItem {
  skillId: string;
  owner?: string;
  slug: string;
  description?: string;
  status?: string;
  version?: string;
  updatedAt?: number;
  tables?: string[];
  downstream?: string[];
  source?: string;
  /** v3.3：访问级别。"public" = 系统自带公共 skill，对全体用户默认开放；
   *  "private" = 需 admin 授权。前端 Skill Hub 列表与 admin 权限面板据此
   *  展示「公共」标签。 */
  access?: string;
}

export interface ApprovalItem {
  requestId: string;
  skillId: string;
  submitter: string;
  mode: string;
  status: string;
  submittedAt: number;
  comment?: string;
}

export interface AuditLogItem {
  id: string;
  action: string;
  skillId?: string;
  operator: string;
  createdAt: number;
  detail?: string;
}

export interface VersionItem {
  version: string;
  publishedAt: number;
  publisher: string;
  current?: boolean;
}

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function arrayFrom(raw: unknown, key: string): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!isRecord(raw)) return [];
  const value = raw[key];
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function optionalString(value: unknown): string | undefined {
  const s = str(value);
  return s && s !== '-' ? s : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}

export function normalizeSkillsResponse(raw: unknown): SkillItem[] {
  return arrayFrom(raw, 'skills')
    .map((item) => {
      if (!isRecord(item)) return null;
      const owner = optionalString(item.owner);
      const slug = str(item.slug) || str(item.name);
      const skillId = str(item.skillId) || str(item.skill_id) || str(item.id) || (owner && slug ? `${owner}/${slug}` : slug);
      if (!skillId) return null;

      const normalized: SkillItem = {
        skillId,
        slug: slug || skillId.split('/').pop() || skillId,
      };
      if (owner) normalized.owner = owner;
      const description = optionalString(item.description);
      if (description) normalized.description = description;
      const status = optionalString(item.status);
      if (status) normalized.status = status;
      const version = optionalString(item.version);
      if (version) normalized.version = version;
      const updatedAt = num(item.updatedAt ?? item.updated_at ?? item.mtime);
      if (updatedAt !== undefined) normalized.updatedAt = updatedAt;
      const tables = stringArray(item.tables ?? item.table_names);
      if (tables) normalized.tables = tables;
      const downstream = stringArray(item.downstream ?? item.dependents ?? item.reverse_dependencies);
      if (downstream) normalized.downstream = downstream;
      const source = optionalString(item.source ?? item.root);
      if (source) normalized.source = source;
      const access = str(item.access);
      if (access) normalized.access = access;
      return normalized;
    })
    .filter((item): item is SkillItem => item !== null);
}

export function normalizeApprovalItemsResponse(raw: unknown): ApprovalItem[] {
  return arrayFrom(raw, 'items')
    .map((item) => {
      if (!isRecord(item)) return null;
      const requestId = str(item.requestId) || str(item.request_id) || str(item.id);
      const skillId = str(item.skillId) || str(item.skill_id);
      if (!requestId || !skillId) return null;

      const normalized: ApprovalItem = {
        requestId,
        skillId,
        submitter: str(item.submitter) || str(item.uploader) || str(item.user),
        mode: str(item.mode),
        status: str(item.status),
        submittedAt: num(item.submittedAt ?? item.submitted_at ?? item.created_at) ?? 0,
      };
      const comment = optionalString(item.comment ?? item.decision_reason);
      if (comment) normalized.comment = comment;
      return normalized;
    })
    .filter((item): item is ApprovalItem => item !== null);
}

export function normalizeAuditResponse(raw: unknown): AuditLogItem[] {
  return arrayFrom(raw, 'items')
    .map((item, index) => {
      if (!isRecord(item)) return null;
      const createdAt = num(item.createdAt ?? item.created_at ?? item.ts) ?? 0;
      const requestId = optionalString(item.requestId ?? item.request_id);
      const result = optionalString(item.result);
      const mode = optionalString(item.mode);
      const detail = [result && `结果: ${result}`, mode && `模式: ${mode}`, requestId && `请求: ${requestId}`]
        .filter(Boolean)
        .join(' · ');

      const normalized: AuditLogItem = {
        id: str(item.id) || requestId || `${createdAt}-${index}`,
        action: str(item.action),
        operator: str(item.operator) || str(item.user),
        createdAt,
      };
      const skillId = optionalString(item.skillId ?? item.skill_id);
      if (skillId) normalized.skillId = skillId;
      if (detail) normalized.detail = detail;
      return normalized;
    })
    .filter((item): item is AuditLogItem => item !== null);
}

export function normalizeVersionsResponse(raw: unknown): VersionItem[] {
  return arrayFrom(raw, 'versions')
    .map((item) => {
      if (!isRecord(item)) return null;
      const version = str(item.version);
      if (!version) return null;
      const normalized: VersionItem = {
        version,
        publishedAt: num(item.publishedAt ?? item.published_at ?? item.ts ?? item.mtime) ?? 0,
        publisher: str(item.publisher) || str(item.user) || str(item.uploader),
      };
      if (typeof item.current === 'boolean') normalized.current = item.current;
      return normalized;
    })
    .filter((item): item is VersionItem => item !== null);
}

export function skillApiBasePath(skillId: string): string {
  const [owner, ...slugParts] = skillId.split('/');
  if (slugParts.length === 0) return `/skill-hub/api/skills/_/${encodeURIComponent(skillId)}`;
  return `/skill-hub/api/skills/${encodeURIComponent(owner)}/${encodeURIComponent(slugParts.join('/'))}`;
}

export function skillApiBasePathFromSkill(skill: Pick<SkillItem, 'skillId' | 'owner' | 'slug'>): string {
  const owner = skill.owner || '_';
  return `/skill-hub/api/skills/${encodeURIComponent(owner)}/${encodeURIComponent(skill.slug)}`;
}

/**
 * 审批维度的 staging 原文 base path：
 *   GET {base}/files            → staging 文件列表
 *   GET {base}/files/raw?path=  → 单文件原文
 * 与 skillApiBasePathFromSkill 同层，request_id 统一 encodeURIComponent。
 */
export function approvalApiBasePath(requestId: string): string {
  return `/skill-hub/api/skills/approvals/${encodeURIComponent(requestId)}`;
}
