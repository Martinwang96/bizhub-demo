import type { Dispatch, SetStateAction } from 'react';
import { DatePicker } from '@shared/components';
import styles from './MobileSessionsFilterBar.module.css';
import toolbarStyles from './MobileStatsToolbar.module.css';

export interface SessionsFilterState {
  user: string;
  session_id: string;
  keyword: string;
  since: string;
  until: string;
}

interface MobileSessionsFilterBarProps {
  filter: SessionsFilterState;
  setFilter: Dispatch<SetStateAction<SessionsFilterState>>;
  quick: string;
  onQuickChange: (value: string) => void;
  onSubmit: () => void;
  onReset: () => void;
  loading?: boolean;
}

interface QuickItem {
  value: string;
  label: string;
}

const QUICK_ITEMS: QuickItem[] = [
  { value: 'today', label: '今天' },
  { value: 'yesterday', label: '昨天' },
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
];

/**
 * 移动端 Session 查询筛选工具栏。
 * - 三个文本 input：用户名 / Session ID / 标题关键词
 * - 日期区间：since / until + 4 个快捷 chip（aria-pressed）
 * - 操作行：重置（ghost）/ 查询（primary）
 */
export default function MobileSessionsFilterBar({
  filter,
  setFilter,
  quick,
  onQuickChange,
  onSubmit,
  onReset,
  loading,
}: MobileSessionsFilterBarProps) {
  return (
    <form
      className={styles.bar}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      aria-label="会话筛选"
    >
      <div className={styles.inputs}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>用户名</span>
          <input
            type="text"
            className={styles.input}
            placeholder="按用户名筛选"
            value={filter.user}
            onChange={(e) => setFilter((prev) => ({ ...prev, user: e.target.value }))}
            autoComplete="off"
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Session ID</span>
          <input
            type="text"
            className={`${styles.input} ${styles.inputMono}`}
            placeholder="完整或部分 ID"
            value={filter.session_id}
            onChange={(e) => setFilter((prev) => ({ ...prev, session_id: e.target.value }))}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>标题关键词</span>
          <input
            type="text"
            className={styles.input}
            placeholder="标题包含的文本"
            value={filter.keyword}
            onChange={(e) => setFilter((prev) => ({ ...prev, keyword: e.target.value }))}
            autoComplete="off"
          />
        </label>
      </div>

      {/*
        日期区间：单行版式（与 MobileStatsToolbar 同款 dateHalf / dateSep）
        - 顶部一个「日期」label，下面 [开始 v]  至  [结束 v]
        - DatePicker 已升级为 TDesign 自定义弹层，不会再被原生 type=date 的最小宽度撑破
      */}
      <div className={styles.field}>
        <span className={styles.fieldLabel}>日期</span>
        <div className={styles.dateRange}>
          <div className={toolbarStyles.dateHalf}>
            <DatePicker
              value={filter.since}
              onChange={(v) => setFilter((prev) => ({ ...prev, since: v || '' }))}
              placeholder="开始"
              allowInput={false}
            />
          </div>
          <span className={toolbarStyles.dateSep} aria-hidden="true">至</span>
          <div className={toolbarStyles.dateHalf}>
            <DatePicker
              value={filter.until}
              onChange={(v) => setFilter((prev) => ({ ...prev, until: v || '' }))}
              placeholder="结束"
              allowInput={false}
            />
          </div>
        </div>
      </div>

      <div className={styles.chipRow} role="group" aria-label="日期快捷">
        {QUICK_ITEMS.map((item) => {
          const active = quick === item.value;
          return (
            <button
              key={item.value}
              type="button"
              className={`${styles.chip} ${active ? styles.chipActive : ''}`}
              aria-pressed={active}
              onClick={() => onQuickChange(active ? '' : item.value)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnGhost}`}
          onClick={onReset}
          disabled={loading}
        >
          重置
        </button>
        <button
          type="submit"
          className={`${styles.btn} ${styles.btnPrimary}`}
          disabled={loading}
        >
          {loading ? '查询中…' : '查询'}
        </button>
      </div>
    </form>
  );
}
