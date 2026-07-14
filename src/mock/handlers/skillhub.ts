import type { Router, MockRequest } from '../router';
import { raw } from '../envelope';
import { rawSkills, skillHubConfig } from '../fixtures/skills';

// 内存态：技能上/下线状态 + staging 暂存，保证 Demo 交互闭环。
const availabilityOverlay = new Map<string, string>();
interface Staging { stagingId: string; skillId: string; owner: string; slug: string; }
const stagingStore = new Map<string, Staging>();
let stagingSeq = 1;

function skillIdOf(owner: string, slug: string): string {
  return owner && owner !== '_' ? `${owner}/${slug}` : slug;
}

function skillsWithOverlay() {
  return rawSkills.map((s) => {
    const id = skillIdOf(s.owner ?? '', s.slug);
    const overlaid = availabilityOverlay.get(id);
    return overlaid ? { ...s, status: overlaid } : s;
  });
}

// Skill Hub 接口返回原始 JSON（httpClient 内部会包一层 Envelope）。
//
// ⚠️ 路由注册顺序：本项目 Router 按注册顺序 + 段数匹配，参数段 `:x` 会吃掉同段数
// 的具体路径。因此所有「具体路径」必须注册在「参数路径」之前，否则例如
// /skills/approvals/pending 会被 /skills/:owner/:slug 误匹配。
export function registerSkillHubRoutes(r: Router): void {
  // ── 顶层具体路径 ──
  r.get('/skill-hub/api/skills', () => raw({ skills: skillsWithOverlay() }));
  r.get('/skill-hub/api/config', () => raw(skillHubConfig));
  r.post('/skill-hub/api/admin/reload-skills', () =>
    raw({ ok: true, skill_count: rawSkills.length, reloaded: true }),
  );

  // ── 上传 / 发布 / staging（具体路径，须先于 :owner/:slug） ──
  r.post('/skill-hub/api/skills/upload', () => {
    const stagingId = `staging-${Date.now().toString(36)}-${stagingSeq++}`;
    stagingStore.set(stagingId, { stagingId, skillId: 'demo/new-skill', owner: 'demo', slug: 'new-skill' });
    return raw({
      ok: true,
      skill_id: 'demo/new-skill',
      staging_id: stagingId,
      validation: {
        ok: true,
        stats: { errors: 0, warnings: 1 },
        issues: [
          { severity: 'warning', message: '建议补充 README 中的示例查询', code: 'DOC_EXAMPLE' },
        ],
      },
      files: [
        { path: 'SKILL.md', size: 2048, role: 'skill' },
        { path: 'reference/schema.md', size: 1536, role: 'reference' },
        { path: 'scripts/query.sql', size: 512, role: 'script' },
      ],
      scripts: [
        { path: 'scripts/query.sql', size: 512, role: 'script' },
      ],
      diff: '+ 新增 3 个文件\n+ 更新技能描述',
    });
  });

  r.post('/skill-hub/api/skills/publish', (req: MockRequest) => {
    const body = (req.body ?? {}) as { job_id?: string };
    if (body.job_id) stagingStore.delete(body.job_id);
    const requestId = `req-${Date.now().toString(36)}`;
    return raw({ ok: true, request_id: requestId, requestId });
  });

  r.del('/skill-hub/api/skills/staging/:id', (req: MockRequest) => {
    stagingStore.delete(req.params.id);
    return raw({ ok: true });
  });

  // ── 审批相关（具体路径，须先于 :owner/:slug） ──
  r.get('/skill-hub/api/skills/approvals/pending', () => raw({ items: [] }));
  r.get('/skill-hub/api/skills/approvals/my', () => raw({ items: [] }));
  r.post('/skill-hub/api/skills/approvals/:id/approve', () => raw({ ok: true, status: 'published' }));
  r.post('/skill-hub/api/skills/approvals/:id/reject', () => raw({ ok: true, status: 'rejected' }));
  r.post('/skill-hub/api/skills/approvals/:id/withdraw', () => raw({ ok: true, status: 'withdrawn' }));

  r.get('/skill-hub/api/audit', () =>
    raw({ items: [], actions: ['upload', 'publish', 'approve', 'reject', 'rollback', 'availability'] }),
  );

  // ── 技能版本 / 回滚 / 上下线 / 导出（5 段具体动词，先于 4 段详情无冲突，但保持在参数详情之前） ──
  r.get('/skill-hub/api/skills/:owner/:slug/versions', (req: MockRequest) => {
    const { owner, slug } = req.params;
    const nowSec = Math.floor(Date.now() / 1000);
    return raw({
      ok: true,
      versions: [
        { version: 'v1.3.0', published_at: nowSec - 3600 * 24 * 2, publisher: 'demo_user', current: true },
        { version: 'v1.2.0', published_at: nowSec - 3600 * 24 * 12, publisher: 'demo_user' },
        { version: 'v1.1.0', published_at: nowSec - 3600 * 24 * 30, publisher: 'demo_admin' },
        { version: 'v1.0.0', published_at: nowSec - 3600 * 24 * 60, publisher: 'demo_admin' },
      ],
      skill_id: skillIdOf(owner, slug),
    });
  });

  r.post('/skill-hub/api/skills/:owner/:slug/rollback', (req: MockRequest) => {
    const body = (req.body ?? {}) as { target_version?: string };
    return raw({ ok: true, rolled_back_to: body.target_version ?? 'v1.0.0' });
  });

  r.post('/skill-hub/api/skills/:owner/:slug/availability', (req: MockRequest) => {
    const { owner, slug } = req.params;
    const body = (req.body ?? {}) as { status?: string };
    const status = body.status === 'unavailable' ? 'unavailable' : 'active';
    availabilityOverlay.set(skillIdOf(owner, slug), status);
    return raw({ ok: true, status });
  });

  r.get('/skill-hub/api/skills/:owner/:slug/export', (req: MockRequest) => {
    const name = `${req.params.slug}-demo.zip`;
    return new Response('PK\u0003\u0004 demo skill package (mock)\n', {
      status: 200,
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${name}"`,
      },
    });
  });

  // ── 技能详情：4 段参数路径，放最后（其它 4 段具体路径已在前面消费） ──
  r.get('/skill-hub/api/skills/:owner/:slug', (req: MockRequest) => {
    const { owner, slug } = req.params;
    const skill = rawSkills.find((s) => (s.owner ?? '_') === owner && s.slug === slug)
      ?? rawSkills.find((s) => s.slug === slug);
    if (!skill) return raw({ ok: true, items: [] }); // 兜底不报错
    return raw({
      ok: true,
      ...skill,
      readme: skill.detail,
      content: skill.detail,
      partition_check: true,
      depends_on: [],
    });
  });

  // ── 兜底：任何其它 skill-hub 接口都返回"成功空数据"，杜绝报错 ──
  r.get('/skill-hub/api/skills/:owner/:slug/:rest', () => raw({ ok: true, items: [] }));
}
