import type { Router } from '../router';
import { ok } from '../envelope';
import { salesTrendChart } from '../fixtures/charts';

// 会话分享快照（SharePage 消费）。
const shareData = {
  title: '云帆优选 2024 销售趋势分享',
  creator: 'demo_user',
  createdAt: Math.floor(Date.now() / 1000) - 86400,
  messages: [
    { role: 'user' as const, content: '帮我分析一下云帆优选 2024 全年的销售趋势' },
    {
      role: 'assistant' as const,
      content:
        '## 云帆优选 2024 全年销售趋势\n\n全年 GMV 持续上升，11 月双十一达到峰值 **4180 万元**，Q4 为全年主引擎。\n\n' +
        '| 月份 | GMV(万元) |\n| --- | --- |\n| 10月 | 3120 |\n| 11月 | 4180 |\n| 12月 | 3560 |',
      charts: [salesTrendChart],
    },
  ],
  chartStyleOverridesById: {},
};

export function registerShareRoutes(r: Router): void {
  r.get('/api/shares/:token', () => ok(shareData));
  r.post('/api/share-imports', () =>
    ok({
      sessionId: 'sess-sales-2024',
      title: '云帆优选 2024 销售趋势分享',
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
      url: '/',
    }),
  );
}
