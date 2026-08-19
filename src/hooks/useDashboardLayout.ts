import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { defaultDashboardLayout, normalizeLayout, type WidgetLayoutItem } from '@/lib/dashboard-widgets';

export function useDashboardLayout() {
  const { user } = useAuth();
  const { businessId } = useBusiness();
  const [layout, setLayout] = useState<WidgetLayoutItem[]>(() => defaultDashboardLayout());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const userId = user?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setLayout(defaultDashboardLayout());
      setLoading(false);
      return;
    }

    setLoading(true);
    void (async () => {
      let query = supabase
        .from('dashboard_preferences')
        .select('layout')
        .eq('user_id', userId);
      query = businessId ? query.eq('business_id', businessId) : query.is('business_id', null);
      const { data } = await query.maybeSingle();
      if (cancelled) return;
      setLayout(normalizeLayout(data?.layout));
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [userId, businessId]);

  const save = useCallback(async (next: WidgetLayoutItem[]) => {
    setLayout(next);
    if (!userId) return false;
    setSaving(true);
    try {
      let query = supabase
        .from('dashboard_preferences')
        .select('id')
        .eq('user_id', userId);
      query = businessId ? query.eq('business_id', businessId) : query.is('business_id', null);
      const { data: existing } = await query.maybeSingle();

      const payload = { user_id: userId, business_id: businessId, layout: next as any };
      const { error } = existing?.id
        ? await supabase.from('dashboard_preferences').update({ layout: next as any }).eq('id', existing.id)
        : await supabase.from('dashboard_preferences').insert(payload);

      return !error;
    } finally {
      setSaving(false);
    }
  }, [userId, businessId]);

  const resetToDefault = useCallback(async () => save(defaultDashboardLayout()), [save]);

  return { layout, loading, saving, save, resetToDefault };
}
