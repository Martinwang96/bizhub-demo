import { memo, useEffect, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { installMarkedSingleTildeFix } from '@shared/utils/markedSetup';

marked.setOptions({ gfm: true, breaks: true });
// 仅识别双波浪线删除线：避免数值区间（如 3%~8%）中的单个 ~ 被误判为删除线
installMarkedSingleTildeFix();

interface Props {
  text: string;
  className?: string;
}

function Markdown({ text, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // 剥离 <think>…</think> 标签（reasoning 已走独立通道）
  const stripped = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  const html = DOMPurify.sanitize(
    marked.parse(stripped) as string,
    { ADD_ATTR: ['target', 'rel'] },
  );

  // useEffect 后注入"复制"按钮（不在 HTML 字符串里注入事件，避免 CSP 问题）
  // 同时为每个 <table> 包一层 .md-table-scroll 容器，使其在移动端可独立横向滚动
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.querySelectorAll('pre').forEach((pre) => {
      if (pre.querySelector('.copy-code-btn')) return;
      const btn = document.createElement('button');
      btn.className = 'copy-code-btn';
      btn.type = 'button';
      btn.textContent = '复制';
      btn.addEventListener('click', () => {
        const code = pre.querySelector('code') ?? pre;
        void navigator.clipboard.writeText(code.textContent ?? '').then(() => {
          btn.textContent = '已复制';
          setTimeout(() => { btn.textContent = '复制'; }, 1500);
        });
      });
      pre.appendChild(btn);
    });

    // 表格独立横滚 wrapper：幂等（已包裹则跳过），不引入 MutationObserver
    el.querySelectorAll('table').forEach((table) => {
      const parent = table.parentElement;
      if (parent && parent.classList.contains('md-table-scroll')) return;
      const wrap = document.createElement('div');
      wrap.className = 'md-table-scroll';
      table.replaceWith(wrap);
      wrap.appendChild(table);
    });
  }, [html]);

  return (
    <div
      ref={ref}
      className={`md-content${className ? ` ${className}` : ''}`}
      // All AI content must go through Markdown + DOMPurify — no bare dangerouslySetInnerHTML
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default memo(Markdown);
