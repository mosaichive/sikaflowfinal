import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

export interface Business {
  allow_sales_without_stock?: boolean;
  id: string;
  name: string;
  slug: string | null;
  logo_light_url: string | null;
  logo_dark_url: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  number_of_employees: number | null;
  owner_user_id: string | null;
  status: string;
  email_verified: boolean;
  phone_verified: boolean;
}

interface BusinessContextType {
  business: Business | null;
  businessId: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  hasBusiness: boolean;
  isActivated: boolean;
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { user, staffMembership } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const loadSeqRef = useRef(0);

  const ownerUserId = staffMembership?.business_owner_id ?? user?.id ?? null;

  const load = useCallback(async (showLoading = false) => {
    const loadSeq = ++loadSeqRef.current;
    if (!user || !ownerUserId) {
      setBusiness(null);
      setLoading(false);
      hasLoadedOnceRef.current = true;
      return;
    }
    if (showLoading || !hasLoadedOnceRef.current) setLoading(true);

    try {
      const db = supabase as any;
      // For team members, ownerUserId points at the inviting business owner.
      // For owners themselves, it points at their own user id.
      const { data: profile } = await db
        .from('profiles')
        .select('id, business_name, business_type, phone, location, logo_url, onboarding_completed, email, allow_sales_without_stock')
        .eq('id', ownerUserId)
        .maybeSingle();

      if (loadSeq !== loadSeqRef.current) return;

      if (!profile) {
        setBusiness(null);
        return;
      }

      const p = profile as any;
      if (!p.business_name) {
        setBusiness(null);
        return;
      }

      setBusiness({
        id: ownerUserId,
        name: p.business_name,
        slug: null,
        logo_light_url: p.logo_url ?? null,
        logo_dark_url: p.logo_url ?? null,
        email: p.email ?? user.email ?? null,
        phone: p.phone ?? null,
        location: p.location ?? null,
        number_of_employees: null,
        owner_user_id: ownerUserId,
        status: 'active',
        email_verified: true,
        phone_verified: false,
        allow_sales_without_stock: Boolean(p.allow_sales_without_stock),
      });
    } finally {
      if (loadSeq === loadSeqRef.current) {
        setLoading(false);
        hasLoadedOnceRef.current = true;
      }
    }
  }, [user, ownerUserId]);

  useEffect(() => {
    // Reset on user change so a sign-out / sign-in shows the loader once.
    hasLoadedOnceRef.current = false;
    void load(true);
  }, [load]);

  const refresh = useCallback(() => load(false), [load]);

  return (
    <BusinessContext.Provider
      value={{
        business,
        businessId: business?.id ?? null,
        loading,
        refresh,
        hasBusiness: !!business,
        isActivated: business?.status === 'active',
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
}

export const useBusiness = () => {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusiness must be used within BusinessProvider');
  return ctx;
};
