import type { Router, MockRequest } from '../router';
import { ok, fail, html, jsonResponse } from '../envelope';
import { ownedReports, sharedReports, reportViewHtml } from '../fixtures/reports';

function findReport(id: string) {
  return [...ownedReports, ...sharedReports].find((r) => r.reportId === id);
}

export function registerReportRoutes(r: Router): void {
  r.get('/api/reports', () => ok({ owned: ownedReports, shared: sharedReports }));

  // 注意：share-candidates 必须在 :id 之前注册，避免被 :id 吞掉
  r.get('/api/reports/share-candidates', () =>
    ok([
      { loginName: 'demo_manager', role: 'manager' },
      { loginName: 'demo_analyst', role: 'user' },
    ]),
  );

  r.get('/api/reports/:id', (req: MockRequest) => {
    const rpt = findReport(req.params.id);
    return rpt ? ok(rpt) : fail('报表不存在', 404);
  });

  r.get('/api/reports/:id/view', () => html(reportViewHtml));

  r.post('/api/reports', (req: MockRequest) => {
    const body = (req.body ?? {}) as { title?: string };
    const nowSec = Math.floor(Date.now() / 1000);
    return ok({
      reportId: `rpt-new-${nowSec}`,
      title: body.title || '未命名看板',
      owner: 'demo_user',
      createdAt: nowSec,
      updatedAt: nowSec,
      lastRefreshedAt: nowSec,
      refreshable: true,
      sharedTo: [],
      isOwner: true,
    });
  });

  r.post('/api/reports/:id/share', (req: MockRequest) => {
    const rpt = findReport(req.params.id);
    if (!rpt) return fail('报表不存在', 404);
    const body = (req.body ?? {}) as { logins?: string[] };
    return jsonResponse({ success: true, data: { ...rpt, sharedTo: body.logins ?? [] }, rejected: [] });
  });

  r.post('/api/reports/:id/link-share', (req: MockRequest) =>
    ok({ token: `lnk-${req.params.id}`, url: `/rs/lnk-${req.params.id}` }),
  );

  r.del('/api/reports/:id', () => jsonResponse({ success: true }));

  // 报表链接分享
  r.get('/api/report-shares/:token/view', () => html(reportViewHtml));
  r.get('/api/report-shares/:token', (req: MockRequest) =>
    ok({
      reportId: 'rpt-sales-2024',
      title: '云帆优选 2024 销售看板',
      owner: 'demo_user',
      createdAt: Math.floor(Date.now() / 1000) - 86400 * 5,
      updatedAt: Math.floor(Date.now() / 1000) - 86400 * 2,
      isOwner: false,
      token: req.params.token,
    }),
  );
  r.post('/api/report-share-imports', () =>
    ok({ reportId: 'rpt-sales-2024', title: '云帆优选 2024 销售看板', url: '/?report=rpt-sales-2024' }),
  );
}
