import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

export type PlanKey = 'free_trial' | 'trial' | 'monthly' | 'annual' | 'lifetime';
export type SubStatus = 'trial' | 'active' | 'overdue' | 'expired' | 'suspended' | 'canceled' | 'lifetime';

export interface Subscription {
  id: string;
  plan: PlanKey;
  status: SubStatus;
  price_ghs: number;
  trial_start_date: string | null;
  trial_end_date: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
}

interface SubContextType {
  subscription: Subscription | null;
  loading: boolean;
  hasAccess: boolean;
  isReadOnly: boolean;
  daysRemaining: number | null;
  refresh: () => Promise<void>;
  isSuperAdmin: boolean;
}

const SubContext = createContext<SubContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (authLoading) return;

    if (!user) {
      setSubscription(null);
      setIsSuperAdmin(false);
      setLoading(false);
      return;
    }

    const { data: superRow } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', user.id)
      .eq('role', 'super_admin' as any)
      .maybeSingle();
    setIsSuperAdmin(!!superRow);

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, subscription_plan, subscription_status, subscription_start_date, subscription_end_date, trial_start_date, trial_end_date')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    const planRaw = (profile.subscription_plan as string) ?? 'trial';
    const statusRaw = (profile.subscription_status as string) ?? 'trial';
    const plan = (planRaw === 'trial' ? 'free_trial' : planRaw) as PlanKey;

    setSubscription({
      id: profile.id,
      plan,
      status: statusRaw as SubStatus,
      price_ghs: plan === 'monthly' ? 50 : plan === 'annual' ? 500 : 0,
      trial_start_date: profile.trial_start_date,
      trial_end_date: profile.trial_end_date,
      current_period_start: profile.subscription_start_date,
      current_period_end: profile.subscription_end_date,
    });
    setLoading(false);
  }, [user, authLoading]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`subscription:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        () => { void load(); },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [user, load]);

  const computeAccess = (): { hasAccess: boolean; daysRemaining: number | null } => {
    if (!subscription) return { hasAccess: false, daysRemaining: null };
    if (subscription.status === 'lifetime') return { hasAccess: true, daysRemaining: null };
    const endRaw = subscription.status === 'trial' ? subscription.trial_end_date : subscription.current_period_end;
    const days = endRaw ? Math.ceil((new Date(endRaw).getTime() - Date.now()) / 86400000) : null;
    if (subscription.status === 'trial' && subscription.trial_end_date && new Date(subscription.trial_end_date) > new Date())
      return { hasAccess: true, daysRemaining: days };
    if (subscription.status === 'active' && (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date()))
      return { hasAccess: true, daysRemaining: days };
    return { hasAccess: false, daysRemaining: days };
  };

  const { hasAccess, daysRemaining } = computeAccess();
  const isReadOnly = !hasAccess && !!subscription;

  return (
    <SubContext.Provider value={{
      subscription, loading, hasAccess, isReadOnly, daysRemaining,
      refresh: load, isSuperAdmin,
    }}>
      {children}
    </SubContext.Provider>
  );
}

export const useSubscription = () => {
  const ctx = useContext(SubContext);
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider');
  return ctx;
};

export const PLAN_LABELS: Record<PlanKey, string> = {
  free_trial: '30-Day Free Trial',
  trial: '30-Day Free Trial',
  monthly: 'Monthly',
  annual: 'Annual',
  lifetime: 'Lifetime',
};

export const PLAN_PRICES: Record<PlanKey, number> = {
  free_trial: 0, trial: 0, monthly: 50, annual: 500, lifetime: 0,
};

export const STATUS_LABELS: Record<SubStatus, string> = {
  trial: 'Free Trial', active: 'Active', overdue: 'Overdue',
  expired: 'Expired', suspended: 'Suspended', canceled: 'Canceled', lifetime: 'Lifetime',
};
