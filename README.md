# Analysis Agent · 纯前端 Demo 站

本目录是 `analysis-agent-4.2/web-react` 前端的**完整复刻 Demo**，与主项目**物理解耦**（独立依赖、独立构建）。它**无需任何后端**即可运行：通过一个在应用代码之前执行的 mock 引导脚本劫持 `window.fetch`，把所有后端请求就地返回**虚构预置数据**，用于对外展示全部 UI 与交互。

> 所有会话、回复、图表、技能、报表、后台数据均为**虚构**（假公司 / 假表 / 假数值），不含任何真实或敏感数据，也不请求任何内网 / 外网服务。

## 五套界面（随屏宽自动切换移动端）

| 入口 | 路径 | 说明 |
| --- | --- | --- |
| 对话主站 | `/` | 流式推理 → 技能加载 → SQL 查询 → 图表 → 结论 |
| 技能中心 | `/skill-hub` | 3 个虚构技能的列表与详情 |
| 管理后台 | `/admin` | 会话列表、统计、告警、日志、导出 |
| 分享页 | `/s/<token>` | 会话分享快照 |

## 本地运行

```bash
npm install
npm run dev       # 开发（含 SPA clean-URL 重写）
npm run build     # 生产构建，产物在 dist/
npm run preview   # 预览生产产物
```

## 示例问题（对话主站输入即可看到不同回放）

- `帮我分析电商全年销售趋势`（折线图 + 结论）
- `各区域门店成本对比一下`（柱状图）
- `云资源费用怎么优化`（占比图）

## 部署（EdgeOne Pages）

- 构建输出目录：`dist/`
- `dist/_redirects` 提供 clean-URL 重写（`/skill-hub`→`/skill-hub.html` 等，SPA 回退 `/index.html`）。
- 站点须部署在**域名根路径**（`skill-hub` / `admin` 页面的路由 `basename` 硬编码为 `/skill-hub`、`/admin`）。

## Mock 结构（`src/mock/`）

```
bootstrap.ts        劫持 window.fetch，按路径分发；非 API 透传
router.ts           路径匹配（含 :param）
envelope.ts         Envelope / 原始 JSON / SSE 响应构造
handlers/           chat · sse · skillhub · admin · reports · share
fixtures/           charts · scenarios · sessions · skills · reports · admin
```

维护场景：改 `fixtures/*` 即可替换数据；改 `fixtures/scenarios.ts` 可增删对话回放脚本。应用 UI 源码保持零改动（仅 4 个 HTML 入口各加了一行 `mock/bootstrap.ts` 引导脚本）。
