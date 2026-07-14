import { postJson, HttpError } from '@shared/api/httpClient';
import type { ChartPayload } from '../types/chart';

/**
 * 单条 assistant 消息按需重生成图表（同步 REST，非 SSE）。
 *
 * 后端三段式兜底：markdown 表格 → 该轮 query_db 原始 JSON → 整段历史最近 query_db。
 * 成功时后端已把新 chart 持久化到 session.messages[idx].charts，前端只需把响应中的
 * chart 追加到本地 store；ChatPage 已有"allChartMessages 变化时自动切到最新图"逻辑，
 * 前端无需手动驱动 setActiveChartId。
 *
 * @param sid          会话 id
 * @param messageIndex 前端展示索引（与 createShare 的 message_indices 同一空间）
 * @returns            新生成的 ChartPayload 列表
 * @throws  Error      失败时抛出，message 透传后端 error 文案
 */
export async function requestMessageVisualize(
  sid: string,
  messageIndex: number,
): Promise<ChartPayload[]> {
  const env = await postJson<{
    chart: ChartPayload;
    charts?: ChartPayload[];
    source: 'markdown' | 'cached_query_db' | 'history_query_db';
    messageIndex: number;
    chartsTotal: number;
  }>(
    `/api/sessions/${encodeURIComponent(sid)}/messages/${messageIndex}/visualize`,
  ).catch((e: unknown) => {
    if (e instanceof HttpError) {
      const body = e.body as { error?: string; message?: string } | undefined;
      const reason = body?.error || body?.message || `HTTP ${e.status}`;
      throw new Error(reason);
    }
    throw e;
  });

  if (!env.success || !env.data) {
    throw new Error(env.error || '生成图表失败');
  }
  return env.data.charts?.length ? env.data.charts : [env.data.chart];
}
