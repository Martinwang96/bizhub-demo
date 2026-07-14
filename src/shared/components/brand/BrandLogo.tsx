/**
 * BrandLogo — Biz-Hub 经营分析智能平台 品牌 logo 共享组件
 *
 * 设计来源：DESIGN.md `components.brandLogo` / Brand Identity 章节
 * - 实色圆角方块 + 白色 stacked data layers SVG，不使用渐变 / 发光
 * - size=sm：34×34，圆角 r-sm（用于 sidebar / topbar / share）
 * - size=lg：96×96，圆角 r-2xl（用于首页 hero / empty state）
 *
 * 调用规范：
 *   <BrandLogo />                  // 默认 sm
 *   <BrandLogo size="lg" />        // 大号
 *   <BrandLogo title="自定义可访问名称" />
 */
import styles from './BrandLogo.module.css';

export interface BrandLogoProps {
  size?: 'sm' | 'lg';
  title?: string;
  className?: string;
}

const DEFAULT_TITLE = 'Biz-Hub 经营分析智能平台';

export default function BrandLogo({
  size = 'sm',
  title = DEFAULT_TITLE,
  className,
}: BrandLogoProps) {
  const sizeClass = size === 'lg' ? styles.lg : styles.sm;
  const svgSize = size === 'lg' ? 48 : 18;
  const composed = className ? `${styles.logo} ${sizeClass} ${className}` : `${styles.logo} ${sizeClass}`;
  return (
    <span className={composed} role="img" aria-label={title}>
      <svg
        width={svgSize}
        height={svgSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    </span>
  );
}
