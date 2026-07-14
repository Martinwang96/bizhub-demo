import type { Session, Message } from '../../chat/types/session';
import { salesTrendChart, storeCostChart } from './charts';

const now = Math.floor(Date.now() / 1000);
const day = 86400;

export interface SeedSession {
  meta: Session;
  messages: Message[];
}

// 一段完整的历史对话（含推理、工具步骤、Markdown 正文与图表），用于展示会话详情。
const salesMessages: Message[] = [
  { role: 'user', content: '帮我分析一下云帆优选 2024 全年的销售趋势', time: now - day * 2 },
  {
    role: 'assistant',
    time: now - day * 2 + 20,
    status: 'ok',
    reasoning: '先加载电商销售技能确认口径，再按月聚合订单事实表，最后用折线图展示走势。',
    stepCount: 2,
    totalDurationMs: 960,
    steps: [
      {
        type: 'tool',
        name: 'load_skill',
        args: { skill: 'demo/ecommerce-sales' },
        output: '已加载技能 demo/ecommerce-sales（v1.4.0）。',
        durationMs: 320,
        status: 'done',
      },
      {
        type: 'tool',
        name: 'query_db',
        args: { sql: 'SELECT month, SUM(paid_amount) gmv FROM dwd_order_fact WHERE year=2024 GROUP BY month' },
        output: '[query_db] 返回 12 行。',
        durationMs: 640,
        status: 'done',
      },
    ],
    content:
      '## 云帆优选 2024 全年销售趋势\n\n全年 GMV 持续上升，11 月双十一达到峰值 4180 万元，Q4 为全年主引擎。\n\n' +
      '| 月份 | GMV(万元) |\n| --- | --- |\n| 6月 | 2360 |\n| 10月 | 3120 |\n| 11月 | 4180 |\n| 12月 | 3560 |',
    charts: [salesTrendChart],
  },
];

const storeMessages: Message[] = [
  { role: 'user', content: '各区域门店成本对比一下', time: now - day },
  {
    role: 'assistant',
    time: now - day + 15,
    status: 'ok',
    stepCount: 1,
    totalDurationMs: 580,
    steps: [
      {
        type: 'tool',
        name: 'query_db',
        args: { sql: "SELECT region, AVG(rent) rent FROM dws_store_cost WHERE ym='2024-06' GROUP BY region" },
        output: '[query_db] 返回 5 行。',
        durationMs: 580,
        status: 'done',
      },
    ],
    content:
      '## 暖阳连锁各区域单店月均成本\n\n华东最高（16.8 万元），西南最低（11.5 万元）。',
    charts: [storeCostChart],
  },
];

export const seedSessions: SeedSession[] = [
  {
    meta: {
      sessionId: 'sess-sales-2024',
      title: '云帆优选全年销售趋势',
      messageCount: 2,
      createdAt: now - day * 2,
      updatedAt: now - day * 2 + 20,
      pinnedAt: now - day,
    },
    messages: salesMessages,
  },
  {
    meta: {
      sessionId: 'sess-store-cost',
      title: '连锁门店成本对比',
      messageCount: 2,
      createdAt: now - day,
      updatedAt: now - day + 15,
    },
    messages: storeMessages,
  },
  {
    meta: {
      sessionId: 'sess-welcome',
      title: '新对话',
      messageCount: 0,
      createdAt: now - 3600,
      updatedAt: now - 3600,
    },
    messages: [],
  },
];
