import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { clearPendingReferralToken, getOrCreateReferralDeviceId, getPendingReferralToken } from '@/lib/referrals';
import { runSaleItemsSchemaCheck } from '@/lib/sale-items-schema';
import { ALL_MODULES, modulesForRole, type ModuleKey } from '@/lib/permissions';

export type AppRole = 'admin' | 'manager' | 'staff' | 'super_admin' | 'salesperson' | 'cashier' | 'distributor' | 'business_owner';

export interface StaffMembership {
  business_owner_id: string;
  role: string;
  modules: ModuleKey[];
  active: boolean;
}

interface ProfileData {
  display_name: string;
  avatar_url: string;
  title: string;
  phone: string;
  bio: string;
  onboarding_completed: boolean;
  phone_verified: boolean;
  phone_verified_at: string | null;
  last_verified_phone: string | null;
}

function isMissingProfileColumnError(error: unknown, column: string) {
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();
  const details = String((error as { details?: string } | null)?.details || '').toLowerCase();
  const target = column.toLowerCase();
  return (
    (message.includes(target) && (message.includes('schema cache') || message.includes('column'))) ||
    (details.includes(target) && (details.includes('schema cache') || details.includes('column')))
  );
}

export interface AppUser {
  id: string;
  email: string;
  user_metadata: {
    display_name?: string;
    avatar_url?: string;
    full_name?: string;
  };
}

interface AppSession {
  userId: string;
}

interface AuthContextType {
  user: AppUser | null;
  session: AppSession | null;
  loading: boolean;
  role: AppRole | null;
  displayName: string;
  avatarUrl: string;
  profileTitle: string;
  profilePhone: string;
  profileBio: string;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isAdmin: boolean;
  isManager: boolean;
  isSalesperson: boolean;
  isDistributor: boolean;
  isSuperAdmin: boolean;
  onboardingCompleted: boolean;
  staffMembership: StaffMembership | null;
  isStaffMember: boolean;
  effectiveBusinessOwnerId: string | null;
  hasModule: (m: ModuleKey) => boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  phoneVerifiedAt: string | null;
  lastVerifiedPhone: string | null;
}

const emptyProfile: ProfileData = {
  display_name: '',
  avatar_url: '',
  title: '',
  phone: '',
  bio: '',
  onboarding_completed: false,
  phone_verified: false,
  phone_verified_at: null,
  last_verified_phone: null,
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<ProfileData>(emptyProfile);
  const [staffMembership, setStaffMembership] = useState<StaffMembership | null>(null);

  const fetchStaffMembership = useCallback(async (userId: string) => {
    const { data } = await (supabase as any)
      .from('staff_members')
      .select('business_owner_id, permissions, active')
      .eq('staff_user_id', userId)
      .eq('active', true)
      .maybeSingle();

    if (!data) {
      setStaffMembership(null);
      return null;
    }
    const perms = (data.permissions || {}) as { role?: string; modules?: ModuleKey[] };
    const membership: StaffMembership = {
      business_owner_id: data.business_owner_id,
      role: perms.role || 'staff',
      modules: Array.isArray(perms.modules) && perms.modules.length > 0 ? perms.modules : modulesForRole(perms.role || 'staff'),
      active: data.active,
    };
    setStaffMembership(membership);
    return membership;
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const user = useMemo<AppUser | null>(() => {
    const authUser = session?.user;
    if (!authUser) return null;

    const displayName =
      authUser.user_metadata?.display_name ||
      authUser.user_metadata?.full_name ||
      authUser.email?.split('@')[0] ||
      'User';

    return {
      id: authUser.id,
      email: authUser.email ?? '',
      user_metadata: {
        display_name: displayName,
        avatar_url: authUser.user_metadata?.avatar_url,
        full_name: authUser.user_metadata?.full_name,
      },
    };
  }, [session]);

  const fetchRole = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    if (error) {
      console.warn('Unable to load user role. Check Supabase auth and RLS policies.', error.message);
      setRole(null);
      return null;
    }

    const roles = ((data || []) as Array<{ role: AppRole }>).map((row) => row.role);
    const priority: AppRole[] = ['super_admin', 'admin', 'business_owner', 'manager', 'salesperson', 'cashier', 'distributor', 'staff'];
    const nextRole = priority.find((candidate) => roles.includes(candidate)) || null;
    setRole(nextRole);
    return nextRole;
  }, []);

  const fetchProfile = useCallback(async (userId?: string) => {
    const uid = userId || user?.id;
    if (!uid) return { found: false, error: false };

    const db = supabase as any;
    let { data, error } = await db
      .from('profiles')
      .select('display_name, avatar_url, title, phone, bio, onboarding_completed, phone_verified, phone_verified_at, last_verified_phone')
      .eq('id', uid)
      .maybeSingle();

    if (error && isMissingProfileColumnError(error, 'onboarding_completed')) {
      const fallbackResult = await db
        .from('profiles')
        .select('display_name, avatar_url, title, phone, bio')
        .eq('id', uid)
        .maybeSingle();
      data = fallbackResult.data ? { ...(fallbackResult.data as any), onboarding_completed: false } : null;
      error = fallbackResult.error;
    }

    if (error) {
      console.warn('Unable to load user profile. Check Supabase auth and RLS policies.', error.message);
      setProfile(emptyProfile);
      return { found: false, error: true };
    }

    const row = data as any;
    setProfile(row ? {
      display_name: row.display_name || '',
      avatar_url: row.avatar_url || '',
      title: row.title || '',
      phone: row.phone || '',
      bio: row.bio || '',
      onboarding_completed: Boolean(row.onboarding_completed),
      phone_verified: Boolean(row.phone_verified),
      phone_verified_at: row.phone_verified_at || null,
      last_verified_phone: row.last_verified_phone || null,
    } : emptyProfile);
    return { found: !!data, error: false };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadUserData() {
      if (authLoading) return;

      if (!user) {
        setRole(null);
        setProfile(emptyProfile);
        setStaffMembership(null);
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      const [nextRole, profileResult, membership] = await Promise.all([
        fetchRole(user.id),
        fetchProfile(user.id),
        fetchStaffMembership(user.id),
      ]);

      // A genuinely missing profile + no role + no staff membership means
      // the account was deleted. Otherwise (team member just signed in)
      // keep them signed in.
      if (!cancelled && profileResult && !profileResult.found && !profileResult.error && !nextRole && !membership) {
        await supabase.auth.signOut();
        if (typeof window !== 'undefined') {
          window.location.replace('/#/sign-in?reason=removed');
        }
        return;
      }

      if (!cancelled) setProfileLoading(false);
    }

    void loadUserData();

    return () => {
      cancelled = true;
    };
  }, [authLoading, fetchProfile, fetchRole, fetchStaffMembership, user]);

  const userId = user?.id ?? null;

  // Live sync: when super admin updates this user's profile, role, or
  // payment status, refresh immediately. If the user is deleted, sign out.
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`auth-user-sync-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, async (payload) => {
        if (payload.eventType === 'DELETE') {
          await supabase.auth.signOut();
          if (typeof window !== 'undefined') window.location.replace('/sign-in?reason=removed');
          return;
        }
        await fetchProfile(userId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles', filter: `user_id=eq.${userId}` }, () => {
        void fetchRole(userId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscription_payments', filter: `user_id=eq.${userId}` }, () => {
        // Trigger downstream refresh by re-reading the profile (subscription fields live there).
        void fetchProfile(userId);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, fetchProfile, fetchRole]);


  useEffect(() => {
    if (!userId) return;

    const syncReferral = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('claim-referral', {
          body: {
            device_id: getOrCreateReferralDeviceId(),
            referral_token: getPendingReferralToken() || undefined,
          },
        });
        if (error) return;
        if ((data as any)?.has_referral || (data as any)?.claimed) {
          clearPendingReferralToken();
        }
      } catch (syncError) {
        console.warn('Referral sync failed', syncError);
      }
    };

    void syncReferral();
  }, [userId]);

  // One-time schema sanity check for admins. Logs to the browser console
  // when the live `sale_items` schema doesn't match what the code expects.
  // Helps catch deployment/migration drift before users hit a runtime error.
  const isAdminUser =
    role === 'admin' || role === 'business_owner' || role === 'super_admin';
  useEffect(() => {
    if (!userId || !isAdminUser) return;
    void runSaleItemsSchemaCheck();
  }, [userId, isAdminUser]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const displayName = profile.display_name || user?.user_metadata.display_name || '';
  const avatarUrl = profile.avatar_url || user?.user_metadata.avatar_url || '';

  const isAdmin = role === 'admin' || role === 'business_owner' || (staffMembership?.role === 'admin');
  const isSuperAdmin = role === 'super_admin';
  const isStaffMember = !!staffMembership;
  const effectiveBusinessOwnerId = staffMembership ? staffMembership.business_owner_id : (user?.id ?? null);

  const hasModule = useCallback((m: ModuleKey) => {
    if (isSuperAdmin || isAdmin) return true;
    // Owners (no staff membership) get everything; staff get only their listed modules.
    if (!staffMembership) return true;
    return staffMembership.modules.includes(m);
  }, [isAdmin, isSuperAdmin, staffMembership]);

  return (
    <AuthContext.Provider value={{
      user,
      session: user ? { userId: user.id } : null,
      loading: authLoading || profileLoading,
      role,
      displayName,
      avatarUrl,
      profileTitle: profile.title,
      profilePhone: profile.phone,
      profileBio: profile.bio,
      signOut,
      refreshProfile: async () => {
        const userId = user?.id ?? (await supabase.auth.getUser()).data.user?.id;
        if (!userId) return;
        await Promise.all([fetchProfile(userId), fetchRole(userId), fetchStaffMembership(userId)]);
      },
      isAdmin,
      isManager: role === 'manager' || staffMembership?.role === 'manager',
      isSalesperson: role === 'salesperson' || role === 'cashier' || staffMembership?.role === 'salesperson' || staffMembership?.role === 'cashier',
      isDistributor: role === 'distributor' || staffMembership?.role === 'distributor',
      isSuperAdmin,
      onboardingCompleted: profile.onboarding_completed || isStaffMember,
      staffMembership,
      isStaffMember,
      effectiveBusinessOwnerId,
      hasModule,
      emailVerified: Boolean((session?.user as any)?.email_confirmed_at) || Boolean((session?.user as any)?.confirmed_at),
      phoneVerified: profile.phone_verified,
      phoneVerifiedAt: profile.phone_verified_at,
      lastVerifiedPhone: profile.last_verified_phone,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
