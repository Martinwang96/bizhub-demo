import styles from './TDesignControl.module.css';

/**
 * TDesign 受控控件（SelectInput / DatePicker / DateRangePicker）的视觉外观变体。
 * - transparent: 默认。控件背景与卡片/工具栏融合，边框由 token 控制。
 * - solid: 在白底卡片中作为「明显的输入框」呈现，常态就是 var(--card) 白底，
 *          不再依赖 hover 才有底色。
 */
export type TDesignControlSurface = 'transparent' | 'solid';

export function surfaceClass(surface: TDesignControlSurface | undefined): string | false {
  return surface === 'solid' && styles.solid;
}
