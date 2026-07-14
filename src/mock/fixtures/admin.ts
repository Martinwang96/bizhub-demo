import type {
  AdminMe,
  SessionItem,
  SessionStats,
  AlertSnapshot,
  LogEntry,
} from '../../admin/api/adminConsole';
import type { PermissionsSnapshot } from '../../admin/api/permissions';
import type { TokenStats, LatencyStats, ActiveStats } from '../../admin/api/stats';
import type {
  DataAclUser,
  LayerValues,
  SkillTableIndexEntry,
  UserGroup,
} from '../../admin/api/dataAcl';
import type { BusinessKnowledgeSnapshot } from '../../admin/api/businessKnowledge';

const now = Math.floor(Date.now() / 1000);
const day = 86400;

export const adminMe: AdminMe = {
  loginName: 'demo_user',
  adminConsoleRole: 'admin',
  bizHubRole: 'admin',
  skillHubRoles: ['approval'],
  readonly: false,
};

export const adminSessions: SessionItem[] = [
  {
    sessionId: 'sess-sales-2024',
    user: 'demo_user',
    title: '云帆优选全年销售趋势',
    messageCount: 8,
    toolCallCount: 5,
    createdAt: now - day * 2,
    updatedAt: now - day * 2 + 600,
    riskTags: [],
  },
  {
    sessionId: 'sess-store-cost',
    user: 'demo_manager',
    title: '连锁门店成本对比',
    messageCount: 4,
    toolCallCount: 2,
    createdAt: now - day,
    updatedAt: now - day + 300,
    riskTags: [],
  },
  {
    sessionId: 'sess-cloud-opt',
    user: 'demo_analyst',
    title: '云资源费用优化',
    messageCount: 6,
    toolCallCount: 3,
    createdAt: now - day * 3,
    updatedAt: now - day * 3 + 900,
    riskTags: ['长会话'],
  },
];

export const adminStats: SessionStats = {
  total: { users: 12, sessions: 148, messages: 1263 },
  today: { users: 4, sessions: 9, messages: 76 },
  yesterday: { users: 6, sessions: 14, messages: 121 },
  generatedAt: now,
};

export const adminAlerts: AlertSnapshot = {
  generatedAt: now,
  count: 2,
  alerts: [
    { level: 'warning', title: '单会话工具调用偏多', count: 1, suggestion: '关注 sess-cloud-opt 的工具调用频次' },
    { level: 'info', title: '演示环境', count: 1, suggestion: '当前为纯前端 Demo，数据均为虚构' },
  ],
};

export const adminLogs: LogEntry[] = [
  { level: 'INFO', message: '[demo] chat session started sess-sales-2024', module: 'chat' },
  { level: 'INFO', message: '[demo] skill loaded demo/ecommerce-sales', module: 'skill' },
  { level: 'WARN', message: '[demo] query_db slow: 640ms', module: 'tools' },
  { level: 'INFO', message: '[demo] report published rpt-sales-2024', module: 'report' },
];

// ── 页面权限管理（GET /admin/api/page-permissions）─────────────────────────
export const adminPermissions: PermissionsSnapshot = {
  users: [
    {
      loginName: 'demo_user',
      bizRole: 'admin',
      skillHubRoles: ['approval'],
      adminConsoleRole: 'admin',
      dataAclMode: 'bypass',
      isEnvAdmin: true,
      addedBy: 'system',
    },
    {
      loginName: 'demo_manager',
      bizRole: 'manager',
      skillHubRoles: ['user'],
      adminConsoleRole: 'readonly',
      dataAclMode: 'bypass',
      isEnvAdmin: false,
      addedBy: 'demo_user',
    },
    {
      loginName: 'demo_analyst',
      bizRole: 'user',
      skillHubRoles: ['user'],
      adminConsoleRole: '',
      dataAclMode: 'enforce',
      isEnvAdmin: false,
      addedBy: 'demo_user',
    },
  ],
  summary: {
    total: 3,
    bizHub: { admin: 1, manager: 1, user: 1 },
    skillHub: { approval: 1, user: 2 },
    adminConsole: { admin: 1, readonly: 1 },
    envAdminCount: 1,
  },
};

// ── 数据统计（GET /admin/api/console/stats/*）──────────────────────────────
const statBuckets: string[] = Array.from({ length: 7 }, (_, i) => {
  const d = new Date((now - (6 - i) * day) * 1000);
  return d.toISOString().slice(0, 10);
});

export const statsToken: TokenStats = {
  dimension: 'user',
  bucket: 'day',
  buckets: statBuckets,
  series: statBuckets.flatMap((b) => [
    { bucket: b, key: 'demo_user', promptTokens: 1200, completionTokens: 800, totalTokens: 2000, callCount: 6 },
    { bucket: b, key: 'demo_manager', promptTokens: 700, completionTokens: 500, totalTokens: 1200, callCount: 4 },
    { bucket: b, key: 'demo_analyst', promptTokens: 400, completionTokens: 260, totalTokens: 660, callCount: 3 },
  ]),
  table: [
    { key: 'demo_user', secondary: '', promptTokens: 8400, completionTokens: 5600, totalTokens: 14000, callCount: 42, lastTime: now - 3600 },
    { key: 'demo_manager', secondary: '', promptTokens: 4900, completionTokens: 3500, totalTokens: 8400, callCount: 28, lastTime: now - 7200 },
    { key: 'demo_analyst', secondary: '', promptTokens: 2800, completionTokens: 1820, totalTokens: 4620, callCount: 21, lastTime: now - 10800 },
  ],
  totals: { promptTokens: 16100, completionTokens: 10920, totalTokens: 27020, callCount: 91 },
  generated_at: now,
};

export const statsLatency: LatencyStats = {
  bucket: 'day',
  buckets: statBuckets,
  series: statBuckets.map((b) => ({ bucket: b, avgMs: 820, maxMs: 2100, minMs: 210, count: 12 })),
  extremes: {
    max: { user: 'demo_analyst', sessionId: 'sess-cloud-opt', sessionTitle: '云资源费用优化', durationMs: 2100, time: now - 5400, status: 'ok' },
    min: { user: 'demo_user', sessionId: 'sess-sales-2024', sessionTitle: '云帆优选全年销售趋势', durationMs: 210, time: now - 3600, status: 'ok' },
  },
  table: [
    { user: 'demo_analyst', sessionId: 'sess-cloud-opt', sessionTitle: '云资源费用优化', durationMs: 2100, time: now - 5400, status: 'ok' },
    { user: 'demo_user', sessionId: 'sess-sales-2024', sessionTitle: '云帆优选全年销售趋势', durationMs: 640, time: now - 3600, status: 'ok' },
    { user: 'demo_manager', sessionId: 'sess-store-cost', sessionTitle: '连锁门店成本对比', durationMs: 480, time: now - 7200, status: 'ok' },
  ],
  totals: { count: 84, avgMs: 760, maxMs: 2100, minMs: 210 },
  generated_at: now,
};

export const statsActive: ActiveStats = {
  bucket: 'day',
  buckets: statBuckets,
  series: statBuckets.map((b, i) => ({ bucket: b, users: 4 + (i % 3), sessions: 9 + i, messages: 60 + i * 8 })),
  totals: { users: 12, sessions: 148, messages: 1263 },
  generated_at: now,
};

// ── 数据权限（GET /admin/api/data-acl/*）────────────────────────────────────
export const daclActive: Record<string, unknown> = {
  version: 'demo-v1',
  product_nodes: [
    { product_id: 'p-video', name: '音视频PaaS', level: '1', agg_layer: '音视频', org_layer: '云产品五部' },
    { product_id: 'p-cdn', name: '边缘平台及CDN', level: '1', agg_layer: '边缘', org_layer: '云产品五部' },
  ],
};

export const daclUsers: DataAclUser[] = [
  {
    loginName: 'demo_analyst',
    productIds: ['p-video'],
    skills: ['demo/ecommerce-sales'],
    businessRoles: ['analyst'],
    aggLayers: ['音视频'],
    orgLayers: ['云产品五部'],
    rowScopes: [],
  },
];

export const daclLayerValues: LayerValues = {
  agg_layers: ['音视频', '边缘', '通信', '物联网'],
  org_layers: ['云产品五部'],
};

export const daclSkillIndex: SkillTableIndexEntry[] = [
  { table: 'dw_sales_daily', skill: 'demo/ecommerce-sales', datasource: 'demo_dw', brief: '销售日汇总', status: 'active' },
];

export const daclGroups: UserGroup[] = [
  {
    groupId: 'grp-analyst',
    name: '分析师组',
    description: '演示用权限组',
    members: ['demo_analyst'],
    memberCount: 1,
    template: { product_ids: ['p-video'], agg_layers: ['音视频'], org_layers: ['云产品五部'], skills: ['demo/ecommerce-sales'], row_scopes: [] },
    updatedBy: 'demo_user',
    updatedAt: now - day,
  },
];

// ── 业务知识（GET /admin/api/business-knowledge）────────────────────────────
export const bizKnowledge: BusinessKnowledgeSnapshot = {
  overview: '本平台为云产品经营分析助手（演示环境），覆盖音视频、边缘、通信、物联网四大产业，服务腾讯云 B 端客户，按月度口径进行目标 vs 实际经营分析。以下数据均为虚构。',
  products: {
    level_1: [
      { canonical: '音视频PaaS', aliases: ['paas'], field_name: 'prod_tree_bsc', level: 1 },
      { canonical: '边缘平台及CDN', aliases: ['cdn'], field_name: 'prod_tree_bsc', level: 1 },
    ],
    level_2: [
      { canonical: '实时互动', aliases: ['实时互动'], field_name: 'prod_class3_name', level: 2 },
    ],
    level_3: [
      { canonical: '实时音视频', aliases: ['trtc', 'rtc'], field_name: 'prod_class4_name', level: 3 },
    ],
  },
  customers: [
    { aliases: ['云帆优选'], customer_name: '云帆优选（演示）', owner_uin: '100000000001', owner_uins: ['100000000001'] },
  ],
};
