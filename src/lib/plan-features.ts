// Feature registry & tier resolution for KudiTrack plans.
//
// Backward-compatibility rule: legacy plans (trial, free_trial, monthly,
// annual, lifetime) that existed before the 3-tier launch are grandfathered
// into ALL features so existing subscribers never lose access. Only NEW
// signups on `starter` / `business` / `business_plus` are feature-gated.

export type PlanTier = 'starter' | 'business' | 'business_plus';
export type AnyPlan =
  | 'trial'
  | 'free_trial'
  | 'monthly'
  | 'annual'
  | 'lifetime'
  | PlanTier;

export type FeatureKey =
  // Starter+
  | 'sales'
  | 'inventory'
  | 'expenses'
  | 'customers'
  | 'basic_reports'
  // Business+
  | 'advanced_reports'
  | 'sms_notifications'
  | 'unlimited_staff'
  | 'team_management'
  | 'business_insights'
  | 'export_reports'
  // Business Plus only
  | 'online_store'
  | 'order_tracking'
  | 'delivery_management'
  | 'paystack_checkout'
  | 'carrier_info';

const FEATURES_BY_TIER: Record<PlanTier, FeatureKey[]> = {
  starter: ['sales', 'inventory', 'expenses', 'customers', 'basic_reports'],
  business: [
    'sales', 'inventory', 'expenses', 'customers', 'basic_reports',
    'advanced_reports', 'sms_notifications', 'unlimited_staff',
    'team_management', 'business_insights', 'export_reports',
  ],
  business_plus: [
    'sales', 'inventory', 'expenses', 'customers', 'basic_reports',
    'advanced_reports', 'sms_notifications', 'unlimited_staff',
    'team_management', 'business_insights', 'export_reports',
    'online_store', 'order_tracking', 'delivery_management',
    'paystack_checkout', 'carrier_info',
  ],
};

const LEGACY_PLANS = new Set<AnyPlan>(['trial', 'free_trial', 'monthly', 'annual', 'lifetime']);

export function isLegacyPlan(plan: AnyPlan | null | undefined): boolean {
  return !!plan && LEGACY_PLANS.has(plan);
}

export function planHasFeature(plan: AnyPlan | null | undefined, feature: FeatureKey): boolean {
  if (!plan) return false;
  if (isLegacyPlan(plan)) return true; // grandfathered
  return FEATURES_BY_TIER[plan as PlanTier]?.includes(feature) ?? false;
}

export function planStaffLimit(plan: AnyPlan | null | undefined): number | null {
  if (!plan) return 0;
  if (isLegacyPlan(plan)) return null; // unlimited (grandfathered)
  if (plan === 'starter') return 2;
  return null; // business & business_plus: unlimited
}

export const TIER_LABEL: Record<PlanTier, string> = {
  starter: 'Starter',
  business: 'Business',
  business_plus: 'Business Plus',
};

// Fallback pricing shown before the DB catalog loads.
export const TIER_FALLBACK_PRICES: Record<PlanTier, { monthly: number; annual: number }> = {
  starter: { monthly: 20, annual: 199 },
  business: { monthly: 50, annual: 499 },
  business_plus: { monthly: 80, annual: 799 },
};
