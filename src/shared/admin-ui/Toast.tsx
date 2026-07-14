/**
 * Toast — 全局轻量提示
 *
 * 用法：
 *   const toast = useToast();
 *   toast.success('已保存');
 *   toast.error(e.message);
 *
 * Provider 必须在使用 useToast 的组件树之上挂载一次。
 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Toast.module.css';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  show: (tone: ToastTone, message: string, durationMs?: number) => void;
  info: (message: string, durationMs?: number) => void;
  success: (message: string, durationMs?: number) => void;
  warning: (message: string, durationMs?: number) => void;
  error: (message: string, durationMs?: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((tone: ToastTone, message: string, durationMs = 2400) => {
    idRef.current += 1;
    const id = idRef.current;
    setItems((prev) => [...prev, { id, tone, message }]);
    setTimeout(() => remove(id), durationMs);
  }, [remove]);

  const api: ToastApi = {
    show,
    info: (m, d) => show('info', m, d),
    success: (m, d) => show('success', m, d),
    warning: (m, d) => show('warning', m, d),
    error: (m, d) => show('danger', m, d),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <div className={styles.root} aria-live="polite" aria-atomic="false">
          {items.map((t) => (
            <div key={t.id} className={`${styles.toast} ${styles[`tone_${t.tone}`]}`} role={t.tone === 'danger' ? 'alert' : 'status'}>
              {t.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // 静默 noop fallback，避免外层未挂载 Provider 时崩溃
    return {
      show: () => {},
      info: () => {},
      success: () => {},
      warning: () => {},
      error: () => {},
    };
  }
  return ctx;
}
