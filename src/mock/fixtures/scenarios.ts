import type { ChartPayload } from '../../chat/types/chart';
import { salesTrendChart, storeCostChart, cloudUsageChart } from './charts';

export interface ScenarioTool {
  name: string;
  args: Record<string, unknown>;
  output: string;
  durationMs: number;
}

export interface Scenario {
  reasoning: string;
  tools: ScenarioTool[];
  answer: string; // markdown 正文
  charts: ChartPayload[];
  title: string;
}

const salesScenario: Scenario = {
  title: '电商销售趋势分析',
  reasoning:
    '用户想看电商销售趋势。我需要先加载「电商销售分析」技能，明确 GMV、订单量的口径，' +
    '再查询订单事实表按月聚合，最后用折线图呈现全年走势并给出结论。',
  tools: [
    {
      name: 'load_skill',
      args: { skill: 'demo/ecommerce-sales' },
      output: '已加载技能 demo/ecommerce-sales（v1.4.0）：GMV=已支付订单金额，订单数=去重支付订单。',
      durationMs: 320,
    },
    {
      name: 'query_db',
      args: {
        sql: "SELECT month, SUM(paid_amount)/1e4 AS gmv, COUNT(DISTINCT order_id)/1e4 AS orders FROM dwd_order_fact WHERE year=2024 GROUP BY month ORDER BY month",
      },
      output: '[query_db] 返回 12 行（按月聚合）。',
      durationMs: 640,
    },
  ],
  answer:
    '## 云帆优选 2024 全年销售趋势\n\n' +
    '全年 GMV 呈明显上升趋势，双十一（11 月）达到峰值 **4180 万元**。\n\n' +
    '| 月份 | GMV(万元) | 订单数(万单) |\n| --- | --- | --- |\n' +
    '| 6月 | 2360 | 27.3 |\n| 9月 | 2470 | 28.9 |\n| 10月 | 3120 | 35.4 |\n| 11月 | 4180 | 47.2 |\n| 12月 | 3560 | 40.1 |\n\n' +
    '**关键结论：**\n\n' +
    '1. Q4 是全年主引擎，11 月 GMV 环比增长约 **34%**；\n' +
    '2. 6 月「618」形成年中小高峰，可作为下半年备货参考；\n' +
    '3. 建议在 10–11 月前置扩充仓配与客服产能。',
  charts: [salesTrendChart],
};

const storeScenario: Scenario = {
  title: '连锁门店成本分析',
  reasoning:
    '用户关注连锁门店成本。加载「门店成本」技能确认成本科目口径，按区域聚合单店月均成本，用柱状图对比。',
  tools: [
    {
      name: 'load_skill',
      args: { skill: 'demo/retail-store-cost' },
      output: '已加载技能 demo/retail-store-cost（v1.1.0）：成本口径含租金、人力、水电物料。',
      durationMs: 300,
    },
    {
      name: 'query_db',
      args: {
        sql: "SELECT region, AVG(rent)/1e4 rent, AVG(labor)/1e4 labor, AVG(utility)/1e4 util FROM dws_store_cost WHERE ym='2024-06' GROUP BY region",
      },
      output: '[query_db] 返回 5 行（按区域聚合）。',
      durationMs: 580,
    },
  ],
  answer:
    '## 暖阳连锁单店月均成本构成（2024-06）\n\n' +
    '华东区域单店月均成本最高，主要由租金驱动。\n\n' +
    '| 区域 | 租金 | 人力 | 水电物料 | 合计(万元) |\n| --- | --- | --- | --- | --- |\n' +
    '| 华东 | 8.2 | 6.5 | 2.1 | 16.8 |\n| 华南 | 7.6 | 6.2 | 2.0 | 15.8 |\n| 华北 | 6.8 | 5.9 | 1.9 | 14.6 |\n| 华中 | 5.7 | 5.1 | 1.7 | 12.5 |\n| 西南 | 5.1 | 4.8 | 1.6 | 11.5 |\n\n' +
    '**建议：** 华东新店优先评估次核心商圈以降低租金占比；西南单店成本最优，可加密布点。',
  charts: [storeCostChart],
};

const cloudScenario: Scenario = {
  title: '云资源费用分析',
  reasoning:
    '用户想优化云资源费用。加载「云资源用量」技能，按云产品汇总月度费用，用占比图定位大头。',
  tools: [
    {
      name: 'load_skill',
      args: { skill: 'demo/cloud-resource-usage' },
      output: '已加载技能 demo/cloud-resource-usage（v0.9.2）：费用来源账单明细表。',
      durationMs: 280,
    },
    {
      name: 'query_db',
      args: {
        sql: "SELECT product, SUM(fee)/1e4 fee FROM dws_cloud_bill WHERE ym='2024-06' GROUP BY product ORDER BY fee DESC",
      },
      output: '[query_db] 返回 5 行（按云产品聚合）。',
      durationMs: 520,
    },
  ],
  answer:
    '## 星尘科技云费用结构（2024-06）\n\n' +
    '云服务器 CVM 占比最高，是成本优化的首要对象。\n\n' +
    '| 云产品 | 月度费用(万元) | 占比 |\n| --- | --- | --- |\n' +
    '| 云服务器 CVM | 42.5 | 40.4% |\n| 云数据库 CDB | 26.7 | 25.4% |\n| 对象存储 COS | 18.3 | 17.4% |\n| CDN 加速 | 12.1 | 11.5% |\n| 负载均衡 CLB | 6.4 | 6.1% |\n\n' +
    '**优化建议：** CVM 可通过包年包月 + 弹性伸缩降低约 15%；CDB 评估只读实例合并。',
  charts: [cloudUsageChart],
};

const fallbackScenario: Scenario = {
  title: '数据分析助手',
  reasoning: '这是一个演示环境。我会基于虚构数据展示一次完整的分析流程：加载技能 → 查询数据 → 出图与结论。',
  tools: [
    {
      name: 'load_skill',
      args: { skill: 'demo/ecommerce-sales' },
      output: '已加载技能 demo/ecommerce-sales（v1.4.0）。',
      durationMs: 300,
    },
    {
      name: 'query_db',
      args: { sql: 'SELECT month, SUM(paid_amount) gmv FROM dwd_order_fact WHERE year=2024 GROUP BY month' },
      output: '[query_db] 返回 12 行。',
      durationMs: 500,
    },
  ],
  answer:
    '## 演示：全年销售趋势\n\n' +
    '这是一个**纯前端 Demo**，以下数据均为虚构。你可以试着问我：\n\n' +
    '- “分析一下电商全年销售趋势”\n' +
    '- “看看各区域门店成本”\n' +
    '- “云资源费用怎么优化”\n\n' +
    '下方是一张示例图表：',
  charts: [salesTrendChart],
};

export function pickScenario(message: string): Scenario {
  const m = (message || '').toLowerCase();
  if (/门店|连锁|成本|租金|store/.test(m)) return storeScenario;
  if (/云|资源|用量|账单|cloud|cvm/.test(m)) return cloudScenario;
  if (/销售|电商|gmv|营收|订单|趋势|sales/.test(m)) return salesScenario;
  return fallbackScenario;
}
