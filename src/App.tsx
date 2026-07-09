import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth, type AppRole } from "@/context/AuthContext";
import { BusinessProvider, useBusiness } from "@/context/BusinessContext";
import { BusinessFinancialsProvider } from "@/context/BusinessFinancialsContext";
import { SubscriptionProvider, useSubscription } from "@/context/SubscriptionContext";
import { BrandLoader } from "./components/BrandLoader";
import { RequireModule } from "./components/RequireModule";
import { MarketingLayout } from "./components/marketing/MarketingLayout";
import { getFirstAssignedModulePath } from "@/lib/module-navigation";

const SignInPage = lazy(() => import("./pages/SignInPage").then((m) => ({ default: m.SignInPage })));
const SignUpPage = lazy(() => import("./pages/SignInPage").then((m) => ({ default: m.SignUpPage })));
const AuthCallbackPage = lazy(() => import("./pages/AuthCallbackPage"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const SalesPage = lazy(() => import("./pages/SalesPage"));
const ProductsPage = lazy(() => import("./pages/ProductsPage"));
const InventoryPage = lazy(() => import("./pages/InventoryPage"));
const CustomersPage = lazy(() => import("./pages/CustomersPage"));
const ExpensesPage = lazy(() => import("./pages/ExpensesPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const SavingsPage = lazy(() => import("./pages/SavingsPage"));
const BillingPage = lazy(() => import("./pages/BillingPage"));
const SupportPage = lazy(() => import("./pages/SupportPage"));
const OtherIncomePage = lazy(() => import("./pages/OtherIncomePage"));
const OrdersPage = lazy(() => import("./pages/OrdersPage"));
const StaffUsersPage = lazy(() => import("./pages/StaffUsersPage"));
const TenantAnnouncementsPage = lazy(() => import("./pages/AnnouncementsPage"));
const PlatformLayout = lazy(() => import("./pages/platform/PlatformLayout"));
const PlatformDashboard = lazy(() => import("./pages/platform/PlatformDashboard"));
const BusinessesPage = lazy(() => import("./pages/platform/BusinessesPage"));
const SubscriptionsPage = lazy(() => import("./pages/platform/SubscriptionsPage"));
const PaymentsPage = lazy(() => import("./pages/platform/PaymentsPage"));
const PaymentMethodsPage = lazy(() => import("./pages/platform/PaymentMethodsPage"));
const PlatformAnnouncementsPage = lazy(() => import("./pages/platform/AnnouncementsPage"));
const AdsPage = lazy(() => import("./pages/platform/AdsPage"));
const ReferralsPage = lazy(() => import("./pages/platform/ReferralsPage"));
const PlatformSupportPage = lazy(() => import("./pages/platform/PlatformSupportPage"));
const PlatformFeedbackPage = lazy(() => import("./pages/platform/FeedbackPage"));
const PlatformAdApplicationsPage = lazy(() => import("./pages/platform/AdApplicationsPage"));
const PlatformReviewsPage = lazy(() => import("./pages/platform/ReviewsPage"));
const PlatformSmsPage = lazy(() => import("./pages/platform/SmsPage"));
const PlatformSecurityMfaPage = lazy(() => import("./pages/platform/SecurityMfaPage"));
const SuperAdminLoginPage = lazy(() => import("./pages/platform/SuperAdminLoginPage"));
const PlatformProfilePage = lazy(() => import("./pages/platform/ProfilePage"));
const PlatformUserActivityPage = lazy(() => import("./pages/platform/UserActivityPage"));
const PlatformSurveysPage = lazy(() => import("./pages/platform/SurveysPage"));
const PlatformSurveyResponsesPage = lazy(() => import("./pages/platform/SurveyResponsesPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const InviteAcceptPage = lazy(() => import("./pages/InviteAcceptPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const StorePage = lazy(() => import("./pages/StorePage"));
const TrackOrderPage = lazy(() => import("./pages/TrackOrderPage"));

const MarketingHome = lazy(() => import("./pages/marketing/HomePage"));
const RefundPolicyPage = lazy(() => import("./pages/marketing/RefundPolicyPage"));

function MarketingOrDashboard() {
  const { user, loading, staffMembership } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><BrandLoader text="Loading..." size="md" /></div>;
  if (user) return <Navigate to={getStaffHomePath(staffMembership)} replace />;
  return <MarketingHome />;
}


const queryClient = new QueryClient();

function getRoleHomePath(role: AppRole | null, isSuperAdmin: boolean) {
  if (isSuperAdmin || role === 'super_admin') return '/super-admin';
  if (role === 'salesperson' || role === 'cashier') return '/sales';
  if (role === 'distributor') return '/inventory';
  return '/dashboard';
}

function getStaffHomePath(staffMembership: ReturnType<typeof useAuth>['staffMembership']) {
  if (!staffMembership) return '/dashboard';
  return getFirstAssignedModulePath(staffMembership.modules) ?? '/dashboard';
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

  if (adminOnly && !isAdmin) {
    return <Navigate to={staffMembership ? getStaffHomePath(staffMembership) : getRoleHomePath(role, isSuperAdmin)} replace />;
  }
  // For staff members the user_roles.role is always 'staff'; their real
  // working role comes from staff_members.permissions.role. Map that into
  // the effective role used for allowedRoles checks. business_owner is
  // treated as admin for tenant pages.
  let effectiveRole: AppRole | null = role === 'business_owner' ? 'admin' : role;
  if (staffMembership) {
    effectiveRole = (staffMembership.role as AppRole) || effectiveRole;
  }
  if (allowedRoles && (!effectiveRole || !allowedRoles.includes(effectiveRole))) {
    return <Navigate to={staffMembership ? getStaffHomePath(staffMembership) : getRoleHomePath(role, isSuperAdmin)} replace />;
  }
  return <>{children}</>;
}


function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, staffMembership } = useAuth();
  const { isSuperAdmin, loading: subLoading } = useSubscription();
  const location = useLocation();
  if (loading || subLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><BrandLoader text="Loading..." size="md" /></div>;
  if (user && isSuperAdmin) return <Navigate to="/super-admin" replace />;
  if (user) {
    // If they were redirected here from a protected route, return to that page.
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && !from.startsWith('/sign-') && from !== '/auth' ? from : getStaffHomePath(staffMembership)} replace />;
  }
  return <>{children}</>;
}

function RouteLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <BrandLoader text="Loading..." size="md" />
    </div>
  );
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
                <Suspense fallback={<RouteLoader />}>
                <Routes>
                <Route path="/sign-in/*" element={<AuthRoute><SignInPage /></AuthRoute>} />
                <Route path="/sign-up/*" element={<AuthRoute><SignUpPage /></AuthRoute>} />
                <Route path="/auth/callback" element={<AuthCallbackPage />} />
                <Route path="/auth/*" element={<Navigate to="/sign-in" replace />} />
                <Route path="/invite/:token" element={<InviteAcceptPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/phone-login" element={<Navigate to="/sign-in" replace />} />
                <Route path="/change-password" element={<Navigate to="/dashboard" replace />} />
                <Route path="/verify" element={<Navigate to="/dashboard" replace />} />

                {/* Public customer-facing store & tracking */}
                <Route path="/store/:slug" element={<StorePage />} />
                <Route path="/track/:code" element={<TrackOrderPage />} />

                {/* Platform Super Admin */}
                <Route path="/platform/*" element={<Navigate to="/super-admin" replace />} />
                <Route path="/super-admin/login" element={<SuperAdminLoginPage />} />
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
                  <Route path="reviews" element={<PlatformReviewsPage />} />
                  <Route path="sms" element={<PlatformSmsPage />} />
                  <Route path="security" element={<PlatformSecurityMfaPage />} />
                  <Route path="profile" element={<PlatformProfilePage />} />
                  <Route path="user-activity" element={<PlatformUserActivityPage />} />
                  <Route path="surveys" element={<PlatformSurveysPage />} />
                  <Route path="survey-responses" element={<PlatformSurveyResponsesPage />} />
                </Route>

                {/* Public marketing site */}
                <Route element={<MarketingLayout />}>
                  <Route path="/" element={<MarketingOrDashboard />} />
                  <Route path="/features" element={<MarketingHome />} />
                  <Route path="/pricing" element={<Navigate to="/" replace />} />
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
                <Route path="/damaged-goods" element={<Navigate to="/inventory" replace />} />
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
                </Suspense>
              </BrowserRouter>
            </SubscriptionProvider>
          </BusinessFinancialsProvider>
        </BusinessProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
