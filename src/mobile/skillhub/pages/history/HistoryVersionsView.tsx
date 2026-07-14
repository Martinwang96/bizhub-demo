/**
 * 历史页 · Versions 段（视图层）。
 *
 * 双层导航：
 *   - 未选中技能：搜索框 + 技能行列表（点击进入详情）
 *   - 选中技能：返回按钮 + 当前 / 历史版本卡片，每张卡片上"回滚到此版本"
 *     触发 RollbackConfirmSheet。
 *
 * 业务流由 useVersionsBrowser 提供，本组件只负责呈现。
 */
import { useState } from 'react';
import type { VersionsBrowserApi } from '@skillhub/hooks/useVersionsBrowser';
import RollbackConfirmSheet from './RollbackConfirmSheet';
import styles from './history.module.css';

interface Props {
  versions: VersionsBrowserApi;
}

const SearchIcon = (
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
);

const ChevronRight = (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={styles.skillRowChevron}
    aria-hidden="true"
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const ChevronLeft = (
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
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

function formatTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const time = d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${date}\n${time}`;
}

export default function HistoryVersionsView({ versions }: Props) {
  const {
    skills,
    filteredSkills,
    search,
    setSearch,
    selected,
    versions: versionItems,
    loadingSkills,
    loadingVersions,
    error,
    rolling,
    selectSkill,
    clearSelected,
    rollback,
  } = versions;

  const [pendingVersion, setPendingVersion] = useState<string | null>(null);
  const isRolling = pendingVersion ? !!rolling[pendingVersion] : false;

  const handleConfirmRollback = async () => {
    if (!pendingVersion) return;
    await rollback(pendingVersion);
    setPendingVersion(null);
  };

  // 选中技能未选时显示列表；选中后显示版本详情。
  const showDetail = selected !== null;

  return (
    <section className={styles.section} aria-label="版本与回滚">
      {error && <div className={styles.errorNotice}>{error}</div>}

      {!showDetail ? (
        <>
          <div className={styles.searchWrap}>
            {SearchIcon}
            <input
              className={styles.searchInput}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索 Skill ID..."
              aria-label="搜索版本技能"
            />
          </div>

          {loadingSkills ? (
            <div className={styles.skeletonStack}>
              <div className={styles.skeletonCard} />
              <div className={styles.skeletonCard} />
              <div className={styles.skeletonCard} />
            </div>
          ) : filteredSkills.length === 0 ? (
            <div className={styles.emptyState}>
              <h3 className={styles.emptyTitle}>暂无技能</h3>
              <p className={styles.emptyDesc}>
                {skills.length === 0
                  ? '当前注册表为空，请联系管理员重新扫描技能。'
                  : '没有匹配的技能，请调整搜索词。'}
              </p>
            </div>
          ) : (
            <ul className={styles.skillList}>
              {filteredSkills.map((s) => (
                <li key={s.skillId}>
                  <button
                    type="button"
                    className={styles.skillRow}
                    onClick={() => void selectSkill(s.skillId)}
                  >
                    <span className={styles.skillRowMain}>
                      <span className={styles.skillRowId} title={s.skillId}>
                        {s.skillId}
                      </span>
                      {s.version && (
                        <span className={styles.skillRowMeta}>
                          v{s.version.replace(/^v/, '')}
                        </span>
                      )}
                    </span>
                    {ChevronRight}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className={styles.detailHeader}>
            <button
              type="button"
              className={styles.backBtn}
              onClick={clearSelected}
              aria-label="返回技能列表"
            >
              {ChevronLeft}
            </button>
            <h2 className={styles.detailTitle} title={selected ?? ''}>
              {selected}
            </h2>
          </div>

          {loadingVersions ? (
            <div className={styles.skeletonStack}>
              <div className={styles.skeletonCard} />
              <div className={styles.skeletonCard} />
            </div>
          ) : versionItems.length === 0 ? (
            <div className={styles.emptyState}>
              <h3 className={styles.emptyTitle}>暂无版本记录</h3>
              <p className={styles.emptyDesc}>
                该技能还没有可展示的发布历史。
              </p>
            </div>
          ) : (
            <ul className={styles.versionList}>
              {versionItems.map((v) => {
                const isCurrent = !!v.current;
                return (
                  <li key={v.version}>
                    <article
                      className={`${styles.versionCard} ${isCurrent ? styles.versionCardCurrent : ''}`}
                    >
                      <div className={styles.versionHead}>
                        <div className={styles.versionLabel}>
                          <h3 className={styles.versionNumber}>v{v.version.replace(/^v/, '')}</h3>
                          {isCurrent && (
                            <span className={styles.versionBadge}>[Current]</span>
                          )}
                        </div>
                        <span className={styles.versionTime}>
                          {formatTime(v.publishedAt)}
                        </span>
                      </div>
                      <p className={styles.versionPublisher}>
                        Published by:{' '}
                        <span className={styles.versionPublisherStrong}>
                          {v.publisher || '—'}
                        </span>
                      </p>
                      {!isCurrent && (
                        <button
                          type="button"
                          className={styles.rollbackBtn}
                          disabled={!!rolling[v.version]}
                          onClick={() => setPendingVersion(v.version)}
                        >
                          {rolling[v.version] ? '回滚中…' : '回滚到此版本'}
                        </button>
                      )}
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <RollbackConfirmSheet
        open={!!pendingVersion}
        loading={isRolling}
        skillId={selected}
        targetVersion={pendingVersion}
        onClose={() => {
          if (!isRolling) setPendingVersion(null);
        }}
        onConfirm={() => void handleConfirmRollback()}
      />
    </section>
  );
}
