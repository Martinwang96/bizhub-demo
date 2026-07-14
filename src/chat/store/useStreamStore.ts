import { create } from 'zustand';
import type { StoreApi as ZustandStoreApi } from 'zustand';
import type { Step, TodoState } from '../types/session';
import { openChatStream, parseSseStream } from '../api/sse';
import { useSessionStore } from './useSessionStore';
import type { ReasoningEvent, ToolEvent, DoneEvent, ErrorEvent, ChartEvent } from '../types/sse';

export interface StreamCtx {
  loading: boolean;
  aborted: boolean;
  abortController?: AbortController;
  content: string;
  steps: Step[];
  liveThinking: { content: string; startAt: number } | null;
  liveTools: Record<string, { startAt: number; args?: Record<string, unknown> }>;
  todo: TodoState | null;
  processStart: number;
  error: string | null;
}

/** 改写指令模板：详细/简洁。指令文本作为 user 消息内容（带 _refine 标记，前端不渲染）。 */
const REFINE_INSTRUCTION: Record<'detailed' | 'concise', string> = {
  detailed: '请把上一条回答改写得更详细，保留原有口径与数据，补充更多分析细节与解读。',
  concise: '请将上一条回答精简，保留核心结论与关键数据，去除冗余表述。',
};

interface StreamStoreState {
  ctxs: Record<string, StreamCtx>;
  send: (sid: string, message: string, options?: { visualize?: boolean }) => Promise<void>;
  regenerate: (sid: string, messageIndex: number) => Promise<void>;
  /** 改写（详细/简洁）：保留旧回答，追加 user(带 _refine，不渲染) + 空 assistant，走正常 chat 管线 */
  refine: (sid: string, mode: 'detailed' | 'concise') => Promise<void>;
  abort: (sid: string) => Promise<void>;
  clear: (sid: string) => void;
}

function initCtx(): StreamCtx {
  return {
    loading: true,
    aborted: false,
    content: '',
    steps: [],
    liveThinking: null,
    liveTools: {},
    todo: null,
    processStart: Date.now(),
    error: null,
  };
}

/**
 * 把当前 ctx 已累积的直播内容（content / steps / 未完结的 liveThinking / liveTools）
 * 一次性"封板"写回 useSessionStore.messagesBySid 的最后一条 assistant，
 * 让 done 与 abort 两条收尾路径产生一致的可持久化展示状态。
 *
 * - thinking 未完结：补一条 type='thinking' 的 step，durationMs 取自 startAt。
 * - tool 未完结：补一条 type='tool' status='running' 的 step，保留 args/durationMs，
 *   与服务端中止落盘时（_display.steps 含 running 工具）的展示对齐。
 */
function commitCtxToMessage(
  sid: string,
  ctx: StreamCtx,
  status: 'ok' | 'aborted',
  contentOverride?: string,
): void {
  const now = Date.now();
  const extraSteps: Step[] = [];

  if (ctx.liveThinking) {
    extraSteps.push({
      type: 'thinking',
      content: ctx.liveThinking.content,
      durationMs: now - ctx.liveThinking.startAt,
    });
  }

  for (const [name, live] of Object.entries(ctx.liveTools)) {
    extraSteps.push({
      type: 'tool',
      name,
      args: live.args,
      durationMs: now - live.startAt,
      status: 'running',
    });
  }

  const finalSteps: Step[] = extraSteps.length ? [...ctx.steps, ...extraSteps] : ctx.steps;
  const finalContent = contentOverride ?? ctx.content;
  const totalDurationMs = now - ctx.processStart;

  useSessionStore.getState().updateLastAssistant(sid, {
    content: finalContent,
    steps: finalSteps,
    stepCount: finalSteps.length,
    totalDurationMs,
    status,
  });
}

export const useStreamStore = create<StreamStoreState>((set, get) => ({
  ctxs: {},

  clear(sid) {
    set((s) => {
      const next = { ...s.ctxs };
      delete next[sid];
      return { ctxs: next };
    });
  },

  async abort(sid) {
    const ctx = get().ctxs[sid];
    if (!ctx || !ctx.loading) return;

    // 1) 先停 fetch，阻断后续 SSE patch 的竞争写入
    ctx.abortController?.abort();

    // 2) 本地 flush：把已生成的内容固化到 messagesBySid，UI 立刻保留
    commitCtxToMessage(sid, ctx, 'aborted');

    // 3) 切换到非 live 渲染分支
    set((s) => ({
      ctxs: {
        ...s.ctxs,
        [sid]: {
          ...s.ctxs[sid],
          loading: false,
          aborted: true,
          liveThinking: null,
          liveTools: {},
        },
      },
    }));

    // 4) best-effort 通知后端；网络抖动不回滚本地状态
    try {
      await useSessionStore.getState().abortRemote(sid);
    } catch (_) {
      /* swallow: 后端可能已经收到关闭信号或已结束 */
    }
  },

  async send(sid, message, options) {
    const sessionStore = useSessionStore.getState();

    // 追加 user 消息
    sessionStore.appendMessage(sid, {
      role: 'user',
      content: message,
      time: Math.floor(Date.now() / 1000),
    });
    // 占位 assistant 消息
    sessionStore.appendMessage(sid, { role: 'assistant', content: '' });

    await runChatStream(sid, set, get, {
      sessionId: sid,
      message,
      visualize: options?.visualize,
    });
  },

  async regenerate(sid, messageIndex) {
    // 流式守卫：会话正在跑则忽略（连点拦截）
    if (get().ctxs[sid]?.loading) return;

    const sessionStore = useSessionStore.getState();
    const msgs = sessionStore.messagesBySid[sid] ?? [];
    if (messageIndex < 0 || messageIndex >= msgs.length) return;

    // 本地回溯该轮 user 展示下标
    let ui = -1;
    for (let i = Math.min(messageIndex, msgs.length - 1); i >= 0; i--) {
      if (msgs[i].role === 'user') { ui = i; break; }
    }
    if (ui === -1) return;

    // 砍掉该 user 之后的旧 assistant 及其后内容，再补一个空 assistant 占位
    sessionStore.truncateAfter(sid, ui);
    sessionStore.appendMessage(sid, { role: 'assistant', content: '' });

    // 以展示下标提交后端；done 后 ensureDetail(force) 以后端权威结果回灌
    await runChatStream(sid, set, get, {
      sessionId: sid,
      regenerateIndex: messageIndex,
    });
  },

  async refine(sid, mode) {
    // 流式守卫：会话正在跑则忽略（连点拦截）
    if (get().ctxs[sid]?.loading) return;

    const sessionStore = useSessionStore.getState();
    const msgs = sessionStore.messagesBySid[sid] ?? [];
    // 必须存在一条已结束的 assistant 才能改写（否则没有可改写的对象）
    const hasAssistant = msgs.some((m) => m.role === 'assistant' && (m.content ?? '').trim());
    if (!hasAssistant) return;

    // 清除目标版本组的激活锁定：新版本（即将追加的最后一条 assistant）应自动激活，
    // 流式过程必须可见。ownerUser = 最近一条非 _refine user（版本组归属者）。
    let ownerUser = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user' && !msgs[i]._refine) { ownerUser = i; break; }
    }
    if (ownerUser >= 0) sessionStore.clearActiveVersion(sid, ownerUser);

    const instruction = REFINE_INSTRUCTION[mode];

    // 追加 user 改写指令（带 _refine 标记，前端跳过渲染）+ 空 assistant 占位。
    // 不截断旧回答 —— 历史版本保留，由版本组翻页在原位切换显示。
    sessionStore.appendMessage(sid, {
      role: 'user',
      content: instruction,
      time: Math.floor(Date.now() / 1000),
      _refine: mode,
    });
    sessionStore.appendMessage(sid, { role: 'assistant', content: '' });

    await runChatStream(sid, set, get, {
      sessionId: sid,
      message: instruction,
      refineMode: mode,
    });
  },
}));

/**
 * 共享 SSE 流处理：建立 ctx → openChatStream → 消费 reasoning/delta/tool/todo/chart/done/error。
 * 被 send（首次提问）与 regenerate（重新对话）复用，事件处理逻辑完全一致。
 * 调用方需在调用前完成本地消息准备（追加 user + 空 assistant 占位 / 截断）。
 */
type StreamStoreApi = ZustandStoreApi<StreamStoreState>;

async function runChatStream(
  sid: string,
  set: StreamStoreApi['setState'],
  get: StreamStoreApi['getState'],
  openParams: {
    sessionId: string;
    message?: string;
    regenerateIndex?: number;
    refineMode?: 'detailed' | 'concise';
    visualize?: boolean;
  },
): Promise<void> {
  const sessionStore = useSessionStore.getState();

  const ac = new AbortController();
  const ctx: StreamCtx = { ...initCtx(), abortController: ac };

  set((s) => ({ ctxs: { ...s.ctxs, [sid]: ctx } }));

  const patch = (updater: (c: StreamCtx) => Partial<StreamCtx>) => {
    set((s) => {
      const c = s.ctxs[sid];
      if (!c) return s;
      return { ctxs: { ...s.ctxs, [sid]: { ...c, ...updater(c) } } };
    });
  };

  const commitThinking = () => {
    const c = get().ctxs[sid];
    if (!c?.liveThinking) return;
    const { content, startAt } = c.liveThinking;
    const durationMs = Date.now() - startAt;
    patch((cur) => ({
      steps: [...cur.steps, { type: 'thinking' as const, content, durationMs }],
      liveThinking: null,
    }));
  };

  try {
    const stream = await openChatStream({ ...openParams, signal: ac.signal });

    for await (const evt of parseSseStream(stream, ac.signal)) {
        if (ac.signal.aborted) break;

        if (evt.event === 'reasoning') {
          const d = evt.data as ReasoningEvent;
          if (d.status === 'start') {
            patch(() => ({ liveThinking: { content: '', startAt: Date.now() } }));
          } else if (d.status === 'delta') {
            patch((c) => {
              if (!c.liveThinking) return { liveThinking: { content: d.text ?? '', startAt: Date.now() } };
              return { liveThinking: { ...c.liveThinking, content: c.liveThinking.content + (d.text ?? '') } };
            });
          } else if (d.status === 'end') {
            commitThinking();
          }
        } else if (evt.event === 'delta') {
          const d = evt.data as { text: string };
          // 如果 reasoning 还在进行中则先提交
          const c = get().ctxs[sid];
          if (c?.liveThinking) commitThinking();
          patch((cur) => ({ content: cur.content + (d.text ?? '') }));
        } else if (evt.event === 'tool') {
          const d = evt.data as ToolEvent;
          if (d.status === 'running') {
            patch((c) => ({
              liveTools: {
                ...c.liveTools,
                [d.name]: { startAt: Date.now(), args: d.args },
              },
            }));
          } else {
            patch((c) => {
              const live = c.liveTools[d.name];
              const durationMs = live ? Date.now() - live.startAt : d.durationMs;
              const newTools = { ...c.liveTools };
              delete newTools[d.name];
              return {
                liveTools: newTools,
                steps: [
                  ...c.steps,
                  {
                    type: 'tool' as const,
                    name: d.name,
                    args: d.args ?? live?.args,
                    output: d.output,
                    durationMs,
                    status: d.status,
                  },
                ],
              };
            });
          }
        } else if (evt.event === 'todo') {
          patch(() => ({ todo: evt.data as TodoState }));
        } else if (evt.event === 'chart') {
          const d = evt.data as ChartEvent;
          if (d.chart) sessionStore.appendChartToLastAssistant(sid, d.chart);
        } else if (evt.event === 'done') {
          const d = evt.data as DoneEvent;
          const c = get().ctxs[sid];
          if (c?.liveThinking) commitThinking();
          const finalText = d.text ?? get().ctxs[sid]?.content ?? '';
          patch(() => ({ loading: false, content: finalText }));

          const finalCtx = get().ctxs[sid];
          if (finalCtx) {
            // 以服务端 done.text 为最终展示内容，避免中间工具轮的 SQL/草稿污染当前页面状态
            commitCtxToMessage(sid, finalCtx, d.aborted ? 'aborted' : 'ok', finalText);
          }

          if (d.title) {
            sessionStore.patchSession(sid, { title: d.title });
          }

          await sessionStore.refreshSessions();

          // 完成后延迟 ~800ms 强制重拉会话详情，把后端权威 _display.steps
          // （含中间轮 reasoning_text "展示推理过程" 条目）收纳进处理框。
          // - 仅在非 aborted 路径触发；abort 沿用本地 commit。
          // - silent 模式不进 loadingDetailSids，避免 UI 抖动；与 ProcessPanel
          //   done 后 800ms 自动折叠的节奏对齐。
          if (!d.aborted) {
            setTimeout(() => {
              void useSessionStore
                .getState()
                .ensureDetail(sid, { force: true, silent: true });
            }, 800);
          }
        } else if (evt.event === 'error') {
          const d = evt.data as ErrorEvent;
          patch(() => ({ error: d.error, loading: false }));
          sessionStore.updateLastAssistant(sid, { status: 'error' });
        }
      }
    } catch (e) {
      if (!ac.signal.aborted) {
        const msg = e instanceof Error ? e.message : '未知错误';
        patch(() => ({ error: msg, loading: false }));
        sessionStore.updateLastAssistant(sid, { status: 'error' });
      }
    } finally {
      patch((c) => ({ loading: false, abortController: c.abortController === ac ? undefined : c.abortController }));
    }
}
