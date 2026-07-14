import { useEffect, useMemo, useState } from 'react';
import Markdown from '@shared/components/content/Markdown';
import Watermark from '@shared/components/content/Watermark';
import BrandLogo from '@shared/components/brand/BrandLogo';
import { getJson } from '@shared/api/httpClient';
import type { ChartPayload, ChartStyleOverrides } from '../chat/types/chart';
import EChartsRenderer from '../chat/components/Chart/EChartsRenderer';
import ReportSharePage from './ReportSharePage';
import styles from './SharePage.module.css';

interface ShareMessage {
  role: 'user' | 'assistant';
  content?: string;
  charts?: ChartPayload[];
}

interface ShareData {
  title?: string;
  creator?: string;
  createdAt?: number | string;
  messages: ShareMessage[];
  chartStyleOverridesById?: Record<string, ChartStyleOverrides>;
}

interface VersionInfo {
  pos: number;
  total: number;
  indices: number[];
}

/**
 * 计算版本组：连续 assistant（中间无 user）归为一组。
 * 分享快照中改写指令 user 已被后端过滤，因此同一问题的「原始回答 + 各改写版本」
 * 在快照里表现为相邻的连续 assistant，自然形成一个可翻页的版本组。
 */
function computeVersionGroups(messages: ShareMessage[]): Map<number, VersionInfo> {
  const groups: number[][] = [];
  let cur: number[] | null = null;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === 'user') { cur = null; continue; }
    if (m.role === 'assistant') {
      if (!cur) { cur = []; groups.push(cur); }
      cur.push(i);
    }
  }
  const map = new Map<number, VersionInfo>();
  for (const g of groups) {
    g.forEach((idx, k) => map.set(idx, { pos: k + 1, total: g.length, indices: g }));
  }
  return map;
}

function fmtDate(ts?: number | string): string {
  if (!ts) return '';
  const raw = typeof ts === 'string' ? Date.parse(ts) : (ts < 1e12 ? ts * 1000 : ts);
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    + ' '
    + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function ShareChart({ chart, overrides }: { chart: ChartPayload; overrides?: ChartStyleOverrides }) {
  return (
    <section className={styles.chartBlock} aria-label="分享图表">
      <div className={styles.chartHeader}>
        <div className={styles.chartTitle}>{chart.title || '图表'}</div>
        <span className={styles.chartBadge}>{overrides?.kind ?? chart.intent ?? 'auto'}</span>
      </div>
      <div className={styles.chartBody}>
        <EChartsRenderer payload={chart} overrides={overrides} />
      </div>
      <div className={styles.chartFooter}>
        <span>来源：{chart.source || 'query_db'}</span>
        {chart.unit && <span>单位：{chart.unit}</span>}
        {chart.truncated && <span>已截断至 {chart.rowCount} 行</span>}
      </div>
    </section>
  );
}

export default function SharePage() {
  return window.location.pathname.startsWith('/rs/') ? <ReportSharePage /> : <ConversationSharePage />;
}

function ConversationSharePage() {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [share, setShare] = useState<ShareData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  /** 版本组激活状态：key=组首 assistant 下标，value=激活的 assistant 下标（默认最后一个） */
  const [activeVersion, setActiveVersion] = useState<Record<number, number>>({});

  const messages = share?.messages ?? [];
  const versionGroups = useMemo(() => computeVersionGroups(messages), [messages]);

  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/s\/([A-Za-z0-9_-]+)$/);
    if (!match) {
      setErrorMsg('无效的分享链接');
      setState('error');
      return;
    }

    const matchedToken = match[1];
    void getJson<ShareData>(`/api/shares/${encodeURIComponent(matchedToken)}`)
      .then((env) => {
        if (env.success && env.data) {
          setShare(env.data);
          document.title = `${env.data.title || '分享'} - Biz-Hub`;
          setState('ok');
        } else {
          setErrorMsg(env.error ?? '加载失败');
          setState('error');
        }
      })
      .catch((e) => {
        setErrorMsg(e instanceof Error ? e.message : '网络错误');
        setState('error');
      });
  }, []);

  function handleGoHome() {
    window.location.href = '/';
  }

  if (state === 'loading') return <div className={styles.loading}>正在加载分享内容...</div>;

  if (state === 'error') {
    return (
      <div className={styles.error}>
        <div className={styles.errorIcon}>链接</div>
        <h2 className={styles.errorTitle}>无法加载分享</h2>
        <p className={styles.errorDesc}>{errorMsg}</p>
      </div>
    );
  }

  /**
   * 覆盖式翻页：同一版本组只渲染激活的那一条 assistant，其余跳过（不占屏）。
   * 默认激活最后一条（最新版本）。
   */
  const skipSet = new Set<number>();
  for (const info of versionGroups.values()) {
    if (info.total <= 1) continue;
    const active = activeVersion[info.indices[0]] ?? info.indices[info.total - 1];
    for (const i of info.indices) {
      if (i !== active) skipSet.add(i);
    }
  }

  return (
    <>
      {share?.creator && <Watermark text={`${share.creator}的分享`} />}

      <div className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <BrandLogo size="sm" />
          <div className={styles.meta}>
            <div className={styles.title}>{share?.title || '分享的对话'}</div>
            <div className={styles.creator}>
              <span>{share?.creator || '匿名'} 的分享</span>
              {share?.createdAt && (
                <>
                  <span className={styles.dot} />
                  <span>{fmtDate(share.createdAt)}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className={styles.topbarRight}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleGoHome}
          >
            <span className={styles.labelDesktop}>进入主页</span>
            <span className={styles.labelMobile}>主页</span>
          </button>
        </div>
      </div>

      <div className={styles.body}>
        {messages.length ? (
          <div className={styles.msgWrap}>
            {messages.map((m, i) => {
              if (skipSet.has(i)) return null;

              if (m.role === 'user') {
                return (
                  <div key={i} className={styles.userRow}>
                    <div className={styles.userBubble}>{m.content}</div>
                  </div>
                );
              }
              if (m.role === 'assistant') {
                const vinfo = versionGroups.get(i);
                const showPager = vinfo && vinfo.total > 1;
                const goVersion = (direction: -1 | 1) => {
                  if (!vinfo) return;
                  const key = vinfo.indices[0];
                  const currentActive = activeVersion[key] ?? vinfo.indices[vinfo.total - 1];
                  const currentPos = vinfo.indices.indexOf(currentActive);
                  const targetIdx = vinfo.indices[currentPos + direction];
                  if (targetIdx !== undefined) {
                    setActiveVersion((prev) => ({ ...prev, [key]: targetIdx }));
                  }
                };

                return (
                  <div key={i} className={styles.aiRow}>
                    <div className={styles.aiContainer}>
                      {m.content && <Markdown text={m.content} />}
                      {m.charts?.map((chart) => (
                        <ShareChart
                          key={chart.id}
                          chart={chart}
                          overrides={share?.chartStyleOverridesById?.[chart.id]}
                        />
                      ))}
                      {showPager && (
                        <div className={styles.pager}>
                          <button
                            type="button"
                            className={styles.pagerBtn}
                            onClick={() => goVersion(-1)}
                            disabled={vinfo!.pos <= 1}
                            aria-label="上一版本"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M15 18l-6-6 6-6" />
                            </svg>
                          </button>
                          <span className={styles.pagerText}>{vinfo!.pos}/{vinfo!.total}</span>
                          <button
                            type="button"
                            className={styles.pagerBtn}
                            onClick={() => goVersion(1)}
                            disabled={vinfo!.pos >= vinfo!.total}
                            aria-label="下一版本"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M9 18l6-6-6-6" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
              return null;
            })}
          </div>
        ) : (
          <div className={styles.loading}>此分享暂无内容</div>
        )}
      </div>

      <div className={styles.footer}>由 Biz-Hub 生成的分享</div>
    </>
  );
}
