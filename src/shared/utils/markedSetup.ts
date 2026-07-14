import { marked } from 'marked';
import type { TokenizerThis } from 'marked';

let installed = false;

/**
 * 修复 marked(GFM) 把「单个」`~` 误判为删除线的问题。
 *
 * marked v14 的内置删除线规则为 `/^(~~?)(?=[^\s~])(...)\1(?=[^~]|$)/`，
 * 其中 `(~~?)` 允许「单个」`~` 触发删除线。于是形如 `12%~16%`、`3%~8%`
 * 这类用单 `~` 表示的数值区间，两个 `~` 会被配对成 `<del>`，导致中间整段
 * 文字被错误地划上横线。
 *
 * 这里覆盖内置 `del` tokenizer，仅识别标准的双波浪线 `~~text~~`；
 * 遇到单个 `~` 返回 `undefined`，marked 会退回到普通文本处理，
 * 从而保证数值区间等单波浪线内容不被划线，同时保留标准删除线能力。
 *
 * 幂等：marked.use 作用于全局默认实例，多次调用只注册一次，避免 tokenizer 叠加。
 */
export function installMarkedSingleTildeFix(): void {
  if (installed) return;
  installed = true;

  marked.use({
    tokenizer: {
      del(src) {
        // 仅匹配成对的双波浪线；单个 ~ 不命中，交还给后续的文本处理。
        const match = /^~~(?=[^\s~])([\s\S]*?[^\s~])~~(?=[^~]|$)/.exec(src);
        if (!match) return undefined;
        const text = match[1];
        return {
          type: 'del',
          raw: match[0],
          text,
          // 运行时 this 为 Tokenizer 实例，其 lexer 可解析删除线内的行内内容
          // （加粗/链接等嵌套）。类型层 lexer 未公开，做一次安全转换。
          tokens: (this as unknown as TokenizerThis).lexer.inlineTokens(text),
        };
      },
    },
  });
}
