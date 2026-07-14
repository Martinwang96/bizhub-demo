interface RawRecord {
  [key: string]: unknown;
}

export interface ValidationIssueView {
  level: string;
  message: string;
  code?: string;
}

export interface SkillFileView {
  path: string;
  size: number;
  role: string; // skill | reference | script
}

export interface ValidationResultView {
  skillId: string;
  status: 'ok' | 'error' | 'warning';
  issues: ValidationIssueView[];
  stagingId?: string;
  diff?: string;
  files?: SkillFileView[];
  scripts?: SkillFileView[];
}

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function issueLevel(issue: RawRecord): string {
  return str(issue.severity) || str(issue.level) || 'info';
}

function normalizeIssue(issue: unknown): ValidationIssueView | null {
  if (!isRecord(issue)) return null;
  const message = str(issue.message);
  if (!message) return null;
  const normalized: ValidationIssueView = {
    level: issueLevel(issue),
    message,
  };
  const code = str(issue.code);
  if (code) normalized.code = code;
  return normalized;
}

function stringifyDiff(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!isRecord(value) && !Array.isArray(value)) return undefined;
  const size = Array.isArray(value) ? value.length : Object.keys(value).length;
  if (size === 0) return undefined;
  return JSON.stringify(value, null, 2);
}

function normalizeFileItem(raw: unknown): SkillFileView | null {
  if (!isRecord(raw)) return null;
  const path = str(raw.path);
  if (!path) return null;
  return { path, size: num(raw.size), role: str(raw.role) || 'reference' };
}

export function normalizeUploadResponse(raw: unknown): ValidationResultView {
  const root = isRecord(raw) ? raw : {};
  const validation = isRecord(root.validation) ? root.validation : root;
  const rawIssues = Array.isArray(validation.issues) ? validation.issues : Array.isArray(root.issues) ? root.issues : [];
  const issues = rawIssues.map(normalizeIssue).filter((item): item is ValidationIssueView => item !== null);
  const stats = isRecord(validation.stats) ? validation.stats : {};
  const errors = num(stats.errors) || issues.filter((issue) => issue.level === 'error').length;
  const warnings = num(stats.warnings) || issues.filter((issue) => issue.level === 'warning').length;
  const status: ValidationResultView['status'] = errors > 0 || validation.ok === false
    ? 'error'
    : warnings > 0
      ? 'warning'
      : 'ok';

  const normalized: ValidationResultView = {
    skillId: str(root.skillId) || str(root.skill_id) || str(validation.skillId) || str(validation.skill_id),
    status,
    issues,
  };

  const stagingId = str(root.stagingId) || str(root.staging_id) || str(root.job_id);
  if (stagingId) normalized.stagingId = stagingId;
  const diff = stringifyDiff(root.diff);
  if (diff) normalized.diff = diff;

  const files = (Array.isArray(root.files) ? root.files : [])
    .map(normalizeFileItem)
    .filter((f): f is SkillFileView => f !== null);
  if (files.length) normalized.files = files;
  const scripts = (Array.isArray(root.scripts) ? root.scripts : [])
    .map(normalizeFileItem)
    .filter((f): f is SkillFileView => f !== null);
  if (scripts.length) normalized.scripts = scripts;

  return normalized;
}

export function getHttpErrorMessage(error: unknown, fallback = '操作失败'): string {
  if (isRecord(error)) {
    const body = isRecord(error.body) ? error.body : undefined;
    if (body) {
      const detail = body.detail;
      if (typeof detail === 'string' && detail) return detail;
      if (Array.isArray(detail) && detail.length > 0) return JSON.stringify(detail);
      const bodyMessage = str(body.message) || str(body.error);
      if (bodyMessage) return bodyMessage;
    }
    const message = str(error.message);
    if (message) return message;
  }
  return error instanceof Error ? error.message : fallback;
}
