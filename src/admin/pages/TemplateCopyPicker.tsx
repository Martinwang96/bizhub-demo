/**
 * TemplateCopyPicker — 模板复制选择器（受控组件）
 *
 * 使用场景：
 *  - 管理员在「用户绑定 Modal」/「用户组模板编辑」表单顶部「从他人复制」
 *  - 申请人在「提交申请 Modal」中选择「参考某位同事的数据权限模板」
 *
 * 交互：
 *  1. 顶部 Source Switch：用户 / 用户组
 *  2. 中部 picker：用户输入 loginName 自动补全；用户组下拉
 *  3. 拉取后 4 维度只读预览（产品 / 层级 / Skill / 行权限），数量统计 + 摘要 chip
 *  4. 「填充」按钮触发 onConfirm(template, sourceMeta)
 *
 * 仅做数据权限四维度的复制，不复制页面权限 / 业务角色 / role。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Notice, SelectInput } from '@shared/components';
import {
  fetchGroupTemplate,
  fetchUserTemplate,
  listGroups,
  type DataAclTemplate,
  type DataAclUser,
  type TemplateSnapshot,
  type UserGroup,
} from '../api/dataAcl';
import styles from './TemplateCopyPicker.module.css';

export type TemplateSource = 'user' | 'group';

export interface TemplateCopyPickerProps {
  /** 现有用户列表（可选；用于用户名 datalist 补全）。 */
  candidateUsers?: DataAclUser[];
  /** 当用户点击「填充」按钮时的回调；返回拉取到的模板数据。 */
  onConfirm: (template: DataAclTemplate, meta: { source: TemplateSource; loginName?: string; groupId?: string; name?: string }) => void;
  /** 关闭 / 取消时的回调（用于把 picker 收起；可选）。 */
  onCancel?: () => void;
  /** 默认源；不传默认 user。 */
  defaultSource?: TemplateSource;
  /** 「填充」按钮的文案；默认「填充到表单」。 */
  confirmLabel?: string;
}

function templateSummary(tpl: DataAclTemplate): {
  productCount: number;
  aggCount: number;
  orgCount: number;
  skillCount: number;
  rowCount: number;
} {
  return {
    productCount: tpl.product_ids?.length ?? 0,
    aggCount: tpl.agg_layers?.length ?? 0,
    orgCount: tpl.org_layers?.length ?? 0,
    skillCount: tpl.skills?.length ?? 0,
    rowCount: tpl.row_scopes?.length ?? 0,
  };
}

export function TemplateCopyPicker(props: TemplateCopyPickerProps): React.ReactElement {
  const {
    candidateUsers,
    onConfirm,
    onCancel,
    defaultSource = 'user',
    confirmLabel = '填充到表单',
  } = props;

  const [source, setSource] = useState<TemplateSource>(defaultSource);
  const [loginQuery, setLoginQuery] = useState('');
  const [groupId, setGroupId] = useState('');
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<TemplateSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 切换到「用户组」时按需拉取一次组列表
  useEffect(() => {
    if (source !== 'group' || groups.length > 0 || groupsLoading) return;
    let cancelled = false;
    setGroupsLoading(true);
    listGroups()
      .then((env) => {
        if (cancelled) return;
        if (env.success && Array.isArray(env.data)) {
          setGroups(env.data);
        }
      })
      .catch((e) => console.error('[TemplateCopyPicker] listGroups failed', e))
      .finally(() => { if (!cancelled) setGroupsLoading(false); });
    return () => { cancelled = true; };
  }, [source, groups.length, groupsLoading]);

  const userOptions = useMemo(() => {
    if (!candidateUsers || candidateUsers.length === 0) return [];
    return candidateUsers.map((u) => u.loginName).filter(Boolean);
  }, [candidateUsers]);

  const handleFetch = async () => {
    setError('');
    setSnapshot(null);
    if (source === 'user') {
      const login = loginQuery.trim();
      if (!login) { setError('请填写 loginName'); return; }
      setLoading(true);
      const env = await fetchUserTemplate(login).catch((e) => {
        console.error('[TemplateCopyPicker] fetchUserTemplate failed', e);
        return { success: false, error: e instanceof Error ? e.message : '请求失败' };
      });
      setLoading(false);
      if (!env.success || !('data' in env) || !env.data) {
        setError(('error' in env && env.error) || '拉取参考用户模板失败');
        return;
      }
      setSnapshot(env.data as TemplateSnapshot);
    } else {
      if (!groupId) { setError('请选择用户组'); return; }
      setLoading(true);
      const env = await fetchGroupTemplate(groupId).catch((e) => {
        console.error('[TemplateCopyPicker] fetchGroupTemplate failed', e);
        return { success: false, error: e instanceof Error ? e.message : '请求失败' };
      });
      setLoading(false);
      if (!env.success || !('data' in env) || !env.data) {
        setError(('error' in env && env.error) || '拉取参考组模板失败');
        return;
      }
      setSnapshot(env.data as TemplateSnapshot);
    }
  };

  const handleConfirm = () => {
    if (!snapshot) return;
    onConfirm(snapshot.template, {
      source: snapshot.source,
      loginName: snapshot.loginName,
      groupId: snapshot.groupId,
      name: snapshot.name,
    });
  };

  const summary = snapshot ? templateSummary(snapshot.template) : null;

  return (
    <div className={styles.picker}>
      <div className={styles.header}>
        <span className={styles.title}>从他人复制</span>
        <div className={styles.sourceSwitch} role="tablist" aria-label="复制来源">
          <button
            type="button"
            role="tab"
            aria-selected={source === 'user'}
            className={`${styles.sourceBtn} ${source === 'user' ? styles.sourceBtnActive : ''}`}
            onClick={() => { setSource('user'); setSnapshot(null); setError(''); }}
          >
            参考用户
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={source === 'group'}
            className={`${styles.sourceBtn} ${source === 'group' ? styles.sourceBtnActive : ''}`}
            onClick={() => { setSource('group'); setSnapshot(null); setError(''); }}
          >
            参考组
          </button>
        </div>
      </div>

      <div className={styles.row}>
        {source === 'user' ? (
          <>
            <input
              className={styles.input}
              placeholder="输入参考用户 loginName"
              list="template-copy-picker-users"
              value={loginQuery}
              onChange={(e) => setLoginQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleFetch(); }}
            />
            {userOptions.length > 0 && (
              <datalist id="template-copy-picker-users">
                {userOptions.map((u) => <option key={u} value={u} />)}
              </datalist>
            )}
          </>
        ) : (
          <SelectInput
            className={styles.input}
            value={groupId}
            onChange={setGroupId}
            disabled={groupsLoading}
            options={[
              { value: '', label: groupsLoading ? '加载中...' : '选择参考组' },
              ...groups.map((g) => ({ value: g.groupId, label: `${g.name}（${g.memberCount} 人）` })),
            ]}
          />
        )}
        <button
          type="button"
          className={styles.btnGhost}
          onClick={() => void handleFetch()}
          disabled={loading}
        >
          {loading ? '拉取中...' : '预览模板'}
        </button>
        {onCancel && (
          <button type="button" className={styles.btnText} onClick={onCancel}>取消</button>
        )}
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      {snapshot && summary && (
        <div className={styles.preview}>
          <div className={styles.previewHead}>
            <span className={styles.previewTitle}>
              {snapshot.source === 'user'
                ? <>参考用户 <code>{snapshot.loginName}</code> 的数据权限</>
                : <>参考组 <strong>{snapshot.name || snapshot.groupId}</strong> 的模板</>}
            </span>
          </div>
          <div className={styles.metricsRow}>
            <div className={styles.metric}><span className={styles.metricNum}>{summary.productCount}</span><span className={styles.metricLabel}>产品</span></div>
            <div className={styles.metric}><span className={styles.metricNum}>{summary.aggCount}</span><span className={styles.metricLabel}>聚合层</span></div>
            <div className={styles.metric}><span className={styles.metricNum}>{summary.orgCount}</span><span className={styles.metricLabel}>组织层</span></div>
            <div className={styles.metric}><span className={styles.metricNum}>{summary.skillCount}</span><span className={styles.metricLabel}>Skill</span></div>
            <div className={styles.metric}><span className={styles.metricNum}>{summary.rowCount}</span><span className={styles.metricLabel}>行权限</span></div>
          </div>
          <details className={styles.details}>
            <summary>展开查看明细</summary>
            <div className={styles.detailsBody}>
              <div className={styles.detailLine}>
                <span className={styles.detailLabel}>产品节点：</span>
                {snapshot.template.product_ids.length === 0
                  ? <span className={styles.muted}>—</span>
                  : snapshot.template.product_ids.slice(0, 30).map((p) => <span key={p} className={styles.chip}>{p}</span>)}
                {snapshot.template.product_ids.length > 30 && <span className={styles.muted}> …等共 {snapshot.template.product_ids.length} 项</span>}
              </div>
              <div className={styles.detailLine}>
                <span className={styles.detailLabel}>聚合层：</span>
                {snapshot.template.agg_layers.length === 0
                  ? <span className={styles.muted}>—</span>
                  : snapshot.template.agg_layers.map((v) => <span key={v} className={styles.chip}>{v}</span>)}
              </div>
              <div className={styles.detailLine}>
                <span className={styles.detailLabel}>组织层：</span>
                {snapshot.template.org_layers.length === 0
                  ? <span className={styles.muted}>—</span>
                  : snapshot.template.org_layers.map((v) => <span key={v} className={styles.chip}>{v}</span>)}
              </div>
              <div className={styles.detailLine}>
                <span className={styles.detailLabel}>Skill：</span>
                {snapshot.template.skills.length === 0
                  ? <span className={styles.muted}>—</span>
                  : snapshot.template.skills.map((s) => <span key={s} className={styles.chip}>{s}</span>)}
              </div>
              <div className={styles.detailLine}>
                <span className={styles.detailLabel}>行权限：</span>
                {snapshot.template.row_scopes.length === 0
                  ? <span className={styles.muted}>—</span>
                  : snapshot.template.row_scopes.slice(0, 12).map((rs, i) => (
                    <span key={`${rs.skill_id}-${rs.table}-${i}`} className={styles.chip}>
                      {rs.skill_id} · {rs.table}（{rs.columns?.length ?? 0} 列）
                    </span>
                  ))}
                {snapshot.template.row_scopes.length > 12 && <span className={styles.muted}> …等共 {snapshot.template.row_scopes.length} 项</span>}
              </div>
            </div>
          </details>
          <div className={styles.confirmRow}>
            <button type="button" className={styles.btnPrimary} onClick={handleConfirm}>{confirmLabel}</button>
            <span className={styles.confirmHint}>填充后，可在表单中继续微调，仍需点击保存才会生效。</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default TemplateCopyPicker;
