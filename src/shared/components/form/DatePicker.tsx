import { useState } from 'react';
import RawDatePicker, { type DatePickerProps as TDesignDatePickerProps } from 'tdesign-react/es/date-picker/DatePicker';
import { ChevronDownIcon } from 'tdesign-icons-react';
import 'tdesign-react/es/input/style/index.css';
import 'tdesign-react/es/popup/style/index.css';
import 'tdesign-react/es/date-picker/style/index.css';
import styles from './_tdesign/TDesignControl.module.css';
import { cx } from '../_internal/cx';
import { surfaceClass, type TDesignControlSurface } from './_tdesign/tdesignSurface';

export interface DatePickerProps extends Omit<TDesignDatePickerProps, 'suffixIcon' | 'value' | 'onChange'> {
  id?: string;
  className?: string;
  surface?: TDesignControlSurface;
  value: string;
  onChange: (value: string) => void;
}

function normalizeDateValue(value: unknown): string {
  if (Array.isArray(value)) return normalizeDateValue(value[0]);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value === null || value === undefined) return '';
  return String(value);
}

export function DatePicker({
  id,
  className,
  surface = 'transparent',
  value,
  onChange,
  allowInput = true,
  clearable = true,
  format = 'YYYY-MM-DD',
  valueType = 'YYYY-MM-DD',
  inputProps,
  popupProps,
  ...rest
}: DatePickerProps) {
  // 接管 popup 可见状态：默认行为下 TDesign DatePicker 在 popup 已展开时
  // 再点 trigger 不会关闭，这里通过 popupProps.visible 走 controlled 模式，
  // 让"再点一下收起"自动生效；选完日期（onChange）后主动关闭 popup。
  // 调用方仍可通过 popupProps.visible / popupProps.onVisibleChange 完全接管。
  const [innerVisible, setInnerVisible] = useState(false);
  const externallyControlled = popupProps?.visible !== undefined;
  const visible = externallyControlled ? popupProps!.visible! : innerVisible;

  return (
    <RawDatePicker
      {...rest}
      className={cx(styles.root, surfaceClass(surface), className)}
      value={value}
      allowInput={allowInput}
      clearable={clearable}
      format={format}
      valueType={valueType}
      suffixIcon={<ChevronDownIcon fillColor="transparent" strokeColor="currentColor" strokeWidth={1.25} />}
      inputProps={inputProps}
      popupProps={{
        ...popupProps,
        visible,
        onVisibleChange: (next, context) => {
          if (!externallyControlled) setInnerVisible(next);
          popupProps?.onVisibleChange?.(next, context);
        },
      }}
      onChange={(nextValue) => {
        onChange(normalizeDateValue(nextValue));
        // 选中日期后主动关闭 panel，符合移动端"选完即关"直觉。
        if (!externallyControlled) setInnerVisible(false);
      }}
    />
  );
}
