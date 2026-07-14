import type { ReactNode } from 'react';
import Watermark from '@shared/components/content/Watermark';
import type { Me } from '@shared/types/user';
import styles from './MobileShell.module.css';

interface MobileShellProps {
  me: Me | null;
  children: ReactNode;
}

/**
 * 移动端外壳：单列布局，去掉 PC 的 sidebar / topbar。
 * 仅承担：Watermark 注入 + 全局背景 + min-height + overflow 控制。
 * 内部所有交互组件（Header / Sheet / TabBar）都由 children 自行渲染。
 *
 * 通用版本，admin / skillhub 两端共用。
 */
export default function MobileShell({ me, children }: MobileShellProps) {
  return (
    <div className={styles.shell}>
      {me && <Watermark text={me.loginName} />}
      {children}
    </div>
  );
}
