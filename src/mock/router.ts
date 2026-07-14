// 极简路由匹配：支持 :param 路径参数与方法匹配。

export interface MockRequest {
  method: string;
  path: string; // 不含 query
  query: URLSearchParams;
  params: Record<string, string>;
  body: unknown; // 已解析的 JSON（若有）
  raw: Request | null;
}

export type MockHandler = (req: MockRequest) => Response | Promise<Response>;

interface Route {
  method: string;
  segments: string[];
  handler: MockHandler;
}

export class Router {
  private routes: Route[] = [];

  add(method: string, pattern: string, handler: MockHandler): this {
    this.routes.push({
      method: method.toUpperCase(),
      segments: pattern.split('/').filter(Boolean),
      handler,
    });
    return this;
  }

  get(p: string, h: MockHandler) { return this.add('GET', p, h); }
  post(p: string, h: MockHandler) { return this.add('POST', p, h); }
  put(p: string, h: MockHandler) { return this.add('PUT', p, h); }
  patch(p: string, h: MockHandler) { return this.add('PATCH', p, h); }
  del(p: string, h: MockHandler) { return this.add('DELETE', p, h); }

  match(method: string, path: string): { handler: MockHandler; params: Record<string, string> } | null {
    const parts = path.split('/').filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method.toUpperCase()) continue;
      if (route.segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let matched = true;
      for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i];
        if (seg.startsWith(':')) {
          params[seg.slice(1)] = decodeURIComponent(parts[i]);
        } else if (seg !== parts[i]) {
          matched = false;
          break;
        }
      }
      if (matched) return { handler: route.handler, params };
    }
    return null;
  }
}
