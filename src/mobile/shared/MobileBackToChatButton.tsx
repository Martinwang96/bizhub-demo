/**
 * 移动端 · 「返回对话」按钮（SkillHub Mobile / Admin Mobile 两端共享）。
 *
 * 用途：在两个移动端应用的顶部右侧承接到 chat 首页（href="/"）。
 * 由于 chat 与 SkillHub / Admin 不在同一个 React Router basename 下，
 * 这里使用原生 <a> 触发整页跳转，与 PC 端 sidebar footer 的「返回对话」一致。
 *
 * 视觉：与 admin 页 sticky header 的 ghost btn 同款（默认 32px 高、1px 描边、
 *      hover 主色）；可通过 `size="md"` 切到 36px 以匹配 BizKnowledge 等 36×36 图标位。
 *
 * 形态：
 * - 默认：左侧 chat 气泡 icon + 「对话」文案
 * - `compact`：仅图标（width 与 height 同尺寸，作为方形图标按钮）
 */
import styles from './MobileBackToChatButton.module.css';

interface Props {
  /** 跳转目标，默认 "/"（chat 首页） */
  href?: string;
  /** 紧凑模式：仅图标，方形按钮 */
  compact?: boolean;
  /** 尺寸：sm（32px，默认）| md（36px，匹配 BizKnowledge headerIconBtn） */
  size?: 'sm' | 'md';
  /** 自定义类名（可叠加） */
  className?: string;
}

export default function MobileBackToChatButton({
  href = '/',
  compact = false,
  size = 'sm',
  className,
}: Props) {
  const cls = [
    styles.btn,
    size === 'md' ? styles.md : '',
    compact ? styles.compact : '',
    className || '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <a
      href={href}
      className={cls}
      aria-label="返回对话"
      title="返回对话"
    >
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
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
      <span className={styles.label}>对话</span>
    </a>
  );
}
