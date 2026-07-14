import { create } from 'zustand';
import type { Me } from '@shared/types/user';
import type { Session, Message } from '../types/session';
import type { ChartPayload } from '../types/chart';
import {
  fetchCurrentUser,
  fetchInfo,
  listSessions,
  createSession,
  fetchSessionDetail,
  deleteSession as apiDeleteSession,
  abortSession as apiAbortSession,
  pinSession as apiPinSession,
} from '../api/sessions';
import { HttpError, isAclError } from '@shared/api/httpClient';

interface SessionStoreState {
  user: Me | null;
  authError: boolean;
  authorized: boolean;
  modelInfo: string;

  sessions: Session[];
  messagesBySid: Record<string, Message[]>;
  loadingDetailSids: Set<string>;

  shareEnabled: boolean;

  bootstrap: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  ensureDetail: (sid: string, options?: { force?: boolean; silent?: boolean }) => Promise<void>;
  removeSession: (sid: string) => Promise<void>;
  pinSession: (sid: string, pinned: boolean) => Promise<void>;
  newSession: () => Promise<Session | null>;
  patchSession: (sid: string, patch: Partial<Session>) => void;
  appendMessage: (sid: string, msg: Message) => void;
  truncateAfter: (sid: string, index: number) => void;
  updateLastAssistant: (sid: string, patch: Partial<Message>) => void;
  appendChartToLastAssistant: (sid: string, chart: ChartPayload) => void;
  appendChartToMessage: (sid: string, messageIndex: number, chart: ChartPayload) => void;
  abortRemote: (sid: string) => Promise<void>;
  /**
   * 版本组激活状态（覆盖式翻页）：
   *   key   = `${sid}::${ownerUserIndex}`（ownerUser 为该版本组所属的非 _refine user 展示下标）
   *   value = 当前激活显示的 assistant 展示下标
   * 未设置时默认激活该组最后一条 assistant（最新版本）。
   */
  activeVersionByGroup: Record<string, number>;
  setActiveVersion: (sid: string, ownerUserIndex: number, assistantIndex: number) => void;
  clearActiveVersion: (sid: string, ownerUserIndex: number) => void;
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  user: null,
  authError: false,
  authorized: true,
  modelInfo: '',
  sessions: [],
  messagesBySid: {},
  loadingDetailSids: new Set(),
  shareEnabled: false,
  activeVersionByGroup: {},

  async bootstrap() {
    try {
      const meEnv = await fetchCurrentUser();
      if (meEnv.success && meEnv.data) {
        const me = meEnv.data;
        set({ user: me, authorized: me.authorized !== false });
        if (me.authorized === false) return;
      }
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        set({ authError: true, authorized: false });
        return;
      }
      if (isAclError(e)) {
        set({ authorized: false });
        return;
      }
    }

    try {
      const infoEnv = await fetchInfo();
      if (infoEnv.success && infoEnv.data) {
        const d = infoEnv.data;
        set({
          modelInfo: `${d.provider} · ${d.model}`,
          shareEnabled: !!d.share_enabled,
        });
      }
    } catch (_) {}

    await get().refreshSessions();
  },

  async refreshSessions() {
    try {
      const env = await listSessions();
      if (env.success && env.data) {
        set({ sessions: env.data });
      }
    } catch (_) {}
  },

  async ensureDetail(sid, options) {
    const force = options?.force === true;
    const silent = options?.silent === true;
    const { messagesBySid, loadingDetailSids } = get();
    if (!force) {
      if (messagesBySid[sid] !== undefined) return;
      if (loadingDetailSids.has(sid)) return;
    }

    if (!silent) {
      set((s) => {
        const next = new Set(s.loadingDetailSids);
        next.add(sid);
        return { loadingDetailSids: next };
      });
    }

    try {
      const env = await fetchSessionDetail(sid);
      if (env.success && env.data) {
        const fresh = env.data.messages;
        set((s) => {
          const prev = s.messagesBySid[sid];
          // 非 force：首次加载，直接写入
          if (!force || !prev) {
            return { messagesBySid: { ...s.messagesBySid, [sid]: fresh } };
          }
          // force：覆盖写入，但对 assistant 消息做 charts 防御性兜底合并
          // —— 若服务端返回 charts 为空/缺失而本地存在，则保留本地 charts
          const merged: Message[] = fresh.map((nm, idx) => {
            if (nm.role !== 'assistant') return nm;
            const old = prev[idx];
            if (!old || old.role !== 'assistant') return nm;
            const newCharts = nm.charts;
            const oldCharts = old.charts;
            if ((!newCharts || newCharts.length === 0) && oldCharts && oldCharts.length > 0) {
              return { ...nm, charts: oldCharts };
            }
            return nm;
          });
          return { messagesBySid: { ...s.messagesBySid, [sid]: merged } };
        });
      }
    } catch (_) {
      // force 模式下失败不清空已有 messages，保留本地 commit 的展示
      if (!force) {
        set((s) => ({
          messagesBySid: { ...s.messagesBySid, [sid]: [] },
        }));
      }
    } finally {
      if (!silent) {
        set((s) => {
          const next = new Set(s.loadingDetailSids);
          next.delete(sid);
          return { loadingDetailSids: next };
        });
      }
    }
  },

  async removeSession(sid) {
    try { await apiDeleteSession(sid); } catch (_) {}
    set((s) => {
      const msgs = { ...s.messagesBySid };
      delete msgs[sid];
      return {
        sessions: s.sessions.filter((x) => x.sessionId !== sid),
        messagesBySid: msgs,
      };
    });
  },

  // 置顶 / 取消置顶：乐观更新本地 pinnedAt，再调后端持久化；失败回滚。
  async pinSession(sid, pinned) {
    const prev = get().sessions.find((x) => x.sessionId === sid)?.pinnedAt ?? 0;
    const next = pinned ? Math.floor(Date.now() / 1000) : 0;
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.sessionId === sid ? { ...x, pinnedAt: next } : x,
      ),
    }));
    try {
      const env = await apiPinSession(sid, next);
      // 以后端权威 pinnedAt 回填（避免本地秒与服务端秒细微偏差导致排序抖动）
      if (env.success && env.data) {
        const authoritative = env.data.pinnedAt ?? next;
        set((s) => ({
          sessions: s.sessions.map((x) =>
            x.sessionId === sid ? { ...x, pinnedAt: authoritative } : x,
          ),
        }));
      }
    } catch (_) {
      // 回滚
      set((s) => ({
        sessions: s.sessions.map((x) =>
          x.sessionId === sid ? { ...x, pinnedAt: prev } : x,
        ),
      }));
    }
  },

  async newSession() {
    try {
      const env = await createSession();
      if (env.success && env.data) {
        const s = env.data;
        set((state) => ({
          sessions: [s, ...state.sessions],
          messagesBySid: { ...state.messagesBySid, [s.sessionId]: [] },
        }));
        return s;
      }
    } catch (_) {}
    return null;
  },

  patchSession(sid, patch) {
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.sessionId === sid ? { ...x, ...patch } : x,
      ),
    }));
  },

  appendMessage(sid, msg) {
    set((s) => ({
      messagesBySid: {
        ...s.messagesBySid,
        [sid]: [...(s.messagesBySid[sid] ?? []), msg],
      },
    }));
  },

  // 重新对话：本地截断展示消息，保留 [0..index]（含 index），砍掉其后旧回复
  truncateAfter(sid, index) {
    set((s) => {
      const msgs = s.messagesBySid[sid];
      if (!msgs || index < 0 || index >= msgs.length) return s;
      return {
        messagesBySid: { ...s.messagesBySid, [sid]: msgs.slice(0, index + 1) },
      };
    });
  },

  updateLastAssistant(sid, patch) {
    set((s) => {
      const msgs = s.messagesBySid[sid];
      if (!msgs) return s;
      const idx = [...msgs].reverse().findIndex((m) => m.role === 'assistant');
      if (idx === -1) return s;
      const realIdx = msgs.length - 1 - idx;
      const updated = [...msgs];
      updated[realIdx] = { ...updated[realIdx], ...patch };
      return { messagesBySid: { ...s.messagesBySid, [sid]: updated } };
    });
  },

  appendChartToLastAssistant(sid, chart) {
    set((s) => {
      const msgs = s.messagesBySid[sid];
      if (!msgs) return s;
      const idx = [...msgs].reverse().findIndex((m) => m.role === 'assistant');
      if (idx === -1) return s;
      const realIdx = msgs.length - 1 - idx;
      const updated = [...msgs];
      const current = updated[realIdx];
      const charts = current.charts?.filter((item) => item.id !== chart.id) ?? [];
      updated[realIdx] = { ...current, charts: [...charts, chart] };
      return { messagesBySid: { ...s.messagesBySid, [sid]: updated } };
    });
  },

  appendChartToMessage(sid, messageIndex, chart) {
    set((s) => {
      const msgs = s.messagesBySid[sid];
      if (!msgs) return s;
      if (messageIndex < 0 || messageIndex >= msgs.length) return s;
      const target = msgs[messageIndex];
      if (!target || target.role !== 'assistant') return s;
      const charts = target.charts?.filter((item) => item.id !== chart.id) ?? [];
      const updated = [...msgs];
      updated[messageIndex] = { ...target, charts: [...charts, chart] };
      return { messagesBySid: { ...s.messagesBySid, [sid]: updated } };
    });
  },

  async abortRemote(sid) {
    await apiAbortSession(sid);
  },

  setActiveVersion(sid, ownerUserIndex, assistantIndex) {
    const key = `${sid}::${ownerUserIndex}`;
    set((s) => ({
      activeVersionByGroup: { ...s.activeVersionByGroup, [key]: assistantIndex },
    }));
  },

  clearActiveVersion(sid, ownerUserIndex) {
    const key = `${sid}::${ownerUserIndex}`;
    set((s) => {
      if (!(key in s.activeVersionByGroup)) return s;
      const next = { ...s.activeVersionByGroup };
      delete next[key];
      return { activeVersionByGroup: next };
    });
  },
}));
