/**
 * Skill Hub 移动端 · 历史页（/history）。
 *
 * URL query `?seg=versions|audit` 持久化分段；默认 versions。
 * - versions：版本浏览（技能选择 → 版本详情 → 回滚）
 * - audit：审计日志（filter sheet + List / Timeline 切换）
 *
 * 数据层完全复用：
 *   - useVersionsBrowser（@skillhub/hooks/useVersionsBrowser）
 *   - useAuditLogs（@skillhub/hooks/useAuditLogs）
 *
 * 顶层持有两个 hook 实例：切段不卸载状态，列表/筛选 / 选中技能保留。
 */
import { useSearchParams } from 'react-router-dom';
import type { Me } from '@shared/types/user';
import { useVersionsBrowser } from '@skillhub/hooks/useVersionsBrowser';
import { useAuditLogs } from '@skillhub/hooks/useAuditLogs';
import MobilePageTitle from '../../components/MobilePageTitle';
import MobileSegmentTabs from '../../../shared/MobileSegmentTabs';
import HistoryVersionsView from './HistoryVersionsView';
import HistoryAuditView from './HistoryAuditView';
import styles from './history.module.css';

export type HistorySegment = 'versions' | 'audit';

interface MobileHistoryPageProps {
  me?: Me | null;
}

export default function MobileHistoryPage({ me }: MobileHistoryPageProps = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const segParam = searchParams.get('seg');
  const segment: HistorySegment = segParam === 'audit' ? 'audit' : 'versions';

  // 顶层持有 hook 实例：切段不卸载状态。
  const versions = useVersionsBrowser();
  const audit = useAuditLogs();

  const setSegment = (next: HistorySegment) => {
    const sp = new URLSearchParams(searchParams);
    sp.set('seg', next);
    setSearchParams(sp, { replace: true });
  };

  return (
    <main className={styles.main} aria-label="历史">
      <MobilePageTitle
        title="历史"
        me={me}
        icon={
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <polyline points="3 4 3 10 9 10" />
            <polyline points="12 7 12 12 15 14" />
          </svg>
        }
      />
      <MobileSegmentTabs<HistorySegment>
        ariaLabel="历史页分段"
        value={segment}
        onChange={setSegment}
        items={[
          { value: 'versions', label: '版本' },
          { value: 'audit', label: '审计' },
        ]}
      />

      {segment === 'versions' ? (
        <HistoryVersionsView versions={versions} />
      ) : (
        <HistoryAuditView audit={audit} skills={versions.skills} />
      )}
    </main>
  );
}
