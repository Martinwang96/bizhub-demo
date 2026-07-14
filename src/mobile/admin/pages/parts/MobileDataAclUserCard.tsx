import styles from './MobileDataAclUserCard.module.css';

export interface DataAclUserCardProps {
  loginName: string;
  role: string;
  /** admin/manager 自动 bypass，禁用编辑 */
  bypass: boolean;
  /** 业务自定义 role 列表（business_roles） */
  businessRoles?: string[];
  /** 该用户已绑定的「叶子产品」数（PC 版 effectiveLeafCount 计算后传入） */
  productCount: number;
  /** 该用户已绑定的 Skill 数（auth-mod 用 skills 替代了原 tables 维度） */
  skillCount: number;
  readonly?: boolean;
  onEdit: (loginName: string) => void;
}

/**
 * 移动端 Data ACL 用户卡片：
 * - 头像首字母 + loginName + role chip
 * - business_roles 折成 chip
 * - 底栏：产品/表 counts + 「执行校验」/「跳过校验」状态 + 「编辑」按钮
 * - bypass 用户置灰、禁用编辑（与 PC 版 DataAclPage userRowBypass 同语义）
 */
export default function MobileDataAclUserCard({
  loginName,
  role,
  bypass,
  businessRoles = [],
  productCount,
  skillCount,
  readonly,
  onEdit,
}: DataAclUserCardProps) {
  const initial = (loginName.charAt(0) || '?').toUpperCase();
  const disabled = !!readonly || bypass;
  const editTitle = bypass
    ? `${role} 自动跳过校验，无需绑定`
    : readonly
      ? '只读角色无权执行此操作'
      : '编辑权限绑定';

  return (
    <article
      className={bypass ? `${styles.card} ${styles.cardBypass}` : styles.card}
      aria-label={`数据权限用户 ${loginName}`}
    >
      <div className={styles.head}>
        <div className={styles.avatar} aria-hidden="true">{initial}</div>
        <div className={styles.idGroup}>
          <div className={styles.nameLine}>
            <span className={styles.name}>{loginName}</span>
            <span className={`${styles.chip} ${styles.chipRole}`}>{role}</span>
          </div>
          {businessRoles.length > 0 && (
            <div className={styles.metaLine}>
              {businessRoles.slice(0, 3).map((br) => (
                <span key={br} className={`${styles.chip} ${styles.chipMuted}`}>{br}</span>
              ))}
              {businessRoles.length > 3 && (
                <span className={styles.metaText}>+{businessRoles.length - 3}</span>
              )}
            </div>
          )}
          {businessRoles.length === 0 && !bypass && (
            <div className={styles.metaText}>需勾选产品权限与表权限</div>
          )}
          {bypass && (
            <div className={styles.metaText}>
              角色 <code>{role}</code> 自动 bypass，无需绑定
            </div>
          )}
        </div>
        <button
          type="button"
          className={styles.editBtn}
          onClick={() => onEdit(loginName)}
          disabled={disabled}
          aria-label={`编辑 ${loginName} 的权限绑定`}
          title={editTitle}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
        </button>
      </div>

      <div className={styles.foot}>
        <div className={styles.counts}>
          <span className={productCount ? styles.countBadge : `${styles.countBadge} ${styles.countBadgeMuted}`}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
            {bypass ? 'All' : productCount} 产品
          </span>
          <span className={skillCount ? styles.countBadge : `${styles.countBadge} ${styles.countBadgeMuted}`}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            {bypass ? 'All' : skillCount} Skill
          </span>
        </div>
        <span className={bypass ? styles.validateSkip : styles.validateExec}>
          {bypass ? (
            <>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
