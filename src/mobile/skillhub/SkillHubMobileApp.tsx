/**
 * Skill Hub 移动端应用壳 + 路由表。
 *
 * 该入口仅在 useMediaQuery(MOBILE_BREAKPOINT) 命中时由 SkillHubApp lazy 挂载。
 *
 * 路由（basename `/skill-hub` 已在 skill-hub-main.tsx 配置）：
 *   /                   → 重定向到 /apply
 *   /apply              → MobileApplyPage（默认 ?seg=new）
 *   /approve            → 占位（敬请期待）
 *   /skills             → 占位
 *   /history            → 占位
 *   /upload             → 重定向到 /apply?seg=new（兼容 PC 旧链接）
 *   /my                 → 重定向到 /apply?seg=mine
 *   其它任意路径         → 重定向到 /apply
 *
 * 整体结构：
 *   <MobileShell>
 *     <Routes>...</Routes>      ← 各页面顶部已有自己的 PageTitle，承担"页面标题"职责
 *     <MobileBottomTabBar />
 *   </MobileShell>
 *
 * 数据：me 通过 /api/me 拉取（与 PC SkillHubShell 一致），用于 Watermark + 头像首字母。
 */
import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { getJson } from '@shared/api/httpClient';
import type { Me } from '@shared/types/user';

import MobileShell from '../shared/MobileShell';
import MobileBottomTabBar, { type MobileTabItem } from '../shared/MobileBottomTabBar';
import MobileApplyPage from './pages/apply/MobileApplyPage';
import MobileReviewPage from './pages/review/MobileReviewPage';
import MobileSkillsPage from './pages/skills/MobileSkillsPage';
import MobileHistoryPage from './pages/history/MobileHistoryPage';

// ── 底部 Tab 4 项的 inline SVG 图标（与各页面 MobilePageTitle 同款） ──
const ApplyIcon = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const ApproveIcon = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2 4 6v6c0 5 3.5 9.4 8 10 4.5-.6 8-5 8-10V6l-8-4z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
);

const SkillsIcon = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 4h12a4 4 0 0 1 4 4v12" />
    <path d="M4 8h11" />
    <path d="M4 12h8" />
    <path d="M4 16h6" />
  </svg>
);

const HistoryIcon = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <polyline points="3 4 3 10 9 10" />
    <polyline points="12 7 12 12 15 14" />
  </svg>
);

/** 4 项底 Tab 的静态配置（路径与 Routes 表保持同步） */
const TAB_DEFS: Array<Pick<MobileTabItem, 'id' | 'label' | 'icon' | 'to' | 'disabled'> & { match: string }> = [
  { id: 'apply', label: '申请', icon: ApplyIcon, to: '/apply', match: '/apply' },
  { id: 'approve', label: '审批', icon: ApproveIcon, to: '/approve', match: '/approve' },
  { id: 'skills', label: '技能', icon: SkillsIcon, to: '/skills', match: '/skills' },
  { id: 'history', label: '历史', icon: HistoryIcon, to: '/history', match: '/history' },
];

export default function SkillHubMobileApp() {
  const [me, setMe] = useState<Me | null>(null);
  const location = useLocation();

  useEffect(() => {
    void getJson<Me>('/api/me')
      .then((env) => {
        if (env.success && env.data) setMe(env.data);
      })
      .catch((e: unknown) => {
        console.error('[SkillHubMobile] load me failed', e);
      });
  }, []);

  // 当前激活 Tab：以 location.pathname 前缀匹配；/upload | /my 视为 apply（重定向后会更新）
  const tabs: MobileTabItem[] = useMemo(() => {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    return TAB_DEFS.map((d) => {
      const active =
        path === d.match ||
        (d.match === '/apply' && (path === '/' || path === '/upload' || path === '/my'));
      return {
        id: d.id,
        label: d.label,
        icon: d.icon,
        to: d.to,
        active,
      };
    });
  }, [location.pathname]);

  return (
    <MobileShell me={me}>
      <Routes>
        <Route index element={<Navigate to="/apply" replace />} />
        <Route path="apply" element={<MobileApplyPage me={me} />} />
        <Route path="approve" element={<MobileReviewPage me={me} />} />
        <Route path="skills" element={<MobileSkillsPage me={me} />} />
        <Route path="history" element={<MobileHistoryPage me={me} />} />
        {/* 兼容 PC 老链接：/upload 与 /my 直接落到申请页 */}
        <Route path="upload" element={<Navigate to="/apply?seg=new" replace />} />
        <Route path="my" element={<Navigate to="/apply?seg=mine" replace />} />
        <Route path="*" element={<Navigate to="/apply" replace />} />
      </Routes>
      <MobileBottomTabBar items={tabs} />
    </MobileShell>
  );
}
