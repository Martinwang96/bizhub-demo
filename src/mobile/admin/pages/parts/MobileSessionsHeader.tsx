import type { ReactNode } from 'react';
import type { Me } from '@shared/types/user';
import MobileBackToChatButton from '../../../shared/MobileBackToChatButton';
import MobileAppSwitchButton from '../../../shared/MobileAppSwitchButton';
import styles from './MobileSessionsHeader.module.css';

interface MobileSessionsHeaderProps {
  onRefresh: () => void;
  /** 全量刷新 in-flight，按钮显示旋转图标 */
  refreshing?: boolean;
  /** 左侧 leading 槽：默认渲染装饰 icon；admin 移动端注入汉堡触发按钮 */
  leading?: ReactNode;
  /** 当前用户：用于判定是否渲染「技能管理」互切入口 */
  me?: Me | null;
}

/**
 * 移动端 Session 查询页 sticky Header。
 * - 左：leading 槽（默认 history icon）+ 「Session 查询」
 * - 右：「技能管理」(可选) + 「返回对话」ghost + 「刷新」ghost btn（旋转图标 busy 态）
 */
export default function MobileSessionsHeader({ onRefresh, refreshing, leading, me }: MobileSessionsHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.titleGroup}>
        {leading ?? (
          <span className={styles.iconWrap} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <polyline points="3 4 3 10 9 10" />
              <polyline points="12 7 12 12 16 14" />
            </svg>
          </span>
        )}
        <h1 className={styles.title}>Session 查询</h1>
      </div>
      <div className={styles.actions}>
        <MobileAppSwitchButton target="skill-hub" me={me} />
        <MobileBackToChatButton compact />
        <button
          type="button"
          className={`${styles.btnGhost} ${refreshing ? styles.btnGhostBusy : ''}`}
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="刷新数据"
          title="全量重新拉取"
        >
          <svg
            className={styles.refreshIcon}
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
            <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
          </svg>
          <span>刷新</span>
        </button>
      </div>
    </header>
  );
}
