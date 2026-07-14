import { useMemo, useState, type ReactNode } from 'react';
import RawSelectInput, { type SelectInputProps as TDesignSelectInputProps } from 'tdesign-react/es/select-input/SelectInput';
import { ChevronDownIcon } from 'tdesign-icons-react';
import 'tdesign-react/es/input/style/index.css';
import 'tdesign-react/es/popup/style/index.css';
import 'tdesign-react/es/select-input/style/index.css';
import styles from './_tdesign/TDesignControl.module.css';
import { cx } from '../_internal/cx';
import { surfaceClass, type TDesignControlSurface } from './_tdesign/tdesignSurface';

export interface SelectInputOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
}

export interface SelectInputProps extends Omit<TDesignSelectInputProps, 'options' | 'panel' | 'suffixIcon' | 'value' | 'valueDisplay' | 'onChange'> {
  id?: string;
  className?: string;
  title?: string;
  surface?: TDesignControlSurface;
  value: string;
  options: ReadonlyArray<SelectInputOption>;
  onChange: (value: string) => void;
}

function optionText(label: ReactNode): string | undefined {
  return typeof label === 'string' || typeof label === 'number' ? String(label) : undefined;
}

export function SelectInput({
  id,
  className,
  value,
  options,
  onChange,
  allowInput = true,
  clearable = true,
  surface = 'transparent',
  title: _title,
  inputProps,
  popupProps,
  onClear,
  onPopupVisibleChange,
  keys,
  ...rest
}: SelectInputProps) {
  const [popupVisible, setPopupVisible] = useState(false);
  const selected = useMemo(() => options.find((item) => item.value === value), [options, value]);
  const selectedText = selected ? optionText(selected.label) : undefined;

  return (
    <RawSelectInput
      {...rest}
      className={cx(styles.root, surfaceClass(surface), className)}
      value={selectedText ?? value}
      keys={keys}
      valueDisplay={selected && selectedText === undefined ? selected.label : undefined}
      allowInput={allowInput}
      clearable={clearable}
      suffixIcon={<ChevronDownIcon fillColor="transparent" strokeColor="currentColor" strokeWidth={1.25} />}
      popupVisible={popupVisible}
      onPopupVisibleChange={(visible, context) => {
        setPopupVisible(visible);
        onPopupVisibleChange?.(visible, context);
      }}
      onClear={(context) => {
        onChange('');
        onClear?.(context);
      }}
      inputProps={inputProps}
      popupProps={{
        ...popupProps,
        overlayInnerStyle: { minWidth: 'var(--select-popup-width, 180px)', ...popupProps?.overlayInnerStyle },
      }}
      panel={(
        <div className={styles.panel} role="listbox" aria-label={rest.placeholder}>
          {options.map((item) => {
            const active = item.value === value;
            return (
              <button
                key={item.value}
                type="button"
                role="option"
                aria-selected={active}
                className={cx(styles.option, active && styles.optionActive)}
                disabled={item.disabled}
                title={item.title ?? optionText(item.label)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(item.value);
                  setPopupVisible(false);
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    />
  );
}
