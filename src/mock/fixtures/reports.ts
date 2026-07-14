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
    title: '星尘科技云费用看板',
    owner: 'demo_manager',
    createdAt: now - day * 6,
    updatedAt: now - day * 4,
    lastRefreshedAt: now - day * 4,
    refreshable: false,
    sharedTo: ['demo_user'],
    isOwner: false,
  },
];

// ---------------------------------------------------------------------------
// 看板 HTML（iframe 预览用）。纯静态、无外部依赖，内联 CSS。
// 每个 reportId 对应一份独立看板，数据为虚构演示。
// ---------------------------------------------------------------------------

const sharedCss = `
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f5f7fa;color:#1f2329;padding:24px}
  .header{display:flex;align-items:center;gap:12px;margin-bottom:20px}
  .header h1{font-size:22px;font-weight:700}
  .badge{display:inline-block;background:#e8f3ff;color:#1664ff;border-radius:4px;padding:3px 10px;font-size:11px;font-weight:600}
  .updated{margin-left:auto;color:#86909c;font-size:12px}
  .kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
  .kpi{background:#fff;border-radius:10px;padding:16px 18px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
  .kpi .label{font-size:12px;color:#86909c;margin-bottom:6px}
  .kpi .value{font-size:24px;font-weight:700;letter-spacing:-.5px}
  .kpi .delta{font-size:12px;margin-top:4px}
  .up{color:#00a870}.down{color:#f53f3f}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
  .card{background:#fff;border-radius:10px;padding:18px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
  .card h2{font-size:14px;font-weight:600;margin-bottom:16px;color:#4e5969}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;padding:8px 10px;background:#f7f8fa;color:#86909c;font-weight:600;border-bottom:1px solid #e5e6eb}
  td{padding:8px 10px;border-bottom:1px solid #f2f3f5}
  tr:last-child td{border-bottom:none}
  .bar-chart{display:flex;align-items:flex-end;gap:10px;height:160px;padding:0 4px}
  .bar-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px}
  .bar{width:100%;border-radius:4px 4px 0 0;transition:height .3s;min-height:2px}
  .bar-label{font-size:11px;color:#86909c}
  .bar-val{font-size:11px;font-weight:600;color:#4e5969}
  .donut-wrap{display:flex;align-items:center;gap:24px}
  .legend{flex:1}
  .legend-item{display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:8px}
  .legend-dot{width:10px;height:10px;border-radius:2px;flex-shrink:0}
  .legend-val{margin-left:auto;font-weight:600}
  .footer{margin-top:20px;color:#86909c;font-size:11px;text-align:center}
`;

function donutHtml(segments: Array<[string, number, string]>): string {
  const total = segments.reduce((s, [, v]) => s + v, 0);
  let acc = 0;
  const stops = segments
    .map(([, v, c]) => {
      const start = (acc / total) * 100;
      acc += v;
      const end = (acc / total) * 100;
      return `${c} ${start}% ${end}%`;
    })
    .join(', ');
  const legend = segments
    .map(
      ([name, v, c]) =>
        `<div class="legend-item"><span class="legend-dot" style="background:${c}"></span>${name}<span class="legend-val">${((v / total) * 100).toFixed(1)}%</span></div>`,
    )
    .join('');
  return `<div class="donut-wrap"><div style="width:130px;height:130px;border-radius:50%;background:conic-gradient(${stops});display:flex;align-items:center;justify-content:center"><div style="width:84px;height:84px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#4e5969">${segments.length}<br><span style="font-size:10px;color:#86909c;font-weight:400">科目</span></div></div><div class="legend">${legend}</div></div>`;
}

function barChartHtml(data: Array<[string, number, string]>, maxVal: number): string {
  return (
    '<div class="bar-chart">' +
    data
      .map(
        ([label, val, color]) =>
          `<div class="bar-col"><span class="bar-val">${val}</span><div class="bar" style="height:${(val / maxVal) * 140}px;background:${color}"></div><span class="bar-label">${label}</span></div>`,
      )
      .join('') +
    '</div>'
  );
}

// 看板1：云帆优选 2024 销售看板
const salesHtml =
  `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>云帆优选 2024 销售看板</title><style>${sharedCss}</style></head><body>` +
  `<div class="header"><h1>云帆优选 2024 销售看板</h1><span class="badge">电商销售分析 · DEMO</span><span class="updated">数据截止 2024-12-31</span></div>` +
  `<div class="kpi-row">
     <div class="kpi"><div class="label">全年 GMV</div><div class="value">¥10,860<span style="font-size:14px">万</span></div><div class="delta up">▲ 23.5% YoY</div></div>
     <div class="kpi"><div class="label">全年订单数</div><div class="value">122.7<span style="font-size:14px">万单</span></div><div class="delta up">▲ 18.2% YoY</div></div>
     <div class="kpi"><div class="label">客单价</div><div class="value">¥88.5</div><div class="delta up">▲ 4.5%</div></div>
     <div class="kpi"><div class="label">支付转化率</div><div class="value">6.8%</div><div class="delta up">▲ 0.9pp</div></div>
   </div>` +
  `<div class="grid2">
     <div class="card"><h2>Q4 月度 GMV 趋势（万元）</h2>${barChartHtml(
       [['10月', 3120, '#1664ff'], ['11月', 4180, '#00b42a'], ['12月', 3560, '#ff7d00']],
       4180,
     )}</div>
     <div class="card"><h2>品类 GMV 占比</h2>${donutHtml([
       ['数码电子', 3260, '#1664ff'],
       ['家居生活', 2840, '#00b42a'],
       ['服饰鞋包', 2180, '#ff7d00'],
       ['食品生鲜', 1620, '#722ed1'],
       ['其他', 960, '#86909c'],
     ])}</div>
   </div>` +
  `<div class="card"><h2>双11 vs 日常 促销效果对比</h2>
     <table><tr><th>维度</th><th>日常均值</th><th>双11当天</th><th>提升幅度</th></tr>
     <tr><td>GMV（万元）</td><td>102</td><td>418</td><td style="color:#00a870;font-weight:600">+310%</td></tr>
     <tr><td>订单数（万单）</td><td>1.2</td><td>4.7</td><td style="color:#00a870;font-weight:600">+292%</td></tr>
     <tr><td>客单价（元）</td><td>85.0</td><td>88.9</td><td style="color:#00a870;font-weight:600">+4.6%</td></tr>
     <tr><td>转化率</td><td>5.1%</td><td>8.3%</td><td style="color:#00a870;font-weight:600">+3.2pp</td></tr>
     </table>
   </div>` +
  `<div class="footer">由 Biz-Hub Demo 生成 · 数据源 dwd_order_fact / dim_product · 全部为演示用虚构数据</div>` +
  `</body></html>`;

// 看板2：暖阳连锁门店成本看板
const storeCostHtml =
  `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>暖阳连锁门店成本看板</title><style>${sharedCss}</style></head><body>` +
  `<div class="header"><h1>暖阳连锁门店成本看板</h1><span class="badge">门店成本分析 · DEMO</span><span class="updated">数据截止 2024-12</span></div>` +
  `<div class="kpi-row">
     <div class="kpi"><div class="label">在营门店数</div><div class="value">186<span style="font-size:14px">家</span></div><div class="delta up">▲ 12 家新增</div></div>
     <div class="kpi"><div class="label">月均单店成本</div><div class="value">¥18.6<span style="font-size:14px">万</span></div><div class="delta down">▼ 2.1% MoM</div></div>
     <div class="kpi"><div class="label">月均单店营收</div><div class="value">¥26.4<span style="font-size:14px">万</span></div><div class="delta up">▲ 3.8%</div></div>
     <div class="kpi"><div class="label">成本营收比</div><div class="value">70.5%</div><div class="delta down">▼ 4.2pp</div></div>
   </div>` +
  `<div class="grid2">
     <div class="card"><h2>单店成本结构占比</h2>${donutHtml([
       ['租金', 840, '#1664ff'],
       ['人力', 620, '#00b42a'],
       ['水电物料', 280, '#ff7d00'],
       ['其他', 120, '#86909c'],
     ])}</div>
     <div class="card"><h2>各区域月均单店成本（万元）</h2>${barChartHtml(
       [['华东', 17.2, '#1664ff'], ['华南', 19.8, '#00b42a'], ['华北', 16.5, '#ff7d00'], ['西南', 21.3, '#722ed1'], ['华中', 18.0, '#f53f3f']],
       21.3,
     )}</div>
   </div>` +
  `<div class="card"><h2>成本趋势（近6个月月均单店，万元）</h2>
     <table><tr><th>月份</th><th>租金</th><th>人力</th><th>水电物料</th><th>其他</th><th>合计</th></tr>
     <tr><td>2024-07</td><td>8.1</td><td>5.9</td><td>2.5</td><td>1.1</td><td>17.6</td></tr>
     <tr><td>2024-08</td><td>8.2</td><td>6.0</td><td>2.6</td><td>1.1</td><td>17.9</td></tr>
     <tr><td>2024-09</td><td>8.3</td><td>6.1</td><td>2.7</td><td>1.2</td><td>18.3</td></tr>
     <tr><td>2024-10</td><td>8.4</td><td>6.2</td><td>2.8</td><td>1.2</td><td>18.6</td></tr>
     <tr><td>2024-11</td><td>8.4</td><td>6.3</td><td>2.9</td><td>1.2</td><td>18.8</td></tr>
     <tr><td>2024-12</td><td>8.4</td><td>6.2</td><td>2.8</td><td>1.2</td><td>18.6</td></tr>
     </table>
   </div>` +
  `<div class="footer">由 Biz-Hub Demo 生成 · 数据源 dws_store_cost / dim_store · 全部为演示用虚构数据</div>` +
  `</body></html>`;

// 看板3：星尘科技云费用看板
const cloudBillHtml =
  `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>星尘科技云费用看板</title><style>${sharedCss}</style></head><body>` +
  `<div class="header"><h1>星尘科技云费用看板</h1><span class="badge">云资源用量分析 · DEMO</span><span class="updated">数据截止 2024-12</span></div>` +
  `<div class="kpi-row">
     <div class="kpi"><div class="label">月度云费用</div><div class="value">¥48.7<span style="font-size:14px">万</span></div><div class="delta up">▲ 5.2% MoM</div></div>
     <div class="kpi"><div class="label">活跃云产品数</div><div class="value">27<span style="font-size:14px">个</span></div><div class="delta">持平</div></div>
     <div class="kpi"><div class="label">单位算力成本</div><div class="value">¥0.34<span style="font-size:14px">/核时</span></div><div class="delta down">▼ 8.1%</div></div>
     <div class="kpi"><div class="label">成本优化空间</div><div class="value">¥6.2<span style="font-size:14px">万/月</span></div><div class="delta up">可优化 12.7%</div></div>
   </div>` +
  `<div class="grid2">
     <div class="card"><h2>云产品费用 Top5（万元/月）</h2>${barChartHtml(
       [['CVM', 16.8, '#1664ff'], ['COS', 8.4, '#00b42a'], ['CDN', 7.1, '#ff7d00'], ['MySQL', 6.3, '#722ed1'], ['Redis', 4.2, '#f53f3f']],
       16.8,
     )}</div>
     <div class="card"><h2>费用类型占比</h2>${donutHtml([
       ['计算', 21.0, '#1664ff'],
       ['存储', 10.5, '#00b42a'],
       ['网络/CDN', 8.9, '#ff7d00'],
       ['数据库', 6.3, '#722ed1'],
       ['其他', 2.0, '#86909c'],
     ])}</div>
   </div>` +
  `<div class="card"><h2>各项目月度费用明细</h2>
     <table><tr><th>项目</th><th>负责团队</th><th>月费用（万）</th><th>环比</th><th>优化建议</th></tr>
     <tr><td>数据分析平台</td><td>数据中台</td><td>14.2</td><td style="color:#f53f3f">+8.3%</td><td>3台闲置CVM可释放</td></tr>
     <tr><td>用户增长系统</td><td>增长团队</td><td>10.6</td><td style="color:#00a870">-3.1%</td><td>COS低频访问转归档</td></tr>
     <tr><td>交易核心</td><td>支付团队</td><td>9.8</td><td style="color:#f53f3f">+2.0%</td><td>MySQL可转TDSQL降本</td></tr>
     <tr><td>内容推荐</td><td>算法团队</td><td>8.1</td><td style="color:#f53f3f">+12.5%</td><td>GPU实例错峰调度</td></tr>
     <tr><td>基础服务</td><td>运维团队</td><td>6.0</td><td style="color:#86909c">持平</td><td>—</td></tr>
     </table>
   </div>` +
  `<div class="footer">由 Biz-Hub Demo 生成 · 数据源 dws_cloud_bill / dim_cloud_product · 全部为演示用虚构数据</div>` +
  `</body></html>`;

/** 按 reportId 返回对应看板 HTML，找不到时回退到销售看板。 */
export const reportViewHtmlMap: Record<string, string> = {
  'rpt-sales-2024': salesHtml,
  'rpt-store-cost': storeCostHtml,
  'rpt-cloud-bill': cloudBillHtml,
};

/** 默认看板 HTML（兼容旧逻辑）。 */
export const reportViewHtml = salesHtml;
