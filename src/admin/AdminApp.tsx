import { Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@shared/components';
import AdminShell from './components/AdminShell';
import PermissionsPage from './pages/PermissionsPage';
import DataAclPage from './pages/DataAclPage';
import BusinessKnowledgePage from './pages/BusinessKnowledgePage';
import SessionsPage from './pages/SessionsPage';
import OpsPage from './pages/OpsPage';
import StatsPage from './pages/StatsPage';

export default function AdminApp() {
  return (
    <ToastProvider>
      <Routes>
        <Route element={<AdminShell />}>
          <Route index element={<Navigate to="permissions" replace />} />
          <Route path="permissions" element={<PermissionsPage />} />
          <Route path="data-acl" element={<DataAclPage />} />
          <Route path="business-knowledge" element={<BusinessKnowledgePage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="ops" element={<OpsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="permissions" replace />} />
      </Routes>
    </ToastProvider>
  );
}
