import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/Shell/AppShell';
import HomePage from './components/Home/HomePage';
import ChatPage from './components/Chat/ChatPage';
import ReportsPage from './components/Reports/ReportsPage';
import ReportDetailPage from './components/Reports/ReportDetailPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="/c/:sessionId" element={<ChatPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/reports/:reportId" element={<ReportDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
