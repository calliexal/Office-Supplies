import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useAuth } from './AuthProvider';

export const RequireAuth = () => {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') return <FullPageSpinner label="Checking your session" />;
  if (auth.status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
};

export const RequireAdmin = () => {
  const auth = useAuth();
  if (auth.status !== 'authenticated') return <RequireAuth />;
  if (auth.user.role !== 'admin') return <Navigate to="/" replace />;
  return <Outlet />;
};

export const RequireLogistics = () => {
  const auth = useAuth();
  if (auth.status !== 'authenticated') return <RequireAuth />;
  if (auth.user.role !== 'logistics') return <Navigate to="/" replace />;
  return <Outlet />;
};

export const RequireRequester = () => {
  const auth = useAuth();
  if (auth.status !== 'authenticated') return <RequireAuth />;
  if (auth.user.role === 'logistics') return <Navigate to="/deliveries" replace />;
  return <Outlet />;
};

export const useIsLogistics = () => {
  const auth = useAuth();
  return auth.status === 'authenticated' && auth.user.role === 'logistics';
};

export const useIsAdmin = () => {
  const auth = useAuth();
  return auth.status === 'authenticated' && auth.user.role === 'admin';
};

export const RedirectIfAuthenticated = () => {
  const auth = useAuth();
  if (auth.status === 'loading') return <FullPageSpinner label="Checking your session" />;
  if (auth.status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
};
