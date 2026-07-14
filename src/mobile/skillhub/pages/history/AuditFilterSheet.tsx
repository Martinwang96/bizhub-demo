/**
 * 审计日志筛选 Bottom Sheet。
 *
 * 与 useAuditLogs 的过滤状态解耦：
 *   - sheet 内部使用本地 state 编辑临时值
 *   - 点击"应用"才回写到 hook（避免抖动 / 频繁请求）
 *   - 点击"重置"清空所有字段
 */
import { useEffect, useState } from 'react';
import MobileBottomSheet from '../../../shared/MobileBottomSheet';
import {
  EMPTY_AUDIT_FILTER,
  type AuditFilter,
} from '@skillhub/hooks/useAuditLogs';
import type { SkillItem } from '@skillhub/apiAdapters';
import styles from './history.module.css';

interface Props {
  open: boolean;
  /** sheet 打开时的当前过滤值 */
  initialFilter: AuditFilter;
  /** 后端返回的可选 action 枚举 */
  actions: string[];
  /** 用于 skill 下拉的可选项（从 versions 借的技能列表） */
  skills: SkillItem[];
  onClose: () => void;
  onApply: (next: AuditFilter) => void;
}

export default function AuditFilterSheet({
  open,
  initialFilter,
  actions,
  skills,
  onClose,
  onApply,
}: Props) {
  const [draft, setDraft] = useState<AuditFilter>(initialFilter);

  useEffect(() => {
    if (open) {
      setDraft(initialFilter);
    }
  }, [open, initialFilter]);

  const handleReset = () => setDraft(EMPTY_AUDIT_FILTER);
  const handleApply = () => onApply(draft);

  return (
    <MobileBottomSheet
      open={open}
      onClose={onClose}
      title="筛选日志"
      footer={
        <div className={styles.filterFooter}>
          <button type="button" className={styles.sheetCancelBtn} onClick={handleReset}>
            重置
          </button>
          <button type="button" className={styles.sheetConfirmBtn} onClick={handleApply}>
            应用筛选
          </button>
        </div>
      }
    >
      <div className={styles.filterSheet}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel} htmlFor="audit-filter-skill">
            Skill
          </label>
          <select
            id="audit-filter-skill"
            className={styles.filterField}
            value={draft.skill_id}
            onChange={(e) => setDraft({ ...draft, skill_id: e.target.value })}
          >
            <option value="">All Skills</option>
            {skills.map((s) => (
              <option key={s.skillId} value={s.skillId}>{s.skillId}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel} htmlFor="audit-filter-user">
            User
          </label>
          <input
            id="audit-filter-user"
            className={styles.filterField}
            type="text"
            value={draft.user}
            onChange={(e) => setDraft({ ...draft, user: e.target.value })}
            placeholder="用户名或邮箱"
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel} htmlFor="audit-filter-action">
            Action Type
          </label>
          <select
            id="audit-filter-action"
            className={styles.filterField}
            value={draft.action}
            onChange={(e) => setDraft({ ...draft, action: e.target.value })}
          >
            <option value="">All Actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterRow}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel} htmlFor="audit-filter-since">
              Since
            </label>
            <input
              id="audit-filter-since"
              className={styles.filterField}
              type="date"
              value={draft.since}
              onChange={(e) => setDraft({ ...draft, since: e.target.value })}
            />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel} htmlFor="audit-filter-until">
              Until
            </label>
            <input
              id="audit-filter-until"
              className={styles.filterField}
              type="date"
              value={draft.until}
              onChange={(e) => setDraft({ ...draft, until: e.target.value })}
            />
          </div>
        </div>
      </div>
    </MobileBottomSheet>
  );
}
