/**
 * 前端 Token 估算（与 Python `context/token_estimator.py` 严格等价）。
 *
 * 中英文分类估算策略：
 *   - CJK 字符: 1.5 token/字符（中日韩统一表意文字 + 扩展区 + 兼容区）
 *   - ASCII（codepoint < 128）: 0.25 token/字符
 *   - 其他 Unicode（标点、符号、emoji 等）: 1 token/字符
 *
 * 比官方 tiktoken 略保守（中文偏高 5-10%），但与后端段 3.5 注入算法对齐，
 * 确保 admin 在编辑器中看到的 "tokens · 上下文占比" 与服务端实际注入体积一致。
 */

const MODEL_CONTEXT_WINDOW_DEFAULT = 65536;

/** 估算单段文本的 token 数。空字符串返回 0；其他至少返回 1（与 Python 版一致）。 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let ascii = 0;
  let other = 0;
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i);
    if (cp === undefined) continue;
    // 处理代理对：codePointAt 返回 4 字节字符的真实 codepoint，但 length 仍按 utf-16 计算
    if (cp > 0xffff) {
      i++; // 跳过代理对的低位
    }
    if (
      (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified Ideographs
      (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Extension A
      (cp >= 0x20000 && cp <= 0x2a6df) || // CJK Extension B
      (cp >= 0xf900 && cp <= 0xfaff) // CJK Compatibility
    ) {
      cjk += 1;
    } else if (cp < 128) {
      ascii += 1;
    } else {
      other += 1;
    }
  }
  const tokens = Math.floor(cjk * 1.5 + ascii * 0.25 + other * 1.0);
  return Math.max(tokens, 1);
}

/** 计算 token 数占给定上下文窗口的百分比（默认 65536，与 chat_loop.MODEL_CONTEXT_WINDOW 对齐）。 */
export function contextRatio(tokens: number, contextWindow: number = MODEL_CONTEXT_WINDOW_DEFAULT): number {
  if (contextWindow <= 0) return 0;
  return tokens / contextWindow;
}

/** 格式化角标文本，例如 "2,341 字符 · 1,876 tokens · 占上下文 2.9%"。 */
export function formatTextStats(text: string, contextWindow: number = MODEL_CONTEXT_WINDOW_DEFAULT): string {
  const chars = text.length;
  const tokens = estimateTokens(text);
  const pct = (contextRatio(tokens, contextWindow) * 100).toFixed(1);
  return `${chars.toLocaleString()} 字符 · ${tokens.toLocaleString()} tokens · 占上下文 ${pct}%`;
}

export const MODEL_CONTEXT_WINDOW = MODEL_CONTEXT_WINDOW_DEFAULT;
