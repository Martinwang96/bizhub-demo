/**
 * 申请页 · 我的申请段（视图层）。
 *
 * 组合状态筛选 chip + 卡片列表 + 撤回 Action Sheet；
 * 数据动作通过 useMyApprovals 统一调度（PC 与移动端共用同一状态机）。
 *
 * 撤回入口：卡片底部按钮 → 打开 WithdrawSheet（选原因 + 二次 confirm）→ 调 approvals.withdraw。
 * 列表自动 reload；下拉刷新由用户手动「刷新」按钮触发（移动端首版未接入手势）。
 */
import { useState } from 'react';
import type { MyApprovalsApi } from '@skillhub/hooks/useMyApprovals';
import StatusFilterChips from './StatusFilterChips';
import MyApprovalCard from './MyApprovalCard';
import WithdrawSheet from './WithdrawSheet';
import styles from './mine.module.css';

interface Props {
  approvals: MyApprovalsApi;
}

export default function MyApprovalsView({ approvals }: Props) {
  const {
    list,
    filtered,
    loading,
    error,
    filterStatus,
    setFilterStatus,
    reload,
    withdraw,
    actionState,
  } = approvals;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);

  const handleOpenSheet = (requestId: string) => {
    setActiveRequestId(requestId);
    setSheetOpen(true);
  };

  const handleCloseSheet = () => {
    if (activeRequestId && actionState[activeRequestId]) return; // 撤回中不允许关
    setSheetOpen(false);
    setActiveRequestId(null);
  };

  const handleConfirm = (reason: string) => {
    if (!activeRequestId) return;
    void (async () => {
      await withdraw(activeRequestId, reason);
      setSheetOpen(false);
      setActiveRequestId(null);
    })();
  };

  const sheetLoading = activeRequestId ? !!actionState[activeRequestId] : false;

  return (
    <section aria-label="我的申请" className={styles.mineSection}>
      <div className={styles.mineToolbar}>
        <StatusFilterChips value={filterStatus} onChange={setFilterStatus} />
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={() => void reload()}
          disabled={loading}
          aria-label="刷新申请列表"
          title="刷新"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
          <h3 className={styles.emptyTitle}>暂无申请记录</h3>
          <p className={styles.emptyDesc}>
            {list.length === 0
              ? '提交发布审批后，这里会显示每一次申请的进度。'
              : '当前筛选条件下没有申请。'}
          </p>
        </div>
      ) : (
        <ul className={styles.cardList}>
          {filtered.map((item) => (
            <li key={item.requestId}>
              <MyApprovalCard
                item={item}
                withdrawing={!!actionState[item.requestId]}
                onWithdrawClick={handleOpenSheet}
              />
            </li>
          ))}
        </ul>
      )}

      <WithdrawSheet
        open={sheetOpen}
        loading={sheetLoading}
        onClose={handleCloseSheet}
        onConfirm={handleConfirm}
      />
    </section>
  );
}
