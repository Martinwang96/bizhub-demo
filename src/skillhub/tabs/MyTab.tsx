/**
 * MyTab — 我的申请 Tab
 */
import { memo, useCallback, useEffect, useState } from 'react';
import { getJson, postJson } from '@shared/api/httpClient';
import { normalizeApprovalItemsResponse, type ApprovalItem as MyRequest } from '../apiAdapters';
import { CountPill, EmptyState, Notice, SectionCard, SkeletonStack, TableWrap } from '@shared/components';
import type { RegisterRefresh } from '../SkillHubApp';
import styles from '@shared/components/common.module.css';

const STATUS_LABELS: Record<string, string> = {
  'pending-review': '待审批',
  'published': '已发布',
  'rejected': '已拒绝',
  'withdrawn': '已撤回',
  'publish-failed': '发布失败',
};

const FILTERS = ['', 'pending-review', 'published', 'rejected', 'withdrawn', 'publish-failed'];

interface Props {
  onRegisterRefresh?: RegisterRefresh;
}

function MyTab({ onRegisterRefresh }: Props) {
  const [list, setList] = useState<MyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [actionState, setActionState] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const env = await getJson<unknown>('/skill-hub/api/skills/approvals/my');
      if (env.success) {
        setList(normalizeApprovalItemsResponse(env.data));
      } else {
        setError(env.error ?? '申请记录加载失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '申请记录加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    onRegisterRefresh?.(load);
    return () => onRegisterRefresh?.(null);
  }, [onRegisterRefresh, load]);

  const handleWithdraw = useCallback(async (requestId: string) => {
    const reason = window.prompt('请输入撤回原因（可选）', '') ?? '';
    setActionState((s) => ({ ...s, [requestId]: true }));
    setError('');
    try {
      const env = await postJson(`/skill-hub/api/skills/approvals/${encodeURIComponent(requestId)}/withdraw`, { reason });
      if (!env.success) setError(env.error ?? '撤回失败');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '撤回失败');
    } finally {
      setActionState((s) => ({ ...s, [requestId]: false }));
    }
  }, [load]);

  const filtered = filterStatus ? list.filter((r) => r.status === filterStatus) : list;

  const statusTagClass = (status: string) => {
    if (status === 'published') return styles.tagSuccess;
    if (status === 'rejected' || status === 'publish-failed') return styles.tagDanger;
    if (status === 'pending-review') return styles.tagWarn;
    return styles.tagMuted;
  };

  return (
    <SectionCard
      eyebrow="Requests"
      title="我发起过的申请"
      description="追踪上传后的审批状态，待审批请求可在发布前撤回。"
      meta={<CountPill>{filtered.length}</CountPill>}
    >
      <div className={styles.toolbar} aria-label="申请状态过滤">
        <span className={styles.filterLabel}>状态</span>
        {FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            className={`${styles.chipButton} ${filterStatus === s ? styles.chipButtonActive : ''}`}
            onClick={() => setFilterStatus(s)}
          >
            {s === '' ? '全部' : STATUS_LABELS[s] ?? s}
          </button>
        ))}
      </div>

      {error && <Notice tone="danger" title="操作失败">{error}</Notice>}

      {loading ? (
        <SkeletonStack widths={[74, 88, 62]} />
      ) : error && list.length === 0 ? (
        <EmptyState
          title="无法加载申请记录"
          description={error}
          action={<button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => void load()}>重试</button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="暂无申请记录"
          description={list.length === 0 ? '提交发布审批后，这里会显示每一次申请的进度。' : '当前筛选条件下没有申请。'}
        />
      ) : (
        <TableWrap>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Skill ID</th>
                <th>类型</th>
                <th>状态</th>
                <th>提交时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.requestId}>
                  <td><code>{r.skillId}</code></td>
                  <td className={styles.tableSub}>{r.mode}</td>
                  <td><span className={`${styles.tag} ${statusTagClass(r.status)}`}>{STATUS_LABELS[r.status] ?? r.status}</span></td>
                  <td className={styles.tableMeta}>{new Date(r.submittedAt * 1000).toLocaleString('zh-CN')}</td>
                  <td>
                    {r.status === 'pending-review' ? (
                      <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} disabled={actionState[r.requestId]} onClick={() => void handleWithdraw(r.requestId)}>
                        {actionState[r.requestId] ? '撤回中' : '撤回'}
                      </button>
                    ) : <span className={styles.tableMeta}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </SectionCard>
  );
}

export default memo(MyTab);
