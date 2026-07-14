import RawDateRangePicker, { type DateRangePickerProps as TDesignDateRangePickerProps } from 'tdesign-react/es/date-picker/DateRangePicker';
import { ChevronDownIcon } from 'tdesign-icons-react';
import dayjs from 'dayjs';
import advancedFormat from 'dayjs/plugin/advancedFormat';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import weekYear from 'dayjs/plugin/weekYear';
import 'dayjs/locale/zh-cn';
import 'tdesign-react/es/input/style/index.css';
import 'tdesign-react/es/range-input/style/index.css';
import 'tdesign-react/es/popup/style/index.css';
import 'tdesign-react/es/date-picker/style/index.css';
import styles from './_tdesign/TDesignControl.module.css';
import { cx } from '../_internal/cx';
import { surfaceClass, type TDesignControlSurface } from './_tdesign/tdesignSurface';

dayjs.extend(advancedFormat);
dayjs.extend(weekOfYear);
dayjs.extend(weekYear);

export type DateRangeValue = [string, string];

export interface DateRangePickerProps extends Omit<TDesignDateRangePickerProps, 'suffixIcon' | 'value' | 'onChange'> {
  className?: string;
  surface?: TDesignControlSurface;
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
}

function normalizeDateValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value === null || value === undefined) return '';
  return String(value);
}

function normalizeDateRangeValue(value: unknown): DateRangeValue {
  if (!Array.isArray(value)) return ['', ''];
  return [normalizeDateValue(value[0]), normalizeDateValue(value[1])];
}

export function DateRangePicker({
  className,
  surface = 'transparent',
  value,
  onChange,
  allowInput = false,
  clearable = true,
  separator = '至',
  ...rest
}: DateRangePickerProps) {
  return (
    <RawDateRangePicker
      {...rest}
      className={cx(styles.root, styles.rangeRoot, surfaceClass(surface), className)}
      value={value}
      allowInput={allowInput}
      clearable={clearable}
      separator={separator}
      suffixIcon={<ChevronDownIcon fillColor="transparent" strokeColor="currentColor" strokeWidth={1.25} />}
      onChange={(nextValue) => onChange(normalizeDateRangeValue(nextValue))}
    />
  );
}
