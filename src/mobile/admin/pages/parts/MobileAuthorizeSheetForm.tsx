import styles from './MobileAuthorizeSheetForm.module.css';

export interface AuthorizeFormState {
  loginName: string;
  bizRole: string;
  skillUser: boolean;
  approval: boolean;
  readonly: boolean;
}

interface MobileAuthorizeSheetFormProps {
  form: AuthorizeFormState;
  setForm: (next: AuthorizeFormState) => void;
  editing: string | null;
  readonly: boolean;
  saving: boolean;
}

/**
 * 新增 / 编辑授权表单内容（不含 footer 按钮，footer 由父组件 Sheet 渲染）。
 */
export default function MobileAuthorizeSheetForm({ form, setForm, editing, readonly, saving }: MobileAuthorizeSheetFormProps) {
  const disabled = readonly || saving;

  return (
    <div className={styles.form}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>登录名 (loginName)</span>
        <input
          className={styles.input}
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="请输入登录名"
          value={form.loginName}
          disabled={!!editing || disabled}
          onChange={(e) => setForm({ ...form, loginName: e.target.value })}
        />
        {editing && (
          <span className={styles.hint}>编辑模式下登录名不可修改</span>
        )}
      </label>

      <fieldset className={styles.field} disabled={disabled}>
        <legend className={styles.fieldLabel}>Biz Hub 角色</legend>
        <div className={styles.chipGroup} role="radiogroup" aria-label="Biz Hub 角色">
          {(['user', 'manager'] as const).map((role) => {
            const active = form.bizRole === role;
            return (
              <button
                key={role}
                type="button"
                role="radio"
                aria-checked={active}
                className={`${styles.chipBtn} ${active ? styles.chipBtnActive : ''}`}
                onClick={() => setForm({ ...form, bizRole: role })}
              >
                {role === 'user' ? 'Biz user' : 'Biz manager'}
              </button>
            );
          })}
        </div>
        <span className={styles.hint}>admin 来自环境变量，不可在此设置。</span>
      </fieldset>

      <fieldset className={styles.field} disabled={disabled}>
        <legend className={styles.fieldLabel}>附加权限</legend>
        <div className={styles.checkList}>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={form.skillUser}
              onChange={(e) => setForm({ ...form, skillUser: e.target.checked })}
            />
            <span>
              <strong>Skill user</strong>
              <em className={styles.checkHint}>可上传与查看 Skill</em>
            </span>
          </label>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={form.approval}
              onChange={(e) => setForm({ ...form, approval: e.target.checked })}
            />
            <span>
              <strong>Skill approval</strong>
              <em className={styles.checkHint}>可审批发布；自动包含 user</em>
            </span>
          </label>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={form.readonly}
              onChange={(e) => setForm({ ...form, readonly: e.target.checked })}
            />
            <span>
              <strong>Console readonly</strong>
              <em className={styles.checkHint}>只读访问管理后台</em>
            </span>
          </label>
        </div>
      </fieldset>
    </div>
  );
}
