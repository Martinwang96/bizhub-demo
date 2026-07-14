import { getJson, postJson, patchJson, del } from '@shared/api/httpClient';
import type { Me, SystemInfo } from '@shared/types/user';
import type { Session, Message } from '../types/session';

export function fetchCurrentUser() {
  return getJson<Me>('/api/me');
}

export function fetchInfo() {
  return getJson<SystemInfo>('/api/info');
}

export function listSessions() {
  return getJson<Session[]>('/api/sessions');
}

export function createSession() {
  return postJson<Session>('/api/sessions');
}

export function fetchSessionDetail(sid: string) {
  return getJson<{ sessionId: string; title?: string; messages: Message[] }>(
    `/api/sessions/${encodeURIComponent(sid)}`,
  );
}

export function deleteSession(sid: string) {
  return del<void>(`/api/sessions/${encodeURIComponent(sid)}`);
}

/**
 * 置顶 / 取消置顶会话。
 * - `pinnedAt > 0` 表示置顶（一般传当前 unix 秒），`0` 表示取消置顶。
 * - 后端按 `pinnedAt` 做「常用对话」分组与组内排序。
 */
export function pinSession(sid: string, pinnedAt: number) {
  return patchJson<Session>(`/api/sessions/${encodeURIComponent(sid)}`, {
    pinnedAt,
  });
}

/** 幂等，吞错误 */
export async function abortSession(sid: string): Promise<void> {
  try {
    await postJson<void>(`/api/sessions/${encodeURIComponent(sid)}/abort`);
  } catch (_) {}
}

export function createShare(
  sid: string,
  messageIndices: number[] | null,
  chartStyleOverridesById?: Record<string, unknown>,
) {
  return postJson<{ url: string }>(
    `/api/sessions/${encodeURIComponent(sid)}/shares`,
    {
      message_indices: messageIndices,
      chart_style_overrides_by_id: chartStyleOverridesById ?? {},
    },
  );
}

export interface ShareImportResult {
  sessionId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  url: string;
}

/**
 * 将分享快照导入为当前用户的新会话。
 * - 受 `/api/*` ACL 拦截：未授权返回 401/403，调用方应跳到主站让 AclDenied 接管。
 * - 成功后由调用方整页跳转 `data.url`，主聊天应用 bootstrap 时会自动刷新侧栏。
 */
export function importShare(token: string) {
  return postJson<ShareImportResult>('/api/share-imports', { token });
}
