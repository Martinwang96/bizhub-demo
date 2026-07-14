import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useOutletContext, useParams } from 'react-router-dom';
import { useSessionStore } from '../../store/useSessionStore';
import { useStreamStore } from '../../store/useStreamStore';
import { useLayoutStore } from '../../store/useLayoutStore';
import { getAllChartMessages, getChartById } from '../../utils/chartSelectors';
import { getAllReportArtifacts, getLiveReportArtifact, aggregateReportArtifacts } from '../../utils/reportSelectors';
import type { ShellOutletContext } from '../Shell/AppShell';
import ChatInput from './ChatInput';
import MessageList from './MessageList';
import ScrollFab from './ScrollFab';
import ChartPanel from '../Chart/ChartPanel';
import SplitHandle from '../Chart/SplitHandle';
import ReportPanel from '../Reports/ReportPanel';
import styles from './ChatPage.module.css';

const FAB_THRESHOLD = 120;

export default function ChatPage() {
  const { sessionId = '' } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const shell = useOutletContext<ShellOutletContext>();

  const ensureDetail = useSessionStore((s) => s.ensureDetail);
  const messages = useSessionStore((s) => s.messagesBySid[sessionId] ?? []);
  const ctx = useStreamStore((s) => s.ctxs[sessionId]);
  const send = useStreamStore((s) => s.send);
  const regenerate = useStreamStore((s) => s.regenerate);
  const refine = useStreamStore((s) => s.refine);
  const abort = useStreamStore((s) => s.abort);
  const pinSession = useSessionStore((s) => s.pinSession);
  const sessions = useSessionStore((s) => s.sessions);
  const sessionPinned = (sessions.find((s) => s.sessionId === sessionId)?.pinnedAt ?? 0) > 0;

  const chartPaneOpen = useLayoutStore((s) => s.chartPaneOpenBySid[sessionId] ?? false);
  const setChartPaneOpen = useLayoutStore((s) => s.setChartPaneOpen);
  const splitRatio = useLayoutStore((s) => s.splitRatioBySid[sessionId] ?? 0.5);
  const setSplitRatio = useLayoutStore((s) => s.setSplitRatio);
  const chartStyleOverridesById = useLayoutStore((s) => s.chartStyleOverridesById);
  const updateChartStyle = useLayoutStore((s) => s.updateChartStyle);
  const hasAutoCollapsed = useLayoutStore((s) => s.hasAutoCollapsed);
  const markAutoCollapsed = useLayoutStore((s) => s.markAutoCollapsed);
  const activeChartId = useLayoutStore((s) => s.activeChartIdBySid[sessionId] ?? null);
  const setActiveChartId = useLayoutStore((s) => s.setActiveChartId);

  const allChartMessages = useMemo(() => getAllChartMessages(messages), [messages]);
  const allChartIds = useMemo(() => allChartMessages.map((p) => p.chart.id), [allChartMessages]);
  const activeChartIndex = allChartIds.indexOf(activeChartId ?? '');
  const currentChart = activeChartId ? getChartById(messages, activeChartId) : null;
  const displayChart = currentChart ?? (allChartMessages.length > 0 ? allChartMessages[allChartMessages.length - 1].chart : null);
  const showChart = !!displayChart && chartPaneOpen;

  // 看板区（右侧栏，与图表区互斥）：run_code 生成 dashboard-report 产物时展示生成中骨架，
  // 完成后切换为 ReportViewer 预览 + 发布入口。
  const reportPaneOpen = useLayoutStore((s) => s.reportPaneOpenBySid[sessionId] ?? false);
  const setReportPaneOpen = useLayoutStore((s) => s.setReportPaneOpen);
  const liveRunCode = ctx?.liveTools?.['run_code'];
  const isGeneratingReport = !!liveRunCode;
  const allReportArtifacts = useMemo(() => getAllReportArtifacts(messages), [messages]);
  // in-flight artifact：run_code 已完成、但 done 还未 commit 到 messagesBySid 之前，
  // 从 ctx.steps 里同步取到当轮产物，避免"骨架消失 → 报表面板整体消失 → done 后才重新出现"闪烁。
  const liveReportArtifact = useMemo(() => getLiveReportArtifact(ctx?.steps), [ctx?.steps]);
  const latestReportArtifact = allReportArtifacts[allReportArtifacts.length - 1]
    ?? (liveReportArtifact ? { messageIndex: -1, execId: liveReportArtifact.execId, files: liveReportArtifact.files } : null);
  // 聚合会话内全部产物：HTML 报表始终优先可预览，其他产物（跨执行）汇总为下载列表，
  // 避免"多次执行时看板区只展示最新一次产物、HTML 报表被覆盖"的问题。
  const aggregatedReport = useMemo(
    () => aggregateReportArtifacts(allReportArtifacts, liveReportArtifact),
    [allReportArtifacts, liveReportArtifact],
  );
  const showReport = reportPaneOpen && (isGeneratingReport || !!aggregatedReport);

  const [draft, setDraft] = useState('');
  const [fabVisible, setFabVisible] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const autoOpenedChartIdRef = useRef<string | null>(null);
  const latestChartIdRef = useRef<string | null>(null);
  const reportRunStartRef = useRef<number | null>(null);
  const autoOpenedReportIdRef = useRef<string | null>(null);
  const latestReportIdRef = useRef<string | null>(null);
  const mobileResetSidRef = useRef<string | null>(null);
  const messageRefs = useRef<Record<number, HTMLElement | null>>({});
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (sessionId) void ensureDetail(sessionId);
    setDraft('');
  }, [sessionId, ensureDetail]);

  // 移动端：每次进入会话默认回到文字区。仅在 sid 真正切换那一刻重置一次。
  // 桌面端不进入此分支，PC 行为完全保持原样。
  useEffect(() => {
    if (!shell.isMobile) return;
    if (!sessionId) return;
    if (mobileResetSidRef.current === sessionId) return;
    mobileResetSidRef.current = sessionId;
    setChartPaneOpen(sessionId, false);
    setReportPaneOpen(sessionId, false);
  }, [sessionId, shell.isMobile, setChartPaneOpen, setReportPaneOpen]);

  const initialSentRef = useRef<string | null>(null);
  useEffect(() => {
    initialSentRef.current = null;
  }, [sessionId]);

  useEffect(() => {
    const state = location.state as { initialPrompt?: string; initialVisualize?: boolean } | null;
    const prompt = state?.initialPrompt;
    if (!prompt) return;
    const key = `${sessionId}::${prompt}::${state?.initialVisualize ? 'chart' : 'chat'}`;
    if (initialSentRef.current === key) return;
    const stillLoading = useSessionStore.getState().messagesBySid[sessionId] === undefined;
    if (stillLoading) return;
    initialSentRef.current = key;
    void send(sessionId, prompt, { visualize: state?.initialVisualize });
    window.history.replaceState({}, '');
  }, [sessionId, location.state, messages, send]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= FAB_THRESHOLD;
      atBottomRef.current = nearBottom;
      setFabVisible(!nearBottom);
    };
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => {
    if (!atBottomRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, ctx?.content, ctx?.steps]);

  // 只有“新图表产生”时才自动打开图表区。
  // 滚动文字区会通过 IntersectionObserver 切换 activeChartId；这只能同步图表内容，不能重新拉起移动端抽屉。
  // 移动端额外受"基线锁"约束：必须等基线锚定 (mobileBaselineChartCountRef) 完成
  // 且 chart 总数 > 基线，才允许自动打开——保证从历史会话进入时不会弹抽屉，
  // 但本会话内真正产生新图时仍会自动打开。
  useEffect(() => {
    const latest = allChartMessages[allChartMessages.length - 1]?.chart;
    if (!latest || latestChartIdRef.current === latest.id) return;
    latestChartIdRef.current = latest.id;
    setActiveChartId(sessionId, latest.id);

    if (autoOpenedChartIdRef.current === latest.id) return;

    // 移动端：禁用自动打开图表抽屉。无论是历史会话已有的图还是本会话新增的图，
    // 都不主动 setChartPaneOpen(true)。用户需要看图表时通过顶栏图表 ICON 手动打开。
    // 这样从历史会话进入时绝不会弹出图表区，行为完全可预期。
    // 桌面端逻辑保持不变。
    if (shell.isMobile) {
      autoOpenedChartIdRef.current = latest.id;
      return;
    }

    autoOpenedChartIdRef.current = latest.id;
    setChartPaneOpen(sessionId, true);
    if (!hasAutoCollapsed(sessionId)) {
      shell.setSidebarOpen(false, 'auto');
      markAutoCollapsed(sessionId);
    }
  }, [allChartMessages, hasAutoCollapsed, markAutoCollapsed, sessionId, setActiveChartId, setChartPaneOpen, shell]);

  // 看板区自动展开（一）：run_code 开始执行 → 立即打开右侧栏展示"生成中"骨架屏。
  // 以 liveTools.run_code.startAt 作为去重 key，避免同一次调用的多次渲染重复触发。
  // 移动端不自动弹出（与图表抽屉策略一致），用户需要时可从该次对话消息进入查看。
  useEffect(() => {
    if (!liveRunCode) { reportRunStartRef.current = null; return; }
    if (reportRunStartRef.current === liveRunCode.startAt) return;
    reportRunStartRef.current = liveRunCode.startAt;
    if (shell.isMobile) return;
    setReportPaneOpen(sessionId, true);
    if (!hasAutoCollapsed(sessionId)) {
      shell.setSidebarOpen(false, 'auto');
      markAutoCollapsed(sessionId);
    }
  }, [liveRunCode, hasAutoCollapsed, markAutoCollapsed, sessionId, setReportPaneOpen, shell]);

  // 看板区自动展开（二）：新看板产物就位（本轮生成完成，或历史会话已含看板）时切到预览。
  useEffect(() => {
    if (!latestReportArtifact || latestReportIdRef.current === latestReportArtifact.execId) return;
    latestReportIdRef.current = latestReportArtifact.execId;

    if (autoOpenedReportIdRef.current === latestReportArtifact.execId) return;
    autoOpenedReportIdRef.current = latestReportArtifact.execId;
    if (shell.isMobile) return;

    setReportPaneOpen(sessionId, true);
    if (!hasAutoCollapsed(sessionId)) {
      shell.setSidebarOpen(false, 'auto');
      markAutoCollapsed(sessionId);
    }
  }, [latestReportArtifact, hasAutoCollapsed, markAutoCollapsed, sessionId, setReportPaneOpen, shell]);

  // IntersectionObserver: 滚动时检测哪个消息可见，同步更新图表区
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || allChartMessages.length === 0) return;
    if (observerRef.current) observerRef.current.disconnect();

    const obs = new IntersectionObserver(
      (entries) => {
        // 找出可见面积最大的消息
        let best: { entry: IntersectionObserverEntry; index: number } | null = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Number((entry.target as HTMLElement).dataset.messageIndex ?? '-1');
          if (idx < 0) continue;
          if (!best || entry.intersectionRatio > best.entry.intersectionRatio) {
            best = { entry, index: idx };
          }
        }
        if (best) {
          const pair = allChartMessages.find((p) => p.messageIndex === best!.index);
          if (pair) setActiveChartId(sessionId, pair.chart.id);
        }
      },
      { root: el, threshold: [0.1, 0.5, 0.9] },
    );
    observerRef.current = obs;

    allChartMessages.forEach((pair) => {
      const node = messageRefs.current[pair.messageIndex];
      if (node) obs.observe(node);
    });

    return () => obs.disconnect();
  }, [allChartMessages, sessionId, setActiveChartId]);

  // 滚动到指定消息
  const scrollToMessage = useCallback((messageIndex: number) => {
    const node = messageRefs.current[messageIndex];
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // 图表导航：切换到上一个/下一个图表
  const handleChartNavigate = useCallback(
    (direction: -1 | 1) => {
      if (allChartMessages.length === 0) return;
      const currentIdx = activeChartIndex >= 0 ? activeChartIndex : allChartMessages.length - 1;
      const nextIdx = (currentIdx + direction + allChartMessages.length) % allChartMessages.length;
      const nextPair = allChartMessages[nextIdx];
      setActiveChartId(sessionId, nextPair.chart.id);
      scrollToMessage(nextPair.messageIndex);
    },
    [activeChartIndex, allChartMessages, sessionId, setActiveChartId, scrollToMessage],
  );

  const handleSubmit = useCallback(
    (text: string, options?: { visualize?: boolean }) => {
      if (useStreamStore.getState().ctxs[sessionId]?.loading) return;
      void send(sessionId, text, options);
    },
    [sessionId, send],
  );

  const handleAbort = useCallback(() => {
    void abort(sessionId);
  }, [sessionId, abort]);

  // 重新对话：以被点击 assistant 的展示下标为锚点，截断该轮后内容并重新生成。
  // 会话级 loading 守卫由 store.regenerate 内部完成，这里只做透传。
  const handleRegenerate = useCallback(
    (messageIndex: number) => {
      void regenerate(sessionId, messageIndex);
    },
    [sessionId, regenerate],
  );

  // 改写（详细/简洁）：保留旧回答，追加新版本到尾部。messageIndex 仅作占位，改写始终
  // 基于最新一条回答（store.refine 内部以最后一条 assistant 为基准）。
  const handleRefine = useCallback(
    (_messageIndex: number, mode: 'detailed' | 'concise') => {
      void refine(sessionId, mode);
    },
    [sessionId, refine],
  );

  const handlePin = useCallback(
    (_messageIndex: number, pinned: boolean) => {
      void pinSession(sessionId, pinned);
    },
    [sessionId, pinSession],
  );

  const handleRetry = useCallback(
    (_text: string) => {
      if (useStreamStore.getState().ctxs[sessionId]?.loading) return;
      const msgs = useSessionStore.getState().messagesBySid[sessionId] ?? [];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'user') {
          void send(sessionId, msgs[i].content ?? '');
          return;
        }
      }
    },
    [sessionId, send],
  );

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    if (smooth) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    else el.scrollTop = el.scrollHeight;
    setFabVisible(false);
  }, []);

  return (
    <div className={styles.page} style={{ '--split-ratio': splitRatio } as React.CSSProperties}>
      <div className={`${styles.workspace} ${(showChart || showReport) ? styles.workspaceSplit : ''}`}>
        <section className={styles.chatPane}>
          <div ref={scrollRef} className={styles.messagesWrap}>
            <div className={styles.messages}>
              <MessageList
                sid={sessionId}
                messages={messages}
                ctx={ctx}
                onRetry={handleRetry}
                onShareOpen={shell.onShareOpen}
                onRegenerate={handleRegenerate}
                onRefine={handleRefine}
                onPin={handlePin}
                sessionPinned={sessionPinned}
                messageRefs={messageRefs}
                chartMessages={allChartMessages}
              />
            </div>
          </div>

          <ScrollFab
            visible={fabVisible && !shell.shareOpen}
            onClick={() => scrollToBottom(true)}
          />

          <ChatInput
            value={draft}
            onChange={setDraft}
            onSubmit={handleSubmit}
            onAbort={handleAbort}
            loading={ctx?.loading}
            autoFocus={!shell.isMobile}
          />
        </section>

        {showChart && displayChart && !shell.isMobile && (
          <>
            <SplitHandle
              ratio={splitRatio}
              onChange={(next) => setSplitRatio(sessionId, next)}
              onReset={() => setSplitRatio(sessionId, 0.5)}
            />
            <section className={styles.chartPane}>
              <ChartPanel
                chart={displayChart}
                overrides={chartStyleOverridesById[displayChart.id]}
                onChangeOverrides={(patch) => updateChartStyle(displayChart.id, patch)}
                onClose={() => setChartPaneOpen(sessionId, false)}
                onOpenReport={(!!aggregatedReport || allReportArtifacts.length > 0) ? () => setReportPaneOpen(sessionId, true) : undefined}
                onNavigate={allChartMessages.length > 1 ? handleChartNavigate : undefined}
                currentChartIndex={activeChartIndex >= 0 ? activeChartIndex : allChartMessages.length - 1}
                totalCharts={allChartMessages.length}
              />
            </section>
          </>
        )}

        {showReport && !shell.isMobile && (
          <>
            <SplitHandle
              ratio={splitRatio}
              onChange={(next) => setSplitRatio(sessionId, next)}
              onReset={() => setSplitRatio(sessionId, 0.5)}
            />
            <section className={styles.chartPane}>
              <ReportPanel
                previewExecId={aggregatedReport?.previewExecId ?? null}
                downloads={aggregatedReport?.downloads ?? []}
                generating={isGeneratingReport}
                sessionId={sessionId}
                onClose={() => setReportPaneOpen(sessionId, false)}
                onOpenChart={displayChart ? () => setChartPaneOpen(sessionId, true) : undefined}
              />
            </section>
          </>
        )}
      </div>

      {showChart && displayChart && shell.isMobile && (
        <div className={styles.mobileChartDrawer}>
          <ChartPanel
            chart={displayChart}
            overrides={chartStyleOverridesById[displayChart.id]}
            onChangeOverrides={(patch) => updateChartStyle(displayChart.id, patch)}
            onClose={() => setChartPaneOpen(sessionId, false)}
            onOpenReport={(!!aggregatedReport || allReportArtifacts.length > 0) ? () => setReportPaneOpen(sessionId, true) : undefined}
            onNavigate={allChartMessages.length > 1 ? handleChartNavigate : undefined}
            currentChartIndex={activeChartIndex >= 0 ? activeChartIndex : allChartMessages.length - 1}
            totalCharts={allChartMessages.length}
          />
        </div>
      )}

      {showReport && shell.isMobile && (
        <div className={styles.mobileChartDrawer}>
          <ReportPanel
            previewExecId={aggregatedReport?.previewExecId ?? null}
            downloads={aggregatedReport?.downloads ?? []}
            generating={isGeneratingReport}
            sessionId={sessionId}
            onClose={() => setReportPaneOpen(sessionId, false)}
            onOpenChart={displayChart ? () => setChartPaneOpen(sessionId, true) : undefined}
          />
        </div>
      )}
    </div>
  );
}
