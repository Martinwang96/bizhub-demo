/**
 * PermissionSummaryButton — 共享组件
 * ----------------------------------------------------------------
 * 「用户绑定」「用户组」表格的"权限配置"列共用按钮：产品 N / Skill N / 行 N。
 *
 * 由 DataAclPage 内部组件提取出来（原来仅在用户绑定页面使用）。
 * 抽出原因：
 *   1) 用户组列表也要复刻同款按钮（视觉一致）；
 *   2) 集中维护"列对齐"行为 —— 通过 PermissionSummaryGroup 的 CSS Grid
 *      三等分确保跨行同列按钮严格对齐，不会因 count 位数变化而漂移。
 *
 * 用法：
 *   <PermissionSummaryGroup>
 *     <PermissionSummaryButton label="产品" count={13} muted={false} onClick={...} />
 *     <PermissionSummaryButton label="Skill" count={2}  muted={false} onClick={...} />
 *     <PermissionSummaryButton label="行"   count={1}  muted={false} onClick={...} />
 *   </PermissionSummaryGroup>
 */
import type { PropsWithChildren } from 'react';
import styles from './PermissionSummaryButton.module.css';

export interface PermissionSummaryButtonProps {
  label: string;
  count: number;
  muted: boolean;
  onClick: () => void;
  /** 可选：覆盖默认 title（默认 `查看${label}详情`） */
  title?: string;
  /** 可选：禁用状态（如父级表格行已禁用编辑） */
  disabled?: boolean;
}

export function PermissionSummaryButton({
  label,
  count,
  muted,
  onClick,
  title,
  disabled,
}: PermissionSummaryButtonProps) {
  return (
    <button
      type="button"
      className={muted ? `${styles.btn} ${styles.btnMuted}` : styles.btn}
      onClick={onClick}
      disabled={disabled}
      title={title ?? `查看${label}详情`}
    >
      <span className={styles.label}>{label}</span>
      <span className={styles.count}>{count}</span>
    </button>
  );
}

/**
 * PermissionSummaryGroup — 三等分 grid 容器
 * 把 3 个 PermissionSummaryButton 包起来，保证跨行严格对齐。
 */
export function PermissionSummaryGroup({ children }: PropsWithChildren) {
  return <div className={styles.summaryGroup}>{children}</div>;
}

export default PermissionSummaryButton;
