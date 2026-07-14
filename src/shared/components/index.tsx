/**
 * @shared/components — Biz-Hub 共享组件库统一入口
 *
 * 按职责分组：
 * - layout/    结构容器：SectionCard / TableWrap
 * - feedback/  状态反馈：EmptyState / SkeletonStack / Notice / Toast / AclDenied
 * - overlay/   浮层：Drawer / Modal
 * - form/      表单控件：TriCheckbox / SelectInput / DatePicker / DateRangePicker
 *               （SelectInput/Date* 是 TDesign 封装层，内部依赖在 form/_tdesign/）
 * - content/   内容渲染：Markdown / Watermark
 * - brand/     品牌：BrandLogo
 * - inline/    行内元素：CountPill
 * - _internal/ 内部工具，不对外（业务代码请勿直接 import）
 *
 * 业务侧统一从 `@shared/components` 导入；不要直接 import 子路径，
 * 唯一例外：`@shared/components/common.module.css`（共享样式 token，向下兼容）。
 */

// layout
export { SectionCard } from './layout/SectionCard';
export type { SectionCardProps } from './layout/SectionCard';
export { TableWrap } from './layout/TableWrap';

// feedback
export { EmptyState } from './feedback/EmptyState';
export type { EmptyStateProps } from './feedback/EmptyState';
export { SkeletonStack } from './feedback/SkeletonStack';
export type { SkeletonStackProps } from './feedback/SkeletonStack';
export { Notice } from './feedback/Notice';
export type { NoticeProps } from './feedback/Notice';
export { ToastProvider, useToast } from './feedback/Toast';
export type { ToastTone } from './feedback/Toast';

// overlay
export { Drawer } from './overlay/Drawer';
export type { DrawerProps } from './overlay/Drawer';
export { Modal } from './overlay/Modal';
export type { ModalProps } from './overlay/Modal';
export { IconTooltip } from './overlay/IconTooltip';
export type { IconTooltipProps } from './overlay/IconTooltip';

// form
export { TriCheckbox } from './form/TriCheckbox';
export type { TriState, TriCheckboxProps } from './form/TriCheckbox';
export { SelectInput } from './form/SelectInput';
export type { SelectInputOption, SelectInputProps } from './form/SelectInput';
export { DatePicker } from './form/DatePicker';
export type { DatePickerProps } from './form/DatePicker';
export { DateRangePicker } from './form/DateRangePicker';
export type { DateRangePickerProps, DateRangeValue } from './form/DateRangePicker';
export type { TDesignControlSurface } from './form/_tdesign/tdesignSurface';

// inline
export { CountPill } from './inline/CountPill';
