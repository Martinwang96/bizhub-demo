import { getJson, putJson, del } from '@shared/api/httpClient';

export interface PermissionUser {
  loginName: string;
  bizRole: string;
  skillHubRoles: string[];
  adminConsoleRole: string;
  dataAclMode: string;
  isEnvAdmin: boolean;
  addedBy?: string;
}

export interface PermissionsSummary {
  total: number;
  bizHub: { admin: number; manager: number; user: number };
  skillHub: { approval: number; user: number };
  adminConsole: { admin: number; readonly: number };
  envAdminCount: number;
}

export interface PermissionsSnapshot {
  users: PermissionUser[];
  summary: PermissionsSummary;
}

export interface PermissionPatch {
  bizRole?: string;
  skillHubRoles?: string[];
  adminConsoleRole?: string;
}

export interface BatchPermissionRequest extends PermissionPatch {
  loginNames: string[];
}

export interface BatchPermissionItemError {
  loginName: string;
  error?: string;
  reason?: string;
  code?: string;
}

export interface BatchPermissionResult {
  updated: PermissionUser[];
  failed: BatchPermissionItemError[];
  skipped: BatchPermissionItemError[];
  counts: { requested: number; updated: number; failed: number; skipped: number };
}

export function fetchPermissions() {
  return getJson<PermissionsSnapshot>('/admin/api/page-permissions');
}

export function savePermission(loginName: string, body: Required<PermissionPatch>) {
  return putJson<unknown>(
    `/admin/api/page-permissions/${encodeURIComponent(loginName)}`,
    body,
  );
}

export function savePermissionsBatch(body: BatchPermissionRequest) {
  return putJson<BatchPermissionResult>('/admin/api/page-permissions/batch', body);
}

export function deletePermission(loginName: string) {
  return del<unknown>(`/admin/api/page-permissions/${encodeURIComponent(loginName)}`);
}
