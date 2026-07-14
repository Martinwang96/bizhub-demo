/**
 * VersionsTab — 版本与回滚 Tab
 */
import { memo, useCallback, useEffect, useState } from 'react';
import type { Me } from '@shared/types/user';
import { getJson, postJson } from '@shared/api/httpClient';
import {
  normalizeSkillsResponse,
  normalizeVersionsResponse,
  skillApiBasePath,
  type SkillItem,
  type VersionItem,
} from '../apiAdapters';
import { CountPill, EmptyState, Notice, SectionCard, SkeletonStack, TableWrap } from '@shared/components';
import type { RegisterRefresh } from '../SkillHubApp';
import styles from '@shared/components/common.module.css';

interface Props { me: Me | null; onRegisterRefresh?: RegisterRefresh; }

function VersionsTab({ onRegisterRefresh }: Props) {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [search, setSearch] = useState('');
  const [loadingSkills, setLoadingSkills] = useState(true);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [error, setError] = useState('');
  const [rolling, setRolling] = useState<Record<string, boolean>>({});

  const loadSkills = useCallback(async () => {
    setLoadingSkills(true);
    setError('');
    try {
      const env = await getJson<unknown>('/skill-hub/api/skills');
      if (env.success) {
        setSkills(normalizeSkillsResponse(env.data));
      } else {
        setError(env.error ?? '技能列表加载失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '技能列表加载失败');
    } finally {
      setLoadingSkills(false);
    }
  }, []);

  useEffect(() => { void loadSkills(); }, [loadSkills]);

  useEffect(() => {
    onRegisterRefresh?.(loadSkills);
    return () => onRegisterRefresh?.(null);
  }, [onRegisterRefresh, loadSkills]);

  const selectSkill = useCallback(async (skillId: string) => {
    setSelected(skillId);
    setLoadingVersions(true);
    setError('');
    try {
      const env = await getJson<unknown>(`${skillApiBasePath(skillId)}/versions`);
      if (env.success) {
        setVersions(normalizeVersionsResponse(env.data));
      } else {
        setVersions([]);
        setError(env.error ?? '版本记录加载失败');
      }
    } catch (e) {
      setVersions([]);
      setError(e instanceof Error ? e.message : '版本记录加载失败');
    } finally {
      setLoadingVersions(false);
    }
  }, []);

  const handleRollback = useCallback(async (version: string) => {
    if (!selected) return;
    setRolling((s) => ({ ...s, [version]: true }));
    setError('');
    try {
      const env = await postJson(`${skillApiBasePath(selected)}/rollback`, { target_version: version });
      if (!env.success) setError(env.error ?? '回滚失败');
      await selectSkill(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : '回滚失败');
    } finally {
      setRolling((s) => ({ ...s, [version]: false }));
    }
  }, [selected, selectSkill]);

  const filtered = skills.filter((s) => !search || s.skillId.toLowerCase().includes(search.toLowerCase()));

  return (
    <SectionCard
      eyebrow="Versions"
      title="版本与回滚"
      description="选择一个技能查看发布历史，必要时回滚到稳定版本。"
      meta={<CountPill>{filtered.length}</CountPill>}
    >
      {error && <Notice tone="danger" title="操作失败">{error}</Notice>}

      <div className={styles.splitGrid}>
        <aside>
          <div className={styles.toolbar}>
            <input
              className={styles.searchInput}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索 skill"
              aria-label="搜索版本技能"
            />
          </div>
          {loadingSkills ? (
            <SkeletonStack widths={[84, 68, 76]} />
          ) : error && skills.length === 0 ? (
            <EmptyState
              title="无法加载技能列表"
              description={error}
              action={<button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => void loadSkills()}>重试</button>}
            />
          ) : filtered.length === 0 ? (
            <EmptyState title="暂无技能" description="没有可查看版本的技能。" />
          ) : (
            <div className={styles.skillList} role="listbox" aria-label="技能列表">
              {filtered.map((s) => (
                <button
                  key={s.skillId}
                  type="button"
                  className={`${styles.skillListButton} ${selected === s.skillId ? styles.skillListButtonActive : ''}`}
                  onClick={() => void selectSkill(s.skillId)}
                  aria-selected={selected === s.skillId}
                >
                  <code>{s.skillId}</code>
                  {s.version && <span className={styles.tableMeta}>{s.version}</span>}
                </button>
              ))}
            </div>
          )}
        </aside>

        <div className={styles.versionPane}>
          {!selected ? (
            <EmptyState title="选择一个技能" description="左侧选择技能后，会显示可追溯的历史版本和回滚操作。" />
          ) : loadingVersions ? (
            <SkeletonStack widths={[74, 88, 62]} />
          ) : versions.length === 0 ? (
            <EmptyState title="暂无版本记录" description="该技能还没有可展示的发布历史。" />
          ) : (
            <TableWrap>
              <table className={styles.table}>
                <thead>
                  <tr><th>版本</th><th>发布人</th><th>发布时间</th><th>操作</th></tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.version}>
                      <td>
                        <code>{v.version}</code>
                        {v.current && <span className={`${styles.tag} ${styles.tagSuccess}`}>当前</span>}
                      </td>
                      <td className={styles.tableSub}>{v.publisher}</td>
                      <td className={styles.tableMeta}>{new Date(v.publishedAt * 1000).toLocaleString('zh-CN')}</td>
                      <td>
                        {!v.current ? (
                          <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} disabled={rolling[v.version]} onClick={() => void handleRollback(v.version)}>
                            {rolling[v.version] ? '回滚中' : '回滚到此版本'}
                          </button>
                        ) : <span className={styles.tableMeta}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

export default memo(VersionsTab);
