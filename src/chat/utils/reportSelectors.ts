import type { Message, Step } from '../types/session';
import { parseArtifactRef } from '../api/reports';

export interface ReportArtifactRef {
  messageIndex: number;
  execId: string;
  files: string[];
}

/**
 * 扫描会话全部消息的 steps，收集所有 run_code 产物引用，
 * 按出现顺序（约等于时间顺序）返回。用于驱动对话右侧「看板区」自动展开最新产物。
 *
 * 返回值携带 files 列表，调用方可据此区分 report.html（预览）与其他文件（下载）。
 */
export function getAllReportArtifacts(messages: Message[] | undefined | null): ReportArtifactRef[] {
  if (!messages?.length) return [];
  const out: ReportArtifactRef[] = [];
  messages.forEach((msg, idx) => {
    if (msg.role !== 'assistant' || !msg.steps?.length) return;
    for (const step of msg.steps) {
      if (step.type !== 'tool' || step.name !== 'run_code' || step.status === 'running') continue;
      const artifact = parseArtifactRef(step.output);
      if (artifact) out.push({ messageIndex: idx, execId: artifact.execId, files: artifact.files });
    }
  });
  return out;
}

/**
 * 从"流式 ctx.steps"里提取当轮已完成的 run_code 看板 artifact。
 *
 * 背景（bug 修复）：SSE 期间 tool 状态变化的落点是 `ctx.steps`（liveTools 移出后 push 到这里），
 * 只有在 `done` 事件触发 commitCtxToMessage 时才会同步到 `messagesBySid`。因此如果只从 messages
 * 提取 artifact，会出现"骨架屏（run_code running）→ 消失（tool 完成但 messages 未更新）
 * → 对话结束后才出现（done commit）"的闪烁。此 selector 让 ChatPage 能在 tool 完成的瞬间
 * 就把 in-flight artifact 纳入渲染，避免中间态断档。
 *
 * 只返回最近一个（按顺序），因为 in-flight 期间通常只有本轮一个报表 artifact 需要展示。
 */
export function getLiveReportArtifact(steps: Step[] | undefined | null): { execId: string; files: string[] } | null {
  if (!steps?.length) return null;
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.type !== 'tool' || step.name !== 'run_code' || step.status === 'running') continue;
    const artifact = parseArtifactRef(step.output);
    if (artifact) return { execId: artifact.execId, files: artifact.files };
  }
  return null;
}

/** 单个可下载产物条目：跨执行汇总时需携带各自的 execId 以生成正确的下载地址。 */
export interface ReportDownloadItem {
  execId: string;
  name: string;
}

/** 会话内看板产物的聚合视图。 */
export interface AggregatedReport {
  /** 最近一次含 report.html 的执行 id；用于 HTML 预览与发布。无 HTML 产物时为 null。 */
  previewExecId: string | null;
  /** 全部可下载产物（已排除 report.html），跨执行汇总，按出现顺序去重。 */
  downloads: ReportDownloadItem[];
}

/**
 * 把会话内全部 run_code 产物聚合为单一看板视图，解决"多次执行分别产出 HTML 报表与
 * 其他文件（如 .docx）时，看板区只展示最新一次产物、HTML 报表被覆盖看不到"的问题。
 *
 * 规则：
 * - previewExecId 取最近一次包含 report.html 的执行，保证 HTML 报表始终优先可预览；
 * - downloads 汇总所有非 report.html 产物（跨执行），保留各自 execId 以生成下载地址，
 *   这样 HTML 报表与其他产物可同时访问，互不覆盖。
 *
 * live 为 in-flight artifact（run_code 完成但尚未 commit 到 messages），一并纳入避免闪烁断档。
 */
export function aggregateReportArtifacts(
  artifacts: ReportArtifactRef[],
  live?: { execId: string; files: string[] } | null,
): AggregatedReport | null {
  const all: Array<{ execId: string; files: string[] }> = [...artifacts];
  if (live && !all.some((a) => a.execId === live.execId)) {
    all.push({ execId: live.execId, files: live.files });
  }
  if (!all.length) return null;

  let previewExecId: string | null = null;
  const downloads: ReportDownloadItem[] = [];
  const seen = new Set<string>();
  for (const a of all) {
    if (a.files.includes('report.html')) previewExecId = a.execId; // 取最新一次含 HTML 的执行
    for (const f of a.files) {
      if (f === 'report.html') continue;
      const key = `${a.execId}::${f}`;
      if (seen.has(key)) continue;
      seen.add(key);
      downloads.push({ execId: a.execId, name: f });
    }
  }
  return { previewExecId, downloads };
}
