/**
 * Skill Hub 移动端"申请"页。
 *
 * URL query `?seg=new|mine` 持久化分段；默认 new。
 * - new：新建提交（操作类型 / 详细信息 / 文件选择 / 验证结果）
 * - mine：我的申请（状态筛选 + 卡片列表 + 撤回 Action Sheet）
 *
 * 数据层完全复用 PC 端：
 * - useUploadFlow（@skillhub/hooks/useUploadFlow）
 * - useMyApprovals（@skillhub/hooks/useMyApprovals）
 *
 * 该页是移动端首版交付的唯一完整功能页。
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Me } from '@shared/types/user';
import { useUploadFlow } from '@skillhub/hooks/useUploadFlow';
import { useMyApprovals } from '@skillhub/hooks/useMyApprovals';
import MobilePageTitle from '../../components/MobilePageTitle';
import MobileSegmentTabs from '../../../shared/MobileSegmentTabs';
import NewSubmissionView from './NewSubmissionView';
import MyApprovalsView from './MyApprovalsView';
import StickyActionBar from './StickyActionBar';
import styles from './MobileApplyPage.module.css';

export type ApplySegment = 'new' | 'mine';

interface MobileApplyPageProps {
  me?: Me | null;
}

export default function MobileApplyPage({ me }: MobileApplyPageProps = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const segParam = searchParams.get('seg');
  const segment: ApplySegment = segParam === 'mine' ? 'mine' : 'new';

  // 顶层持有两个 hook 的实例：切段不会卸载状态（草稿、列表筛选都保留）
  const flow = useUploadFlow();
  const approvals = useMyApprovals();

  const setSegment = (next: ApplySegment) => {
    const sp = new URLSearchParams(searchParams);
    sp.set('seg', next);
    setSearchParams(sp, { replace: true });
  };

  const hasMineRedDot = useMemo(
    () => approvals.list.some((r) => r.status === 'pending-review'),
    [approvals.list],
  );

  // toast 由 useUploadFlow 内部管理，这里读取后渲染浮层
  const toast = flow.toast;
  const toastClass = toast?.type === 'success'
    ? styles.toastSuccess
    : toast?.type === 'error'
      ? styles.toastError
      : toast?.type === 'warning'
        ? styles.toastWarn
        : styles.toastInfo;

  return (
    <>
      <main className={styles.main} aria-label="申请">
        <MobilePageTitle
          title="申请"
          me={me}
          icon={
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          }
        />
        <MobileSegmentTabs<ApplySegment>
          ariaLabel="申请页分段"
          value={segment}
          onChange={setSegment}
          items={[
            { value: 'new', label: '新建提交' },
            { value: 'mine', label: '我的申请', dot: hasMineRedDot },
          ]}
        />

        {segment === 'new' ? (
          <NewSubmissionView flow={flow} />
        ) : (
          <MyApprovalsView approvals={approvals} />
        )}
      </main>

      {toast && (
        <div className={styles.toastRoot} role="status" aria-live="polite">
          <div className={`${styles.toast} ${toastClass}`}>{toast.msg}</div>
        </div>
      )}

      {segment === 'new' && <StickyActionBar flow={flow} />}
    </>
  );
}
