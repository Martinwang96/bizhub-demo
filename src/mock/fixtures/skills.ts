const now = Math.floor(Date.now() / 1000);

// Skill Hub 后端返回的原始 JSON（非 Envelope）。全部为虚构技能。
export interface RawSkill {
  skillId: string;
  owner: string;
  slug: string;
  name: string;
  description: string;
  status: string;
  version: string;
  updatedAt: number;
  tables: string[];
  access: string;
  detail?: string; // SKILL.md 正文（详情页用）
}

export const rawSkills: RawSkill[] = [
  {
    skillId: 'demo/ecommerce-sales',
    owner: 'demo',
    slug: 'ecommerce-sales',
    name: '电商销售分析',
    description: '面向电商 GMV / 订单 / 转化的分析技能，含全年趋势、品类拆解、促销复盘等常用口径。',
    status: 'active',
    version: '1.4.0',
    updatedAt: now - 86400 * 3,
    tables: ['dwd_order_fact', 'dim_product', 'dim_shop'],
    access: 'public',
    detail:
      '# 电商销售分析\n\n## 适用场景\n分析云帆优选（虚构）的销售趋势、品类结构与促销效果。\n\n## 口径\n- GMV = 已支付订单金额之和\n- 订单数 = 去重支付订单\n\n## 主要表\n- `dwd_order_fact` 订单事实表\n- `dim_product` 商品维度\n\n> 演示数据均为虚构，不含真实业务信息。',
  },
  {
    skillId: 'demo/retail-store-cost',
    owner: 'demo',
    slug: 'retail-store-cost',
    name: '连锁门店成本分析',
    description: '连锁零售单店成本结构分析，覆盖租金、人力、水电物料等科目，支持按区域/城市对比。',
    status: 'active',
    version: '1.1.0',
    updatedAt: now - 86400 * 8,
    tables: ['dws_store_cost', 'dim_store', 'dim_region'],
    access: 'public',
    detail:
      '# 连锁门店成本分析\n\n## 适用场景\n分析暖阳连锁（虚构）各区域单店成本构成。\n\n## 成本科目\n租金 / 人力 / 水电物料。\n\n## 主要表\n- `dws_store_cost` 门店成本汇总表',
  },
  {
    skillId: 'demo/cloud-resource-usage',
    owner: 'demo',
    slug: 'cloud-resource-usage',
    name: '云资源用量分析',
    description: '云账单费用分析技能，按云产品/项目/时间维度拆解费用，辅助成本优化决策。',
    status: 'degraded',
    version: '0.9.2',
    updatedAt: now - 86400 * 15,
    tables: ['dws_cloud_bill', 'dim_cloud_product'],
    access: 'private',
    detail:
      '# 云资源用量分析\n\n## 适用场景\n分析星尘科技（虚构）云费用结构，定位成本大头。\n\n## 主要表\n- `dws_cloud_bill` 云账单明细',
  },
];

export const skillHubConfig = {
  ok: true,
  login_name: 'demo_user',
  role: 'admin',
  skill_hub_roles: ['approval'],
  is_approver: true,
  approvers: ['demo_admin'],
  self_approval_enabled: true,
  approval_ttl: null,
  skill_roots: ['/skills/_examples', '/skills/demo'],
  skill_count: rawSkills.length,
};
