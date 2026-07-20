import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';

import { hasAnyRole } from '../domain/permissions';
import { AppShell } from '../components/layout/AppShell';
import { PageLoader } from '../components/ui/LoadingState';
import { useAuth } from '../features/auth/AuthProvider';
import { ConfigurationPage } from '../features/auth/ConfigurationPage';
import { LoginPage } from '../features/auth/LoginPage';
import { NoAccessPage } from '../features/auth/NoAccessPage';
import { PasswordSetupPage } from '../features/auth/PasswordSetupPage';
import { isSupabaseConfigured } from '../lib/supabase/config';
import { NotFoundPage } from './NotFoundPage';
import { canViewFinanceQueue } from '../features/my-work/visibility';

const DashboardPage = lazy(() =>
  import('../features/dashboard/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  })),
);
const PromotionsPage = lazy(() =>
  import('../features/promotions/PromotionsPage').then((module) => ({
    default: module.PromotionsPage,
  })),
);
const CalendarPage = lazy(() =>
  import('../features/calendar/CalendarPage').then((module) => ({
    default: module.CalendarPage,
  })),
);
const PublishingAccountsPage = lazy(() =>
  import('../features/publishing-accounts/PublishingAccountsPage').then((module) => ({
    default: module.PublishingAccountsPage,
  })),
);
const FinancePage = lazy(() =>
  import('../features/finance/FinancePage').then((module) => ({ default: module.FinancePage })),
);
const CreatePromotionPage = lazy(() =>
  import('../features/promotions/CreatePromotionPage').then((module) => ({
    default: module.CreatePromotionPage,
  })),
);
const PromotionDetailPage = lazy(() =>
  import('../features/promotions/PromotionDetailPage').then((module) => ({
    default: module.PromotionDetailPage,
  })),
);
const ClientsPage = lazy(() =>
  import('../features/clients/ClientsPage').then((module) => ({ default: module.ClientsPage })),
);
const ClientDetailPage = lazy(() =>
  import('../features/clients/ClientDetailPage').then((module) => ({
    default: module.ClientDetailPage,
  })),
);
const MyWorkPage = lazy(() =>
  import('../features/my-work/MyWorkPage').then((module) => ({ default: module.MyWorkPage })),
);
const NotificationsPage = lazy(() =>
  import('../features/notifications/NotificationsPage').then((module) => ({
    default: module.NotificationsPage,
  })),
);
const AdministrationPage = lazy(() =>
  import('../features/administration/AdministrationPage').then((module) => ({
    default: module.AdministrationPage,
  })),
);

function ProtectedLayout() {
  const { credentialSetup, profile, loading } = useAuth();
  if (!isSupabaseConfigured) return <ConfigurationPage />;
  if (loading) return <PageLoader />;
  if (credentialSetup) return <PasswordSetupPage />;
  if (!profile) return <LoginPage />;
  if (profile.roles.length === 0) return <NoAccessPage />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function AdministratorRoute() {
  const { profile } = useAuth();
  if (!hasAnyRole(profile?.roles ?? [], ['ADMINISTRATOR']))
    return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

function SalesRoute() {
  const { profile } = useAuth();
  if (!hasAnyRole(profile?.roles ?? [], ['SALES'])) return <Navigate to="/promotions" replace />;
  return <Outlet />;
}

function FinanceRoute() {
  const { profile } = useAuth();
  if (!canViewFinanceQueue(profile?.roles ?? [])) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export function AppRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<ProtectedLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="campaigns" element={<PromotionsPage />} />
          <Route path="promotions" element={<PromotionsPage />} />
          <Route element={<SalesRoute />}>
            <Route path="promotions/new" element={<CreatePromotionPage />} />
          </Route>
          <Route path="promotions/:id" element={<PromotionDetailPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/:id" element={<ClientDetailPage />} />
          <Route path="channels" element={<PublishingAccountsPage />} />
          <Route path="publishing-accounts" element={<PublishingAccountsPage />} />
          <Route element={<FinanceRoute />}>
            <Route path="finance" element={<FinancePage />} />
          </Route>
          <Route path="my-work" element={<MyWorkPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route element={<AdministratorRoute />}>
            <Route path="administration" element={<AdministrationPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
