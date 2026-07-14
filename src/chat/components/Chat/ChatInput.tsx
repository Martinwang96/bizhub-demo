import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from 'tdesign-icons-react';
import { useAutoResize } from '../../hooks/useAutoResize';
import styles from './ChatInput.module.css';

interface SubmitOptions {
  visualize?: boolean;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string, options?: SubmitOptions) => void;
  onAbort?: () => void;
  loading?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

type ToolKey = 'visualize';

interface ToolItem {
  key: ToolKey;
  icon: string;
  label: string;
  badge?: string;
  desc?: string;
}

// 工具列表：当前只有"生成图表"，预留扩展位
const TOOL_ITEMS: ToolItem[] = [
  {
    key: 'visualize',
    icon: 'chart-bar',
    label: '可视化',
    desc: '把回答自动渲染为可视化图表',
  },
];

function ChatInput({ value, onChange, onSubmit, onAbort, loading, placeholder, autoFocus }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const toolsWrapRef = useRef<HTMLDivElement>(null);
  const [activeTool, setActiveTool] = useState<ToolKey | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useAutoResize(ref, value, 200);

  const visualizeSelected = activeTool === 'visualize';

  const submit = useCallback(() => {
    const v = value.trim();
    if (v && !loading) {
      onChange('');
      onSubmit(v, visualizeSelected ? { visualize: true } : undefined);
      setActiveTool(null);
    }
  }, [loading, onChange, onSubmit, value, visualizeSelected]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      submit();
    }
  }, [submit]);

  const handleBtnClick = useCallback(() => {
    if (loading) onAbort?.();
    else submit();
  }, [loading, onAbort, submit]);

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
    <div className={styles.area}>
      <div className={styles.outer}>
        <div className={styles.wrap}>
          <textarea
            ref={ref}
            className={styles.textarea}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? '继续对话...'}
            rows={1}
            autoFocus={autoFocus}
          />
          <div className={styles.toolbar}>
            <div className={styles.toolsCluster}>
              <div className={styles.toolsWrap} ref={toolsWrapRef}>
                <button
                  type="button"
                  className={`${styles.toolsBtn} ${menuOpen ? styles.toolsBtnOpen : ''}`}
                  onClick={() => setMenuOpen((v) => !v)}
                  disabled={!!loading}
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
                          {selected && (
                            <Icon name="check" className={styles.toolsMenuItemCheck} />
                          )}
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
                  disabled={!!loading}
                  title="点击取消生成图表"
                >
                  <Icon name="chart-bar" className={styles.toolChipIcon} />
                  <span className={styles.toolChipLabel}>可视化</span>
                  <Icon name="close" className={styles.toolChipClose} />
                </button>
              )}
            </div>

            <span className={styles.hint}>Enter 发送 / Shift+Enter 换行</span>
          </div>
          <div className={styles.btnArea}>
            <button
              type="button"
              className={`${styles.sendBtn} ${loading ? styles.stopBtn : ''}`}
              onClick={handleBtnClick}
              disabled={!loading && !value.trim()}
              title={loading ? '停止生成' : '发送'}
              aria-label={loading ? '停止生成' : '发送'}
            >
              {loading ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="5" y="5" width="14" height="14" rx="2.5" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(ChatInput);
