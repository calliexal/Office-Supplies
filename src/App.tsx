import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthProvider';
import { RedirectIfAuthenticated, RequireAdmin, RequireAuth } from '@/auth/RequireAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { FullPageSpinner, Spinner } from '@/components/ui/Spinner';

const LoginPage = lazy(() => import('@/features/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const SuppliesPage = lazy(() => import('@/features/supplies/SuppliesPage').then((m) => ({ default: m.SuppliesPage })));
const HistoryPage = lazy(() => import('@/features/requests/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const ApprovalsPage = lazy(() => import('@/features/approvals/ApprovalsPage').then((m) => ({ default: m.ApprovalsPage })));

const PageFallback = () => (
  <div className="grid min-h-[50vh] place-items-center">
    <Spinner className="size-8 text-navy" label="Loading page" />
  </div>
);

const NotFound = () => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
    <h1 className="font-display text-2xl font-bold text-navy">Page not found</h1>
    <p className="text-sm text-ink-500">The page you’re looking for doesn’t exist or was moved.</p>
    <Link to="/" className="text-sm font-semibold text-brand hover:underline">
      Back to Dashboard
    </Link>
  </div>
);

export const App = () => (
  <AuthProvider>
    <Routes>
      <Route element={<RedirectIfAuthenticated />}>
        <Route
          path="/login"
          element={
            <Suspense fallback={<FullPageSpinner label="Loading" />}>
              <LoginPage />
            </Suspense>
          }
        />
      </Route>
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<Suspense fallback={<PageFallback />}><DashboardPage /></Suspense>} />
          <Route path="supplies" element={<Suspense fallback={<PageFallback />}><SuppliesPage /></Suspense>} />
          <Route path="history" element={<Suspense fallback={<PageFallback />}><HistoryPage /></Suspense>} />
          <Route element={<RequireAdmin />}>
            <Route path="approvals" element={<Suspense fallback={<PageFallback />}><ApprovalsPage /></Suspense>} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  </AuthProvider>
);
