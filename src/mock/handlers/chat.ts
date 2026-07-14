import type { Router, MockRequest } from '../router';
import { ok, fail, empty, html } from '../envelope';
import type { Session, Message } from '../../chat/types/session';
import type { Me, SystemInfo } from '../../shared/types/user';
import { seedSessions } from '../fixtures/sessions';
import { reportViewHtml } from '../fixtures/reports';

// ── 内存态会话库（页面刷新即重置，保证 Demo 交互可用） ──
interface Store {
  order: string[]; // 会话 id，按更新时间倒序
  meta: Map<string, Session>;
  messages: Map<string, Message[]>;
}

const store: Store = { order: [], meta: new Map(), messages: new Map() };

for (const s of seedSessions) {
  store.order.push(s.meta.sessionId);
  store.meta.set(s.meta.sessionId, { ...s.meta });
  store.messages.set(s.meta.sessionId, s.messages.map((m) => ({ ...m })));
}

let seq = 1;
function newId(): string {
  return `sess-new-${Date.now().toString(36)}-${seq++}`;
}

function sortedSessions(): Session[] {
  return store.order
    .map((id) => store.meta.get(id)!)
    .filter(Boolean)
    .sort((a, b) => {
      const pa = a.pinnedAt ?? 0;
      const pb = b.pinnedAt ?? 0;
      if (pa !== pb) return pb - pa;
      return b.updatedAt - a.updatedAt;
    });
}

// 供 SSE handler 追加对话记录
export function appendMessages(sid: string, msgs: Message[]): void {
  const list = store.messages.get(sid);
  if (!list) return;
  list.push(...msgs);
  const meta = store.meta.get(sid);
  if (meta) {
    meta.messageCount = list.length;
    meta.updatedAt = Math.floor(Date.now() / 1000);
    if ((!meta.title || meta.title === '新对话') && msgs[0]?.content) {
      meta.title = msgs[0].content.slice(0, 20);
    }
  }
}

export function hasSession(sid: string): boolean {
  return store.meta.has(sid);
}

const me: Me = {
  loginName: 'demo_user',
  staffId: 'D0001',
  role: 'admin',
  bizHubRole: 'admin',
  skillHubRoles: ['approval'],
  adminConsoleRole: 'admin',
  requiresDataAcl: false,
  authorized: true,
  admins: ['demo_admin'],
};

const info: SystemInfo = {
  provider: 'Demo Provider',
  model: 'analysis-agent-demo',
  cwd: '/demo',
  share_enabled: true,
};

export function registerChatRoutes(r: Router): void {
  r.get('/api/me', () => ok(me));
  r.get('/api/info', () => ok(info));
  r.get('/api/health', () => ok({ status: 'ok', demo: true }));
  r.get('/api/metrics', () => ok({ sessions: store.order.length, demo: true }));

  r.get('/api/sessions', () => ok(sortedSessions()));

  r.post('/api/sessions', () => {
    const id = newId();
    const nowSec = Math.floor(Date.now() / 1000);
    const meta: Session = { sessionId: id, title: '新对话', messageCount: 0, createdAt: nowSec, updatedAt: nowSec };
    store.order.unshift(id);
    store.meta.set(id, meta);
    store.messages.set(id, []);
    return ok(meta);
  });

  r.get('/api/sessions/:id', (req: MockRequest) => {
    const meta = store.meta.get(req.params.id);
    if (!meta) return fail('会话不存在', 404);
    return ok({ sessionId: meta.sessionId, title: meta.title, messages: store.messages.get(meta.sessionId) ?? [] });
  });

  r.del('/api/sessions/:id', (req: MockRequest) => {
    store.order = store.order.filter((x) => x !== req.params.id);
    store.meta.delete(req.params.id);
    store.messages.delete(req.params.id);
    return empty();
  });

  r.patch('/api/sessions/:id', (req: MockRequest) => {
    const meta = store.meta.get(req.params.id);
    if (!meta) return fail('会话不存在', 404);
    const body = (req.body ?? {}) as { pinnedAt?: number; title?: string };
    if (typeof body.pinnedAt === 'number') meta.pinnedAt = body.pinnedAt;
    if (typeof body.title === 'string') meta.title = body.title;
    return ok(meta);
  });

  r.post('/api/sessions/:id/abort', () => empty());

  // 分享：创建分享链接
  r.post('/api/sessions/:id/shares', (req: MockRequest) => {
    return ok({ url: `/s/demo-${req.params.id}` });
  });

  // 产物预览 / 报表查看（iframe）
  r.get('/api/artifacts/:execId/view', () => html(reportViewHtml));
  r.get('/api/artifacts/:execId/files', () => ok(['report.html', 'data.csv']));
  r.get('/api/artifacts/:execId/meta', () => ok({ title: '云帆优选 2024 销售看板', hasReport: true }));
}
