import { useEffect, useRef, useState } from 'react';
import type { PermissionUser } from '../../../../admin/api/permissions';
import styles from './MobileUserCard.module.css';

interface MobileUserCardProps {
  user: PermissionUser;
  readonly: boolean;
  pendingDelete: boolean;
  onEdit: (u: PermissionUser) => void;
  onArmDelete: (login: string) => void;
}

function bizChipClass(role: string): string {
  if (role === 'admin') return styles.chipPrimary;
  if (role === 'manager') return styles.chipAccent;
  return styles.chipMuted;
}

export default function MobileUserCard({ user, readonly, pendingDelete, onEdit, onArmDelete }: MobileUserCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const node = wrapRef.current;
      if (node && !node.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const initial = (user.loginName.charAt(0) || '?').toUpperCase();
  const skipValidation = user.dataAclMode === 'bypass';
  const hasSkillUser = user.skillHubRoles.includes('user');
  const hasApproval = user.skillHubRoles.includes('approval');
  const hasReadonly = user.adminConsoleRole === 'readonly';

  return (
    <article ref={wrapRef} className={styles.card} aria-label={`授权用户 ${user.loginName}`}>
      <div className={styles.row}>
        <div className={styles.avatar} aria-hidden="true">{initial}</div>
        <div className={styles.idGroup}>
          <div className={styles.nameLine}>
            <span className={styles.name}>{user.loginName}</span>
            {user.isEnvAdmin && (
              <span className={`${styles.chip} ${styles.chipEnv}`} title="环境变量保护">Env 保护</span>
            )}
          </div>
          <div className={styles.metaLine}>
            <span className={`${styles.chip} ${bizChipClass(user.bizRole)}`}>{user.bizRole}</span>
            {user.addedBy && !user.isEnvAdmin && (
              <span className={styles.metaText}>添加人 {user.addedBy}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          className={styles.moreBtn}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`${user.loginName} 的更多操作`}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="19" cy="12" r="1.6" />
          </svg>
        </button>
        {menuOpen && (
          <div className={styles.menu} role="menu">
            <button
              type="button"
              className={styles.menuItem}
              role="menuitem"
              disabled={readonly}
              onClick={() => {
                setMenuOpen(false);
                onEdit(user);
              }}
            >
              编辑
            </button>
            <button
              type="button"
              className={`${styles.menuItem} ${pendingDelete ? styles.menuItemDangerActive : styles.menuItemDanger}`}
              role="menuitem"
              disabled={readonly || user.isEnvAdmin}
              title={user.isEnvAdmin ? '环境变量保护，不能删除' : pendingDelete ? '再次点击确认删除' : '点击两次以删除'}
              onClick={() => {
                onArmDelete(user.loginName);
                if (pendingDelete) setMenuOpen(false);
              }}
            >
              {pendingDelete ? '再次点击确认' : '删除'}
            </button>
          </div>
        )}
      </div>

      <div className={styles.tagsRow}>
        {hasSkillUser && <span className={`${styles.chip} ${styles.chipMuted}`}>Skill user</span>}
        {hasApproval && <span className={`${styles.chip} ${styles.chipWarn}`}>Skill approval</span>}
        {hasReadonly && <span className={`${styles.chip} ${styles.chipMuted}`}>Console readonly</span>}
        {!hasSkillUser && !hasApproval && !hasReadonly && (
          <span className={styles.metaText}>无附加权限</span>
        )}
        <span className={styles.spacer} />
        <span className={skipValidation ? styles.validateSkip : styles.validateExec}>
          {skipValidation ? (
            <>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              跳过校验
            </>
          ) : (
            '执行校验'
          )}
        </span>
      </div>
    </article>
  );
}
