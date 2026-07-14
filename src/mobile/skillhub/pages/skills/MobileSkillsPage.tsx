/**
 * Skill Hub 移动端 · 技能页（/skills）。
 *
 * URL query `?seg=list|config` 持久化分段；默认 list。
 * - list：已注册技能列表（搜索 + 筛选 sheet + 卡片 + 原文/导出）
 * - config：管理员配置（metric stack + 折叠卡片 + reload）
 *
 * 数据层完全复用：
 *   - useSkillsList（@skillhub/hooks/useSkillsList）
 *   - useSkillHubAdmin（@skillhub/hooks/useSkillHubAdmin）
 *
 * me 由 SkillHubMobileApp 通过 props 注入（与 PC SkillHubShell 同源 /api/me），
 * 用于配置段判定 isAdmin 以及 PageTitle 的「管理后台」互切入口。
 */
import { useSearchParams } from 'react-router-dom';
import type { Me } from '@shared/types/user';
import { useSkillsList } from '@skillhub/hooks/useSkillsList';
import { useSkillHubAdmin } from '@skillhub/hooks/useSkillHubAdmin';
import MobilePageTitle from '../../components/MobilePageTitle';
import MobileSegmentTabs from '../../../shared/MobileSegmentTabs';
import SkillsListView from './SkillsListView';
import SkillsConfigView from './SkillsConfigView';
import styles from './skills.module.css';

export type SkillsSegment = 'list' | 'config';

interface MobileSkillsPageProps {
  me?: Me | null;
}

export default function MobileSkillsPage({ me }: MobileSkillsPageProps = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const segParam = searchParams.get('seg');
  const segment: SkillsSegment = segParam === 'config' ? 'config' : 'list';

  // 顶层持有 hook 实例：切段不卸载状态，列表/筛选保留
  const skills = useSkillsList();
  const admin = useSkillHubAdmin();

  const setSegment = (next: SkillsSegment) => {
    const sp = new URLSearchParams(searchParams);
    sp.set('seg', next);
    setSearchParams(sp, { replace: true });
  };

  return (
    <main className={styles.main} aria-label="技能">
      <MobilePageTitle
        title="技能"
        me={me}
        icon={
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
        }
      />
      <MobileSegmentTabs<SkillsSegment>
        ariaLabel="技能页分段"
        value={segment}
        onChange={setSegment}
        items={[
          { value: 'list', label: '列表' },
          { value: 'config', label: '配置' },
        ]}
      />

      {segment === 'list' ? (
        <SkillsListView skills={skills} />
      ) : (
        <SkillsConfigView admin={admin} me={me ?? null} />
      )}
    </main>
  );
}
