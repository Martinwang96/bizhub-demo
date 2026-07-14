/**
 * 技能页 · 配置段（视图层）。
 *
 * 仅管理员可见 reload 控制；非管理员展示空态 + 配置摘要。
 *
 * 视觉对齐 PC AdminTab + mockup：
 *   - 顶部 metric stack（4 张），icon 圆形容器
 *   - 折叠卡片：审批人配置 / 最近 reload 结果
 *   - 底部主按钮：重新扫描并热刷新 Registry
 */
import { useMemo, useState, type ReactNode } from 'react';
import type { Me } from '@shared/types/user';
import type { SkillHubAdminApi } from '@skillhub/hooks/useSkillHubAdmin';
import styles from './skills.module.css';

interface Props {
  admin: SkillHubAdminApi;
  me: Me | null;
}

const PersonIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const ShieldIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const SkillsIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9.5 2A2.5 2.5 0 0 0 7 4.5v15A2.5 2.5 0 0 0 9.5 22h5a2.5 2.5 0 0 0 2.5-2.5v-15A2.5 2.5 0 0 0 14.5 2h-5z" />
    <path d="M12 6v12" />
  </svg>
);

const LockIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const ApproverIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2 3 7v6c0 5 3.5 8.5 9 9 5.5-.5 9-4 9-9V7l-9-5z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const ReloadHistoryIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 2 3 8 9 8" />
    <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
    <path d="M12 7v5l4 2" />
  </svg>
);

const ChevronDownIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const RefreshIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
    <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
  </svg>
);

interface CollapseProps {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}

function CollapseCard({ icon, title, children }: CollapseProps) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`${styles.collapseCard} ${open ? styles.collapseCardOpen : ''}`}>
      <button
        type="button"
        className={styles.collapseHeader}
        onClick={() => setOpen((s) => !s)}
        aria-expanded={open}
      >
        <span className={styles.collapseHeaderLeft}>
          <span className={styles.collapseIcon}>{icon}</span>
          <span className={styles.collapseTitle}>{title}</span>
        </span>
        <span
          className={`${styles.collapseExpand} ${open ? styles.collapseExpandOpen : ''}`}
          aria-hidden="true"
        >
          {ChevronDownIcon}
        </span>
      </button>
      {open && <div className={styles.collapseBody}>{children}</div>}
    </section>
  );
}

export default function SkillsConfigView({ admin, me }: Props) {
  const { config, reloadResult, loading, reloading, error, reloadRegistry } = admin;

  const isAdmin = config?.role === 'admin' || me?.adminConsoleRole === 'admin';
  const skillCount = config?.skill_count ?? 0;
  const selfApprovalEnabled = !!config?.self_approval_enabled;

  const approverSnapshot = useMemo(
    () =>
      JSON.stringify(
        {
          approvers: config?.approvers ?? [],
          skillHubRoles: config?.skill_hub_roles ?? [],
          approvalTtl: config?.approval_ttl ?? null,
          skillRoots: config?.skill_roots ?? [],
        },
        null,
        2,
      ),
    [config],
  );

  if (loading) {
    return (
      <section aria-label="技能配置" className={styles.configSection}>
        <div className={styles.skeletonStack}>
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
        </div>
      </section>
    );
  }

  return (
    <section aria-label="技能配置" className={styles.configSection}>
      {error && <div className={styles.errorNotice}>{error}</div>}

      <div className={styles.metricStack}>
        <div className={styles.metricCard}>
          <div className={styles.metricInfo}>
            <p className={styles.metricLabel}>当前用户</p>
            <p className={styles.metricValue}>{config?.login_name ?? me?.loginName ?? '—'}</p>
          </div>
          <span className={styles.metricIconWrap}>{PersonIcon}</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricInfo}>
            <p className={styles.metricLabel}>角色</p>
            <p className={styles.metricValue}>{config?.role ?? '—'}</p>
          </div>
          <span className={styles.metricIconWrap}>{ShieldIcon}</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricInfo}>
            <p className={styles.metricLabel}>技能数</p>
            <p className={styles.metricValue}>{skillCount.toLocaleString('zh-CN')}</p>
          </div>
          <span className={styles.metricIconWrap}>{SkillsIcon}</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricInfo}>
            <p className={styles.metricLabel}>Self Approval</p>
            <p className={styles.metricValue}>
              <span
                className={`${styles.metricDot} ${selfApprovalEnabled ? styles.metricDotOn : styles.metricDotOff}`}
                aria-hidden="true"
              />
              {selfApprovalEnabled ? '已启用' : '已关闭'}
            </p>
          </div>
          <span className={`${styles.metricIconWrap} ${styles.metricIconWrapAlt}`}>{LockIcon}</span>
        </div>
      </div>

      <div className={styles.collapseList}>
        <CollapseCard icon={ApproverIcon} title="审批人配置">
          <p className={styles.collapseDesc}>
            查看审批人列表、Skill Hub 角色、审批 TTL 与技能根目录等核心配置。
          </p>
          <pre className={styles.codeBlock}>{approverSnapshot}</pre>
        </CollapseCard>

        <CollapseCard icon={ReloadHistoryIcon} title="最近 Reload 结果">
          {reloadResult ? (
            <pre className={styles.codeBlock}>{JSON.stringify(reloadResult, null, 2)}</pre>
          ) : (
            <p className={styles.collapseDesc}>暂无 reload 记录。点击底部按钮可触发一次扫描。</p>
          )}
        </CollapseCard>
      </div>

      {isAdmin ? (
        <div className={styles.reloadButtonWrap}>
          <button
            type="button"
            className={styles.reloadButton}
            disabled={reloading}
            onClick={() => void reloadRegistry()}
          >
            {RefreshIcon}
            {reloading ? '扫描中…' : '重新扫描并热刷新 Registry'}
          </button>
        </div>
      ) : (
        <div className={styles.adminEmpty}>
          <h3 className={styles.adminEmptyTitle}>仅管理员可执行 Registry 控制</h3>
          <p className={styles.adminEmptyDesc}>
            审批人可查看审计与审批；Registry reload 需要管理后台权限。
          </p>
        </div>
      )}
    </section>
  );
}
