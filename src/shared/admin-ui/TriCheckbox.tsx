/**
 * TriCheckbox — 三态 checkbox（受控）
 *
 * state:
 *  - checked       已选
 *  - indeterminate 部分选（用于树父节点）
 *  - unchecked     未选
 * onChange 仅会回 'checked' / 'unchecked'，indeterminate 由外部传入。
 */
import type { KeyboardEvent } from 'react';
import styles from './TriCheckbox.module.css';

export type TriState = 'checked' | 'indeterminate' | 'unchecked';

export interface TriCheckboxProps {
  state: TriState;
  onChange: (next: 'checked' | 'unchecked') => void;
  disabled?: boolean;
  ariaLabel: string;
  /** 点击 indeterminate 时，应作为 checked 还是 unchecked 处理（默认 checked，符合"再点一次清空"的反向语义需求请传 unchecked） */
  indeterminateClickAs?: 'checked' | 'unchecked';
}

export function TriCheckbox({ state, onChange, disabled, ariaLabel, indeterminateClickAs = 'unchecked' }: TriCheckboxProps) {
  const handleClick = () => {
    if (disabled) return;
    if (state === 'checked') onChange('unchecked');
    else if (state === 'indeterminate') onChange(indeterminateClickAs);
    else onChange('checked');
  };

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleClick();
    }
  };

  const ariaChecked = state === 'checked' ? 'true' : state === 'indeterminate' ? 'mixed' : 'false';

  return (
    <div
      role="checkbox"
      aria-checked={ariaChecked}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      data-state={state}
      className={`${styles.box} ${disabled ? styles.disabled : ''}`}
      onClick={handleClick}
      onKeyDown={handleKey}
    />
  );
}

export default TriCheckbox;
