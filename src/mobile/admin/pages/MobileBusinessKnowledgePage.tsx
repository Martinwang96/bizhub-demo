/**
 * MobileBusinessKnowledgePage —— 移动端「业务知识管理」单列版
 *
 * 与 PC 版 BusinessKnowledgePage 共享同一组 admin api（fetchAll / parsePreview /
 * saveOverview / saveProducts / saveCustomers / listHistory / rollback），仅渲染层重做：
 *  - 顶部 sticky Header：左侧标题 + 角色徽章；右侧「刷新」「历史」两个 IconBtn
 *  - 只读 Notice（reader 角色）/ Error Notice（加载失败）
 *  - Snapshot 卡片（3 个竖向堆叠按钮）：业务概览 / 产品清单 / 主要客户 — 点击弹底部 Sheet 看详情
 *  - sticky Tab 切换条：业务概览 / 产品清单 / 主要客户
 *  - 编辑器卡片：format select（products/customers）+ textarea + footer（字数/Token + 保存按钮）
 *  - 解析预览：与 PC 版同款 ProductsPreview / CustomersPreview，错误行高亮 + 错误详情 details
 *  - 历史 Drawer（MobileRightDrawer）：列表 + 二次确认回滚（2.4s 超时）
 *  - Snapshot 详情 Sheet（MobileBottomSheet）：业务概览/产品清单/主要客户 三种 kind
 *  - 左侧抽屉导航 MobileAdminNavDrawer：knowledge active（触发器嵌入 Header 左侧）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Notice, SkeletonStack, useToast } from '@shared/components';
import { formatTextStats } from '@shared/utils/tokenEstimator';
import type { Me } from '@shared/types/user';
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
} from '../../../admin/api/businessKnowledge';
import MobileRightDrawer from '../../shared/MobileRightDrawer';
import MobileBottomSheet from '../../shared/MobileBottomSheet';
import MobileBackToChatButton from '../../shared/MobileBackToChatButton';
import MobileAppSwitchButton from '../../shared/MobileAppSwitchButton';
import MobileAdminNavDrawer, { MobileAdminNavTrigger } from './parts/MobileAdminNavDrawer';
import styles from './MobileBusinessKnowledgePage.module.css';

function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="1 4 1 10 7 10" />
      <polyline points="23 20 23 14 17 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
      <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
}


/* ─── 常量 ─── */
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
  '音视频PaaS\\tpaas\\t实时互动\\t实时互动\\t实时音视频\\ttrtc,rtc';

const CUSTOMERS_PLACEHOLDER =
  '直接粘贴 3 列 TSV（建议从 Excel/飞书表格复制），列顺序：\n' +
  '简称\\tcustomer_name\\towner_uin\n' +
  '多别名/多 uin 用 ; 或 , 分隔。示例：\n' +
  '字跳;字节跳动;ByteDance\\t北京字跳网络技术有限公司\\t100000324942;100030118245';

interface SectionState {
  text: string;
  preview: ParsePreviewResponse | null;
  manualFormat: string;
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

export interface MobileBusinessKnowledgePageProps {
  me: Me | null;
}

export default function MobileBusinessKnowledgePage({ me }: MobileBusinessKnowledgePageProps) {
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

  // Snapshot 详情 Sheet
  const [snapshotSheet, setSnapshotSheet] = useState<SectionKey | null>(null);

  // 左侧抽屉导航
  const [navOpen, setNavOpen] = useState(false);

  const stateOf = (key: SectionKey): SectionState =>
    key === 'overview' ? overviewState : key === 'products' ? productsState : customersState;
  const setStateOf = (key: SectionKey, updater: (s: SectionState) => SectionState) => {
    if (key === 'overview') setOverviewState(updater);
    else if (key === 'products') setProductsState(updater);
    else setCustomersState(updater);
  };

  /* ─── 数据加载 ─── */
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const env = await fetchAll().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : '加载失败');
      return null;
    });
    if (env?.success && env.data) {
      setSnapshot(env.data);
      setOverviewState((s) => ({ ...s, text: env.data!.overview, preview: null }));
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

  /* ─── 解析预览（debounce 380ms） ─── */
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
    if (key === 'overview') return;
    const formatHint = stateOf(key).manualFormat;
    triggerPreview(key, text, formatHint);
  };

  const handleFormatChange = (key: SectionKey, fmt: string) => {
    setStateOf(key, (s) => ({ ...s, manualFormat: fmt }));
    if (key === 'overview') return;
    const text = stateOf(key).text;
    if (text.trim()) triggerPreview(key, text, fmt);
  };

  /* ─── 保存 ─── */
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

  /* ─── 历史 ─── */
  const openHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    const env = await listHistory().catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : '加载历史失败');
      return null;
    });
    if (env?.success && env.data) {
      // 后端返回 {versions: [...]}，兼容旧版直接数组的情况
      const raw = env.data as unknown;
      const list: HistoryEntry[] = Array.isArray(raw)
        ? (raw as HistoryEntry[])
        : Array.isArray((raw as { versions?: HistoryEntry[] })?.versions)
        ? ((raw as { versions: HistoryEntry[] }).versions)
        : [];
      setHistoryItems(list);
    }
    setHistoryLoading(false);
  };

  const closeHistory = () => {
    setHistoryOpen(false);
    if (rollbackTimerRef.current) {
      clearTimeout(rollbackTimerRef.current);
      rollbackTimerRef.current = null;
    }
    setPendingRollback(null);
  };

  const handleRollback = async (versionId: string) => {
    if (!isAdmin) {
      toast.warning('仅管理员可执行回滚');
      return;
    }
    if (pendingRollback === versionId) {
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

  /* ─── 渲染辅助 ─── */
  const currentState = stateOf(active);
  const stats = useMemo(() => formatTextStats(currentState.text), [currentState.text]);

  return (
    <>
      {/* sticky Header */}
      <header className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <MobileAdminNavTrigger onClick={() => setNavOpen(true)} />
          <h1 className={styles.headerTitle}>业务知识管理</h1>
          <span
            className={`${styles.roleBadge} ${isAdmin ? styles.roleAdmin : styles.roleReader}`}
            aria-label={isAdmin ? '管理员角色' : '只读角色'}
          >
            {isAdmin ? 'Admin' : 'Reader'}
          </span>
        </div>
        <div className={styles.headerActions}>
          <MobileAppSwitchButton target="skill-hub" me={me} size="md" />
          <MobileBackToChatButton compact size="md" />
          <button
            type="button"
            className={`${styles.headerIconBtn} ${loading ? styles.headerIconBtnSpinning : ''}`}
            onClick={() => void load()}
            disabled={loading}
            aria-label="刷新"
            title="刷新"
          >
            <IconRefresh />
          </button>
          <button
            type="button"
            className={styles.headerIconBtn}
            onClick={() => void openHistory()}
            aria-label="查看历史版本"
            title="历史版本"
          >
            <IconClock />
          </button>
        </div>
      </header>

      <main className={styles.main} role="main">
        {!isAdmin && (
          <Notice tone="warning" title="只读视图">
            当前账号非 admin 角色，仅可查看业务知识；写操作（保存、回滚）已被禁用。
          </Notice>
        )}
        {error && (
          <Notice tone="danger" title="加载失败">{error}</Notice>
        )}

        {/* Snapshot */}
        <section className={styles.section} aria-label="当前已注入内容">
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>当前已注入内容</h2>
            <span className={styles.sectionMeta}>SNAPSHOT</span>
          </header>
          <p className={styles.sectionDesc}>
            以下是当前已保存到磁盘并注入 LLM Prompt 的内容快照。点击任一卡片查看完整内容。
          </p>
          {loading ? (
            <div className={styles.skeletonWrap}>
              <SkeletonStack widths={[80, 92, 70]} />
            </div>
          ) : snapshot ? (
            <SnapshotPreview snapshot={snapshot} onOpen={setSnapshotSheet} />
          ) : (
            <div className={styles.empty}>暂无内容快照</div>
          )}
        </section>

        {/* Tabs */}
        <nav className={styles.tabsBar} role="tablist" aria-label="业务知识三块内容">
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
        </nav>

        {/* Editor */}
        <section className={styles.section} aria-label={`${TAB_LABELS[active]}编辑`}>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{TAB_LABELS[active]}</h2>
            {currentState.parsing && (
              <span className={styles.parseSpinner} aria-live="polite">解析中…</span>
            )}
          </header>
          {loading ? (
            <div className={styles.skeletonWrap}>
              <SkeletonStack widths={[80, 92, 70, 86]} />
            </div>
          ) : (
            <div className={styles.editorCard}>
              {active !== 'overview' && (
                <div className={styles.formatBar}>
                  <label className={styles.formatLabel}>
                    解析格式
                    <select
                      className={styles.formatSelect}
                      value={currentState.manualFormat}
                      onChange={(e) => handleFormatChange(active, e.target.value)}
                      aria-label="解析格式选择"
                      disabled={!isAdmin || currentState.saving}
                    >
                      {FORMAT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {currentState.preview && (
                    <span className={styles.formatBadge} title="后端检测到的格式">
                      Detected: <code>{currentState.preview.format_detected}</code>
                    </span>
                  )}
                  {currentState.preview &&
                    currentState.preview.format_used !== currentState.preview.format_detected && (
                      <span className={styles.formatHint}>
                        实际使用：<strong>{currentState.preview.format_used}</strong>
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
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => void handleSave(active)}
                  disabled={!isAdmin || currentState.saving}
                  title={!isAdmin ? '仅管理员可保存' : '保存并热刷 LLM Prompt'}
                >
                  {currentState.saving ? '保存中…' : '保存同步'}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Preview（仅 products / customers） */}
        {active !== 'overview' && currentState.preview && !loading && (
          <section className={styles.section} aria-label="解析预览">
            <header className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>解析预览</h2>
              <span className={styles.sectionMeta}>PREVIEW</span>
            </header>
            <p className={styles.sectionDesc}>
              保存前请确认内容；错误行（高亮）需修正后再保存。
            </p>
            <PreviewBlock section={active} preview={currentState.preview} />
          </section>
        )}
      </main>

      <MobileAdminNavDrawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        activeId="business-knowledge"
      />

      {/* 历史 Drawer */}
      <MobileRightDrawer
        open={historyOpen}
        title="历史快照"
        onClose={closeHistory}
      >
        <button
          type="button"
          className={styles.historyBackBtn}
          onClick={closeHistory}
          aria-label="返回知识管理"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          返回知识管理
        </button>
        {historyLoading ? (
          <div className={styles.skeletonWrap}>
            <SkeletonStack widths={[90, 84, 78, 70]} />
          </div>
        ) : historyItems.length === 0 ? (
          <div className={styles.empty}>暂无历史版本</div>
        ) : (
          <div className={styles.historyList}>
            {historyItems.map((item) => {
              const pending = pendingRollback === item.version_id;
              return (
                <div key={item.version_id} className={styles.historyItem}>
                  <div className={styles.historyHead}>
                    <div className={styles.historyVersion}>{item.version_id}</div>
                    <button
                      type="button"
                      className={pending ? styles.btnDangerActive : styles.btnDanger}
                      onClick={() => void handleRollback(item.version_id)}
                      disabled={!isAdmin}
                      aria-label={`回滚到版本 ${item.version_id}`}
                      title={
                        !isAdmin
                          ? '仅管理员可回滚'
                          : pending
                          ? '再次点击确认回滚'
                          : '回滚到此版本'
                      }
                    >
                      {pending ? '确认回滚？' : '⟲ 回滚'}
                    </button>
                  </div>
                  <div className={styles.historyMeta}>
                    {item.ts_iso} · 修改人 <strong>{item.user}</strong>
                    <br />
                    改动文件：{item.files_changed.length > 0 ? item.files_changed.join('、') : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </MobileRightDrawer>

      {/* Snapshot 详情 Sheet */}
      {snapshot && (
        <SnapshotDetailSheet
          kind={snapshotSheet}
          snapshot={snapshot}
          onClose={() => setSnapshotSheet(null)}
        />
      )}
    </>
  );
}

/* ─── Snapshot 卡片 ─── */
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
        <span className={styles.snapshotLabel}>
          业务概览
        </span>
        {overviewEmpty ? (
          <span className={`${styles.snapshotValue} ${styles.snapshotMuted}`}>尚未配置</span>
        ) : (
          <>
            <span className={styles.snapshotValue}>{snapshot.overview.length.toLocaleString()} 字</span>
            <span className={styles.snapshotMeta}>点击查看完整内容</span>
          </>
        )}
      </button>

      <button
        type="button"
        className={styles.snapshotBlock}
        onClick={() => onOpen('products')}
        aria-label="查看完整产品清单"
      >
        <span className={styles.snapshotLabel}>
          产品清单
        </span>
        {productsCount === 0 ? (
          <span className={`${styles.snapshotValue} ${styles.snapshotMuted}`}>尚未配置</span>
        ) : (
          <>
            <span className={styles.snapshotValue}>共 {productsCount} 条</span>
            <span className={styles.snapshotMeta}>
              二级 {snapshot.products.level_1.length} · 细类 {snapshot.products.level_2.length} · 子类{' '}
              {snapshot.products.level_3.length}
            </span>
          </>
        )}
      </button>

      <button
        type="button"
        className={styles.snapshotBlock}
        onClick={() => onOpen('customers')}
        aria-label="查看完整主要客户清单"
      >
        <span className={styles.snapshotLabel}>
          主要客户
        </span>
        {customersCount === 0 ? (
          <span className={`${styles.snapshotValue} ${styles.snapshotMuted}`}>尚未配置</span>
        ) : (
          <>
            <span className={styles.snapshotValue}>共 {customersCount} 个客户</span>
            <span className={styles.snapshotMeta}>点击查看完整内容</span>
          </>
        )}
      </button>
    </div>
  );
}

/* ─── 预览面板 ─── */
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
              {g.label}
              <code className={styles.codeMono}>{g.field}</code>
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
                            <span className={styles.errorIcon} aria-label="解析失败">⚠</span>
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
                      <span className={styles.errorIcon} aria-label="解析失败">⚠</span>
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
        解析失败行汇总（{errors.length} 条）
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

/* ─── Snapshot 详情 Sheet（移动端用 BottomSheet 替代 PC 的 Modal） ─── */
function SnapshotDetailSheet({
  kind,
  snapshot,
  onClose,
}: {
  kind: SectionKey | null;
  snapshot: BusinessKnowledgeSnapshot;
  onClose: () => void;
}) {
  if (kind === 'overview') {
    const empty = !snapshot.overview?.trim();
    return (
      <MobileBottomSheet open onClose={onClose} title="业务概览">
        {empty ? (
          <Notice>尚未配置业务概览</Notice>
        ) : (
          <div className={styles.overviewText}>{snapshot.overview}</div>
        )}
      </MobileBottomSheet>
    );
  }

  if (kind === 'products') {
    const total =
      snapshot.products.level_1.length +
      snapshot.products.level_2.length +
      snapshot.products.level_3.length;
    return (
      <MobileBottomSheet open onClose={onClose} title="产品清单">
        {total === 0 ? (
          <Notice>尚未配置产品清单</Notice>
        ) : (
          <ProductsPreview products={snapshot.products} errors={[]} />
        )}
      </MobileBottomSheet>
    );
  }

  if (kind === 'customers') {
    const empty = snapshot.customers.length === 0;
    return (
      <MobileBottomSheet open onClose={onClose} title="主要客户">
        {empty ? (
          <Notice>尚未配置客户清单</Notice>
        ) : (
          <CustomersPreview customers={snapshot.customers} errors={[]} />
        )}
      </MobileBottomSheet>
    );
  }

  // kind === null：sheet 关闭，但保持 DOM 不渲染（避免空 sheet 闪烁）
  return null;
}

/* ─── 工具：把后端结构化数据回填到 textarea ─── */
function productsToTsv(products: ProductsByLevel): string {
  const has3 = products.level_3.length > 0;
  if (!has3 && products.level_1.length === 0 && products.level_2.length === 0) {
    return '';
  }
  const lines: string[] = [
    '二级产业树聚合\t聚合-别名\t产业树细类\t细类-别名\t产业树子类\t子类-别名',
  ];
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
