import { useEffect, useRef, useState } from 'react';
import { Notice, SkeletonStack, useToast } from '@shared/components';
import type { Me } from '@shared/types/user';
import { fetchPermissions, savePermission, deletePermission } from '../../../admin/api/permissions';
import type { PermissionUser, PermissionsSnapshot } from '../../../admin/api/permissions';
import MobileBottomSheet from '../../shared/MobileBottomSheet';
import MobilePageHeader from './parts/MobilePageHeader';
import MobileStatsGrid from './parts/MobileStatsGrid';
import MobileUserCard from './parts/MobileUserCard';
import MobileAuthorizeSheetForm, { type AuthorizeFormState } from './parts/MobileAuthorizeSheetForm';
import MobilePermissionGuideSheet from './parts/MobilePermissionGuideSheet';
import MobileAdminNavDrawer, { MobileAdminNavTrigger } from './parts/MobileAdminNavDrawer';
import styles from './MobilePermissionsPage.module.css';

const EMPTY_FORM: AuthorizeFormState = { loginName: '', bizRole: 'user', skillUser: false, approval: false, readonly: false };
type SheetMode = 'authorize' | 'guide' | null;

export interface MobilePermissionsPageProps {
  me: Me | null;
}

export default function MobilePermissionsPage({ me }: MobilePermissionsPageProps) {
  const toast = useToast();
  const readonly = me?.adminConsoleRole === 'readonly';

  // 与 PC 版 PermissionsPage 保持完全一致的状态机
  const [data, setData] = useState<PermissionsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState<AuthorizeFormState>({ ...EMPTY_FORM });
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [navOpen, setNavOpen] = useState(false);

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

  const reset = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
  };

  const beginEdit = (u: PermissionUser) => {
    setEditing(u.loginName);
    setForm({
      loginName: u.loginName,
      bizRole: u.bizRole || 'user',
      skillUser: u.skillHubRoles.includes('user'),
      approval: u.skillHubRoles.includes('approval'),
      readonly: u.adminConsoleRole === 'readonly',
    });
    setSheetMode('authorize');
  };

  const openAuthorize = () => {
    if (readonly) {
      toast.warning('只读角色无权执行此操作');
      return;
    }
    reset();
    setSheetMode('authorize');
  };

  const closeSheet = () => {
    setSheetMode(null);
    if (sheetMode === 'authorize') {
      reset();
    }
  };

  const handleSave = async () => {
    if (readonly) {
      toast.warning('只读角色无权执行此操作');
      return;
    }
    const login = form.loginName.trim();
    if (!login) {
      toast.warning('请输入 loginName');
      return;
    }
    setSaving(true);
    const skillHubRoles: string[] = [];
    if (form.skillUser) skillHubRoles.push('user');
    if (form.approval) {
      skillHubRoles.push('approval');
      if (!form.skillUser) skillHubRoles.unshift('user');
    }
    const env = await savePermission(login, {
      bizRole: form.bizRole,
      skillHubRoles,
      adminConsoleRole: form.readonly ? 'readonly' : '',
    }).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : '保存失败');
      return null;
    });
    setSaving(false);
    if (env?.success) {
      toast.success(editing ? `已更新 ${login} 的权限` : `已为 ${login} 创建权限`);
      reset();
      setSheetMode(null);
      await load();
    } else if (env) {
      toast.error(env.error ?? '保存失败');
    }
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
      await load();
    } else if (env) {
      toast.error(env.error ?? '删除失败');
    }
  };

  const users = data?.users ?? [];

  return (
    <>
      <MobilePageHeader
        me={me}
        title="用户页面权限管理"
        addDisabled={!!readonly}
        onAdd={openAuthorize}
        onOpenGuide={() => setSheetMode('guide')}
        leading={<MobileAdminNavTrigger onClick={() => setNavOpen(true)} />}
      />

      <main className={styles.main}>
        {readonly && (
          <Notice tone="warning" title="只读角色">
            当前账号为只读角色，写操作已被禁用。
          </Notice>
        )}
        {error && (
          <Notice tone="danger" title="加载失败">{error}</Notice>
        )}

        {data && (
          <MobileStatsGrid summary={data.summary} onCardClick={() => setSheetMode('guide')} />
        )}

        <section className={styles.section} aria-label="授权用户列表">
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>授权用户</h2>
            {data && (
              <span className={styles.sectionMeta}>{users.length} 位</span>
            )}
          </header>

          {loading ? (
            <div className={styles.skeletonWrap}>
              <SkeletonStack widths={[80, 92, 70, 86]} />
            </div>
          ) : !data ? (
            <Notice tone="danger">{error || '暂无数据'}</Notice>
          ) : users.length === 0 ? (
            <div className={styles.empty}>
              暂无授权用户，点击右上 <strong>+</strong> 新增。
            </div>
          ) : (
            <div className={styles.cardList}>
              {users.map((u) => (
                <MobileUserCard
                  key={u.loginName}
                  user={u}
                  readonly={!!readonly}
                  pendingDelete={pendingDelete === u.loginName}
                  onEdit={beginEdit}
                  onArmDelete={armDelete}
                />
              ))}
              <div className={styles.listEnd}>— 已显示全部 {users.length} 位用户 —</div>
            </div>
          )}
        </section>
      </main>

      <MobileAdminNavDrawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        activeId="permissions"
      />

      <MobileBottomSheet
        open={sheetMode === 'authorize'}
        title={editing ? `编辑权限 · ${editing}` : '新增授权'}
        onClose={closeSheet}
        footer={
          <>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={closeSheet}
              disabled={saving}
            >
              取消
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => void handleSave()}
              disabled={readonly || saving}
            >
              {saving ? '保存中…' : editing ? '保存修改' : '保存权限'}
            </button>
          </>
        }
      >
        <MobileAuthorizeSheetForm
          form={form}
          setForm={setForm}
          editing={editing}
          readonly={!!readonly}
          saving={saving}
        />
      </MobileBottomSheet>

      <MobileBottomSheet
        open={sheetMode === 'guide'}
        title="权限说明"
        onClose={closeSheet}
      >
        <MobilePermissionGuideSheet />
      </MobileBottomSheet>
    </>
  );
}
