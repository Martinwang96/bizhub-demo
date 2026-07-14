import type { Router, MockRequest } from '../router';
import { ok } from '../envelope';
import {
  adminMe,
  adminSessions,
  adminStats,
  adminAlerts,
  adminLogs,
  adminPermissions,
  statsToken,
  statsLatency,
  statsActive,
  daclActive,
  daclUsers,
  daclLayerValues,
  daclSkillIndex,
  daclGroups,
  bizKnowledge,
} from '../fixtures/admin';
import { seedSessions } from '../fixtures/sessions';

// ⚠️ Router 按注册顺序 + 段数匹配，参数段 `:id` 会吃掉同段数具体路径，
// 因此 /sessions/stats、/sessions/export 等必须注册在 /sessions/:id 之前。
export function registerAdminRoutes(r: Router): void {
  r.get('/admin/api/console/me', () => ok(adminMe));
  r.get('/admin/api/console/sessions/stats', () => ok(adminStats));

  // 导出：返回 CSV 附件（须在 /sessions/:id 之前注册）
  r.get('/admin/api/console/sessions/export', () => {
    const rows = [
      'sessionId,user,title,messageCount',
      ...adminSessions.map((s) => `${s.sessionId},${s.user},${s.title},${s.messageCount}`),
    ].join('\n');
    return new Response(rows, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="sessions-demo.csv"',
      },
    });
  });

  r.get('/admin/api/console/sessions', (req: MockRequest) => {
    const kw = req.query.get('keyword')?.toLowerCase() ?? '';
    const user = req.query.get('user')?.toLowerCase() ?? '';
    let items = adminSessions;
    if (kw) items = items.filter((s) => s.title.toLowerCase().includes(kw) || s.sessionId.includes(kw));
    if (user) items = items.filter((s) => s.user.toLowerCase().includes(user));
    return ok({ items, total: items.length, cursor: 0 });
  });

  r.get('/admin/api/console/sessions/:id', (req: MockRequest) => {
    const seed = seedSessions.find((s) => s.meta.sessionId === req.params.id);
    const fallback = seedSessions[0];
    const target = seed ?? fallback;
    return ok({
      sessionId: req.params.id,
      user: 'demo_user',
      title: target.meta.title,
      messages: target.messages,
      createdAt: target.meta.createdAt,
      updatedAt: target.meta.updatedAt,
    });
  });

  r.get('/admin/api/console/ops/alerts', () => ok(adminAlerts));
  r.get('/admin/api/console/ops/logs', () => ok({ items: adminLogs, total: adminLogs.length }));
  r.get('/admin/api/console/ops/summary', () =>
    ok({ uptime: '演示环境', sessions: adminSessions.length, alerts: adminAlerts.count }),
  );

  // ── 数据统计 ──────────────────────────────────────────────────────────────
  r.get('/admin/api/console/stats/token', () => ok(statsToken));
  r.get('/admin/api/console/stats/latency', () => ok(statsLatency));
  r.get('/admin/api/console/stats/active', () => ok(statsActive));

  // ── 页面权限管理 ──────────────────────────────────────────────────────────
  r.get('/admin/api/page-permissions', () => ok(adminPermissions));
  r.put('/admin/api/page-permissions/batch', () =>
    ok({ updated: [], failed: [], skipped: [], counts: { requested: 0, updated: 0, failed: 0, skipped: 0 } }),
  );
  r.put('/admin/api/page-permissions/:login', (req: MockRequest) => ok({ loginName: req.params.login, ok: true }));
  r.del('/admin/api/page-permissions/:login', (req: MockRequest) => ok({ loginName: req.params.login }));

  // ── 数据权限（Data ACL）──────────────────────────────────────────────────
  r.get('/admin/api/data-acl/active', () => ok(daclActive));
  r.get('/admin/api/data-acl/layer-values', () => ok(daclLayerValues));
  r.get('/admin/api/data-acl/history', () => ok([]));
  r.get('/admin/api/data-acl/candidates', () => ok([]));
  r.get('/admin/api/data-acl/tables/skill-index', () => ok(daclSkillIndex));
  r.get('/admin/api/data-acl/users', () => ok(daclUsers));
  r.get('/admin/api/data-acl/groups', () => ok(daclGroups));
  r.get('/admin/api/data-acl/audit', () => ok([]));

  // ── 业务知识管理 ──────────────────────────────────────────────────────────
  r.get('/admin/api/business-knowledge/history', () => ok([]));
  r.get('/admin/api/business-knowledge', () => ok(bizKnowledge));

  // ── /api/health、/api/metrics（OpsPage 探活，返回演示占位）─────────────────
  r.get('/api/health', () => ok({ status: 'ok', env: 'demo' }));
  r.get('/api/metrics', () => ok({ items: [], total: 0 }));

  // 兜底：其它未覆盖的 admin console 接口一律返回"成功空数据"，杜绝任何报错。
  // 同时覆盖 GET 单段与多段路径，兼容 items/total 结构。
  const okEmpty = () => ok({ items: [], total: 0, cursor: 0 });
  r.get('/admin/api/console/:rest', okEmpty);
  r.get('/admin/api/console/:a/:b', okEmpty);
  r.post('/admin/api/console/:rest', () => ok({ ok: true }));
  r.post('/admin/api/console/:a/:b', () => ok({ ok: true }));
}
