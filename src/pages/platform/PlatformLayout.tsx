import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { supabase } from '@/integrations/supabase/client';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Building2, CreditCard, Receipt, Megaphone, ShieldAlert, ShieldCheck, LogOut, Wallet, ImagePlus, LifeBuoy, Gift, MessageSquare, Sparkles, Star, Send, UserCircle2, Activity, ClipboardList } from 'lucide-react';
import { BrandLoader } from '@/components/BrandLoader';

const NAV = [
  { to: '/super-admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/super-admin/businesses', label: 'Businesses', icon: Building2 },
  { to: '/super-admin/user-activity', label: 'User Activity', icon: Activity },
  { to: '/super-admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { to: '/super-admin/payments', label: 'Payments', icon: Receipt },
  { to: '/super-admin/payment-methods', label: 'Payment Methods', icon: Wallet },
  { to: '/super-admin/referrals', label: 'Referrals', icon: Gift },
  { to: '/super-admin/ads', label: 'Ads', icon: ImagePlus },
  { to: '/super-admin/ad-applications', label: 'Ad Applications', icon: Sparkles },
  { to: '/super-admin/reviews', label: 'Reviews', icon: Star },
  { to: '/super-admin/sms', label: 'SMS', icon: Send },
  { to: '/super-admin/feedback', label: 'Feedback', icon: MessageSquare },
  { to: '/super-admin/support', label: 'Support', icon: LifeBuoy },
  { to: '/super-admin/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/super-admin/security', label: 'Security (MFA)', icon: ShieldCheck },
  { to: '/super-admin/profile', label: 'Profile', icon: UserCircle2 },
];

type MfaState = 'checking' | 'ok' | 'needs-challenge' | 'needs-enroll';

export default function PlatformLayout() {
  const { user, loading, signOut } = useAuth();
  const { isSuperAdmin, loading: subLoading } = useSubscription();
  const [mfaState, setMfaState] = useState<MfaState>('checking');

  useEffect(() => {
    if (!user || !isSuperAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        const { data: f } = await supabase.auth.mfa.listFactors();
        const verified = (f?.totp ?? []).find((x: any) => x.status === 'verified');
        if (cancelled) return;
        if (!verified) {
          setMfaState('needs-enroll');
        } else if (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
          setMfaState('needs-challenge');
        } else {
          setMfaState('ok');
        }
      } catch {
        if (!cancelled) setMfaState('ok'); // fail-open to avoid lockout if API unreachable
      }
    })();
    return () => { cancelled = true; };
  }, [user, isSuperAdmin]);

  if (loading || subLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><BrandLoader text="Loading..." size="md" /></div>;
  if (!user) return <Navigate to="/super-admin/login" replace />;
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;

  if (mfaState === 'checking') {
    return <div className="min-h-screen flex items-center justify-center bg-background"><BrandLoader text="Verifying security..." size="md" /></div>;
  }
  if (mfaState === 'needs-challenge') return <Navigate to="/super-admin/login?step=mfa" replace />;
  if (mfaState === 'needs-enroll') return <Navigate to="/super-admin/login?step=enroll" replace />;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-60 border-r border-border bg-card/50 flex flex-col">
        <div className="p-4 flex items-center gap-3 border-b border-border">
          <Logo className="h-9 w-9" />
          <div>
            <h2 className="text-sm font-bold tracking-tight">KudiTrack</h2>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Platform Admin</p>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-auto">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`
              }
            >
              <n.icon className="h-4 w-4" /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border space-y-2">
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2 flex items-start gap-2">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-[10px] text-muted-foreground leading-tight">
              Platform-level access. Tenant business data is private.
            </p>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={async () => { await signOut(); window.location.assign('/super-admin/login'); }}>
            <LogOut className="h-4 w-4 mr-2" /> Sign Out
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card/50">
          <div>
            <p className="text-xs text-muted-foreground">Signed in as</p>
            <p className="text-sm font-semibold text-foreground">{user.email}</p>
          </div>
          <ThemeToggle />
        </header>
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
