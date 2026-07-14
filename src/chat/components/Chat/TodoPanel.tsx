import { memo } from 'react';
import type { TodoState } from '../../types/session';
import styles from './TodoPanel.module.css';

interface Props {
  todo: TodoState;
}

function TodoPanel({ todo }: Props) {
  if (!todo.todos.length) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>📋 任务清单</span>
        <span className={`${styles.progress} ${todo.all_done ? styles.progressDone : ''}`}>
          {todo.all_done ? '✅ ' : ''}{todo.progress}
        </span>
      </div>
      <div className={styles.list}>
        {todo.todos.map((item, i) => (
          <div
            key={i}
            className={`${styles.item} ${item.status === 'doing' ? styles.itemDoing : ''} ${item.status === 'done' ? styles.itemDone : ''}`}
          >
            <div className={`${styles.icon} ${item.status === 'pending' ? styles.iconPending : ''} ${item.status === 'doing' ? styles.iconDoing : ''} ${item.status === 'done' ? styles.iconDone : ''}`}>
              {item.status === 'done' && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
              {item.status === 'doing' && (
                <svg className={styles.spinSvg} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                </svg>
              )}
            </div>
            <div className={styles.body}>
              <div className={`${styles.content} ${item.status === 'done' ? styles.contentDone : ''}`}>
                {item.content}
              </div>
              {item.result_summary && (
                <div className={styles.result}>→ {item.result_summary}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(TodoPanel);
