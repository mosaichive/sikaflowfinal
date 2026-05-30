import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth, type AppRole } from "@/context/AuthContext";
import { BusinessProvider, useBusiness } from "@/context/BusinessContext";
import { BusinessFinancialsProvider } from "@/context/BusinessFinancialsContext";
import { SubscriptionProvider, useSubscription } from "@/context/SubscriptionContext";
import { SignInPage, SignUpPage } from "./pages/SignInPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import Dashboard from "./pages/Dashboard";
import SalesPage from "./pages/SalesPage";
import ProductsPage from "./pages/ProductsPage";
import InventoryPage from "./pages/InventoryPage";
import CustomersPage from "./pages/CustomersPage";
import ExpensesPage from "./pages/ExpensesPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import SavingsPage from "./pages/SavingsPage";
import BillingPage from "./pages/BillingPage";
import SupportPage from "./pages/SupportPage";
import OtherIncomePage from "./pages/OtherIncomePage";
import OrdersPage from "./pages/OrdersPage";
import StaffUsersPage from "./pages/StaffUsersPage";
import TenantAnnouncementsPage from "./pages/AnnouncementsPage";
import PlatformLayout from "./pages/platform/PlatformLayout";
import PlatformDashboard from "./pages/platform/PlatformDashboard";
import BusinessesPage from "./pages/platform/BusinessesPage";
import SubscriptionsPage from "./pages/platform/SubscriptionsPage";
import PaymentsPage from "./pages/platform/PaymentsPage";
import PaymentMethodsPage from "./pages/platform/PaymentMethodsPage";
import PlatformAnnouncementsPage from "./pages/platform/AnnouncementsPage";
import AdsPage from "./pages/platform/AdsPage";
import ReferralsPage from "./pages/platform/ReferralsPage";
import PlatformSupportPage from "./pages/platform/PlatformSupportPage";
import NotFound from "./pages/NotFound";
import InviteAcceptPage from "./pages/InviteAcceptPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import PhoneLoginPage from "./pages/PhoneLoginPage";
import { BrandLoader } from "./components/BrandLoader";
import { RequireModule } from "./components/RequireModule";
import { MarketingLayout } from "./components/marketing/MarketingLayout";
import MarketingHome from "./pages/marketing/HomePage";
import PlatformFeedbackPage from "./pages/platform/FeedbackPage";
import PlatformAdApplicationsPage from "./pages/platform/AdApplicationsPage";

function MarketingOrDashboard() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><BrandLoader text="Loading..." size="md" /></div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return <MarketingHome />;
}


const queryClient = new QueryClient();

function getRoleHomePath(role: AppRole | null, isSuperAdmin: boolean) {
  if (isSuperAdmin || role === 'super_admin') return '/super-admin';
  if (role === 'salesperson') return '/sales';
  if (role === 'distributor') return '/inventory';
  return '/dashboard';
}

function ProtectedRoute({
  children,
  adminOnly = false,
  allowedRoles,
  allowReadOnly = false,
  allowOnboarding = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
  allowedRoles?: AppRole[];
  allowReadOnly?: boolean;
  allowOnboarding?: boolean;
}) {
  const { user, loading, isAdmin, role, staffMembership } = useAuth();
  const { business, loading: bizLoading } = useBusiness();
  const { hasAccess, subscription, loading: subLoading, isSuperAdmin } = useSubscription();
  const location = useLocation();

  if (loading || bizLoading || subLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><BrandLoader text="Loading..." size="md" /></div>;
  }
  if (!user) return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  if (isSuperAdmin) return <Navigate to="/super-admin" replace />;
  // Only force users without a business back to /dashboard if they're not already there.
  if (!business && !allowOnboarding && location.pathname !== '/dashboard') {
    return <Navigate to="/dashboard" replace />;
  }

  if (subscription && !hasAccess && !allowReadOnly) {
    return <Navigate to="/billing" replace />;
  }

  if (adminOnly && !isAdmin) return <Navigate to={getRoleHomePath(role, isSuperAdmin)} replace />;
  // For staff members the user_roles.role is always 'staff'; their real
  // working role comes from staff_members.permissions.role. Map that into
  // the effective role used for allowedRoles checks. business_owner is
  // treated as admin for tenant pages.
  let effectiveRole: AppRole | null = role === 'business_owner' ? 'admin' : role;
  if (staffMembership) {
    effectiveRole = (staffMembership.role as AppRole) || effectiveRole;
  }
  if (allowedRoles && (!effectiveRole || !allowedRoles.includes(effectiveRole))) return <Navigate to={getRoleHomePath(role, isSuperAdmin)} replace />;
  return <>{children}</>;
}


function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isSuperAdmin, loading: subLoading } = useSubscription();
  const location = useLocation();
  if (loading || subLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><BrandLoader text="Loading..." size="md" /></div>;
  if (user && isSuperAdmin) return <Navigate to="/super-admin" replace />;
  if (user) {
    // If they were redirected here from a protected route, return to that page.
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && !from.startsWith('/sign-') && from !== '/auth' ? from : '/dashboard'} replace />;
  }
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <BusinessProvider>
          <BusinessFinancialsProvider>
            <SubscriptionProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Routes>
                <Route path="/sign-in/*" element={<AuthRoute><SignInPage /></AuthRoute>} />
                <Route path="/sign-up/*" element={<AuthRoute><SignUpPage /></AuthRoute>} />
                <Route path="/auth/callback" element={<AuthCallbackPage />} />
                <Route path="/auth/*" element={<Navigate to="/sign-in" replace />} />
                <Route path="/invite/:token" element={<InviteAcceptPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/phone-login" element={<PhoneLoginPage />} />
                <Route path="/change-password" element={<Navigate to="/dashboard" replace />} />
                <Route path="/verify" element={<Navigate to="/dashboard" replace />} />

                {/* Platform Super Admin */}
                <Route path="/platform/*" element={<Navigate to="/super-admin" replace />} />
                <Route path="/super-admin" element={<PlatformLayout />}>
                  <Route index element={<PlatformDashboard />} />
                  <Route path="businesses" element={<BusinessesPage />} />
                  <Route path="subscriptions" element={<SubscriptionsPage />} />
                  <Route path="payments" element={<PaymentsPage />} />
                  <Route path="payment-methods" element={<PaymentMethodsPage />} />
                  <Route path="referrals" element={<ReferralsPage />} />
                  <Route path="ads" element={<AdsPage />} />
                  <Route path="support" element={<PlatformSupportPage />} />
                  <Route path="announcements" element={<PlatformAnnouncementsPage />} />
                  <Route path="feedback" element={<PlatformFeedbackPage />} />
                  <Route path="ad-applications" element={<PlatformAdApplicationsPage />} />
                </Route>

                {/* Public marketing site */}
                <Route element={<MarketingLayout />}>
                  <Route path="/" element={<MarketingOrDashboard />} />
                  <Route path="/features" element={<MarketingHome />} />
                  <Route path="/pricing" element={<MarketingHome />} />
                  <Route path="/reviews" element={<MarketingHome />} />
                  <Route path="/advertise" element={<MarketingHome />} />
                  <Route path="/contact" element={<MarketingHome />} />
                  <Route path="/feedback" element={<MarketingHome />} />
                </Route>

                {/* Tenant app */}
                <Route path="/dashboard" element={<ProtectedRoute allowReadOnly allowOnboarding><RequireModule module="dashboard"><Dashboard /></RequireModule></ProtectedRoute>} />
                <Route path="/sales" element={<ProtectedRoute><RequireModule module="sales"><SalesPage /></RequireModule></ProtectedRoute>} />
                <Route path="/products" element={<ProtectedRoute><RequireModule module="products"><ProductsPage /></RequireModule></ProtectedRoute>} />
                <Route path="/inventory" element={<ProtectedRoute><RequireModule module="inventory"><InventoryPage /></RequireModule></ProtectedRoute>} />
                <Route path="/customers" element={<ProtectedRoute><RequireModule module="customers"><CustomersPage /></RequireModule></ProtectedRoute>} />
                <Route path="/orders" element={<ProtectedRoute><RequireModule module="orders"><OrdersPage /></RequireModule></ProtectedRoute>} />
                <Route path="/other-income" element={<ProtectedRoute><RequireModule module="other_income"><OtherIncomePage /></RequireModule></ProtectedRoute>} />
                <Route path="/expenses" element={<ProtectedRoute><RequireModule module="expenses"><ExpensesPage /></RequireModule></ProtectedRoute>} />
                <Route path="/reports" element={<ProtectedRoute><RequireModule module="reports"><ReportsPage /></RequireModule></ProtectedRoute>} />
                <Route path="/staff" element={<ProtectedRoute adminOnly><RequireModule module="staff"><StaffUsersPage /></RequireModule></ProtectedRoute>} />
                <Route path="/announcements" element={<ProtectedRoute allowReadOnly allowOnboarding><RequireModule module="announcements"><TenantAnnouncementsPage /></RequireModule></ProtectedRoute>} />
                <Route path="/support" element={<ProtectedRoute allowReadOnly allowOnboarding><SupportPage /></ProtectedRoute>} />
                <Route path="/savings" element={<ProtectedRoute><RequireModule module="savings"><SavingsPage /></RequireModule></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute allowReadOnly allowOnboarding><SettingsPage /></ProtectedRoute>} />
                <Route path="/billing" element={<ProtectedRoute adminOnly allowReadOnly><BillingPage /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </SubscriptionProvider>
          </BusinessFinancialsProvider>
        </BusinessProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
