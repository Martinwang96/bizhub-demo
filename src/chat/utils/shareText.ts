/**
 * 分享文本预格式化模板。
 *
 * 模板：
 *   《{title}》 点击查看与biz-hub的对话
 *   {url}
 */

export function formatShareText(title: string, url: string): string {
  const safeTitle = (title || '').trim() || '分享的对话';
  return `《${safeTitle}》 点击查看与biz-hub的对话\n${url}`;
}

/**
 * 报表（看板）分享文本预格式化模板。
 *
 * 模板：
 *   《{title}》 点击查看 biz-hub 看板
 *   {url}
 */
export function formatReportShareText(title: string, url: string): string {
  const safeTitle = (title || '').trim() || '分享的看板';
  return `《${safeTitle}》 点击查看 biz-hub 看板\n${url}`;
}

/**
 * 生成导出文件名（去除文件系统不安全字符）。
 */
export function buildExportFileName(title: string, ext: 'png' | 'pdf'): string {
  const base = (title || '').trim() || '分享对话';
  const safe = base.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  return `biz-hub-${safe}-${stamp}.${ext}`;
}
