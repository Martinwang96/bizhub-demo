/**
 * MobilePagination — 移动端通用客户端/服务端分页控件
 *
 * 设计：
 * - 顶部一行信息：「显示 a–b / 共 N 条」
 * - 底部一行控件：上一页 / 第 X / Y 页 / 下一页
 * - 受控组件：page 由父组件状态驱动，onChange 回调切页
 * - total ≤ 0 或 totalPages ≤ 1 时，组件返回 null（无需翻页）
 *
 * 复用建议：
 * - 客户端切片：父级用 useMemo 切 sessions，传 total=sessions.length
 * - 服务端分页：父级以 cursor=(page-1)*pageSize 拉数据，传 total=resp.total
 */
import styles from './MobilePagination.module.css';

interface MobilePaginationProps {
  /** 当前页码（1 起） */
  page: number;
  /** 每页条数 */
  pageSize: number;
  /** 总条数 */
  total: number;
  /** 切页回调 */
  onChange: (next: number) => void;
  /** 数据单位（如「会话」「条」），默认「条」 */
  unitLabel?: string;
  /** 加载中：禁用按钮 */
  loading?: boolean;
  /** 自定义 className */
  className?: string;
  /**
   * 紧凑模式：单行显示「X/Y ‹ ›」，按钮 28×28，无 a–b/N 长信息。
   * 适合放在卡片标题右上角等空间受限位置。
   */
  compact?: boolean;
}

export default function MobilePagination({
  page,
  pageSize,
  total,
  onChange,
  unitLabel = '条',
  loading = false,
  className,
  compact = false,
}: MobilePaginationProps) {
  if (!total || total <= 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(start + pageSize - 1, total);

  const prevDisabled = loading || safePage <= 1;
  const nextDisabled = loading || safePage >= totalPages;

  const rootCls = `${styles.pagination}${compact ? ` ${styles.compact}` : ''}${className ? ` ${className}` : ''}`;
  const btnCls = `${styles.btn}${compact ? ` ${styles.btnSm}` : ''}`;

  return (
    <nav className={rootCls} aria-label="分页">
      {!compact && (
        <span className={styles.info}>
          显示 {start}–{end} / 共 {total} {unitLabel}
        </span>
      )}
      <div className={styles.ctl}>
        <button
          type="button"
          className={btnCls}
          onClick={() => onChange(safePage - 1)}
          disabled={prevDisabled}
          aria-label="上一页"
        >
          <svg viewBox="0 0 24 24" width={compact ? 14 : 16} height={compact ? 14 : 16} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 6 9 12 15 18" />
          </svg>
        </button>
        <span className={`${styles.label}${compact ? ` ${styles.labelSm}` : ''}`}>
          {compact ? (
            <><strong>{safePage}</strong>/{totalPages}</>
          ) : (
            <>第 <strong>{safePage}</strong> / {totalPages} 页</>
          )}
        </span>
        <button
          type="button"
          className={btnCls}
          onClick={() => onChange(safePage + 1)}
          disabled={nextDisabled}
          aria-label="下一页"
        >
          <svg viewBox="0 0 24 24" width={compact ? 14 : 16} height={compact ? 14 : 16} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
      </div>
    </nav>
  );
}
