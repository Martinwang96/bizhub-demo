// 统一构造 mock 响应。
// - REST（/api、/admin/api）：httpClient 期望 Envelope<T>={success,data}
// - Skill Hub（/skill-hub/api）：期望原始 JSON（httpClient 内部再包一层）

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** Envelope 成功响应（/api、/admin/api 用）。 */
export function ok<T>(data: T): Response {
  return jsonResponse({ success: true, data }, 200);
}

/** Envelope 失败响应。 */
export function fail(message: string, status = 400): Response {
  return jsonResponse({ success: false, error: message }, status);
}

/** 原始 JSON（Skill Hub 用）。 */
export function raw(body: unknown, status = 200): Response {
  return jsonResponse(body, status);
}

/** text/html 响应（报表/产物 iframe 预览）。 */
export function html(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

/** 空成功（DELETE / abort 等）。 */
export function empty(): Response {
  return jsonResponse({ success: true }, 200);
}
