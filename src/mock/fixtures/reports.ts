import type { ReportMeta } from '../../chat/api/reports';

const now = Math.floor(Date.now() / 1000);
const day = 86400;

export const ownedReports: ReportMeta[] = [
  {
    reportId: 'rpt-sales-2024',
    title: '云帆优选 2024 销售看板',
    owner: 'demo_user',
    createdAt: now - day * 5,
    updatedAt: now - day * 2,
    lastRefreshedAt: now - day * 2,
    refreshable: true,
    sharedTo: ['demo_manager'],
    isOwner: true,
    linkShareEnabled: true,
    sourceSessionId: 'sess-sales-2024',
  },
  {
    reportId: 'rpt-store-cost',
    title: '暖阳连锁门店成本看板',
    owner: 'demo_user',
    createdAt: now - day * 3,
    updatedAt: now - day,
    lastRefreshedAt: now - day,
    refreshable: true,
    sharedTo: [],
    isOwner: true,
    linkShareEnabled: false,
    sourceSessionId: 'sess-store-cost',
  },
];

export const sharedReports: ReportMeta[] = [
  {
    reportId: 'rpt-cloud-bill',
    title: '星尘科技云费用看板（他人分享）',
    owner: 'demo_manager',
    createdAt: now - day * 6,
    updatedAt: now - day * 4,
    lastRefreshedAt: now - day * 4,
    refreshable: false,
    sharedTo: ['demo_user'],
    isOwner: false,
  },
];

// 已发布报表的 HTML（iframe 预览用）。纯静态、无脚本。
export const reportViewHtml =
  '<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>看板预览</title>' +
  '<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:32px;color:#1f2329;background:#f7f8fa}' +
  'h1{font-size:20px}table{border-collapse:collapse;margin-top:16px;background:#fff}th,td{border:1px solid #e5e6eb;padding:8px 14px;font-size:13px}' +
  'th{background:#f2f3f5;text-align:left}.tag{display:inline-block;background:#e8f3ff;color:#1664ff;border-radius:4px;padding:2px 8px;font-size:12px}</style></head>' +
  '<body><h1>云帆优选 2024 销售看板 <span class="tag">DEMO · 虚构数据</span></h1>' +
  '<table><tr><th>月份</th><th>GMV(万元)</th><th>订单数(万单)</th></tr>' +
  '<tr><td>10月</td><td>3120</td><td>35.4</td></tr>' +
  '<tr><td>11月</td><td>4180</td><td>47.2</td></tr>' +
  '<tr><td>12月</td><td>3560</td><td>40.1</td></tr></table>' +
  '<p style="margin-top:16px;color:#86909c;font-size:12px">本看板由 Biz-Hub Demo 生成，全部为演示用虚构数据。</p></body></html>';
