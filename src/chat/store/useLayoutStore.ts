import { create } from 'zustand';
import type { ChartStyleOverrides } from '../types/chart';

const SPLIT_KEY = 'biz-hub:chart-split-ratio';
// 右侧栏（图表区/看板区）展开状态持久化，使关闭页面后重新打开能恢复上次的开合状态
const PANE_KEY = 'biz-hub:right-pane-open';

function readStoredSplit(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SPLIT_KEY);
    return raw ? JSON.parse(raw) as Record<string, number> : {};
  } catch (_) {
    return {};
  }
}

function saveStoredSplit(splitRatioBySid: Record<string, number>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SPLIT_KEY, JSON.stringify(splitRatioBySid));
}

function readStoredPanes(): { chart: Record<string, boolean>; report: Record<string, boolean> } {
  if (typeof window === 'undefined') return { chart: {}, report: {} };
  try {
    const raw = localStorage.getItem(PANE_KEY);
    if (!raw) return { chart: {}, report: {} };
    const parsed = JSON.parse(raw) as { chart?: Record<string, boolean>; report?: Record<string, boolean> };
    return { chart: parsed.chart ?? {}, report: parsed.report ?? {} };
  } catch (_) {
    return { chart: {}, report: {} };
  }
}

function saveStoredPanes(chart: Record<string, boolean>, report: Record<string, boolean>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PANE_KEY, JSON.stringify({ chart, report }));
  } catch (_) {
    /* ignore quota errors */
  }
}

const storedPanes = readStoredPanes();

interface LayoutStoreState {
  chartPaneOpenBySid: Record<string, boolean>;
  // 看板（report）右侧栏开关。与 chartPaneOpenBySid 互斥：同一时刻右侧栏只能
  // 展示图表或看板中的一种，二者的 open setter 会互相把对方置为 false。
  reportPaneOpenBySid: Record<string, boolean>;
  splitRatioBySid: Record<string, number>;
  chartStyleOverridesById: Record<string, ChartStyleOverrides>;
  autoCollapsedSidSet: Record<string, boolean>;
  activeChartIdBySid: Record<string, string | null>;
  setChartPaneOpen: (sid: string, open: boolean) => void;
  toggleChartPane: (sid: string) => void;
  setReportPaneOpen: (sid: string, open: boolean) => void;
  getSplitRatio: (sid: string) => number;
  setSplitRatio: (sid: string, ratio: number) => void;
  updateChartStyle: (chartId: string, patch: Partial<ChartStyleOverrides>) => void;
  markAutoCollapsed: (sid: string) => void;
  hasAutoCollapsed: (sid: string) => boolean;
  setActiveChartId: (sid: string, chartId: string | null) => void;
  getActiveChartId: (sid: string) => string | null;
}

function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0.5;
  return Math.min(0.68, Math.max(0.32, ratio));
}

export const useLayoutStore = create<LayoutStoreState>((set, get) => ({
  chartPaneOpenBySid: storedPanes.chart,
  reportPaneOpenBySid: storedPanes.report,
  splitRatioBySid: readStoredSplit(),
  chartStyleOverridesById: {},
  autoCollapsedSidSet: {},
  activeChartIdBySid: {},

  setChartPaneOpen(sid, open) {
    set((s) => {
      const chartPaneOpenBySid = { ...s.chartPaneOpenBySid, [sid]: open };
      // 右侧栏同一时刻只展示一种内容：打开图表区时关闭看板区
      const reportPaneOpenBySid = open
        ? { ...s.reportPaneOpenBySid, [sid]: false }
        : s.reportPaneOpenBySid;
      saveStoredPanes(chartPaneOpenBySid, reportPaneOpenBySid);
      return { chartPaneOpenBySid, reportPaneOpenBySid };
    });
  },

  toggleChartPane(sid) {
    const current = get().chartPaneOpenBySid[sid] ?? false;
    get().setChartPaneOpen(sid, !current);
  },

  setReportPaneOpen(sid, open) {
    set((s) => {
      const reportPaneOpenBySid = { ...s.reportPaneOpenBySid, [sid]: open };
      // 打开看板区时关闭图表区，保持右侧栏单一内容
      const chartPaneOpenBySid = open
        ? { ...s.chartPaneOpenBySid, [sid]: false }
        : s.chartPaneOpenBySid;
      saveStoredPanes(chartPaneOpenBySid, reportPaneOpenBySid);
      return { chartPaneOpenBySid, reportPaneOpenBySid };
    });
  },

  getSplitRatio(sid) {
    return get().splitRatioBySid[sid] ?? 0.5;
  },

  setSplitRatio(sid, ratio) {
    const nextRatio = clampRatio(ratio);
    set((s) => {
      const next = { ...s.splitRatioBySid, [sid]: nextRatio };
      saveStoredSplit(next);
      return { splitRatioBySid: next };
    });
  },

  updateChartStyle(chartId, patch) {
    set((s) => ({
      chartStyleOverridesById: {
        ...s.chartStyleOverridesById,
        [chartId]: { ...(s.chartStyleOverridesById[chartId] ?? {}), ...patch },
      },
    }));
  },

  markAutoCollapsed(sid) {
    set((s) => ({ autoCollapsedSidSet: { ...s.autoCollapsedSidSet, [sid]: true } }));
  },

  hasAutoCollapsed(sid) {
    return !!get().autoCollapsedSidSet[sid];
  },

  setActiveChartId(sid, chartId) {
    set((s) => ({ activeChartIdBySid: { ...s.activeChartIdBySid, [sid]: chartId } }));
  },

  getActiveChartId(sid) {
    return get().activeChartIdBySid[sid] ?? null;
  },
}));
