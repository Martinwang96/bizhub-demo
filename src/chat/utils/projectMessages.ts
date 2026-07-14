/**
 * 前端版的展示消息投影。
 *
 * 后端 `_project_display_messages`/`_project_to_display` 已经把原始 messages
 * 投影为「user + 含 _display 的 assistant」并通过 GET /api/sessions/{sid} 返回，
 * 因此前端 store 中的 messages 数组天然与后端展示索引空间对齐。
 *
 * 这里只做一层防御性过滤：
 *  - 仅保留 role 为 user/assistant
 *  - 跳过 content 为空字符串/undefined 的消息（无内容的中间轮）
 *
 * 返回值的索引（即数组下标）即为发往
 * `POST /api/sessions/{sid}/shares { message_indices }` 的 indices。
 */
import type { Message } from '../types/session';

export interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function projectToDisplay(msgs: Message[] | undefined | null): DisplayMessage[] {
  if (!Array.isArray(msgs)) return [];
  const out: DisplayMessage[] = [];
  for (const m of msgs) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const content = (m.content ?? '').trim();
    if (!content) continue;
    out.push({ role: m.role, content });
  }
  return out;
}

/**
 * 取「最后一轮」的 indices：从最后一条 user 起到末尾的所有展示消息。
 */
export function getLastTurnIndices(displayLen: number, msgs: DisplayMessage[]): number[] | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') {
      return Array.from({ length: displayLen - i }, (_, k) => i + k);
    }
  }
  return null;
}
