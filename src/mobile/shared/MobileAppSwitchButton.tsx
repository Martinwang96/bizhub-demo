/**
 * 移动端 · 应用互切按钮（admin ↔ skill-hub）。
 *
 * 用途：在 admin 移动端各 Header 顶部右侧渲染「技能管理」入口（钥匙图标 → /skill-hub），
 *       在 skillhub 移动端各 Header 顶部右侧渲染「管理后台」入口（齿轮图标 → /admin）。
 *
 * 跨应用跳转：与 chat 端 `AppShell` topbar 一致，使用原生 <a> 触发整页跳转。
 *
 * 显示判定（与 chat AppShell topbar 完全一致，避免越权入口暴露）：
 * - target='skill-hub'：admin 角色 或 skillHubRoles 含 'user'|'approval'
 * - target='admin'    ：adminConsoleRole 为 'admin' | 'readonly'
 *
 * 视觉：复用 `MobileBackToChatButton.module.css` 的 ghost 圆形按钮（compact 模式 32×32），
 *       hover 主色描边；与并排的「返回对话」按钮等高对齐。
 */
import type { Me } from '@shared/types/user';
import styles from './MobileBackToChatButton.module.css';

type AppSwitchTarget = 'admin' | 'skill-hub';

interface Props {
  /** 跳转目标应用 */
  target: AppSwitchTarget;
  /** 当前用户：用于判定是否渲染（无权限时不渲染） */
  me?: Me | null;
  /** 尺寸：sm（32×32，默认）| md（36×36，与 BizKnowledge headerIconBtn 对齐） */
  size?: 'sm' | 'md';
  /** 自定义类名（可叠加） */
  className?: string;
}

function shouldRender(target: AppSwitchTarget, me?: Me | null): boolean {
  if (!me) return false;
  if (target === 'skill-hub') {
    if (me.adminConsoleRole === 'admin') return true;
    return (me.skillHubRoles ?? []).some((r) => r === 'user' || r === 'approval');
  }
  // target === 'admin'
  return me.adminConsoleRole === 'admin' || me.adminConsoleRole === 'readonly';
}

export default function MobileAppSwitchButton({ target, me, size = 'sm', className }: Props) {
  if (!shouldRender(target, me)) return null;

  const href = target === 'skill-hub' ? '/skill-hub' : '/admin';
  const label = target === 'skill-hub' ? '技能管理' : '管理后台';

  const cls = [
    styles.btn,
    styles.compact,
    size === 'md' ? styles.md : '',
    className || '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <a href={href} className={cls} aria-label={label} title={label}>
      {target === 'skill-hub' ? (
        // 钥匙 icon —— 与 chat AppShell topbar 同款
        <svg
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
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      ) : (
        // 齿轮 icon —— 与 chat AppShell topbar 同款
        <svg
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
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      )}
    </a>
  );
}
