import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PlatformDataProvider } from './context/PlatformDataContext';
import { ScenarioProvider } from './context/ScenarioContext';
import { SidebarProvider } from './components/layout/Sidebar';

import Landing from './pages/landing/Landing';
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
import OffboardingGaps from './pages/admin/OffboardingGaps';
import Scenarios from './pages/admin/Scenarios';

import AuditorDashboard, { EvidencePage, ExportsPage } from './pages/auditor/AuditorDashboard';
import ExecutiveDashboard from './pages/executive/ExecutiveDashboard';
import EmployeeDashboard from './pages/employee/EmployeeDashboard';
import EmployeeApps from './pages/employee/EmployeeApps';
import EmployeeRoles from './pages/employee/EmployeeRoles';
import EmployeeRequests from './pages/employee/EmployeeRequests';
import EmployeeActivity from './pages/employee/EmployeeActivity';
import EmployeeSecurity from './pages/employee/EmployeeSecurity';
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

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<RedirectToLogin />} />

      <Route path="/admin" element={<RoleGuard allowed={['admin']}><DashboardLayout /></RoleGuard>}>
        <Route index element={<Overview />} />
        <Route path="identities" element={<Identities />} />
        <Route path="identities/:personId" element={<IdentityDetail />} />
        <Route path="lifecycle" element={<Lifecycle />} />
        <Route path="access-review" element={<AccessReview />} />
        <Route path="privileges" element={<Privileges />} />
        <Route path="risks" element={<Risks />} />
        <Route path="offboarding-gaps" element={<OffboardingGaps />} />
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
        <Route path="apps" element={<EmployeeApps />} />
        <Route path="roles" element={<EmployeeRoles />} />
        <Route path="requests" element={<EmployeeRequests />} />
        <Route path="activity" element={<EmployeeActivity />} />
        <Route path="security" element={<EmployeeSecurity />} />
      </Route>

      <Route path="/contractor" element={<RoleGuard allowed={['contractor']}><DashboardLayout /></RoleGuard>}>
        <Route index element={<ContractorDashboard />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PlatformDataProvider>
          <ScenarioProvider>
            <SidebarProvider>
              <AppRoutes />
            </SidebarProvider>
          </ScenarioProvider>
        </PlatformDataProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
