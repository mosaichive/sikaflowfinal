import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getFirstAssignedModulePath } from '@/lib/module-navigation';
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
  const { hasModule, loading, isStaffMember, staffMembership } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (hasModule(module)) return <>{children}</>;

  if (isStaffMember) {
    const fallbackPath = getFirstAssignedModulePath(staffMembership?.modules);
    if (fallbackPath && fallbackPath !== location.pathname) {
      return <Navigate to={fallbackPath} replace />;
    }

    return (
      <main className="min-h-screen bg-background px-4 py-10 text-foreground">
        <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center">
          <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
            <h1 className="text-lg font-semibold">No assigned sections</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              No sections have been assigned to your account yet. Please contact your company owner.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return <Navigate to="/dashboard" replace />;
}
