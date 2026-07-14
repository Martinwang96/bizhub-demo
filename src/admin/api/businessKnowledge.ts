/**
 * Business Knowledge API client.
 *
 * 与后端 admin_console/business_knowledge.py 的 5 个 endpoint 对齐：
 *   GET  /admin/api/business-knowledge          → 读全部
 *   POST /admin/api/business-knowledge/parse    → 解析预览（不落盘）
 *   PUT  /admin/api/business-knowledge/{section} → 落盘单个板块（overview/products/customers）
 *   GET  /admin/api/business-knowledge/history  → 历史版本列表
 *   POST /admin/api/business-knowledge/rollback/{version_id} → 一键回滚
 *
 * 全部接口的鉴权由 require_admin_console_admin（写）/ require_admin_console_reader（读）控制。
 */
import { getJson, postJson, putJson } from '@shared/api/httpClient';

// ── 数据类型 ─────────────────────────────────────────────────────────────

export interface ProductEntry {
  canonical: string;
  aliases: string[];
  field_name: string; // prod_tree_bsc | prod_class3_name | prod_class4_name
  level: number; // 1 / 2 / 3
}

export interface CustomerEntry {
  aliases: string[];
  customer_name: string;
  owner_uin?: string | null;
  owner_uins?: string[] | null;
}

export interface ProductsByLevel {
  level_1: ProductEntry[];
  level_2: ProductEntry[];
  level_3: ProductEntry[];
}

export interface BusinessKnowledgeSnapshot {
  overview: string;
  products: ProductsByLevel;
  customers: CustomerEntry[];
}

export interface ParseError {
  line_no: number;
  column?: string;
  raw?: string;
  reason: string;
}

export interface ParsePreviewResponse {
  section: 'overview' | 'products' | 'customers';
  format_detected: string; // 'yaml' | 'json' | 'md' | 'tsv' | 'csv' | 'unknown'
  format_used: string;
  // overview 时：仅返回 normalized 文本（products / customers 字段为 null）
  overview?: string | null;
  products?: ProductsByLevel | null;
  customers?: CustomerEntry[] | null;
  errors: ParseError[];
}

export interface HistoryEntry {
  version_id: string; // {ts}-{hash} 形式
  ts: number;
  ts_iso: string;
  user: string;
  files_changed: string[];
}

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

// ── API 调用 ─────────────────────────────────────────────────────────────

const BASE = '/admin/api/business-knowledge';

export function fetchAll() {
  return getJson<BusinessKnowledgeSnapshot>(BASE);
}

export function parsePreview(
  section: 'overview' | 'products' | 'customers',
  text: string,
  formatHint?: string,
) {
  return postJson<ParsePreviewResponse>(`${BASE}/parse`, {
    section,
    text,
    format_hint: formatHint ?? 'unknown',
  });
}

export function saveOverview(text: string) {
  return putJson<{ files_changed: string[]; version_id: string }>(`${BASE}/overview`, { text });
}

export function saveProducts(text: string, formatHint?: string) {
  return putJson<{ files_changed: string[]; version_id: string }>(`${BASE}/products`, {
    text,
    format_hint: formatHint ?? 'unknown',
  });
}

export function saveCustomers(text: string, formatHint?: string) {
  return putJson<{ files_changed: string[]; version_id: string }>(`${BASE}/customers`, {
    text,
    format_hint: formatHint ?? 'unknown',
  });
}

export function listHistory() {
  return getJson<HistoryEntry[]>(`${BASE}/history`);
}

export function rollback(versionId: string) {
  return postJson<{ rollback_from: string; pre_rollback_snapshot: string; files_restored: string[] }>(
    `${BASE}/rollback/${encodeURIComponent(versionId)}`,
    {},
  );
}
