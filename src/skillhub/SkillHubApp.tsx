/**
 * Skill Hub 应用入口（路由表）
 *
 * 与 admin/AdminApp.tsx 同构：本文件只放 <Routes>；layout、状态、刷新句柄全部下沉到
 * components/SkillHubShell.tsx。
 *
 * URL 设计：
 *   /skill-hub               → 重定向 /skill-hub/upload
 *   /skill-hub/upload        → UploadTab
 *   /skill-hub/skills        → SkillsTab
 *   /skill-hub/pending       → PendingTab（仅 approver；非审批人由 Shell 守卫回 upload）
 *   /skill-hub/my            → MyTab
 *   /skill-hub/versions      → VersionsTab
 *   /skill-hub/audit         → AuditTab
 *   /skill-hub/admin         → AdminTab（仅 approver；非审批人由 Shell 守卫回 upload）
 *   /skill-hub/<unknown>     → 重定向 upload
 *
 * 注：BrowserRouter 在 skill-hub-main.tsx 以 basename="/skill-hub" 包裹，因此本文件中
 * <Route path="..."> 都是相对路径。
 */
import { lazy, memo, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useMediaQuery } from '@shared/hooks/useMediaQuery';
import { MOBILE_BREAKPOINT } from '../mobile/shared/constants';
import { ToastProvider } from '@shared/components';

import SkillHubShell, { useSkillHubContext } from './components/SkillHubShell';
import UploadTab from './tabs/UploadTab';
import SkillsTab from './tabs/SkillsTab';
import PendingTab from './tabs/PendingTab';
import MyTab from './tabs/MyTab';
import VersionsTab from './tabs/VersionsTab';
import AuditTab from './tabs/AuditTab';
import AdminTab from './tabs/AdminTab';

// 移动端壳采用 React.lazy 异步加载：PC 端 bundle 不会包含任何移动端代码。
const SkillHubMobileApp = lazy(() => import('../mobile/skillhub/SkillHubMobileApp'));

// 兼容现有 7 个 Tab 子组件的 `import type { RegisterRefresh } from '../SkillHubApp'`。
// 类型权威定义在 SkillHubShell.tsx，此处仅做 re-export，避免大批 import 改名。
export type { RefreshHandle, RegisterRefresh, TabId } from './components/SkillHubShell';

// ── 各 Tab 的薄封装：仅负责从 OutletContext 取依赖并透传给原组件，原组件文件不动 ──

const UploadRoute = memo(function UploadRoute() {
  const { me } = useSkillHubContext();
  return <UploadTab me={me} />;
});

const SkillsRoute = memo(function SkillsRoute() {
  const { makeRegister } = useSkillHubContext();
  return <SkillsTab onRegisterRefresh={makeRegister('skills')} />;
});

const PendingRoute = memo(function PendingRoute() {
  const { me, makeRegister, setPendingCount } = useSkillHubContext();
  // unmount 时 PendingTab 不会再触发 onCountChange，需要在切走时主动归零，
  // 避免侧栏 badge 残留（例如 approver 切到 my 后还显示历史的待审批数）。
  useEffect(() => () => setPendingCount(0), [setPendingCount]);
  return <PendingTab me={me} onCountChange={setPendingCount} onRegisterRefresh={makeRegister('pending')} />;
});

const MyRoute = memo(function MyRoute() {
  const { makeRegister } = useSkillHubContext();
  return <MyTab onRegisterRefresh={makeRegister('my')} />;
});

const VersionsRoute = memo(function VersionsRoute() {
  const { me, makeRegister } = useSkillHubContext();
  return <VersionsTab me={me} onRegisterRefresh={makeRegister('versions')} />;
});

const AuditRoute = memo(function AuditRoute() {
  const { makeRegister } = useSkillHubContext();
  return <AuditTab onRegisterRefresh={makeRegister('audit')} />;
});

const AdminRoute = memo(function AdminRoute() {
  const { me, makeRegister } = useSkillHubContext();
  return <AdminTab me={me} onRegisterRefresh={makeRegister('admin')} />;
});

export default function SkillHubApp() {
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);

  return (
    <ToastProvider>
      {isMobile ? (
        <Suspense fallback={null}>
          <SkillHubMobileApp />
        </Suspense>
      ) : (
        <Routes>
          <Route element={<SkillHubShell />}>
            <Route index element={<Navigate to="upload" replace />} />
            <Route path="upload" element={<UploadRoute />} />
            <Route path="skills" element={<SkillsRoute />} />
            <Route path="pending" element={<PendingRoute />} />
            <Route path="my" element={<MyRoute />} />
            <Route path="versions" element={<VersionsRoute />} />
            <Route path="audit" element={<AuditRoute />} />
            <Route path="admin" element={<AdminRoute />} />
            <Route path="*" element={<Navigate to="upload" replace />} />
          </Route>
        </Routes>
      )}
    </ToastProvider>
  );
}
