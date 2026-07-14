/**
 * 移动端 · 页面标题（与 admin `MobilePageHeader` 同款视觉）。
 *
 * 风格：左侧 32×32 soft 底块 + 主色 icon，中间黑色标题文字，
 *       右侧默认渲染「返回对话」按钮（href="/"），可被 `actions` 覆盖。
 *
 * `icon` 接收一个内联 SVG ReactNode（caller 决定形状），保证 4 个页面可以
 * 各用合适的图标语义；统一应用 24×24 viewBox + currentColor 即可，颜色由
 * 容器 `.iconWrap`（var(--primary)）驱动。
 *
 * `actions`：可选右侧自定义 actions；不传则默认挂载「返回对话」按钮。
 *            若不希望渲染任何右侧 action，请显式传入 `actions={null}`。
 */
import type { ReactNode } from 'react';
import type { Me } from '@shared/types/user';
import MobileBackToChatButton from '../../shared/MobileBackToChatButton';
import MobileAppSwitchButton from '../../shared/MobileAppSwitchButton';
import styles from './MobilePageTitle.module.css';

interface Props {
  title: string;
  icon: ReactNode;
  /**
   * 右侧 actions 槽位。
   * - undefined（默认）：渲染「管理后台」(若有权限) + 「返回对话」按钮
   * - null：不渲染任何右侧内容
   * - 自定义 ReactNode：完全替换默认按钮
   */
  actions?: ReactNode | null;
  /** 当前用户：用于判定是否渲染「管理后台」互切入口（仅默认 actions 时生效） */
  me?: Me | null;
}

export default function MobilePageTitle({ title, icon, actions, me }: Props) {
  const right =
    actions === undefined ? (
      <>
        <MobileAppSwitchButton target="admin" me={me} />
        <MobileBackToChatButton compact />
      </>
    ) : (
      actions
    );

  return (
    <div className={styles.titleRow}>
      <div className={styles.titleGroup}>
        <span className={styles.iconWrap} aria-hidden="true">
          {icon}
        </span>
        <h1 className={styles.title}>{title}</h1>
      </div>
      {right ? <div className={styles.actions}>{right}</div> : null}
    </div>
  );
}
