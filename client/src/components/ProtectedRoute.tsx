import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingState } from './ui/Feedback';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../lib/types';

/** Blocks rendering of nested routes until an authenticated session is confirmed. */
export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingState label="Checking session…" />;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
