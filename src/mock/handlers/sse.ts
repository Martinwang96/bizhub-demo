import type { MockRequest } from '../router';
import { pickScenario, type Scenario } from '../fixtures/scenarios';
import { appendMessages } from './chat';
import type { Message, Step } from '../../chat/types/session';

const enc = new TextEncoder();

function frame(event: string, data: unknown): Uint8Array {
  return enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

// 把正文按标点/换行切成打字机块
function chunkText(text: string, size = 12): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

function buildAssistantMessage(scenario: Scenario): Message {
  const steps: Step[] = scenario.tools.map((t) => ({
    type: 'tool',
    name: t.name,
    args: t.args,
    output: t.output,
    durationMs: t.durationMs,
    status: 'done',
  }));
  return {
    role: 'assistant',
    content: scenario.answer,
    reasoning: scenario.reasoning,
    steps,
    stepCount: steps.length,
    totalDurationMs: scenario.tools.reduce((s, t) => s + t.durationMs, 0),
    status: 'ok',
    time: Math.floor(Date.now() / 1000),
    charts: scenario.charts,
  };
}

export function handleChatStream(req: MockRequest): Response {
  const body = (req.body ?? {}) as { message?: string; regenerate_index?: number };
  const message = body.message ?? '';
  const scenario = pickScenario(message);
  const sid = req.params.id;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // 1) 推理过程
        controller.enqueue(frame('reasoning', { status: 'start' }));
        for (const c of chunkText(scenario.reasoning, 16)) {
          controller.enqueue(frame('reasoning', { status: 'delta', text: c }));
          await sleep(28);
        }
        controller.enqueue(frame('reasoning', { status: 'end' }));
        await sleep(120);

        // 2) 工具调用
        for (const tool of scenario.tools) {
          controller.enqueue(frame('tool', { name: tool.name, status: 'running', args: tool.args }));
          await sleep(Math.min(tool.durationMs, 700));
          controller.enqueue(
            frame('tool', {
              name: tool.name,
              status: 'done',
              args: tool.args,
              output: tool.output,
              durationMs: tool.durationMs,
            }),
          );
          await sleep(120);
        }

        // 3) 正文（打字机）
        for (const c of chunkText(scenario.answer, 10)) {
          controller.enqueue(frame('delta', { text: c }));
          await sleep(22);
        }

        // 4) 图表
        for (const chart of scenario.charts) {
          controller.enqueue(frame('chart', { chart }));
          await sleep(80);
        }

        // 5) 结束
        controller.enqueue(frame('done', { title: scenario.title, text: scenario.answer }));

        // 落库，保证刷新会话详情可见
        if (message) {
          appendMessages(sid, [
            { role: 'user', content: message, time: Math.floor(Date.now() / 1000) },
            buildAssistantMessage(scenario),
          ]);
        }
      } catch (e) {
        controller.enqueue(frame('error', { error: e instanceof Error ? e.message : 'demo error' }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
    },
  });
}
