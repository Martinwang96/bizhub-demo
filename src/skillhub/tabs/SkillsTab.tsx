/**
 * SkillsTab — 技能列表 Tab
 *
 * v2.7：行操作支持「下线 / 上线」（approval / admin 可见），点击即生效（不再弹
 * 二次确认 / 理由输入框）；切换成功后立即刷新列表，下线 skill 行整体置灰但仍展示。
 */
import { memo, useCallback, useEffect, useState } from 'react';
import { Dropdown } from 'tdesign-react';
import { getJson, postJson } from '@shared/api/httpClient';
import { normalizeSkillsResponse, skillApiBasePathFromSkill, type SkillItem as Skill } from '../apiAdapters';
import { CountPill, EmptyState, Notice, SectionCard, SelectInput, SkeletonStack, TableWrap, useToast } from '@shared/components';
import SkillMdViewer from '../components/SkillMdViewer';
import type { RegisterRefresh } from '../SkillHubApp';
import styles from '@shared/components/common.module.css';
import local from './SkillsTab.module.css';

const STATUS_FILTERS = ['', 'active', 'degraded', 'unavailable'];

interface Props {
  onRegisterRefresh?: RegisterRefresh;
}

interface ConfigSnapshot {
  is_approver?: boolean;
  role?: string;
  skill_hub_roles?: string[];
}

function SkillsTab({ onRegisterRefresh }: Props) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterOwner, setFilterOwner] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterQ, setFilterQ] = useState('');
  const [owners, setOwners] = useState<string[]>([]);
  const [viewerSkill, setViewerSkill] = useState<Skill | null>(null);
  const [isApprover, setIsApprover] = useState(false);
  const [busySkillId, setBusySkillId] = useState<string>('');
  const toast = useToast();

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    // silent：切换上下线后的后台刷新，不切骨架屏，避免表格被替换导致页面跳到顶部
    if (!opts?.silent) {
      setLoading(true);
      setError('');
    }
    try {
      const env = await getJson<unknown>('/skill-hub/api/skills');
      if (env.success) {
        const nextSkills = normalizeSkillsResponse(env.data);
        setSkills(nextSkills);
        const ownerSet = new Set(nextSkills.map((s) => s.owner ?? '').filter(Boolean));
        setOwners(Array.from(ownerSet));
      } else if (!opts?.silent) setError(env.error ?? '技能列表加载失败');
    } catch (e) {
      if (!opts?.silent) setError(e instanceof Error ? e.message : '技能列表加载失败');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // 拉一次 config 判定是否 approver / admin（决定下线按钮可见性）
  useEffect(() => {
    let alive = true;
    void getJson<ConfigSnapshot>('/skill-hub/api/config').then((env) => {
      if (!alive) return;
      const data = env.success ? env.data : undefined;
      const role = data?.role ?? '';
      const roles = data?.skill_hub_roles ?? [];
      const approver = !!data?.is_approver || role === 'admin' || role === 'approver' || roles.includes('approval');
      setIsApprover(approver);
    }).catch(() => { /* 静默：approver 默认 false 即可 */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    onRegisterRefresh?.(load);
    return () => onRegisterRefresh?.(null);
  }, [onRegisterRefresh, load]);

  const filtered = skills.filter((s) => {
    if (filterOwner && (s.owner ?? '') !== filterOwner) return false;
    if (filterStatus && s.status !== filterStatus) return false;
    if (filterQ) {
      const q = filterQ.toLowerCase();
      return s.skillId.toLowerCase().includes(q)
        || (s.description ?? '').toLowerCase().includes(q)
        || (s.tables ?? []).some((t) => t.toLowerCase().includes(q));
    }
    return true;
  });

  const statusTag = (status?: string) => {
    if (status === 'active') return <span className={`${styles.tag} ${styles.tagSuccess}`}>正常</span>;
    if (status === 'degraded') return <span className={`${styles.tag} ${styles.tagWarn}`}>部分受限</span>;
    if (status === 'unavailable') return <span className={`${styles.tag} ${styles.tagDanger}`}>已下线</span>;
    return <span className={`${styles.tag} ${styles.tagMuted}`}>{status || '未知'}</span>;
  };

  const exportZip = (skill: Skill) => {
    window.open(`${skillApiBasePathFromSkill(skill)}/export`, '_blank', 'noopener,noreferrer');
  };

  /**
   * 切换下线 / 上线：直接发请求，不再弹 confirm / prompt。
   *
   * 历史上这里走两步弹窗（confirm 影响说明 + prompt 收集 reason），但下线本身
   * 是可逆操作（上线立即恢复，绑定不被清理），二次确认价值低；理由字段后端
   * 保持兼容（未传按空串入 audit log）。
   *
   * 成功后局部 setState 立即翻面（避免再次 GET 等待），同时再 load 一次以
   * 同步 availability_overlay 等 meta 字段。
   */
  const toggleAvailability = useCallback(async (skill: Skill) => {
    const isDown = skill.status === 'unavailable';
    const next = isDown ? 'active' : 'unavailable';

    setBusySkillId(skill.skillId);
    try {
      const env = await postJson<{ status?: string }>(
        `${skillApiBasePathFromSkill(skill)}/availability`,
        { status: next, reason: '' },
      );
      if (!env.success) {
        toast.error(env.error ?? '操作失败');
        return;
      }
      // 乐观更新
      setSkills((prev) => prev.map((s) =>
        s.skillId === skill.skillId ? { ...s, status: env.data?.status ?? next } : s,
      ));
      toast.success(next === 'unavailable' ? `已下线 ${skill.skillId}` : `已上线 ${skill.skillId}`);
      // 后台再 load 一遍，拿最新 overlay / 时间戳；静默刷新不动骨架屏，保持滚动位置
      void load({ silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusySkillId('');
    }
  }, [load, toast]);

  return (
    <SectionCard eyebrow="Registry" title="已注册的技能" description="查看当前可用技能、归属团队、运行状态、版本、依赖和原文。" meta={<CountPill>{filtered.length}</CountPill>}>
      <div className={`${styles.toolbar} ${local.toolbarTight}`}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel} htmlFor="skill-owner-filter">Owner</label>
          <SelectInput
            id="skill-owner-filter"
            className={styles.field}
            surface="solid"
            value={filterOwner}
            onChange={setFilterOwner}
            allowInput={false}
            clearable={false}
            options={[{ value: '', label: '全部' }, ...owners.map((o) => ({ value: o, label: o }))]}
          />
        </div>
        <div className={styles.filterGroup} aria-label="状态过滤">
          <span className={styles.filterLabel}>状态</span>
          {STATUS_FILTERS.map((s) => <button key={s} type="button" className={`${styles.chipButton} ${filterStatus === s ? styles.chipButtonActive : ''}`} onClick={() => setFilterStatus(s)}>{s === '' ? '全部' : s}</button>)}
        </div>
        <div className={styles.toolbarSpacer} />
        <input className={styles.searchInput} value={filterQ} onChange={(e) => setFilterQ(e.target.value)} placeholder="搜索 skill id / 描述 / 表名" aria-label="搜索技能" />
      </div>

      {error && <Notice tone="danger" title="操作失败">{error}</Notice>}
      {loading ? <SkeletonStack widths={[72, 92, 64, 86, 58]} /> : filtered.length === 0 ? <EmptyState title="暂无匹配技能" description="调整 Owner、状态或搜索词后再试。" /> : (
        <TableWrap>
          <table className={`${styles.table} ${local.centered}`}>
            <thead><tr><th>Skill ID</th><th>Owner</th><th>描述</th><th>状态</th><th>版本</th><th>发布时间</th><th>Tables</th><th>下游</th><th>来源</th><th className={local.cellActionsCol}>操作</th></tr></thead>
            <tbody>
              {filtered.map((s) => {
                const tablesText = s.tables?.join(', ') || '—';
                const downstreamText = s.downstream?.join(', ') || '—';
                const isDown = s.status === 'unavailable';
                const busy = busySkillId === s.skillId;
                return (
                  <tr key={s.skillId}>
                    <td className={local.cellId} title={s.skillId}>
                      <code>{s.skillId}</code>
                      {s.access === 'public' && <span className={local.publicBadge}>公共</span>}
                    </td>
                    <td className={local.cellNoWrap}>{s.owner || '_'}</td>
                    <td className={`${styles.tableSub} ${local.cellDesc}`} title={s.description || ''}>{s.description || '—'}</td>
                    <td className={local.cellNoWrap}>{statusTag(s.status)}</td>
                    <td className={`${styles.tableMeta} ${local.cellNoWrap}`}>{s.version || '—'}</td>
                    <td className={`${styles.tableMeta} ${local.cellNoWrap}`}>{s.updatedAt ? new Date(s.updatedAt * 1000).toLocaleString('zh-CN') : '—'}</td>
                    <td className={`${styles.tableSub} ${local.cellList}`} title={tablesText}>{tablesText}</td>
                    <td className={`${styles.tableSub} ${local.cellList}`} title={downstreamText}>{downstreamText}</td>
                    <td className={`${styles.tableMeta} ${local.cellNoWrap}`}>{s.source || 'registry'}</td>
                    <td className={local.cellActionsCol}>
                      <Dropdown
                        direction="right"
                        placement="right"
                        trigger="click"
                        hideAfterItemClick
                        minColumnWidth={96}
                        popupProps={{
                          popperOptions: {
                            modifiers: [
                              { name: 'flip', enabled: false },
                            ],
                          },
                        }}
                        options={[
                          { content: '原文', value: 'view' },
                          { content: '导出', value: 'export' },
                          ...(isApprover
                            ? [{
                                content: busy ? '处理中…' : (isDown ? '上线' : '下线'),
                                value: 'toggle',
                                theme: (isDown ? 'default' : 'error') as 'default' | 'error',
                              }]
                            : []),
                        ]}
                        onClick={(data) => {
                          if (data.value === 'view') setViewerSkill(s);
                          else if (data.value === 'export') exportZip(s);
                          else if (data.value === 'toggle' && !busy) void toggleAvailability(s);
                        }}
                      >
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnSm} ${styles.btnGhost}`}
                        >
                          操作
                        </button>
                      </Dropdown>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}

      <SkillMdViewer
        open={viewerSkill !== null}
        skill={viewerSkill}
        onClose={() => setViewerSkill(null)}
      />
    </SectionCard>
  );
}

export default memo(SkillsTab);
