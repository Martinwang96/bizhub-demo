import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  deletePermission,
  fetchPermissions,
  savePermission,
  savePermissionsBatch,
} from '../api/permissions';
import type { BatchPermissionResult, PermissionPatch, PermissionUser, PermissionsSnapshot } from '../api/permissions';
import { EmptyState, Modal, Notice, SectionCard, SelectInput, SkeletonStack, useToast } from '@shared/components';
import type { AdminOutletContext } from '../components/AdminShell';
import styles from './PermissionsPage.module.css';

type ModalState =
  | { mode: 'configure' }
  | { mode: 'edit'; user: PermissionUser }
  | { mode: 'batch'; loginNames: string[] }
  | null;

type BizChoice = 'keep' | 'user' | 'manager';
type SkillChoice = 'keep' | 'none' | 'user' | 'approval';
type ConsoleChoice = 'keep' | 'none' | 'readonly';

function bizTagClass(role: string) {
  if (role === 'admin') return styles.tagPrimary;
  if (role === 'manager') return styles.tagSuccess;
  return styles.tagMuted;
}
function consoleTagClass(role: string | undefined | null) {
  if (role === 'admin') return styles.tagPrimary;
  if (role === 'readonly') return styles.tagMuted;
  return styles.tagMuted;
}
function skillTagClass(role: string) {
  if (role === 'approval') return styles.tagWarn;
  return styles.tagMuted;
}
function parseLoginNames(text: string) {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const names: string[] = [];
  text.replace(/，/g, ',').split(/[\n,]+/).forEach((raw) => {
    const name = raw.trim();
    if (!name) return;
    if (seen.has(name)) {
      duplicates.push(name);
      return;
    }
    seen.add(name);
    names.push(name);
  });
  return { names, duplicates };
}
function skillRoles(choice: SkillChoice) {
  if (choice === 'user') return ['user'];
  if (choice === 'approval') return ['user', 'approval'];
  if (choice === 'none') return [];
  return undefined;
}
function skillChoiceFromUser(user: PermissionUser): SkillChoice {
  if (user.skillHubRoles.includes('approval')) return 'approval';
  if (user.skillHubRoles.includes('user')) return 'user';
  return 'none';
}
function patchFromChoices(biz: BizChoice, skill: SkillChoice, consoleRole: ConsoleChoice): PermissionPatch {
  const patch: PermissionPatch = {};
  if (biz !== 'keep') patch.bizRole = biz;
  const roles = skillRoles(skill);
  if (roles) patch.skillHubRoles = roles;
  if (consoleRole !== 'keep') patch.adminConsoleRole = consoleRole === 'readonly' ? 'readonly' : '';
  return patch;
}

export default function PermissionsPage() {
  const { me, setTopbar } = useOutletContext<AdminOutletContext>();
  const toast = useToast();
  const readonly = me?.adminConsoleRole === 'readonly';

  const [data, setData] = useState<PermissionsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    const env = await fetchPermissions().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : '加载失败');
      return null;
    });
    if (env?.success && env.data) setData(env.data);
    else if (env && !env.success) setError(env.error ?? '加载失败');
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    setTopbar({
      title: '用户页面权限管理',
      description: '集中查看和维护 Biz Hub、Skill Hub、管理后台权限。',
    });
    return () => setTopbar(null);
  }, [setTopbar]);

  const selectableLogins = useMemo(
    () => (data?.users || []).filter((u) => !u.isEnvAdmin).map((u) => u.loginName),
    [data],
  );
  const allSelected = selectableLogins.length > 0 && selectableLogins.every((login) => selected.includes(login));

  const toggleSelect = (login: string) => {
    setSelected((prev) => prev.includes(login) ? prev.filter((x) => x !== login) : [...prev, login]);
  };
  const toggleAll = () => {
    setSelected(allSelected ? [] : selectableLogins);
  };

  const armDelete = (login: string) => {
    if (readonly) {
      toast.warning('只读角色无权执行此操作');
      return;
    }
    if (pendingDelete === login) {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
      setPendingDelete(null);
      void doDelete(login);
      return;
    }
    setPendingDelete(login);
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = setTimeout(() => {
      setPendingDelete(null);
      pendingTimerRef.current = null;
    }, 2400);
  };

  const doDelete = async (login: string) => {
    const env = await deletePermission(login).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : '删除失败');
      return null;
    });
    if (env?.success) {
      toast.success(`已删除 ${login}`);
      setSelected((prev) => prev.filter((x) => x !== login));
      await load();
    } else if (env) {
      toast.error(env.error ?? '删除失败');
    }
  };

  return (
    <div className={styles.page}>
      {readonly && <Notice tone="warning" title="只读角色">当前账号为只读角色，写操作已被禁用。</Notice>}
      {error && <Notice tone="danger" title="加载失败">{error}</Notice>}

      {data && (
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Biz Admin</span>
            <span className={styles.statNum}>{data.summary.bizHub.admin}</span>
            <span className={styles.statHint}>环境变量保护</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Biz Manager</span>
            <span className={styles.statNum}>{data.summary.bizHub.manager}</span>
            <span className={styles.statHint}>跳过 Data ACL</span>
          </div>
          <div className={`${styles.statCard} ${styles.statCardWarn}`}>
            <span className={styles.statLabel}>Skill Approval</span>
            <span className={styles.statNum}>{data.summary.skillHub.approval}</span>
            <span className={styles.statHint}>可审批发布</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Console Readonly</span>
            <span className={styles.statNum}>{data.summary.adminConsole.readonly}</span>
            <span className={styles.statHint}>只读后台</span>
          </div>
        </div>
      )}

      <div className={styles.threeRow}>
        <article className={styles.infoCard}><h3>Biz Hub 主页面权限</h3><p>admin 来自环境变量；manager 跳过用户数据权限校验；user 执行用户数据权限校验。</p></article>
        <article className={styles.infoCard}><h3>Skill Hub 权限</h3><p>approval 可审批 Skill 发布；user 可上传和查看 Skill。</p></article>
        <article className={styles.infoCard}><h3>管理后台权限</h3><p>admin 来自环境变量；readonly 只能查看权限、数据权限、Session 和日志。</p></article>
      </div>

      <SectionCard
        eyebrow="Permissions"
        title="用户页面权限列表"
        description="集中查看和维护 Biz Hub、Skill Hub、管理后台权限。"
      >
        <div className={styles.toolbar}>
          <button type="button" className={styles.btnPrimary} onClick={() => setModal({ mode: 'configure' })} disabled={readonly}>配置</button>
          <button type="button" className={styles.btnGhost} onClick={() => setModal({ mode: 'batch', loginNames: selected })} disabled={readonly || selected.length === 0}>变更</button>
          <button type="button" className={styles.btnGhost} onClick={() => void load()}>刷新</button>
          <div className={styles.toolbarSpacer} />
          <span className={styles.selectionSummary}>已选择 {selected.length} 个用户</span>
        </div>

        {loading ? (
          <SkeletonStack widths={[80, 92, 70, 86]} />
        ) : !data ? (
          <Notice tone="danger">{error || '加载失败'}</Notice>
        ) : data.users.length === 0 ? (
          <EmptyState title="暂无用户权限记录" description="点击「配置」为用户分配 Biz Hub、Skill Hub 或管理后台权限。" />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.colSelect}><input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={readonly || selectableLogins.length === 0} aria-label="全选用户" /></th>
                  <th>用户</th>
                  <th>Biz Hub</th>
                  <th>Skill Hub</th>
                  <th>管理后台</th>
                  <th>数据权限</th>
                  <th>来源</th>
                  <th className={styles.colActions}>操作</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => {
                  const isPending = pendingDelete === u.loginName;
                  const selectable = !readonly && !u.isEnvAdmin;
                  return (
                    <tr key={u.loginName} className={selected.includes(u.loginName) ? styles.rowSelected : ''}>
                      <td className={styles.colSelect}><input type="checkbox" checked={selected.includes(u.loginName)} disabled={!selectable} onChange={() => toggleSelect(u.loginName)} aria-label={`选择 ${u.loginName}`} title={u.isEnvAdmin ? '环境变量管理员不可批量变更' : undefined} /></td>
                      <td><strong>{u.loginName}</strong></td>
                      <td><span className={`${styles.tag} ${bizTagClass(u.bizRole)}`}>{u.bizRole}</span></td>
                      <td>
                        {u.skillHubRoles.length === 0 ? <span className={styles.muted}>—</span> : u.skillHubRoles.map((r) => <span key={r} className={`${styles.tag} ${skillTagClass(r)}`}>{r}</span>)}
                      </td>
                      <td><span className={`${styles.tag} ${consoleTagClass(u.adminConsoleRole)}`}>{u.adminConsoleRole || '无'}</span></td>
                      <td>{u.dataAclMode === 'bypass' ? <span className={`${styles.statusPill} ${styles.statusPillBypass}`}><span className={styles.statusDot} />跳过校验</span> : <span className={`${styles.statusPill} ${styles.statusPillEnforce}`}><span className={styles.statusDot} />执行校验</span>}</td>
                      <td className={styles.tableMeta}>{u.isEnvAdmin ? <span className={`${styles.tag} ${styles.tagPrimary}`}>环境变量保护</span> : (u.addedBy || '—')}</td>
                      <td className={styles.colActions}>
                        <button type="button" className={styles.btnTextPrimary} onClick={() => setModal({ mode: 'edit', user: u })} disabled={readonly}>编辑</button>
                        <button type="button" className={isPending ? styles.btnTextDangerActive : styles.btnTextDanger} onClick={() => armDelete(u.loginName)} disabled={readonly || u.isEnvAdmin} title={u.isEnvAdmin ? '环境变量保护，不能删除' : isPending ? '再次点击确认删除' : '点击两次以删除'}>{isPending ? '确认删除？' : '删除'}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <PermissionConfigModal
        modal={modal}
        existingUsers={data?.users || []}
        readonly={readonly}
        onClose={() => setModal(null)}
        onSaved={async (clearSelection) => {
          if (clearSelection) setSelected([]);
          await load();
        }}
      />
    </div>
  );
}

function PermissionConfigModal({
  modal,
  existingUsers,
  readonly,
  onClose,
  onSaved,
}: {
  modal: ModalState;
  existingUsers: PermissionUser[];
  readonly: boolean;
  onClose: () => void;
  onSaved: (clearSelection: boolean) => Promise<void>;
}) {
  const toast = useToast();
  const editing = modal?.mode === 'edit' ? modal.user : null;
  const fixedLogins = modal?.mode === 'batch' ? modal.loginNames : editing ? [editing.loginName] : [];
  const batchMode = modal?.mode === 'batch';
  const configureMode = modal?.mode === 'configure';

  const [loginText, setLoginText] = useState('');
  const [biz, setBiz] = useState<BizChoice>('user');
  const [skill, setSkill] = useState<SkillChoice>('none');
  const [consoleRole, setConsoleRole] = useState<ConsoleChoice>('none');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<BatchPermissionResult | null>(null);

  useEffect(() => {
    if (!modal) return;
    setResult(null);
    if (modal.mode === 'edit') {
      setLoginText(modal.user.loginName);
      setBiz(modal.user.bizRole === 'manager' ? 'manager' : 'user');
      setSkill(skillChoiceFromUser(modal.user));
      setConsoleRole(modal.user.adminConsoleRole === 'readonly' ? 'readonly' : 'none');
    } else if (modal.mode === 'batch') {
      setLoginText(modal.loginNames.join('\n'));
      setBiz('keep');
      setSkill('keep');
      setConsoleRole('keep');
    } else {
      setLoginText('');
      setBiz('user');
      setSkill('none');
      setConsoleRole('none');
    }
  }, [modal]);

  const parsed = parseLoginNames(configureMode ? loginText : fixedLogins.join('\n'));
  const existingSet = useMemo(() => new Set(existingUsers.map((u) => u.loginName)), [existingUsers]);
  const newCount = parsed.names.filter((n) => !existingSet.has(n)).length;
  const existingCount = parsed.names.length - newCount;
  const title = modal?.mode === 'edit' ? `编辑权限 · ${editing?.loginName}` : modal?.mode === 'batch' ? '批量变更权限' : '配置用户权限';

  const handleSubmit = async () => {
    if (!modal) return;
    if (readonly) { toast.warning('只读角色无权执行此操作'); return; }
    if (parsed.names.length === 0) { toast.warning('请输入 loginName'); return; }
    setSaving(true);
    setResult(null);
    if (modal.mode === 'edit' && editing) {
      const env = await savePermission(editing.loginName, {
        bizRole: biz === 'manager' ? 'manager' : 'user',
        skillHubRoles: skillRoles(skill) || [],
        adminConsoleRole: consoleRole === 'readonly' ? 'readonly' : '',
      }).catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : '保存失败');
        return null;
      });
      setSaving(false);
      if (env?.success) {
        toast.success(`已更新 ${editing.loginName} 的权限`);
        onClose();
        await onSaved(false);
      } else if (env) toast.error(env.error ?? '保存失败');
      return;
    }
    const patch = patchFromChoices(biz, skill, consoleRole);
    if (Object.keys(patch).length === 0) {
      setSaving(false);
      toast.warning('请选择至少一项要变更的权限');
      return;
    }
    const env = await savePermissionsBatch({ loginNames: parsed.names, ...patch }).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : '保存失败');
      return null;
    });
    setSaving(false);
    if (env?.success && env.data) {
      setResult(env.data);
      const { updated, failed, skipped } = env.data.counts;
      if (failed === 0 && skipped === 0) {
        toast.success(`已更新 ${updated} 个用户`);
        onClose();
        await onSaved(batchMode);
      } else {
        toast.warning(`已更新 ${updated} 个用户，${failed + skipped} 个需处理`);
        await onSaved(false);
      }
    } else if (env) toast.error(env.error ?? '保存失败');
  };

  if (!modal) return null;

  return (
    <Modal open onClose={onClose} title={title} meta={batchMode ? `已选择 ${fixedLogins.length} 个用户` : undefined} width={720}>
      <div className={styles.modalForm}>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>用户</label>
          {configureMode ? (
            <textarea className={`${styles.input} ${styles.textarea}`} rows={5} value={loginText} onChange={(e) => setLoginText(e.target.value)} placeholder="alice\nbob, charlie" />
          ) : (
            <div className={styles.userPreview}>{fixedLogins.map((login) => <span key={login} className={`${styles.tag} ${styles.tagMuted}`}>{login}</span>)}</div>
          )}
          <span className={styles.formHint}>支持按行或英文逗号分隔。当前解析 {parsed.names.length} 个用户；现有 {existingCount} 个，新用户 {newCount} 个。</span>
          {parsed.duplicates.length > 0 && <span className={styles.formHint}>已自动忽略重复项：{parsed.duplicates.join(', ')}</span>}
        </div>

        <div className={styles.formGrid}>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Biz Hub</label>
            <SelectInput
              className={styles.input}
              value={biz}
              onChange={(next) => setBiz(next as BizChoice)}
              options={[
                ...(batchMode ? [{ value: 'keep', label: '不修改' }] : []),
                { value: 'user', label: 'Biz user' },
                { value: 'manager', label: 'Biz manager' },
              ]}
            />
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Skill Hub</label>
            <SelectInput
              className={styles.input}
              value={skill}
              onChange={(next) => setSkill(next as SkillChoice)}
              options={[
                ...(batchMode ? [{ value: 'keep', label: '不修改' }] : []),
                { value: 'none', label: '无' },
                { value: 'user', label: 'Skill user' },
                { value: 'approval', label: 'Skill approval + user' },
              ]}
            />
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>管理后台</label>
            <SelectInput
              className={styles.input}
              value={consoleRole}
              onChange={(next) => setConsoleRole(next as ConsoleChoice)}
              options={[
                ...(batchMode ? [{ value: 'keep', label: '不修改' }] : []),
                { value: 'none', label: '无' },
                { value: 'readonly', label: 'Console readonly' },
              ]}
            />
          </div>
        </div>

        {result && (result.failed.length > 0 || result.skipped.length > 0) && (
          <div className={styles.resultBox}>
            {[...result.failed, ...result.skipped].map((item, index) => (
              <div key={`${item.loginName}-${index}`} className={styles.resultLine}>
                <strong>{item.loginName || '空用户'}</strong><span>{item.error || item.reason || '处理失败'}</span>
              </div>
            ))}
          </div>
        )}

        <div className={styles.modalFooter}>
          <span className={styles.formHint}>环境变量 admin 仍由后端保护，不可降级或配置 readonly。</span>
          <div className={styles.footerActions}>
            <button type="button" className={styles.btnGhost} onClick={onClose} disabled={saving}>取消</button>
            <button type="button" className={styles.btnPrimary} onClick={() => void handleSubmit()} disabled={readonly || saving}>{saving ? '保存中…' : '保存'}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
