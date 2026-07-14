/**
 * BusinessKnowledgePage — admin 后台「业务知识管理」单页
 *
 * 三块内容由 admin 直接粘贴：
 *   - 业务概览：纯文本 textarea（sans 字体）
 *   - 产品清单：6 列 TSV / YAML / JSON / MD 表格 / CSV，自动嗅探（mono 字体 + 表格预览）
 *   - 客户清单：3 列 TSV / YAML / JSON / MD 表格 / CSV（mono 字体 + 表格预览）
 *
 * 所有改动落盘前先经预览（POST /parse），admin 确认后调用 PUT 接口；保存即热刷
 * （后端 `_trigger_prompt_refresh()` 调用 prompt_builder.refresh_business_knowledge()）。
 *
 * 历史浮层用 Drawer 展示版本列表，回滚动作双步确认。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Drawer, Modal, Notice, SectionCard, SelectInput, SkeletonStack, useToast } from '@shared/components';
import { formatTextStats } from '@shared/utils/tokenEstimator';
import {
  fetchAll,
  listHistory,
  parsePreview,
  rollback,
  saveCustomers,
  saveOverview,
  saveProducts,
  type BusinessKnowledgeSnapshot,
  type CustomerEntry,
  type HistoryEntry,
  type ParseError,
  type ParsePreviewResponse,
  type ProductsByLevel,
} from '../api/businessKnowledge';
import type { AdminOutletContext } from '../components/AdminShell';
import styles from './BusinessKnowledgePage.module.css';

type SectionKey = 'overview' | 'products' | 'customers';

const TAB_LABELS: Record<SectionKey, string> = {
  overview: '业务概览',
  products: '产品清单',
  customers: '主要客户',
};

const FORMAT_OPTIONS = [
  { value: 'unknown', label: '自动嗅探' },
  { value: 'yaml', label: 'YAML' },
  { value: 'json', label: 'JSON' },
  { value: 'md', label: 'Markdown 表格' },
  { value: 'tsv', label: 'TSV (Excel/飞书复制)' },
  { value: 'csv', label: 'CSV' },
];

const OVERVIEW_PLACEHOLDER =
  '示例：本平台为云产品五部经营分析助手，覆盖加速/通信/音视频/物联网四大产业，业务对象为腾讯云 B 端客户，月度结账，目标 vs 实际口径...';

const PRODUCTS_PLACEHOLDER =
  '直接粘贴 6 列 TSV（建议从 Excel/飞书表格复制），列顺序：\n' +
  '二级产业树聚合\\t聚合-别名\\t产业树细类\\t细类-别名\\t产业树子类\\t子类-别名\n' +
  '示例：\n' +
  '音视频PaaS\\tpaas\\t实时互动\\t实时互动\\t实时音视频\\ttrtc,rtc\n' +
  '边缘平台及CDN流量类\\t\\t云直播\\t直播,live\\t云直播\\t直播,live';

const CUSTOMERS_PLACEHOLDER =
  '直接粘贴 3 列 TSV（建议从 Excel/飞书表格复制），列顺序：\n' +
  '简称\\tcustomer_name\\towner_uin\n' +
  '多别名/多 uin 用 ; 或 , 分隔。示例：\n' +
  '字跳;字节跳动;ByteDance;抖音;TikTok\\t北京字跳网络技术有限公司\\t100000324942;100030118245';

interface SectionState {
  text: string;
  preview: ParsePreviewResponse | null;
  manualFormat: string; // 当 detect 失败或 admin 想覆盖时使用，'unknown' 表示沿用嗅探
  parsing: boolean;
  saving: boolean;
}

const EMPTY_SECTION: SectionState = {
  text: '',
  preview: null,
  manualFormat: 'unknown',
  parsing: false,
  saving: false,
};

export default function BusinessKnowledgePage() {
  const { me, setTopbar } = useOutletContext<AdminOutletContext>();
  const toast = useToast();
  const isAdmin = me?.adminConsoleRole === 'admin';

  const [active, setActive] = useState<SectionKey>('overview');
  const [snapshot, setSnapshot] = useState<BusinessKnowledgeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 三个 tab 的独立状态
  const [overviewState, setOverviewState] = useState<SectionState>({ ...EMPTY_SECTION });
  const [productsState, setProductsState] = useState<SectionState>({ ...EMPTY_SECTION });
  const [customersState, setCustomersState] = useState<SectionState>({ ...EMPTY_SECTION });

  // 历史浮层
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pendingRollback, setPendingRollback] = useState<string | null>(null);
  const rollbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Snapshot 详情弹窗（业务概览 / 产品清单 / 主要客户）
  const [snapshotModal, setSnapshotModal] = useState<SectionKey | null>(null);

  const stateOf = (key: SectionKey): SectionState =>
    key === 'overview' ? overviewState : key === 'products' ? productsState : customersState;
  const setStateOf = (key: SectionKey, updater: (s: SectionState) => SectionState) => {
    if (key === 'overview') setOverviewState(updater);
    else if (key === 'products') setProductsState(updater);
    else setCustomersState(updater);
  };

  // ── 数据加载 ───────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const env = await fetchAll().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : '加载失败');
      return null;
    });
    if (env?.success && env.data) {
      setSnapshot(env.data);
      // 把当前内容回填到 textarea 让 admin 可以基于现有内容修改
      setOverviewState((s) => ({ ...s, text: env.data!.overview, preview: null }));
      // 产品/客户回填为 YAML 格式（最忠实于结构）
      setProductsState((s) => ({
        ...s,
        text: productsToTsv(env.data!.products),
        preview: null,
      }));
      setCustomersState((s) => ({
        ...s,
        text: customersToTsv(env.data!.customers),
        preview: null,
      }));
    } else if (env && !env.success) {
      setError(env.error ?? '加载失败');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── topbar 注入 ────────────────────────────────────────────────────
  useEffect(() => {
    setTopbar({
      title: '业务知识管理',
      description: '维护业务概览、产品别名和客户简称速查表，注入 LLM 上下文（System Prompt 段 3.5）。',
      actions: (
        <>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => void load()}
            disabled={loading}
          >
            刷新
          </button>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => void openHistory()}
          >
            查看历史
          </button>
        </>
      ),
    });
    return () => setTopbar(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setTopbar, loading]);

  // ── 解析预览（debounced）───────────────────────────────────────────
  const debounceTimerRef = useRef<Record<SectionKey, ReturnType<typeof setTimeout> | null>>({
    overview: null,
    products: null,
    customers: null,
  });

  const triggerPreview = useCallback(
    (key: SectionKey, text: string, formatHint: string) => {
      const tm = debounceTimerRef.current[key];
      if (tm) clearTimeout(tm);
      if (!text.trim()) {
        setStateOf(key, (s) => ({ ...s, preview: null }));
        return;
      }
      debounceTimerRef.current[key] = setTimeout(async () => {
        setStateOf(key, (s) => ({ ...s, parsing: true }));
        const env = await parsePreview(key, text, formatHint).catch((e: unknown) => {
          toast.error(e instanceof Error ? e.message : '解析失败');
          return null;
        });
        if (env?.success && env.data) {
          setStateOf(key, (s) => ({ ...s, preview: env.data!, parsing: false }));
        } else if (env && !env.success) {
          setStateOf(key, (s) => ({ ...s, parsing: false }));
          toast.error(env.error ?? '解析失败');
        } else {
          setStateOf(key, (s) => ({ ...s, parsing: false }));
        }
      }, 380);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleTextChange = (key: SectionKey, text: string) => {
    setStateOf(key, (s) => ({ ...s, text }));
    if (key === 'overview') return; // 业务概览无需结构化预览
    const formatHint = stateOf(key).manualFormat;
    triggerPreview(key, text, formatHint);
  };

  const handleFormatChange = (key: SectionKey, fmt: string) => {
    setStateOf(key, (s) => ({ ...s, manualFormat: fmt }));
    if (key === 'overview') return;
    const text = stateOf(key).text;
    if (text.trim()) triggerPreview(key, text, fmt);
  };

  // ── 保存 ───────────────────────────────────────────────────────────
  const handleSave = async (key: SectionKey) => {
    if (!isAdmin) {
      toast.warning('仅管理员可修改业务知识');
      return;
    }
    const s = stateOf(key);
    setStateOf(key, (st) => ({ ...st, saving: true }));
    let result;
    try {
      if (key === 'overview') {
        result = await saveOverview(s.text);
      } else if (key === 'products') {
        result = await saveProducts(s.text, s.manualFormat);
      } else {
        result = await saveCustomers(s.text, s.manualFormat);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
      setStateOf(key, (st) => ({ ...st, saving: false }));
      return;
    }
    setStateOf(key, (st) => ({ ...st, saving: false }));
    if (result?.success) {
      toast.success(`已保存「${TAB_LABELS[key]}」，下一轮 LLM 调用即可见新内容`);
      await load();
    } else if (result) {
      toast.error(result.error ?? '保存失败');
    }
  };

  // ── 历史 ───────────────────────────────────────────────────────────
  const openHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    const env = await listHistory().catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : '加载历史失败');
      return null;
    });
    if (env?.success && env.data) setHistoryItems(env.data);
    setHistoryLoading(false);
  };

  const handleRollback = async (versionId: string) => {
    if (!isAdmin) {
      toast.warning('仅管理员可执行回滚');
      return;
    }
    if (pendingRollback === versionId) {
      // 第二次点击：执行回滚
      if (rollbackTimerRef.current) clearTimeout(rollbackTimerRef.current);
      rollbackTimerRef.current = null;
      setPendingRollback(null);
      const env = await rollback(versionId).catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : '回滚失败');
        return null;
      });
      if (env?.success) {
        toast.success(`已回滚到版本 ${versionId}`);
        setHistoryOpen(false);
        await load();
      } else if (env) {
        toast.error(env.error ?? '回滚失败');
      }
      return;
    }
    setPendingRollback(versionId);
    if (rollbackTimerRef.current) clearTimeout(rollbackTimerRef.current);
    rollbackTimerRef.current = setTimeout(() => {
      setPendingRollback(null);
      rollbackTimerRef.current = null;
    }, 2400);
  };

  // ── 渲染 ───────────────────────────────────────────────────────────
  const currentState = stateOf(active);
  const stats = useMemo(() => formatTextStats(currentState.text), [currentState.text]);

  return (
    <div className={styles.page}>
      {!isAdmin && (
        <Notice tone="warning" title="只读视图">
          当前账号非 admin 角色，仅可查看业务知识；写操作（保存、回滚）已被禁用。
        </Notice>
      )}
      {error && (
        <Notice tone="danger" title="加载失败">
          {error}
        </Notice>
      )}

      {/* Snapshot 置顶：第一时间呈现已注入 LLM Prompt 的内容；点击子卡查看完整内容 */}
      <SectionCard
        eyebrow="Snapshot"
        title="当前已注入内容（只读）"
        description="以下是当前已保存到磁盘并注入 LLM Prompt 的内容快照。点击任一卡片查看完整内容。"
      >
        {loading ? (
          <SkeletonStack widths={[60, 60, 60]} />
        ) : snapshot ? (
          <SnapshotPreview snapshot={snapshot} onOpen={setSnapshotModal} />
        ) : (
          <Notice>暂无内容快照</Notice>
        )}
      </SectionCard>

      <SectionCard
        eyebrow="Business Knowledge"
        title="System Prompt 段 3.5 内容"
        description="本页内容会自动注入 LLM System Prompt 的「业务知识速查」段，用于让 LLM 在用户首次提问时快速识别产品别名/客户简称。SQL 权威口径仍以 Skill body + references 为准。"
      >
        <div className={styles.tabs} role="tablist" aria-label="业务知识三块内容">
          {(Object.keys(TAB_LABELS) as SectionKey[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active === key}
              className={`${styles.tab} ${active === key ? styles.tabActive : ''}`}
              onClick={() => setActive(key)}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>

        {loading ? (
          <SkeletonStack widths={[80, 92, 70, 86]} />
        ) : (
          <div className={styles.editorWrap}>
            {active !== 'overview' && (
              <div className={styles.formatBar}>
                <label className={styles.formatLabel}>
                  解析格式：
                  <SelectInput
                    className={styles.formatSelect}
                    value={currentState.manualFormat}
                    onChange={(next) => handleFormatChange(active, next)}
                    aria-label="解析格式选择"
                    options={FORMAT_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
                  />
                </label>
                {currentState.preview && (
                  <span className={styles.formatHint}>
                    检测到格式：<strong>{currentState.preview.format_detected}</strong>
                    {currentState.preview.format_used !== currentState.preview.format_detected &&
                      `（已使用 ${currentState.preview.format_used}）`}
                  </span>
                )}
              </div>
            )}

            <textarea
              className={`${styles.textarea} ${active === 'overview' ? styles.textareaSans : styles.textareaMono}`}
              placeholder={
                active === 'overview'
                  ? OVERVIEW_PLACEHOLDER
                  : active === 'products'
                  ? PRODUCTS_PLACEHOLDER
                  : CUSTOMERS_PLACEHOLDER
              }
              value={currentState.text}
              onChange={(e) => handleTextChange(active, e.target.value)}
              spellCheck={false}
              disabled={!isAdmin || currentState.saving}
              aria-label={`${TAB_LABELS[active]}内容`}
            />

            <div className={styles.editorFooter}>
              <span className={styles.statsHint}>{stats}</span>
              <span className={styles.flexSpacer} />
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => void handleSave(active)}
                disabled={!isAdmin || currentState.saving}
              >
                {currentState.saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        )}
      </SectionCard>

      {/* 解析预览（仅 products / customers） */}
      {active !== 'overview' && currentState.preview && (
        <SectionCard
          eyebrow="Preview"
          title="解析预览"
          description="保存前请确认内容；错误行（高亮）需修正后再保存。"
        >
          <PreviewBlock section={active} preview={currentState.preview} />
        </SectionCard>
      )}

      {/* 历史浮层 */}
      <Drawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="历史版本"
        width={560}
      >
        {historyLoading ? (
          <SkeletonStack widths={[90, 84, 78, 70]} />
        ) : historyItems.length === 0 ? (
          <Notice>暂无历史版本</Notice>
        ) : (
          <div className={styles.historyList}>
            {historyItems.map((item) => (
              <div key={item.version_id} className={styles.historyItem}>
                <div className={styles.historyMain}>
                  <div className={styles.historyVersion}>{item.version_id}</div>
                  <div className={styles.historyMeta}>
                    {item.ts_iso} · 修改人 {item.user} · 改动文件{' '}
                    {item.files_changed.length > 0 ? item.files_changed.join('、') : '—'}
                  </div>
                </div>
                <button
                  type="button"
                  className={
                    pendingRollback === item.version_id
                      ? styles.btnDangerActive
                      : styles.btnDanger
                  }
                  onClick={() => void handleRollback(item.version_id)}
                  disabled={!isAdmin}
                  aria-label={`回滚到版本 ${item.version_id}`}
                  title={
                    !isAdmin
                      ? '仅管理员可回滚'
                      : pendingRollback === item.version_id
                      ? '再次点击确认回滚'
                      : '回滚到此版本'
                  }
                >
                  {pendingRollback === item.version_id ? '确认回滚？' : '⟲ 回滚'}
                </button>
              </div>
            ))}
          </div>
        )}
      </Drawer>

      {snapshot && (
        <SnapshotDetailModal
          kind={snapshotModal}
          snapshot={snapshot}
          onClose={() => setSnapshotModal(null)}
        />
      )}
    </div>
  );
}

// ── 预览面板 ─────────────────────────────────────────────────────────

function PreviewBlock({
  section,
  preview,
}: {
  section: 'products' | 'customers';
  preview: ParsePreviewResponse;
}) {
  const errors = preview.errors ?? [];
  return (
    <>
      {section === 'products' && preview.products && (
        <ProductsPreview products={preview.products} errors={errors} />
      )}
      {section === 'customers' && preview.customers && (
        <CustomersPreview customers={preview.customers} errors={errors} />
      )}
      {errors.length > 0 && <ErrorsPanel errors={errors} />}
    </>
  );
}

function ProductsPreview({ products, errors }: { products: ProductsByLevel; errors: ParseError[] }) {
  const errLines = new Set(errors.map((e) => e.line_no));
  const groups: { label: string; field: string; entries: typeof products.level_1 }[] = [
    { label: '二级产业树', field: 'prod_tree_bsc', entries: products.level_1 },
    { label: '产业细类', field: 'prod_class3_name', entries: products.level_2 },
    { label: '产业子类', field: 'prod_class4_name', entries: products.level_3 },
  ];
  return (
    <div className={styles.previewStack}>
      {groups.map((g) =>
        g.entries.length === 0 ? null : (
          <div key={g.field} className={styles.previewGroup}>
            <h4 className={styles.previewTitle}>
              {g.label} <code className={styles.codeMono}>{g.field}</code>
            </h4>
            <div className={styles.tableWrap}>
              <table className={styles.previewTable}>
                <thead>
                  <tr>
                    <th>规范值</th>
                    <th>别名</th>
                  </tr>
                </thead>
                <tbody>
                  {g.entries.map((e, idx) => {
                    const isErr = errLines.has(idx + 1);
                    return (
                      <tr key={`${e.canonical}-${idx}`} className={isErr ? styles.errorRow : ''}>
                        <td>{e.canonical}</td>
                        <td className={styles.colMono}>
                          {e.aliases.length > 0
                            ? e.aliases.join(', ')
                            : <span className={styles.muted}>（字面值）</span>}
                          {isErr && (
                            <span className={styles.errorIcon} aria-label="解析失败">
                              ⚠
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function CustomersPreview({
  customers,
  errors,
}: {
  customers: CustomerEntry[];
  errors: ParseError[];
}) {
  const errLines = new Set(errors.map((e) => e.line_no));
  return (
    <div className={styles.previewStack}>
      <div className={styles.tableWrap}>
        <table className={styles.previewTable}>
          <thead>
            <tr>
              <th>用户说法</th>
              <th>客户全称</th>
              <th className={styles.colMonoHead}>owner_uin</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c, idx) => {
              const uins = c.owner_uins ?? (c.owner_uin ? [c.owner_uin] : []);
              const aliasText =
                c.aliases.length > 0
                  ? c.aliases.join(', ')
                  : `${c.customer_name}（无别名，仅按全称匹配）`;
              const isErr = errLines.has(idx + 1);
              return (
                <tr key={c.customer_name} className={isErr ? styles.errorRow : ''}>
                  <td>{aliasText}</td>
                  <td>{c.customer_name}</td>
                  <td className={styles.colMono}>
                    {uins.length > 0 ? uins.join(', ') : <span className={styles.muted}>—</span>}
                    {isErr && (
                      <span className={styles.errorIcon} aria-label="解析失败">
                        ⚠
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Notice tone="info">
        多 uin 客户在 SQL 中使用 <code>WHERE owner_uin IN (uin1, uin2, ...)</code>；
        单 uin 客户使用 <code>WHERE owner_uin = ...</code>。严禁用 customer_name LIKE 兜底。
      </Notice>
    </div>
  );
}

function ErrorsPanel({ errors }: { errors: ParseError[] }) {
  return (
    <details className={styles.errorPanel}>
      <summary>
        <strong>解析失败行汇总</strong>（{errors.length} 条）
      </summary>
      <ul className={styles.errorList}>
        {errors.map((e, idx) => (
          <li key={idx}>
            行 {e.line_no}
            {e.column ? ` · 列「${e.column}」` : ''}
            {e.raw ? ` · 原文：${e.raw.slice(0, 80)}` : ''}
            {' → '}
            <span className={styles.errorReason}>{e.reason}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function SnapshotPreview({
  snapshot,
  onOpen,
}: {
  snapshot: BusinessKnowledgeSnapshot;
  onOpen: (kind: SectionKey) => void;
}) {
  const overviewEmpty = !snapshot.overview?.trim();
  const productsCount =
    snapshot.products.level_1.length +
    snapshot.products.level_2.length +
    snapshot.products.level_3.length;
  const customersCount = snapshot.customers.length;

  return (
    <div className={styles.snapshotStack}>
      <button
        type="button"
        className={styles.snapshotBlock}
        onClick={() => onOpen('overview')}
        aria-label="查看完整业务概览"
      >
        <h4 className={styles.previewTitle}>业务概览</h4>
        {overviewEmpty ? (
          <span className={styles.muted}>尚未配置</span>
        ) : (
          <div className={styles.snapshotMeta}>
            {snapshot.overview.length} 字 · 点击查看完整内容
          </div>
        )}
      </button>
      <button
        type="button"
        className={styles.snapshotBlock}
        onClick={() => onOpen('products')}
        aria-label="查看完整产品清单"
      >
        <h4 className={styles.previewTitle}>产品清单</h4>
        {productsCount === 0 ? (
          <span className={styles.muted}>尚未配置</span>
        ) : (
          <div className={styles.snapshotMeta}>
            二级产业树 {snapshot.products.level_1.length} 条 · 产业细类{' '}
            {snapshot.products.level_2.length} 条 · 产业子类 {snapshot.products.level_3.length} 条
          </div>
        )}
      </button>
      <button
        type="button"
        className={styles.snapshotBlock}
        onClick={() => onOpen('customers')}
        aria-label="查看完整主要客户清单"
      >
        <h4 className={styles.previewTitle}>主要客户</h4>
        {customersCount === 0 ? (
          <span className={styles.muted}>尚未配置</span>
        ) : (
          <div className={styles.snapshotMeta}>共 {customersCount} 个客户</div>
        )}
      </button>
    </div>
  );
}

// ── Snapshot 详情弹窗（按 kind 切换标题/meta/body） ────────────────────

function SnapshotDetailModal({
  kind,
  snapshot,
  onClose,
}: {
  kind: SectionKey | null;
  snapshot: BusinessKnowledgeSnapshot;
  onClose: () => void;
}) {
  if (!kind) {
    return null;
  }

  if (kind === 'overview') {
    const empty = !snapshot.overview?.trim();
    return (
      <Modal
        open
        onClose={onClose}
        title="业务概览"
        meta={empty ? undefined : `${snapshot.overview.length} 字`}
      >
        {empty ? (
          <Notice>尚未配置业务概览</Notice>
        ) : (
          <div className={styles.overviewText}>{snapshot.overview}</div>
        )}
      </Modal>
    );
  }

  if (kind === 'products') {
    const total =
      snapshot.products.level_1.length +
      snapshot.products.level_2.length +
      snapshot.products.level_3.length;
    return (
      <Modal
        open
        onClose={onClose}
        title="产品清单"
        meta={
          total === 0
            ? undefined
            : `二级产业树 ${snapshot.products.level_1.length} 条 · 产业细类 ${snapshot.products.level_2.length} 条 · 产业子类 ${snapshot.products.level_3.length} 条`
        }
      >
        {total === 0 ? (
          <Notice>尚未配置产品清单</Notice>
        ) : (
          <ProductsPreview products={snapshot.products} errors={[]} />
        )}
      </Modal>
    );
  }

  // kind === 'customers'
  const empty = snapshot.customers.length === 0;
  return (
    <Modal
      open
      onClose={onClose}
      title="主要客户"
      meta={empty ? undefined : `共 ${snapshot.customers.length} 个客户`}
    >
      {empty ? (
        <Notice>尚未配置客户清单</Notice>
      ) : (
        <CustomersPreview customers={snapshot.customers} errors={[]} />
      )}
    </Modal>
  );
}

// ── 工具：把后端结构化数据回填到 textarea ─────────────────────────────

function productsToTsv(products: ProductsByLevel): string {
  // 把 3 层重新组合为原始 6 列 TSV（按 level_3 行展开，level_1/level_2 作前缀填充）
  // 当某层无数据时回退到 YAML 块（admin 可继续编辑）
  const has3 = products.level_3.length > 0;
  if (!has3 && products.level_1.length === 0 && products.level_2.length === 0) {
    return '';
  }
  // 简单回填：直接生成 6 列表头 + 每个 level_3 entry 单独成行（聚合/细类列留空让 admin 补全）
  const lines: string[] = [
    '二级产业树聚合\t聚合-别名\t产业树细类\t细类-别名\t产业树子类\t子类-别名',
  ];
  // 先放 level_1 / level_2 / level_3 的"扁平视图"（按规范值 + 字段名展平）
  // 这里采用"按层独立写出"的方式：每条 entry 一行，相应列为空
  const writeLine = (level: 1 | 2 | 3, canonical: string, aliases: string[]) => {
    const aliasStr = aliases.join(',');
    if (level === 1) {
      lines.push(`${canonical}\t${aliasStr}\t\t\t\t`);
    } else if (level === 2) {
      lines.push(`\t\t${canonical}\t${aliasStr}\t\t`);
    } else {
      lines.push(`\t\t\t\t${canonical}\t${aliasStr}`);
    }
  };
  for (const e of products.level_1) writeLine(1, e.canonical, e.aliases);
  for (const e of products.level_2) writeLine(2, e.canonical, e.aliases);
  for (const e of products.level_3) writeLine(3, e.canonical, e.aliases);
  return lines.join('\n');
}

function customersToTsv(customers: CustomerEntry[]): string {
  if (customers.length === 0) return '';
  const lines: string[] = ['简称\tcustomer_name\towner_uin'];
  for (const c of customers) {
    const aliases = c.aliases.join(';');
    const uins = (c.owner_uins ?? (c.owner_uin ? [c.owner_uin] : [])).join(';');
    lines.push(`${aliases}\t${c.customer_name}\t${uins}`);
  }
  return lines.join('\n');
}
