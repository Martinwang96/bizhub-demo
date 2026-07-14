/**
 * 健壮的写剪贴板工具，优先 navigator.clipboard，失败时 fallback 到
 * document.execCommand('copy')。返回 Promise<boolean> —— true 表示复制成功。
 *
 * 关键约束：必须在用户手势同步栈内调用（点击事件 handler 第一次同步执行段里）。
 *
 * 重要的实现细节：fallback (execCommand) 路径必须 *同步* 执行，不能跨越任何
 * await / setTimeout / Promise.then —— 否则 iOS Safari / WebView 会判定
 * "已经脱离用户手势"，execCommand('copy') 静默失败（无错误，但啥也没复制）。
 *
 * 因此本函数的策略：
 *   1. 同步检查能否用 navigator.clipboard（secure context + 对象存在）
 *   2. 不能 → 同步走 execCommand fallback，立即得结果，包成 Promise.resolve
 *   3. 能用 → await navigator.clipboard.writeText；失败时再 fallback —— 但
 *      此时手势可能已丢，所以 modern API 失败的兜底成功率本就较低，无碍
 *      （HTTP / WebView 场景压根进不来这个分支）
 *
 * 平台分流：
 *   桌面 / Android：<textarea> + select() + execCommand('copy')
 *   iOS：<span contentEditable> + Range/Selection + execCommand('copy')
 */
export function writeClipboard(text: string): Promise<boolean> {
  // 同步分流：先决定走哪条路径，避免不必要地引入 microtask 边界
  const canUseModern =
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard &&
    typeof window !== 'undefined' &&
    window.isSecureContext;

  if (!canUseModern) {
    // 关键：同步执行，不进入 microtask
    return Promise.resolve(execCommandCopy(text));
  }

  // Modern path
  return navigator.clipboard.writeText(text).then(
    () => true,
    () => execCommandCopy(text), // 兜底（手势可能已丢，但试一下不亏）
  );
}

/** 同步执行 execCommand 复制；按平台分流 */
function execCommandCopy(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const isIOS = /ipad|iphone|ipod/i.test(navigator.userAgent);
  return isIOS ? copyByContentEditable(text) : copyByTextarea(text);
}

/** 桌面 / Android 路径：textarea + select() */
function copyByTextarea(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  // 不要 readonly：某些浏览器在 readonly textarea 上 execCommand 行为异常
  ta.style.position = 'fixed';
  ta.style.top = '-9999px';
  ta.style.left = '0';
  ta.style.width = '1px';
  ta.style.height = '1px';
  ta.style.padding = '0';
  ta.style.border = 'none';
  ta.style.outline = 'none';
  ta.style.boxShadow = 'none';
  ta.style.background = 'transparent';
  ta.style.fontSize = '16px';
  document.body.appendChild(ta);

  const prevActive = document.activeElement as HTMLElement | null;
  let ok = false;
  try {
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  } finally {
    document.body.removeChild(ta);
    if (prevActive && typeof prevActive.focus === 'function') {
      try { prevActive.focus(); } catch { /* ignore */ }
    }
  }
  return ok;
}

/** iOS 路径：contentEditable span + Range/Selection */
function copyByContentEditable(text: string): boolean {
  const el = document.createElement('span');
  el.textContent = text;
  el.style.whiteSpace = 'pre'; // 保留 \n
  el.style.position = 'fixed';
  el.style.top = '-9999px';
  el.style.left = '0';
  el.style.fontSize = '16px';
  el.style.color = 'transparent';
  el.contentEditable = 'true';
  (el.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect = 'text';
  el.style.userSelect = 'text';
  document.body.appendChild(el);

  const prevSelection = (() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    return sel.getRangeAt(0).cloneRange();
  })();

  let ok = false;
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    ok = document.execCommand('copy');
    sel?.removeAllRanges();
  } catch {
    ok = false;
  } finally {
    document.body.removeChild(el);
    if (prevSelection) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(prevSelection);
    }
  }
  return ok;
}
