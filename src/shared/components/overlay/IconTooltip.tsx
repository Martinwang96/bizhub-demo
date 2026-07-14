import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { Tooltip } from 'tdesign-react';
import type { TooltipProps } from 'tdesign-react';

export interface IconTooltipProps {
  content: ReactNode;
  children: ReactElement;
  disabled?: boolean;
  delay?: TooltipProps['delay'];
  compact?: boolean;
}

export function IconTooltip({
  content,
  children,
  disabled = false,
  delay = [400, 0],
  compact = false,
}: IconTooltipProps) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setEnabled(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  if (disabled || !enabled || !content) return children;

  return (
    <Tooltip
      content={content}
      placement="bottom"
      showArrow={false}
      theme="light"
      delay={delay}
      destroyOnClose
      overlayInnerStyle={compact ? {
        minHeight: 'unset',
        padding: '4px 8px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 400,
        lineHeight: '18px',
      } : undefined}
    >
      {children}
    </Tooltip>
  );
}
