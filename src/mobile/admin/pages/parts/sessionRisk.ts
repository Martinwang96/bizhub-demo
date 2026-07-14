/**
 * 会话风险等级映射（前端展示层派生，不污染后端契约）。
 *
 * - 含高危关键字（critical / high / danger / leak / abuse） → 'critical'
 * - 其他非空 tag → 'attention'
 * - 空 / 未提供 → 'normal'
 */
export type RiskLevel = 'normal' | 'attention' | 'critical';

const HIGH_RISK_KEYWORDS = ['critical', 'high', 'danger', 'leak', 'abuse'];

export function mapRiskLevel(tags?: string[]): RiskLevel {
  if (!tags || tags.length === 0) return 'normal';
  const lower = tags.map((t) => t.toLowerCase());
  if (lower.some((t) => HIGH_RISK_KEYWORDS.some((k) => t.includes(k)))) {
    return 'critical';
  }
  return 'attention';
}

export function riskLevelLabel(level: RiskLevel): string {
  if (level === 'critical') return '高危';
  if (level === 'attention') return '关注';
  return '常规';
}
