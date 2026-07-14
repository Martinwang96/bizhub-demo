/**
 * Demo Mock 引导：在应用任何代码执行前同步劫持 window.fetch。
 *
 * 由 vite.config.ts 的 injectMock 插件以 <script type="module"> 注入到每个 HTML
 * 入口的 <head> 最前，模块脚本按文档顺序在应用主脚本之前执行，因此应用发出的
 * 第一个请求即被拦截。所有数据均为虚构，无任何后端 / 内网依赖。
 */
import { Router, type MockRequest } from './router';
import { jsonResponse } from './envelope';
import { registerChatRoutes } from './handlers/chat';
import { handleChatStream } from './handlers/sse';
import { registerSkillHubRoutes } from './handlers/skillhub';
import { registerAdminRoutes } from './handlers/admin';
import { registerReportRoutes } from './handlers/reports';
import { registerShareRoutes } from './handlers/share';

const router = new Router();
// SSE 优先注册（虽路径唯一，保持语义清晰）
router.post('/api/sessions/:id/chat', handleChatStream);
registerChatRoutes(router);
registerReportRoutes(router);
registerShareRoutes(router);
registerSkillHubRoutes(router);
registerAdminRoutes(router);

function isMockedApi(path: string): boolean {
  return (
    path.startsWith('/api/') ||
    path === '/api' ||
    path.startsWith('/admin/api/') ||
    path.startsWith('/skill-hub/api/')
  );
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

async function parseBody(input: RequestInfo | URL, init?: RequestInit): Promise<unknown> {
  const rawBody = init?.body;
  if (typeof rawBody === 'string') {
    try { return JSON.parse(rawBody); } catch { return rawBody; }
  }
  if (rawBody === undefined && input instanceof Request) {
    try { return await input.clone().json(); } catch { return undefined; }
  }
  return undefined;
}

const nativeFetch = window.fetch.bind(window);

window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  let path: string;
  try {
    const u = new URL(resolveUrl(input), window.location.origin);
    path = u.pathname;

    if (!isMockedApi(path)) {
      return nativeFetch(input as RequestInfo, init);
    }

    const method = resolveMethod(input, init);
    const matched = router.match(method, path);
    if (!matched) {
      // 兜底：任何未显式 mock 的接口都返回"成功空数据"，杜绝页面出现任何形式的报错。
      // skill-hub 走原始 JSON（httpClient 会再包一层），其余走 Envelope。
      if (path.startsWith('/skill-hub/api/')) {
        return jsonResponse({ ok: true, items: [], skills: [], versions: [] }, 200);
      }
      return jsonResponse({ success: true, data: { items: [], total: 0, cursor: 0 } }, 200);
    }

    const body = await parseBody(input, init);
    const req: MockRequest = {
      method,
      path,
      query: u.searchParams,
      params: matched.params,
      body,
      raw: input instanceof Request ? input : null,
    };
    return await matched.handler(req);
  } catch (e) {
    return jsonResponse(
      { success: false, error: e instanceof Error ? e.message : 'Demo mock 内部错误' },
      500,
    );
  }
};

// eslint-disable-next-line no-console
console.info('%c[Demo Mock] window.fetch 已接管 · 全部为虚构数据', 'color:#1664ff');
