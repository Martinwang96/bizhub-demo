import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Icon } from 'tdesign-icons-react';
import styles from './HomeSearch.module.css';

interface SubmitOptions {
  visualize?: boolean;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string, options?: SubmitOptions) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  inputRef?: RefObject<HTMLInputElement>;
}

type ToolKey = 'visualize';

interface ToolItem {
  key: ToolKey;
  icon: string;
  label: string;
  badge?: string;
}

const TOOL_ITEMS: ToolItem[] = [
  { key: 'visualize', icon: 'chart-bar', label: '可视化' },
];

function HomeSearch({ value, onChange, onSubmit, placeholder, autoFocus, disabled, inputRef }: Props) {
  const [activeTool, setActiveTool] = useState<ToolKey | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const toolsWrapRef = useRef<HTMLDivElement>(null);

  const visualizeSelected = activeTool === 'visualize';

  const submit = useCallback(() => {
    const v = value.trim();
    if (v && !disabled) {
      onChange('');
      onSubmit(v, visualizeSelected ? { visualize: true } : undefined);
      setActiveTool(null);
    }
  }, [disabled, onChange, onSubmit, value, visualizeSelected]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      submit();
    }
  }, [submit]);

  // 点击外部 / ESC 关闭菜单
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!toolsWrapRef.current) return;
      if (!toolsWrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const handleToolPick = useCallback((key: ToolKey) => {
    setActiveTool((prev) => (prev === key ? null : key));
    setMenuOpen(false);
  }, []);

  const clearActiveTool = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveTool(null);
  }, []);

  return (
    <div className={styles.wrap}>
      <input
        ref={inputRef}
        className={styles.input}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
      />
      <div className={styles.toolbar}>
        <div className={styles.toolsCluster}>
          <div className={styles.toolsWrap} ref={toolsWrapRef}>
            <button
              type="button"
              className={`${styles.toolsBtn} ${menuOpen ? styles.toolsBtnOpen : ''}`}
              onClick={() => setMenuOpen((v) => !v)}
              disabled={disabled}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="工具"
            >
              <Icon name="adjustment" className={styles.toolsBtnIcon} />
              <span className={styles.toolsBtnLabel}>工具</span>
              <Icon
                name="chevron-up"
                className={`${styles.toolsBtnChevron} ${menuOpen ? styles.toolsBtnChevronOpen : ''}`}
              />
            </button>

            {menuOpen && (
              <div className={styles.toolsMenu} role="menu">
                <div className={styles.toolsMenuTitle}>工具</div>
                {TOOL_ITEMS.map((item) => {
                  const selected = activeTool === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="menuitem"
                      className={`${styles.toolsMenuItem} ${selected ? styles.toolsMenuItemActive : ''}`}
                      onClick={() => handleToolPick(item.key)}
                    >
                      <Icon name={item.icon} className={styles.toolsMenuItemIcon} />
                      <span className={styles.toolsMenuItemLabel}>{item.label}</span>
                      {item.badge && <span className={styles.toolsMenuItemBadge}>{item.badge}</span>}
                      {selected && <Icon name="check" className={styles.toolsMenuItemCheck} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {visualizeSelected && (
            <button
              type="button"
              className={styles.toolChip}
              onClick={clearActiveTool}
              disabled={disabled}
              title="点击取消生成图表"
            >
              <Icon name="chart-bar" className={styles.toolChipIcon} />
              <span className={styles.toolChipLabel}>可视化</span>
              <Icon name="close" className={styles.toolChipClose} />
            </button>
          )}
        </div>

        <span className={styles.hint}>Enter 发送</span>
      </div>
      <button
        type="button"
        className={styles.sendBtn}
        onClick={submit}
        disabled={disabled || !value.trim()}
        title="发送"
        aria-label="发送"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

export default memo(HomeSearch);
