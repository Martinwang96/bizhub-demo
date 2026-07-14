import type { SseEvent } from '../types/sse';

export async function openChatStream(params: {
  sessionId: string;
  message?: string;
  /** 重新对话：被点击 assistant 的展示下标；存在时 body 带 regenerate_index 而不带 message */
  regenerateIndex?: number;
  /**
   * 改写模式：'detailed' | 'concise'。
   * 走 message 路径（message 为改写指令文本），额外带 refine_mode 让后端打 _refine 标记。
   * 改写仍走正常 chat 管线（while 循环 + tools + skill），由 LLM 自行判断是否需要查数据库。
   */
  refineMode?: 'detailed' | 'concise';
  visualize?: boolean;
  signal?: AbortSignal;
}): Promise<ReadableStream<Uint8Array>> {
  const payload: Record<string, unknown> =
    params.regenerateIndex !== undefined
      ? { regenerate_index: params.regenerateIndex }
      : { message: params.message ?? '' };
  if (params.refineMode !== undefined) payload.refine_mode = params.refineMode;
  if (params.visualize !== undefined) payload.visualize = params.visualize;

  const res = await fetch(
    `/api/sessions/${encodeURIComponent(params.sessionId)}/chat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify(payload),
      signal: params.signal,
    },
  );

  if (!res.ok || !res.body) {
    throw new Error(`请求失败: HTTP ${res.status}`);
  }

  return res.body;
}

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const block of parts) {
        const trimmed = block.trim();
        if (!trimmed) continue;

        let eventType = 'message';
        let eventData = '';

        for (const line of trimmed.split('\n')) {
          if (line.startsWith('event: ')) eventType = line.slice(7).trim();
          else if (line.startsWith('data: ')) eventData = line.slice(6);
        }

        if (!eventData) continue;

        try {
          const parsed = JSON.parse(eventData) as Record<string, unknown>;
          yield { event: eventType as SseEvent['event'], data: parsed };
        } catch (_) {}
      }
    }
  } finally {
    try { reader.cancel(); } catch (_) {}
  }
}
