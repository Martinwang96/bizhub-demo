import { memo, useMemo, useState } from 'react';
import type { Step } from '../../types/session';
import type { StreamCtx } from '../../store/useStreamStore';
import ThinkingBlock from './ThinkingBlock';
import ToolStep from './ToolStep';
import styles from './ProcessPanel.module.css';

function fmtMs(ms?: number): string {
  if (!ms) return '';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

interface Props {
  steps: Step[];
  isLive?: boolean;
  ctx?: StreamCtx;
  stepCount?: number;
  totalDurationMs?: number;
}

/**
 * 工具名 → 中文环节名映射。
 *
 * 与后端 tools/__init__.py 的 TOOL_HANDLERS 对齐（默认注册 13 项 + bash 条件注册）：
 *   run_code / create_workspace / write_file / edit_file / read_file /
 *   delete_file / list_files / grep_files / query_db / load_skill /
 *   todo / memory / read_archive / bash
 * 未命中映射时兜底返回原始名，兼容 MCP 自定义工具。
 */
const TOOL_LABEL_ZH: Record<string, string> = {
  // 代码执行（条件注册：ENABLE_RUN_CODE_TOOL，默认开）
  run_code: '运行代码',
  // workspace 文件工具集（条件注册：ENABLE_WORKSPACE_FILES_TOOL，默认开）
  create_workspace: '创建工作区',
  write_file: '写入文件',
  edit_file: '编辑文件',
  read_file: '读取文件',
  delete_file: '删除文件',
  list_files: '列出文件',
  grep_files: '搜索文件',
  // 数据 / 技能 / 计划 / 记忆 / 归档
  query_db: '查询数据',
  load_skill: '加载技能',
  todo: '整理计划',
  memory: '调阅记忆',
  read_archive: '读取归档',
  // 排障开关（条件注册：ENABLE_BASH_TOOL，默认关）
  bash: '执行命令',
};

export function toolLabel(name: string): string {
  return TOOL_LABEL_ZH[name] ?? name;
}

/**
 * 计算 isLive 时的"当前路径"摘要文字。
 *
 * 所有环节统一以中文省略号 "…" 结尾，呈现"进行中"语义。
 *
 * 优先级：
 *  1) liveThinking 在跑    → "思考中…"
 *  2) liveTools 有运行中工具 → 最后一个加入的工具中文名 + "…"
 *  3) 历史 steps 末条       → 末条工具中文名 / "推理过程" / "思考" + "…"
 *  4) 兜底                  → "处理中…"
 */
function getCurrentPathLabel(steps: Step[], ctx?: StreamCtx): string {
  if (ctx?.liveThinking) return '思考中…';

  const liveToolNames = ctx ? Object.keys(ctx.liveTools) : [];
  if (liveToolNames.length > 0) {
    const last = liveToolNames[liveToolNames.length - 1];
    return `${toolLabel(last)}…`;
  }

  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    if (s.type === 'tool') return `${toolLabel(s.name)}…`;
    if (s.type === 'thinking') return '思考…';
    if (s.type === 'reasoning_text') return '推理过程…';
  }

  return '处理中…';
}

/**
 * BizHub 三层堆叠 icon（思考态）。
 *
 * - 视觉与品牌 logo 同源：三层菱形堆叠的数据层。
 * - thinking=true 时，三条 path 错相位做轻微上下浮动 + 透明度脉动，
 *   形成"模型正在思考"的呼吸感动效（CSS 控制）。
 */
function BizHubThinkingIcon({ thinking }: { thinking: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className={thinking ? `${styles.bizhubLayer} ${styles.bizhubLayer1}` : undefined}
        d="M12 2L2 7l10 5 10-5-10-5z"
      />
      <path
        className={thinking ? `${styles.bizhubLayer} ${styles.bizhubLayer2}` : undefined}
        d="M2 12l10 5 10-5"
      />
      <path
        className={thinking ? `${styles.bizhubLayer} ${styles.bizhubLayer3}` : undefined}
        d="M2 17l10 5 10-5"
      />
    </svg>
  );
}

function ProcessPanel({ steps, isLive, ctx, stepCount, totalDurationMs }: Props) {
  // 默认折叠：无论 isLive 还是已完成，初始都收起，仅显示单行摘要 / 当前路径
  const [open, setOpen] = useState(false);

  const count = isLive
    ? Object.keys(ctx?.liveTools ?? {}).length + steps.length
    : stepCount ?? steps.length;

  const dur = fmtMs(totalDurationMs ?? (isLive ? Date.now() - (ctx?.processStart ?? Date.now()) : undefined));

  // 当前路径文字（仅 isLive 折叠态摘要使用）
  const currentPath = useMemo(() => getCurrentPathLabel(steps, ctx), [steps, ctx]);

  if (!count && !ctx?.liveThinking) return null;

  // 折叠态一律启用"裸态"（无背景/边框/阴影，hover 浮起）；展开后才切回卡片态。
  const isBare = !open;

  const containerClass = [
    styles.container,
    isBare ? styles.containerBare : styles.containerCard,
    isLive ? styles.containerActive : '',
  ].filter(Boolean).join(' ');

  // isLive 折叠时显示"当前路径"，并以文本作为 key 触发渐入动画；
  // 已完成 / 展开后都显示"处理中… / 已完成处理 N 个步骤 · 时长"摘要。
  const summaryNode = isBare && isLive ? (
    <span key={currentPath} className={styles.summaryText}>
      {currentPath}
    </span>
  ) : (
    <>
      {isLive ? '处理中…' : '已完成处理'}
      {count > 0 && (
        <span className={styles.meta}>
          {count} 个步骤{dur ? ` · ${dur}` : ''}
        </span>
      )}
    </>
  );

  return (
    <div className={containerClass}>
      <div
        className={styles.header}
        onClick={() => setOpen((p) => !p)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((p) => !p);
          }
        }}
      >
        <span className={`${styles.icon} ${isLive ? '' : styles.iconDone}`}>
          {isLive ? (
            <BizHubThinkingIcon thinking />
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
        </span>
        <span className={styles.summary}>{summaryNode}</span>
        <span className={`${styles.arrow} ${open ? styles.arrowOpen : ''}`}>▾</span>
      </div>

      <div className={`${styles.body} ${open ? styles.bodyExpanded : styles.bodyCollapsed}`}>
        {/* 历史步骤 */}
        {steps.map((step, i) => {
          if (step.type === 'thinking') {
            return <ThinkingBlock key={i} content={step.content} durationMs={step.durationMs} mode="done" variant="thinking" />;
          }
          if (step.type === 'reasoning_text') {
            return <ThinkingBlock key={i} content={step.content} durationMs={step.durationMs} mode="done" variant="reasoning" />;
          }
          if (step.type === 'tool') {
            return <ToolStep key={i} step={step} />;
          }
          return null;
        })}

        {/* Live thinking */}
        {isLive && ctx?.liveThinking && (
          <ThinkingBlock
            content={ctx.liveThinking.content}
            mode="live"
            variant="thinking"
          />
        )}

        {/* Live tools */}
        {isLive && ctx && Object.entries(ctx.liveTools).map(([name]) => (
          <ToolStep
            key={name}
            step={{ type: 'tool', name, status: 'running' }}
          />
        ))}
      </div>
    </div>
  );
}

export default memo(ProcessPanel);
