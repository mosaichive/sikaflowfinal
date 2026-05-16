import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import type { ModuleKey } from '@/lib/permissions';

interface Props {
  module: ModuleKey;
  children: React.ReactNode;
}

/**
 * Gate a route by module permission. Owners/admins/super_admins always pass.
 * Team members must have the module listed in their staff_members permissions.
 */
export function RequireModule({ module, children }: Props) {
  const { hasModule, loading } = useAuth();
  if (loading) return null;
  if (!hasModule(module)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
