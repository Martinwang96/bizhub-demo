/**
 * 技能页 · 列表段（视图层）。
 *
 * - 顶部工具栏：search input + Filter 按钮（带数字徽标）+ 刷新
 * - 卡片列表：SkillCard，点击"原文" → 唤起 MobileSourceDrawer（kind: 'skill'）
 * - 筛选弹层：SkillFilterSheet（编辑临时值后再应用回 hook）
 */
import { useMemo, useState } from 'react';
import type { SkillsListApi } from '@skillhub/hooks/useSkillsList';
import type { SkillItem } from '@skillhub/apiAdapters';
import SkillCard from './SkillCard';
import SkillFilterSheet from './SkillFilterSheet';
import MobileSourceDrawer, {
  type MobileSourceDrawerSource,
} from '../review/MobileSourceDrawer';
import styles from './skills.module.css';

interface Props {
  skills: SkillsListApi;
}

export default function SkillsListView({ skills }: Props) {
  const {
    filtered,
    list,
    owners,
    filterOwner,
    filterStatus,
    filterQ,
    setFilterOwner,
    setFilterStatus,
    setFilterQ,
    loading,
    error,
    reload,
    exportZip,
    toggleAvailability,
    pendingSkillId,
    isApprover,
  } = skills;

  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [sourceTarget, setSourceTarget] = useState<SkillItem | null>(null);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filterOwner) n += 1;
    if (filterStatus) n += 1;
    return n;
  }, [filterOwner, filterStatus]);

  // 下线 / 上线：点击即生效，不再弹 confirm / prompt（与 PC SkillsTab 同步）。
  // 下线本身可逆——上线立即恢复，绑定不被清理，二次确认价值低；reason 字段
  // 保持兼容传空串入 audit log。
  const handleToggle = async (skill: SkillItem) => {
    const isDown = skill.status === 'unavailable';
    const next = isDown ? 'active' : 'unavailable';
    try {
      await toggleAvailability(skill, next, '');
    } catch {
      // 错误已经写入 hook.error，由列表上方 errorNotice 呈现
    }
  };

  const drawerSource: MobileSourceDrawerSource | null = sourceTarget
    ? {
        kind: 'skill',
        skill: {
          skillId: sourceTarget.skillId,
          owner: sourceTarget.owner,
          slug: sourceTarget.slug,
        },
      }
    : null;

  return (
    <section aria-label="技能列表" className={styles.listSection}>
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={styles.searchIcon}
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className={styles.searchInput}
            type="search"
            value={filterQ}
            onChange={(e) => setFilterQ(e.target.value)}
            placeholder="搜索 skill / 描述 / 表名"
            aria-label="搜索技能"
          />
        </div>

        <button
          type="button"
          className={styles.filterBtn}
          onClick={() => setFilterSheetOpen(true)}
          aria-label="筛选"
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
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="7" y1="12" x2="17" y2="12" />
            <line x1="10" y1="18" x2="14" y2="18" />
          </svg>
          <span>筛选</span>
          {activeFilterCount > 0 && (
            <span className={styles.filterCount} aria-label={`已应用 ${activeFilterCount} 项过滤`}>
              {activeFilterCount}
            </span>
          )}
        </button>

        <button
          type="button"
          className={styles.refreshBtn}
          onClick={() => void reload()}
          disabled={loading}
          aria-label="刷新技能列表"
          title="刷新"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
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
        </button>
      </div>

      {error && <div className={styles.errorNotice}>{error}</div>}

      {loading ? (
        <div className={styles.skeletonStack}>
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <h3 className={styles.emptyTitle}>暂无匹配技能</h3>
          <p className={styles.emptyDesc}>
            {list.length === 0
              ? '当前注册表为空，请联系管理员重新扫描技能或先发布技能。'
              : '调整筛选条件或搜索词后再试。'}
          </p>
        </div>
      ) : (
        <ul className={styles.cardList}>
          {filtered.map((s) => (
            <li key={s.skillId}>
              <SkillCard
                skill={s}
                onSource={setSourceTarget}
                onExport={exportZip}
                onToggleAvailability={isApprover ? handleToggle : undefined}
                togglePending={pendingSkillId === s.skillId}
              />
            </li>
          ))}
        </ul>
      )}

      <SkillFilterSheet
        open={filterSheetOpen}
        initialOwner={filterOwner}
        initialStatus={filterStatus}
        owners={owners}
        onClose={() => setFilterSheetOpen(false)}
        onApply={({ owner, status }) => {
          setFilterOwner(owner);
          setFilterStatus(status);
          setFilterSheetOpen(false);
        }}
      />

      <MobileSourceDrawer
        open={!!sourceTarget}
        source={drawerSource}
        onClose={() => setSourceTarget(null)}
      />
    </section>
  );
}
