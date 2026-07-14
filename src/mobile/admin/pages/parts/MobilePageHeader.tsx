import type { ReactNode } from 'react';
import type { Me } from '@shared/types/user';
import MobileBackToChatButton from '../../../shared/MobileBackToChatButton';
import MobileAppSwitchButton from '../../../shared/MobileAppSwitchButton';
import styles from './MobilePageHeader.module.css';

interface MobilePageHeaderProps {
  title: string;
  /** 是否禁用「+」按钮（如只读角色） */
  addDisabled?: boolean;
  onAdd: () => void;
  onOpenGuide: () => void;
  /** 左侧 leading 槽：默认渲染装饰 icon；通常传入「左抽屉触发汉堡按钮」 */
  leading?: ReactNode;
  /** 当前用户：用于判定是否渲染「技能管理」互切入口 */
  me?: Me | null;
}

/**
 * 移动端 Permissions / Data ACL 页面 sticky Header。
 * - 左：leading 槽（默认装饰 icon，admin 移动端会注入汉堡触发按钮）+ 页面标题
 * - 右：「技能管理」(可选) + 「返回对话」ghost + 「说明」ghost btn + 「+」primary btn
 */
export default function MobilePageHeader({ title, addDisabled, onAdd, onOpenGuide, leading, me }: MobilePageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.titleGroup}>
        {leading ?? (
          <span className={styles.iconWrap} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2 4 6v6c0 5 3.5 9.4 8 10 4.5-.6 8-5 8-10V6l-8-4z" />
            </svg>
          </span>
        )}
        <h1 className={styles.title}>{title}</h1>
      </div>
      <div className={styles.actions}>
        <MobileAppSwitchButton target="skill-hub" me={me} />
        <MobileBackToChatButton compact />
        <button
          type="button"
          className={styles.btnGhost}
          onClick={onOpenGuide}
          aria-label="查看权限说明"
        >
          说明
        </button>
        <button
          type="button"
          className={styles.btnAdd}
          onClick={onAdd}
          disabled={addDisabled}
          aria-label="新增授权"
          title={addDisabled ? '只读角色无权执行此操作' : '新增授权'}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    </header>
  );
}
