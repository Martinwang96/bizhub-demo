import { getJson, postJson, del, HttpError } from '@shared/api/httpClient';

/** 报表元数据（后端 Report.to_public 的前端视图）。 */
export interface ReportMeta {
  reportId: string;
  title: string;
  owner: string;
  createdAt: number;
  updatedAt: number;
  lastRefreshedAt: number;
  refreshable: boolean;
  sharedTo: string[];
  isOwner: boolean;
  linkShareEnabled?: boolean;
  sourceSessionId?: string;
}

export interface ReportLinkShare {
  token: string;
  url: string;
  report?: ReportMeta;
}

export interface ReportShareData {
  reportId: string;
  title: string;
  owner: string;
  createdAt: number;
  updatedAt: number;
  isOwner: boolean;
}

export interface ShareCandidate {
  loginName: string;
  role: string;
}

function reason(e: unknown, fallback: string): Error {
  if (e instanceof HttpError) {
    const body = e.body as { error?: string; message?: string } | undefined;
    return new Error(body?.error || body?.message || `HTTP ${e.status}`);
  }
  return e instanceof Error ? e : new Error(fallback);
}

/** 临时产物预览 URL（run_code 生成、尚未发布），用于 iframe 预览 report.html。 */
export function artifactPreviewUrl(execId: string): string {
  return `/api/artifacts/${encodeURIComponent(execId)}/view`;
}

/** 临时产物下载 URL（任意文件，触发浏览器下载）。 */
export function artifactDownloadUrl(execId: string, fileName: string): string {
  return `/api/artifacts/${encodeURIComponent(execId)}/files/${encodeURIComponent(fileName)}`;
}

/** 列出某次 run_code 执行的全部产物文件名（含 report.html）。 */
export async function listArtifactFiles(execId: string): Promise<string[]> {
  const env = await getJson<string[]>(`/api/artifacts/${encodeURIComponent(execId)}/files`)
    .catch((e) => { throw reason(e, '加载产物列表失败'); });
  if (!env.success) throw new Error(env.error ?? '加载产物列表失败');
  return env.data ?? [];
}

/** 看板产物元数据（轻量）：用于"发布看板"弹窗输入框预填看板 title。 */
export interface ArtifactMeta {
  title: string;
  hasReport: boolean;
}

export async function fetchArtifactMeta(execId: string): Promise<ArtifactMeta> {
  const env = await getJson<ArtifactMeta>(`/api/artifacts/${encodeURIComponent(execId)}/meta`)
    .catch((e) => { throw reason(e, '加载看板信息失败'); });
  if (!env.success || !env.data) throw new Error(env.error ?? '加载看板信息失败');
  return env.data;
}

/** 已发布报表的查看 URL，用于 iframe。 */
export function reportViewUrl(reportId: string): string {
  return `/api/reports/${encodeURIComponent(reportId)}/view`;
}

/** 报表链接分享预览 URL（要求登录且具备 Biz-Hub 访问权限）。 */
export function reportShareViewUrl(token: string): string {
  return `/api/report-shares/${encodeURIComponent(token)}/view`;
}

/** 发布看板：把某次 run_code 产物（artifactRef=exec_id）持久化为报表。 */
export async function publishReport(
  artifactRef: string,
  title: string,
  sessionId?: string,
): Promise<ReportMeta> {
  const env = await postJson<ReportMeta>('/api/reports', {
    artifactRef,
    title,
    sessionId: sessionId ?? '',
  }).catch((e) => { throw reason(e, '发布失败'); });
  if (!env.success || !env.data) throw new Error(env.error ?? '发布失败');
  return env.data;
}

/** 列出报表（我创建的 + 可查看的）。 */
export async function listReports(): Promise<{ owned: ReportMeta[]; shared: ReportMeta[] }> {
  const env = await getJson<{ owned: ReportMeta[]; shared: ReportMeta[] }>('/api/reports')
    .catch((e) => { throw reason(e, '加载报表失败'); });
  if (!env.success || !env.data) throw new Error(env.error ?? '加载报表失败');
  return env.data;
}

/** 单个报表元数据。 */
export async function getReportMeta(reportId: string): Promise<ReportMeta> {
  const env = await getJson<ReportMeta>(`/api/reports/${encodeURIComponent(reportId)}`)
    .catch((e) => { throw reason(e, '加载报表失败'); });
  if (!env.success || !env.data) throw new Error(env.error ?? '加载报表失败');
  return env.data;
}

/** 可分享用户列表（biz hub 白名单，已排除自己）。 */
export async function listShareCandidates(): Promise<ShareCandidate[]> {
  const env = await getJson<ShareCandidate[]>('/api/reports/share-candidates')
    .catch((e) => { throw reason(e, '加载用户列表失败'); });
  if (!env.success) throw new Error(env.error ?? '加载用户列表失败');
  return env.data ?? [];
}

/** 全量覆盖设置被分享名单。返回更新后的元数据与被拒绝（不在白名单）的用户。 */
export async function shareReport(
  reportId: string,
  logins: string[],
): Promise<{ meta: ReportMeta; rejected: string[] }> {
  const env = await postJson<ReportMeta>(
    `/api/reports/${encodeURIComponent(reportId)}/share`,
    { logins },
  ).catch((e) => { throw reason(e, '设置分享失败'); });
  if (!env.success || !env.data) throw new Error(env.error ?? '设置分享失败');
  const rejected = ((env as unknown as { rejected?: string[] }).rejected) ?? [];
  return { meta: env.data, rejected };
}

/** 创建/获取报表链接分享。链接只允许具备 Biz-Hub 访问权限的登录用户查看。 */
export async function createReportLinkShare(reportId: string): Promise<ReportLinkShare> {
  const env = await postJson<ReportLinkShare>(
    `/api/reports/${encodeURIComponent(reportId)}/link-share`,
    {},
  ).catch((e) => { throw reason(e, '创建链接失败'); });
  if (!env.success || !env.data) throw new Error(env.error ?? '创建链接失败');
  return env.data;
}

/** 获取报表链接分享元信息。 */
export async function getReportLinkShare(token: string): Promise<ReportShareData> {
  const env = await getJson<ReportShareData>(`/api/report-shares/${encodeURIComponent(token)}`)
    .catch((e) => { throw reason(e, '加载分享失败'); });
  if (!env.success || !env.data) throw new Error(env.error ?? '加载分享失败');
  return env.data;
}

/** 将报表链接分享加入当前用户报表区，返回详情页地址。 */
export async function importReportLinkShare(token: string): Promise<{ reportId: string; title: string; url: string }> {
  const env = await postJson<{ reportId: string; title: string; url: string }>('/api/report-share-imports', { token })
    .catch((e) => { throw reason(e, '打开详情失败'); });
  if (!env.success || !env.data) throw new Error(env.error ?? '打开详情失败');
  return env.data;
}

/** 删除报表。 */
export async function deleteReport(reportId: string): Promise<void> {
  const env = await del<unknown>(`/api/reports/${encodeURIComponent(reportId)}`)
    .catch((e) => { throw reason(e, '删除失败'); });
  if (!env.success) throw new Error(env.error ?? '删除失败');
}

/** 从 run_code 工具输出中解析 artifact 引用：形如 `[artifact] exec_id=xxx files=a,b`。
 *
 * 返回该次执行的全部产物文件名列表（不再过滤 report.html）。
 * 调用方自行区分：含 report.html 的可走预览，其余走下载。
 */
export function parseArtifactRef(output?: string): { execId: string; files: string[] } | null {
  if (!output) return null;
  const m = output.match(/\[artifact\]\s+exec_id=(\S+)\s+files=(\S+)/);
  if (!m) return null;
  const files = m[2].split(',').map((s) => s.trim()).filter(Boolean);
  if (!files.length) return null;
  return { execId: m[1], files };
}
