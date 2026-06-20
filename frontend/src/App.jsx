import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ScenarioProvider } from './context/ScenarioContext';

import DashboardLayout from './components/layout/DashboardLayout';

import Overview from './pages/admin/Overview';
import Identities from './pages/admin/Identities';
import IdentityDetail from './pages/admin/IdentityDetail';
import Lifecycle from './pages/admin/Lifecycle';
import AccessReview from './pages/admin/AccessReview';
import Privileges from './pages/admin/Privileges';
import Risks from './pages/admin/Risks';
import AttackPaths from './pages/admin/AttackPaths';
import BlastRadius from './pages/admin/BlastRadius';
import Compliance from './pages/admin/Compliance';
import Copilot from './pages/admin/Copilot';
import Incidents from './pages/admin/Incidents';
import Scenarios from './pages/admin/Scenarios';

import AuditorDashboard, { EvidencePage, ExportsPage } from './pages/auditor/AuditorDashboard';
import ExecutiveDashboard from './pages/executive/ExecutiveDashboard';
import EmployeeDashboard from './pages/employee/EmployeeDashboard';
import ContractorDashboard from './pages/contractor/ContractorDashboard';

function RedirectToLogin() {
  window.location.replace('/login.html');
  return null;
}

function RoleGuard({ allowed, children }) {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <RedirectToLogin />;
  if (!allowed.includes(user.role)) return <RedirectToLogin />;
  return children;
}

function GoHome() {
  window.location.replace('/');
  return null;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<RedirectToLogin />} />

      <Route path="/admin" element={<RoleGuard allowed={['admin']}><DashboardLayout /></RoleGuard>}>
        <Route index element={<Overview />} />
        <Route path="identities" element={<Identities />} />
        <Route path="identities/:personId" element={<IdentityDetail />} />
        <Route path="lifecycle" element={<Lifecycle />} />
        <Route path="access-review" element={<AccessReview />} />
        <Route path="privileges" element={<Privileges />} />
        <Route path="risks" element={<Risks />} />
        <Route path="attack-paths" element={<AttackPaths />} />
        <Route path="blast-radius" element={<BlastRadius />} />
        <Route path="compliance" element={<Compliance />} />
        <Route path="copilot" element={<Copilot />} />
        <Route path="incidents" element={<Incidents />} />
        <Route path="scenarios" element={<Scenarios />} />
      </Route>

      <Route path="/auditor" element={<RoleGuard allowed={['auditor']}><DashboardLayout /></RoleGuard>}>
        <Route element={<AuditorDashboard />}>
          <Route index element={null} />
          <Route path="compliance" element={null} />
          <Route path="evidence" element={<EvidencePage />} />
          <Route path="exports" element={<ExportsPage />} />
        </Route>
      </Route>

      <Route path="/executive" element={<RoleGuard allowed={['executive']}><DashboardLayout /></RoleGuard>}>
        <Route index element={<ExecutiveDashboard />} />
      </Route>

      <Route path="/employee" element={<RoleGuard allowed={['employee']}><DashboardLayout /></RoleGuard>}>
        <Route index element={<EmployeeDashboard />} />
      </Route>

      <Route path="/contractor" element={<RoleGuard allowed={['contractor']}><DashboardLayout /></RoleGuard>}>
        <Route index element={<ContractorDashboard />} />
      </Route>

      <Route path="*" element={<GoHome />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScenarioProvider>
          <AppRoutes />
        </ScenarioProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
