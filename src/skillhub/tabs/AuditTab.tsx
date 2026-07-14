/**
 * AuditTab — 审计日志 Tab
 *
 * 视觉对齐 admin/SessionsPage 的「会话筛选」模块：
 * - 页面级 .card（实色 + 边框 + 阴影 + 圆角）
 * - cardHead：标题 + 计数 pill
 * - filterBar：两行 grid 结构
 *   Row 1（关键词）：skill / user / action（3 列等宽）
 *   Row 2（时间 + 操作）：since / until + 视图切换组（2 列等宽 + 操作组 auto）
 * - tableWrap + 同款 .table（hover 高亮、紧凑列头）
 */
import { memo, useCallback, useEffect, useState } from 'react';
import { getJson } from '@shared/api/httpClient';
import { normalizeAuditResponse, type AuditLogItem as AuditLog } from '../apiAdapters';
import { DatePicker, EmptyState, Notice, SelectInput, SkeletonStack } from '@shared/components';
import type { RegisterRefresh } from '../SkillHubApp';
import styles from './AuditTab.module.css';
import commonStyles from '@shared/components/common.module.css';

function toTs(value: string, end = false) {
  if (!value) return '';
  const d = new Date(value + (end ? 'T23:59:59' : 'T00:00:00'));
  return Number.isNaN(d.getTime()) ? '' : String(Math.floor(d.getTime() / 1000));
}

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString('zh-CN');
}

interface Props {
  onRegisterRefresh?: RegisterRefresh;
}

function AuditTab({ onRegisterRefresh }: Props) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'list' | 'timeline'>('list');
  const [filter, setFilter] = useState({ skill_id: '', user: '', action: '', since: '', until: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const qs = new URLSearchParams({ limit: '80' });
    if (filter.skill_id) qs.set('skill_id', filter.skill_id);
    if (filter.user) qs.set('user', filter.user);
    if (filter.action) qs.set('action', filter.action);
    const since = toTs(filter.since);
    const until = toTs(filter.until, true);
    if (since) qs.set('since', since);
    if (until) qs.set('until', until);
    try {
      const env = await getJson<Record<string, unknown>>(`/skill-hub/api/audit?${qs}`);
      if (env.success) {
        setLogs(normalizeAuditResponse(env.data));
        const rawActions = env.data?.actions;
        if (Array.isArray(rawActions)) setActions(rawActions.filter((x): x is string => typeof x === 'string'));
      } else setError(env.error ?? '审计日志加载失败');
    } catch (e) {
      setError(e instanceof Error ? e.message : '审计日志加载失败');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    onRegisterRefresh?.(load);
    return () => onRegisterRefresh?.(null);
  }, [onRegisterRefresh, load]);

  return (
    <div className={styles.page}>
      <header className={commonStyles.sectionHeader}>
        <div className={commonStyles.sectionIntro}>
          <span className={commonStyles.eyebrow}>Audit</span>
          <div className={commonStyles.titleLine}>
            <h2 className={commonStyles.sectionTitle}>审计日志</h2>
            <span className={commonStyles.countPill}>{logs.length}</span>
          </div>
          <p className={commonStyles.sectionDesc}>记录发布、审批、回滚、导出等关键动作。</p>
        </div>
      </header>

      {error && <Notice tone="danger" title="加载失败">{error}</Notice>}

      <div className={styles.card}>
        <div className={styles.filterBar}>
          {/* Row 1：关键词组 —— skill / user / action */}
          <div className={styles.filterRow}>
            <div className={styles.filterField}>
              <label className={styles.filterLabel}>Skill</label>
              <input
                className={styles.input}
                placeholder="skill"
                value={filter.skill_id}
                onChange={(e) => setFilter({ ...filter, skill_id: e.target.value })}
              />
            </div>
            <div className={styles.filterField}>
              <label className={styles.filterLabel}>操作人</label>
              <input
                className={styles.input}
                placeholder="user"
                value={filter.user}
                onChange={(e) => setFilter({ ...filter, user: e.target.value })}
              />
            </div>
            <div className={styles.filterField}>
              <label className={styles.filterLabel}>Action</label>
              <SelectInput
                value={filter.action}
                onChange={(next) => setFilter({ ...filter, action: next })}
                allowInput={false}
                clearable={false}
                options={[{ value: '', label: '全部 action' }, ...actions.map((a) => ({ value: a, label: a }))]}
              />
            </div>
          </div>

          {/* Row 2：日期组 + 视图切换 */}
          <div className={styles.filterRow}>
            <div className={styles.filterField}>
              <label className={styles.filterLabel}>开始日期</label>
              <DatePicker
                value={filter.since}
                onChange={(next) => setFilter({ ...filter, since: next })}
              />
            </div>
            <div className={styles.filterField}>
              <label className={styles.filterLabel}>结束日期</label>
              <DatePicker
                value={filter.until}
                onChange={(next) => setFilter({ ...filter, until: next })}
              />
            </div>
            <div className={styles.filterActions}>
              <button
                type="button"
                className={`${styles.chipButton} ${view === 'list' ? styles.chipButtonActive : ''}`}
                onClick={() => setView('list')}
              >
                列表
              </button>
              <button
                type="button"
                className={`${styles.chipButton} ${view === 'timeline' ? styles.chipButtonActive : ''}`}
                onClick={() => setView('timeline')}
              >
                时间线
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <SkeletonStack widths={[78, 92, 64, 86]} />
        ) : logs.length === 0 ? (
          <EmptyState title="暂无审计记录" description="完成审批、发布或回滚后，关键操作会自动沉淀在这里。" />
        ) : view === 'timeline' ? (
          <div className={styles.timeline}>
            {logs.map((l) => (
              <p key={l.id}>{fmtTime(l.createdAt)} · {l.operator} · {l.action} · {l.skillId || '-'}</p>
            ))}
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>操作</th>
                  <th>Skill</th>
                  <th>操作人</th>
                  <th>时间</th>
                  <th>详情</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td><span className={`${styles.tag} ${styles.tagPrimary}`}>{l.action}</span></td>
                    <td><code className={styles.code}>{l.skillId || '—'}</code></td>
                    <td className={styles.tableSub}>{l.operator}</td>
                    <td className={styles.tableMeta}>{fmtTime(l.createdAt)}</td>
                    <td className={styles.tableSub}>{l.detail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(AuditTab);
