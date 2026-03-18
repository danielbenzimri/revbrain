import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore, useIsAuthenticated } from '@/stores/auth-store';
import type { UserRole } from '@/types/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: UserRole[];
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const isAuthenticated = useIsAuthenticated();
  const isLoading = useAuthStore((state) => state.isLoading);
  const user = useAuthStore((state) => state.user);
  const location = useLocation();

  // Wait for auth to initialize before making redirect decisions
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to login, preserving the attempted URL
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRoles && user && !requiredRoles.includes(user.role)) {
    // Redirect to dashboard if role is not allowed
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
