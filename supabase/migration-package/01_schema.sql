-- KudiTrack schema migration package (generated, read-only audit)
-- Target: fresh external Supabase project. Run as postgres/service role.

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
create extension if not exists pg_net;
create extension if not exists pg_cron;


-- ============ ENUM TYPES ============
create type public.announcement_audience as enum ('all', 'trial', 'active', 'expired');
create type public.announcement_priority as enum ('low', 'normal', 'high', 'critical');
create type public.app_role as enum ('super_admin', 'business_owner', 'staff', 'admin', 'manager', 'salesperson', 'distributor');
create type public.savings_type as enum ('bank', 'mobile_money', 'susu');
create type public.subscription_plan as enum ('trial', 'monthly', 'annual', 'lifetime', 'starter', 'business', 'business_plus');
create type public.subscription_status as enum ('trial', 'active', 'expired', 'suspended', 'lifetime');

-- ============ TABLES ============

create table if not exists public.ad_applications (
  id uuid default gen_random_uuid() not null,
  business_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  business_type text,
  ad_goal text,
  budget text,
  message text,
  status text default 'pending'::text not null,
  created_at timestamp with time zone default now() not null,
  reviewed_at timestamp with time zone,
  reviewed_by uuid
);

create table if not exists public.announcements (
  id uuid default gen_random_uuid() not null,
  title text not null,
  message text not null,
  audience public.announcement_audience default 'all'::announcement_audience not null,
  priority public.announcement_priority default 'normal'::announcement_priority not null,
  publish_at timestamp with time zone default now() not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  target_user_id uuid,
  target_plan public.subscription_plan
);

create table if not exists public.audit_log (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  action text not null,
  details text,
  performed_by uuid,
  performed_by_name text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.bank_accounts (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  bank_name text default ''::text not null,
  account_name text default ''::text not null,
  account_number text default ''::text not null,
  branch text default ''::text,
  mobile_money_name text default ''::text,
  mobile_money_number text default ''::text,
  account_type text default 'bank'::text not null,
  note text default ''::text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.currencies (
  code text not null,
  name text not null,
  symbol text not null,
  flag text,
  country text,
  decimals integer default 2 not null,
  active boolean default true not null,
  is_default boolean default false not null,
  sort_order integer default 100 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.customers (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  phone text,
  email text,
  note text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  client_txn_id text,
  created_offline boolean default false not null
);

create table if not exists public.dashboard_preferences (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  business_id uuid,
  layout jsonb default '[]'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.email_audit_log (
  id uuid default gen_random_uuid() not null,
  actor_id uuid,
  actor_email text,
  action text not null,
  campaign_id uuid,
  details jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.email_campaign_recipients (
  id uuid default gen_random_uuid() not null,
  campaign_id uuid not null,
  email text not null,
  user_id uuid,
  merge_data jsonb default '{}'::jsonb not null,
  status text default 'pending'::text not null,
  resend_message_id text,
  sent_at timestamp with time zone,
  delivered_at timestamp with time zone,
  opened_at timestamp with time zone,
  open_count integer default 0 not null,
  first_clicked_at timestamp with time zone,
  click_count integer default 0 not null,
  bounced_at timestamp with time zone,
  unsubscribed_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.email_campaigns (
  id uuid default gen_random_uuid() not null,
  name text not null,
  subject text default ''::text not null,
  preview_text text,
  from_name text default 'KudiTrack Team'::text not null,
  from_email text default 'news@mail.kuditrack.online'::text not null,
  reply_to text,
  body_html text default ''::text not null,
  template_id uuid,
  audience_type text default 'all_users'::text not null,
  audience_filter jsonb default '{}'::jsonb not null,
  recipient_count integer default 0 not null,
  status text default 'draft'::text not null,
  scheduled_at timestamp with time zone,
  timezone text default 'UTC'::text,
  sent_at timestamp with time zone,
  started_at timestamp with time zone,
  delivered_count integer default 0 not null,
  open_count integer default 0 not null,
  unique_open_count integer default 0 not null,
  click_count integer default 0 not null,
  unique_click_count integer default 0 not null,
  bounce_count integer default 0 not null,
  unsubscribe_count integer default 0 not null,
  failed_count integer default 0 not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.email_marketing_unsubscribes (
  id uuid default gen_random_uuid() not null,
  email text not null,
  user_id uuid,
  reason text,
  source text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.email_media_library (
  id uuid default gen_random_uuid() not null,
  name text not null,
  url text not null,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  kind text default 'image'::text not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.email_templates (
  id uuid default gen_random_uuid() not null,
  name text not null,
  description text,
  category text,
  subject text default ''::text not null,
  preview_text text,
  body_html text default ''::text not null,
  is_system boolean default false not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.exchange_rates (
  id uuid default gen_random_uuid() not null,
  base_currency text not null,
  target_currency text not null,
  rate numeric not null,
  provider text default 'open.er-api.com'::text not null,
  fetched_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone default (now() + '12:00:00'::interval) not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.expenses (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  amount numeric default 0 not null,
  category text default 'Other'::text not null,
  note text,
  expense_date timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  description text,
  payment_method text default 'cash'::text,
  attachment_path text,
  attachment_name text,
  recorded_by uuid,
  recorded_by_name text,
  client_txn_id text,
  created_offline boolean default false not null
);

create table if not exists public.feedback_messages (
  id uuid default gen_random_uuid() not null,
  name text not null,
  email text not null,
  subject text default ''::text not null,
  message text not null,
  status text default 'new'::text not null,
  created_at timestamp with time zone default now() not null,
  resolved_at timestamp with time zone,
  resolved_by uuid
);

create table if not exists public.investments (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text default ''::text not null,
  amount numeric default 0 not null,
  investment_date timestamp with time zone default now() not null,
  status text default 'active'::text not null,
  note text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.investor_funding (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  investor_name text default ''::text not null,
  amount numeric default 0 not null,
  date_received timestamp with time zone default now() not null,
  reference text,
  note text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.marketing_reviews (
  id uuid default gen_random_uuid() not null,
  customer_name text not null,
  business_name text,
  testimonial text default ''::text not null,
  rating integer default 5 not null,
  media_url text,
  media_type text,
  avatar_url text,
  visible boolean default true not null,
  sort_order integer default 0 not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  avatar_fit text default 'cover'::text not null,
  avatar_position_x numeric default 50 not null,
  avatar_position_y numeric default 50 not null,
  avatar_zoom numeric default 1 not null,
  media_fit text default 'cover'::text not null,
  media_position_x numeric default 50 not null,
  media_position_y numeric default 50 not null,
  media_zoom numeric default 1 not null
);

create table if not exists public.order_items (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  order_id uuid not null,
  product_id uuid,
  product_name text default ''::text not null,
  sku text,
  quantity numeric default 1 not null,
  unit_price numeric default 0 not null,
  cost_price numeric default 0 not null,
  line_total numeric default 0 not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.orders (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  customer_name text,
  customer_phone text,
  delivery_location text,
  notes text,
  subtotal numeric default 0 not null,
  discount numeric default 0 not null,
  total numeric default 0 not null,
  amount_paid numeric default 0 not null,
  balance numeric default 0 not null,
  payment_method text default 'cash'::text not null,
  payment_status text default 'unpaid'::text not null,
  status text default 'pending'::text not null,
  created_by uuid,
  created_by_name text,
  assigned_to uuid,
  assigned_to_name text,
  due_date timestamp with time zone,
  delivered_at timestamp with time zone,
  order_date timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  tracking_code text,
  carrier_name text,
  carrier_phone text,
  tracking_notes text,
  source text default 'manual'::text not null,
  estimated_delivery_date date,
  delivery_fee numeric default 0 not null,
  fulfillment_type text default 'delivery'::text not null,
  customer_confirmed_at timestamp with time zone,
  confirmation_token text,
  customer_payment_name text,
  customer_payment_reference text
);

create table if not exists public.other_income (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  source text default ''::text,
  amount numeric default 0 not null,
  note text,
  income_date timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  category text,
  payment_method text,
  description text,
  attachment_path text,
  attachment_name text,
  recorded_by uuid,
  recorded_by_name text,
  client_txn_id text,
  created_offline boolean default false not null
);

create table if not exists public.payment_methods (
  id uuid default gen_random_uuid() not null,
  type text not null,
  label text not null,
  details jsonb default '{}'::jsonb not null,
  active boolean default true not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.platform_ads (
  id uuid default gen_random_uuid() not null,
  title text not null,
  description text default ''::text not null,
  image_url text default ''::text not null,
  cta_text text,
  cta_url text,
  active boolean default true not null,
  sort_order integer default 0 not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.platform_support_settings (
  id uuid default gen_random_uuid() not null,
  singleton_key text default 'default'::text not null,
  support_email text default ''::text not null,
  phone_number text default ''::text not null,
  whatsapp_number text default ''::text not null,
  whatsapp_link text default ''::text not null,
  office_address text default ''::text not null,
  show_email boolean default true not null,
  show_phone boolean default true not null,
  show_whatsapp boolean default true not null,
  show_office_address boolean default true not null,
  updated_by uuid,
  updated_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.pricing_plans (
  id uuid default gen_random_uuid() not null,
  tier text not null,
  name text not null,
  description text default ''::text not null,
  price_monthly numeric default 0 not null,
  price_annual numeric default 0 not null,
  features jsonb default '[]'::jsonb not null,
  cta_label text default 'Get Started'::text not null,
  is_popular boolean default false not null,
  is_active boolean default true not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.products (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  sku text,
  price numeric default 0 not null,
  cost numeric default 0 not null,
  stock numeric default 0 not null,
  low_stock_threshold numeric default 5 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  category text default ''::text not null,
  is_archived boolean default false not null,
  image_url text,
  available_online boolean default false not null,
  online_description text
);

create table if not exists public.profiles (
  id uuid not null,
  email text,
  business_name text,
  phone text,
  role text,
  business_type text,
  num_employees text,
  location text,
  onboarding_completed boolean default false not null,
  trial_start_date timestamp with time zone default now() not null,
  trial_end_date timestamp with time zone default (now() + '30 days'::interval) not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  subscription_plan public.subscription_plan default 'trial'::subscription_plan not null,
  subscription_status public.subscription_status default 'trial'::subscription_status not null,
  subscription_start_date timestamp with time zone,
  subscription_end_date timestamp with time zone,
  suspended boolean default false not null,
  currency text default 'GHS'::text not null,
  logo_url text,
  avatar_url text,
  opening_cash_balance numeric default 0 not null,
  bio text,
  display_name text,
  title text,
  phone_verified boolean default false not null,
  referred_by_user_id uuid,
  phone_verified_at timestamp with time zone,
  last_verified_phone text,
  allow_sales_without_stock boolean default false not null,
  sms_notify_sale_thanks boolean default true not null,
  sms_notify_low_stock boolean default true not null,
  sms_notify_team_invite boolean default true not null,
  last_login_at timestamp with time zone,
  last_activity_at timestamp with time zone,
  login_count integer default 0 not null,
  store_slug text,
  online_ordering_enabled boolean default false not null,
  store_show_stock boolean default true not null,
  store_enable_notes boolean default true not null,
  store_enable_delivery_address boolean default true not null,
  store_enable_product_images boolean default true not null,
  sms_notify_new_order boolean default true not null,
  sms_notify_order_status boolean default true not null,
  store_payment_methods text[] default ARRAY['cash_on_delivery'::text] not null,
  store_payment_instructions text,
  orders_auto_publish_products boolean default true not null,
  store_default_delivery_fee numeric default 0 not null,
  store_allow_pickup boolean default true not null,
  store_allow_delivery boolean default true not null,
  marketing_emails_opted_out boolean default false not null,
  monthly_statement_enabled boolean default true not null
);

create table if not exists public.referral_codes (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  code text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.referrals (
  id uuid default gen_random_uuid() not null,
  referrer_user_id uuid not null,
  referred_user_id uuid not null,
  status text default 'pending'::text not null,
  rewarded_at timestamp with time zone,
  reward_payment_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  referred_email text,
  reward_months integer default 0 not null,
  referrer_business_id uuid
);

create table if not exists public.restocks (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  product_id uuid,
  product_name text default ''::text not null,
  category text default ''::text not null,
  quantity_added numeric default 0 not null,
  cost_price_per_unit numeric default 0 not null,
  total_cost numeric default 0 not null,
  payment_method text default 'cash'::text not null,
  note text,
  reference text,
  recorded_by uuid,
  recorded_by_name text,
  restock_date timestamp with time zone default now() not null,
  status text default 'active'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  is_opening_stock boolean default false not null
);

create table if not exists public.restore_logs (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  business_id uuid,
  backup_version integer,
  backup_created_at timestamp with time zone,
  backup_business_name text,
  restore_mode text not null,
  status text default 'success'::text not null,
  restored_counts jsonb default '{}'::jsonb not null,
  skipped_counts jsonb default '{}'::jsonb not null,
  error_message text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.restore_record_map (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  entity text not null,
  source_id uuid not null,
  new_id uuid not null,
  restore_id uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.sale_documents (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  sale_id uuid not null,
  kind text not null,
  document_number text not null,
  sale_date timestamp with time zone default now() not null,
  payment_status text default 'paid'::text not null,
  amount_ghs numeric default 0 not null,
  amount_paid_ghs numeric default 0 not null,
  balance_ghs numeric default 0 not null,
  customer_name text,
  customer_phone text,
  seller_name text,
  issued_by uuid,
  snapshot jsonb default '{}'::jsonb not null,
  issued_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.sale_items (
  id uuid default gen_random_uuid() not null,
  sale_id uuid not null,
  user_id uuid not null,
  product_id uuid,
  product_name text not null,
  quantity numeric default 1 not null,
  unit_price numeric default 0 not null,
  unit_cost numeric default 0 not null,
  created_at timestamp with time zone default now() not null,
  business_id uuid,
  sku text,
  cost_price numeric default 0 not null,
  line_total numeric default 0 not null
);

create table if not exists public.sales (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  total numeric default 0 not null,
  cost_total numeric default 0 not null,
  payment_method text default 'cash'::text not null,
  customer_name text,
  note text,
  sale_date timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  customer_id uuid,
  discount numeric default 0 not null,
  amount_paid numeric default 0 not null,
  invoice_number text,
  business_id uuid,
  customer_phone text,
  staff_id uuid,
  staff_name text,
  subtotal numeric default 0 not null,
  balance numeric default 0 not null,
  payment_status text default 'paid'::text not null,
  notes text,
  status text default 'completed'::text not null,
  sale_channel text default 'pos'::text not null,
  due_date timestamp with time zone,
  order_id uuid,
  client_txn_id text,
  created_offline boolean default false not null,
  client_device_id text,
  synced_at timestamp with time zone
);

create table if not exists public.savings (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  amount numeric default 0 not null,
  savings_date timestamp with time zone default now() not null,
  type public.savings_type default 'bank'::savings_type,
  institution text,
  account_name text,
  note text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  source text,
  bank_account_id uuid,
  reference text,
  recorded_by uuid
);

create table if not exists public.signup_otps (
  id uuid default gen_random_uuid() not null,
  phone text not null,
  code_hash text not null,
  purpose text default 'signup'::text not null,
  user_id uuid,
  attempts integer default 0 not null,
  consumed boolean default false not null,
  expires_at timestamp with time zone default (now() + '00:10:00'::interval) not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.sms_logs (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  recipient_phone text not null,
  notification_type text not null,
  message_preview text,
  provider_response jsonb,
  status text not null,
  error_message text,
  reference_id uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.staff_invites (
  id uuid default gen_random_uuid() not null,
  business_owner_id uuid not null,
  email text not null,
  display_name text,
  permissions jsonb default '{}'::jsonb not null,
  token text default replace((gen_random_uuid())::text, '-'::text, ''::text) not null,
  status text default 'pending'::text not null,
  accepted_user_id uuid,
  accepted_at timestamp with time zone,
  expires_at timestamp with time zone default (now() + '7 days'::interval) not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.staff_members (
  id uuid default gen_random_uuid() not null,
  business_owner_id uuid not null,
  staff_user_id uuid not null,
  display_name text,
  email text,
  permissions jsonb default '{}'::jsonb not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.statement_deliveries (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  business_name text,
  email text not null,
  period text not null,
  status text default 'pending'::text not null,
  generated_at timestamp with time zone,
  sent_at timestamp with time zone,
  error_message text,
  retry_count integer default 0 not null,
  provider_message_id text,
  totals jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.statement_settings (
  id uuid default gen_random_uuid() not null,
  singleton_key text default 'default'::text not null,
  automation_enabled boolean default false not null,
  send_day integer default 1 not null,
  from_name text default 'KudiTrack'::text not null,
  from_email text default 'statements@mail.kuditrack.online'::text not null,
  last_run_at timestamp with time zone,
  last_run_period text,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.stock_movements (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  product_id uuid not null,
  change numeric not null,
  reason text default 'adjustment'::text not null,
  note text,
  reference_id uuid,
  created_at timestamp with time zone default now() not null,
  added_by_name text
);

create table if not exists public.subscription_payments (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  plan public.subscription_plan not null,
  amount numeric default 0 not null,
  payment_method text not null,
  reference text,
  note text,
  status text default 'pending'::text not null,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  paystack_reference text,
  network text,
  amount_paid numeric,
  provider_response jsonb,
  expires_at timestamp with time zone
);

create table if not exists public.support_messages (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  sender_name text default ''::text not null,
  sender_contact text default ''::text not null,
  subject text default ''::text not null,
  message text default ''::text not null,
  is_read boolean default false not null,
  read_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.survey_questions (
  id uuid default gen_random_uuid() not null,
  survey_id uuid not null,
  type text not null,
  label text not null,
  options jsonb default '[]'::jsonb not null,
  required boolean default false not null,
  "position" integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.survey_response_answers (
  id uuid default gen_random_uuid() not null,
  response_id uuid not null,
  question_id uuid not null,
  answer jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.survey_responses (
  id uuid default gen_random_uuid() not null,
  survey_id uuid not null,
  user_id uuid not null,
  business_id uuid,
  name text,
  email text,
  phone text,
  rating integer,
  submitted_at timestamp with time zone default now() not null
);

create table if not exists public.survey_user_status (
  id uuid default gen_random_uuid() not null,
  survey_id uuid not null,
  user_id uuid not null,
  status text not null,
  shown_at timestamp with time zone,
  skipped_at timestamp with time zone,
  submitted_at timestamp with time zone,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.surveys (
  id uuid default gen_random_uuid() not null,
  title text not null,
  description text,
  enabled boolean default false not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  thank_you_message text,
  enabled_at timestamp with time zone
);

create table if not exists public.user_roles (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamp with time zone default now() not null
);

-- ============ CONSTRAINTS (pk, unique, fk, check) ============
alter table public.ad_applications add constraint ad_applications_pkey PRIMARY KEY (id);
alter table public.announcements add constraint announcements_pkey PRIMARY KEY (id);
alter table public.audit_log add constraint audit_log_pkey PRIMARY KEY (id);
alter table public.bank_accounts add constraint bank_accounts_pkey PRIMARY KEY (id);
alter table public.currencies add constraint currencies_pkey PRIMARY KEY (code);
alter table public.customers add constraint customers_pkey PRIMARY KEY (id);
alter table public.dashboard_preferences add constraint dashboard_preferences_pkey PRIMARY KEY (id);
alter table public.email_audit_log add constraint email_audit_log_pkey PRIMARY KEY (id);
alter table public.email_campaign_recipients add constraint email_campaign_recipients_pkey PRIMARY KEY (id);
alter table public.email_campaigns add constraint email_campaigns_pkey PRIMARY KEY (id);
alter table public.email_marketing_unsubscribes add constraint email_marketing_unsubscribes_pkey PRIMARY KEY (id);
alter table public.email_media_library add constraint email_media_library_pkey PRIMARY KEY (id);
alter table public.email_templates add constraint email_templates_pkey PRIMARY KEY (id);
alter table public.exchange_rates add constraint exchange_rates_pkey PRIMARY KEY (id);
alter table public.expenses add constraint expenses_pkey PRIMARY KEY (id);
alter table public.feedback_messages add constraint feedback_messages_pkey PRIMARY KEY (id);
alter table public.investments add constraint investments_pkey PRIMARY KEY (id);
alter table public.investor_funding add constraint investor_funding_pkey PRIMARY KEY (id);
alter table public.marketing_reviews add constraint marketing_reviews_pkey PRIMARY KEY (id);
alter table public.order_items add constraint order_items_pkey PRIMARY KEY (id);
alter table public.orders add constraint orders_pkey PRIMARY KEY (id);
alter table public.other_income add constraint other_income_pkey PRIMARY KEY (id);
alter table public.payment_methods add constraint payment_methods_pkey PRIMARY KEY (id);
alter table public.platform_ads add constraint platform_ads_pkey PRIMARY KEY (id);
alter table public.platform_support_settings add constraint platform_support_settings_pkey PRIMARY KEY (id);
alter table public.pricing_plans add constraint pricing_plans_pkey PRIMARY KEY (id);
alter table public.products add constraint products_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.referral_codes add constraint referral_codes_pkey PRIMARY KEY (id);
alter table public.referrals add constraint referrals_pkey PRIMARY KEY (id);
alter table public.restocks add constraint restocks_pkey PRIMARY KEY (id);
alter table public.restore_logs add constraint restore_logs_pkey PRIMARY KEY (id);
alter table public.restore_record_map add constraint restore_record_map_pkey PRIMARY KEY (id);
alter table public.sale_documents add constraint sale_documents_pkey PRIMARY KEY (id);
alter table public.sale_items add constraint sale_items_pkey PRIMARY KEY (id);
alter table public.sales add constraint sales_pkey PRIMARY KEY (id);
alter table public.savings add constraint savings_pkey PRIMARY KEY (id);
alter table public.signup_otps add constraint signup_otps_pkey PRIMARY KEY (id);
alter table public.sms_logs add constraint sms_logs_pkey PRIMARY KEY (id);
alter table public.staff_invites add constraint staff_invites_pkey PRIMARY KEY (id);
alter table public.staff_members add constraint staff_members_pkey PRIMARY KEY (id);
alter table public.statement_deliveries add constraint statement_deliveries_pkey PRIMARY KEY (id);
alter table public.statement_settings add constraint statement_settings_pkey PRIMARY KEY (id);
alter table public.stock_movements add constraint stock_movements_pkey PRIMARY KEY (id);
alter table public.subscription_payments add constraint subscription_payments_pkey PRIMARY KEY (id);
alter table public.support_messages add constraint support_messages_pkey PRIMARY KEY (id);
alter table public.survey_questions add constraint survey_questions_pkey PRIMARY KEY (id);
alter table public.survey_response_answers add constraint survey_response_answers_pkey PRIMARY KEY (id);
alter table public.survey_responses add constraint survey_responses_pkey PRIMARY KEY (id);
alter table public.survey_user_status add constraint survey_user_status_pkey PRIMARY KEY (id);
alter table public.surveys add constraint surveys_pkey PRIMARY KEY (id);
alter table public.user_roles add constraint user_roles_pkey PRIMARY KEY (id);
alter table public.email_campaign_recipients add constraint email_campaign_recipients_campaign_id_email_key UNIQUE (campaign_id, email);
alter table public.email_marketing_unsubscribes add constraint email_marketing_unsubscribes_email_key UNIQUE (email);
alter table public.orders add constraint orders_tracking_code_key UNIQUE (tracking_code);
alter table public.platform_support_settings add constraint platform_support_settings_singleton_key_key UNIQUE (singleton_key);
alter table public.pricing_plans add constraint pricing_plans_tier_key UNIQUE (tier);
alter table public.profiles add constraint profiles_store_slug_key UNIQUE (store_slug);
alter table public.referral_codes add constraint referral_codes_user_id_key UNIQUE (user_id);
alter table public.referral_codes add constraint referral_codes_code_key UNIQUE (code);
alter table public.referrals add constraint referrals_referred_user_id_key UNIQUE (referred_user_id);
alter table public.restore_record_map add constraint restore_record_map_user_id_entity_source_id_key UNIQUE (user_id, entity, source_id);
alter table public.sale_documents add constraint sale_documents_sale_kind_unique UNIQUE (sale_id, kind);
alter table public.staff_invites add constraint staff_invites_token_key UNIQUE (token);
alter table public.staff_members add constraint staff_members_business_owner_id_staff_user_id_key UNIQUE (business_owner_id, staff_user_id);
alter table public.statement_deliveries add constraint statement_deliveries_business_id_period_key UNIQUE (business_id, period);
alter table public.statement_settings add constraint statement_settings_singleton_key_key UNIQUE (singleton_key);
alter table public.survey_responses add constraint survey_responses_survey_id_user_id_key UNIQUE (survey_id, user_id);
alter table public.survey_user_status add constraint survey_user_status_survey_id_user_id_key UNIQUE (survey_id, user_id);
alter table public.user_roles add constraint user_roles_user_id_role_key UNIQUE (user_id, role);
alter table public.ad_applications add constraint ad_applications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'contacted'::text])));
alter table public.feedback_messages add constraint feedback_messages_status_check CHECK ((status = ANY (ARRAY['new'::text, 'in_progress'::text, 'resolved'::text])));
alter table public.marketing_reviews add constraint marketing_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
alter table public.marketing_reviews add constraint marketing_reviews_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text])));
alter table public.sale_documents add constraint sale_documents_kind_check CHECK ((kind = ANY (ARRAY['invoice'::text, 'receipt'::text])));
alter table public.sms_logs add constraint sms_logs_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text])));
alter table public.sms_logs add constraint sms_logs_notification_type_check CHECK ((notification_type = ANY (ARRAY['sale_thanks'::text, 'low_stock'::text, 'team_invite'::text])));
alter table public.survey_questions add constraint survey_questions_type_check CHECK ((type = ANY (ARRAY['rating'::text, 'multiple_choice'::text, 'checkbox'::text, 'short_text'::text, 'long_text'::text])));
alter table public.survey_user_status add constraint survey_user_status_status_check CHECK ((status = ANY (ARRAY['shown'::text, 'skipped'::text, 'completed'::text])));
alter table public.dashboard_preferences add constraint dashboard_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.email_audit_log add constraint email_audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.email_audit_log add constraint email_audit_log_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE SET NULL;
alter table public.email_campaign_recipients add constraint email_campaign_recipients_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE;
alter table public.email_campaigns add constraint email_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.email_media_library add constraint email_media_library_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.email_templates add constraint email_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.expenses add constraint expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.order_items add constraint order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.products add constraint products_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.sale_items add constraint sale_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.sale_items add constraint sale_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
alter table public.sale_items add constraint sale_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE;
alter table public.sales add constraint sales_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.sms_logs add constraint sms_logs_business_id_fkey FOREIGN KEY (business_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.survey_questions add constraint survey_questions_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE;
alter table public.survey_response_answers add constraint survey_response_answers_response_id_fkey FOREIGN KEY (response_id) REFERENCES survey_responses(id) ON DELETE CASCADE;
alter table public.survey_response_answers add constraint survey_response_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES survey_questions(id) ON DELETE CASCADE;
alter table public.survey_responses add constraint survey_responses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.survey_responses add constraint survey_responses_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE;
alter table public.survey_user_status add constraint survey_user_status_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.survey_user_status add constraint survey_user_status_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE;
alter table public.surveys add constraint surveys_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.user_roles add constraint user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ============ INDEXES ============
CREATE INDEX sale_documents_user_id_idx ON public.sale_documents USING btree (user_id);
CREATE INDEX sale_documents_sale_id_idx ON public.sale_documents USING btree (sale_id);
CREATE UNIQUE INDEX currencies_single_default_idx ON public.currencies USING btree (is_default) WHERE is_default;
CREATE UNIQUE INDEX exchange_rates_pair_idx ON public.exchange_rates USING btree (base_currency, target_currency);
CREATE INDEX idx_savings_user_date ON public.savings USING btree (user_id, savings_date DESC);
CREATE INDEX exchange_rates_fetched_at_idx ON public.exchange_rates USING btree (fetched_at DESC);
CREATE UNIQUE INDEX surveys_one_enabled ON public.surveys USING btree (enabled) WHERE (enabled = true);
CREATE INDEX survey_questions_survey_idx ON public.survey_questions USING btree (survey_id, "position");
CREATE INDEX survey_responses_survey_idx ON public.survey_responses USING btree (survey_id, submitted_at DESC);
CREATE INDEX idx_restocks_user_id ON public.restocks USING btree (user_id);
CREATE INDEX idx_restocks_product_id ON public.restocks USING btree (product_id);
CREATE INDEX idx_restocks_restock_date ON public.restocks USING btree (restock_date DESC);
CREATE INDEX idx_sub_payments_paystack_ref ON public.subscription_payments USING btree (paystack_reference);
CREATE UNIQUE INDEX idx_stock_movements_reference_reason_product ON public.stock_movements USING btree (reference_id, reason, product_id) WHERE ((reference_id IS NOT NULL) AND (reason = ANY (ARRAY['sold'::text, 'restock'::text])));
CREATE INDEX idx_sub_payments_user_status ON public.subscription_payments USING btree (user_id, status);
CREATE INDEX survey_response_answers_resp_idx ON public.survey_response_answers USING btree (response_id);
CREATE INDEX idx_orders_tracking_code ON public.orders USING btree (tracking_code);
CREATE INDEX idx_orders_business_status ON public.orders USING btree (business_id, status);
CREATE INDEX idx_stock_movements_user_product ON public.stock_movements USING btree (user_id, product_id, created_at DESC);
CREATE INDEX sms_logs_business_type_created_idx ON public.sms_logs USING btree (business_id, notification_type, created_at DESC);
CREATE INDEX sms_logs_reference_idx ON public.sms_logs USING btree (reference_id, notification_type, created_at DESC);
CREATE INDEX idx_products_user ON public.products USING btree (user_id);
CREATE UNIQUE INDEX dashboard_preferences_user_business_idx ON public.dashboard_preferences USING btree (user_id, COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX statement_deliveries_period_idx ON public.statement_deliveries USING btree (period, status);
CREATE INDEX idx_sale_items_sale ON public.sale_items USING btree (sale_id);
CREATE INDEX idx_sale_items_user ON public.sale_items USING btree (user_id);
CREATE INDEX idx_orders_business ON public.orders USING btree (business_id);
CREATE INDEX idx_sales_user_date ON public.sales USING btree (user_id, sale_date DESC);
CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);
CREATE INDEX idx_order_items_business ON public.order_items USING btree (business_id);
CREATE INDEX referrals_referrer_business_idx ON public.referrals USING btree (referrer_business_id, created_at DESC);
CREATE INDEX idx_sales_order ON public.sales USING btree (order_id);
CREATE INDEX idx_expenses_user_date ON public.expenses USING btree (user_id, expense_date DESC);
CREATE INDEX staff_invites_owner_idx ON public.staff_invites USING btree (business_owner_id);
CREATE INDEX staff_invites_email_idx ON public.staff_invites USING btree (lower(email));
CREATE INDEX orders_confirmation_token_idx ON public.orders USING btree (confirmation_token);
CREATE INDEX email_campaigns_status_idx ON public.email_campaigns USING btree (status);
CREATE INDEX email_campaigns_scheduled_idx ON public.email_campaigns USING btree (scheduled_at) WHERE (status = 'scheduled'::text);
CREATE INDEX products_user_archived_idx ON public.products USING btree (user_id, is_archived);
CREATE INDEX idx_profiles_last_activity_at ON public.profiles USING btree (last_activity_at DESC);
CREATE INDEX idx_profiles_last_login_at ON public.profiles USING btree (last_login_at DESC);
CREATE INDEX idx_signup_otps_phone ON public.signup_otps USING btree (phone);
CREATE INDEX idx_referrals_referrer ON public.referrals USING btree (referrer_user_id);
CREATE INDEX email_recipients_email_idx ON public.email_campaign_recipients USING btree (email);
CREATE UNIQUE INDEX sales_user_client_txn_uidx ON public.sales USING btree (user_id, client_txn_id) WHERE (client_txn_id IS NOT NULL);
CREATE UNIQUE INDEX customers_user_client_txn_uidx ON public.customers USING btree (user_id, client_txn_id) WHERE (client_txn_id IS NOT NULL);
CREATE UNIQUE INDEX expenses_user_client_txn_uidx ON public.expenses USING btree (user_id, client_txn_id) WHERE (client_txn_id IS NOT NULL);
CREATE UNIQUE INDEX other_income_user_client_txn_uidx ON public.other_income USING btree (user_id, client_txn_id) WHERE (client_txn_id IS NOT NULL);
CREATE INDEX email_recipients_campaign_idx ON public.email_campaign_recipients USING btree (campaign_id, status);

-- ============ FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.accept_staff_invite(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv public.staff_invites%ROWTYPE;
  user_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO inv FROM public.staff_invites WHERE token = _token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite not found';
  END IF;
  IF inv.status <> 'pending' THEN
    RAISE EXCEPTION 'invite no longer valid';
  END IF;
  IF inv.expires_at < now() THEN
    RAISE EXCEPTION 'invite expired';
  END IF;

  user_email := lower(coalesce((auth.jwt() ->> 'email'), ''));
  IF user_email = '' OR user_email <> lower(inv.email) THEN
    RAISE EXCEPTION 'invite is for a different email';
  END IF;

  INSERT INTO public.staff_members (business_owner_id, staff_user_id, display_name, email, permissions, active)
  VALUES (inv.business_owner_id, auth.uid(), inv.display_name, inv.email, inv.permissions, true)
  ON CONFLICT (business_owner_id, staff_user_id)
    DO UPDATE SET permissions = EXCLUDED.permissions, active = true, display_name = EXCLUDED.display_name;

  UPDATE public.staff_invites
    SET status = 'accepted', accepted_user_id = auth.uid(), accepted_at = now()
    WHERE id = inv.id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), 'staff')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'business_owner_id', inv.business_owner_id);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.accept_staff_invite(_token text, _full_name text DEFAULT NULL::text, _position text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv public.staff_invites%ROWTYPE;
  user_email text;
  v_owner_name text;
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO inv FROM public.staff_invites WHERE token = _token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite not found';
  END IF;
  IF inv.status <> 'pending' THEN
    RAISE EXCEPTION 'invite no longer valid';
  END IF;
  IF inv.expires_at < now() THEN
    UPDATE public.staff_invites SET status = 'expired' WHERE id = inv.id;
    RAISE EXCEPTION 'invite expired';
  END IF;

  user_email := lower(coalesce((auth.jwt() ->> 'email'), ''));
  IF user_email = '' OR user_email <> lower(inv.email) THEN
    RAISE EXCEPTION 'invite is for a different email';
  END IF;

  v_role := COALESCE(inv.permissions ->> 'role', 'staff');

  -- Make sure the invitee has a profile row, and stamp the onboarding flag
  -- + display name + position so they skip business setup entirely.
  INSERT INTO public.profiles (id, email, display_name, title, onboarding_completed)
  VALUES (
    auth.uid(),
    inv.email,
    COALESCE(NULLIF(_full_name, ''), inv.display_name, split_part(inv.email, '@', 1)),
    NULLIF(_position, ''),
    true
  )
  ON CONFLICT (id) DO UPDATE
    SET display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), public.profiles.display_name),
        title = COALESCE(NULLIF(EXCLUDED.title, ''), public.profiles.title),
        onboarding_completed = true;

  INSERT INTO public.staff_members (business_owner_id, staff_user_id, display_name, email, permissions, active)
  VALUES (
    inv.business_owner_id,
    auth.uid(),
    COALESCE(NULLIF(_full_name, ''), inv.display_name, split_part(inv.email, '@', 1)),
    inv.email,
    inv.permissions,
    true
  )
  ON CONFLICT (business_owner_id, staff_user_id)
    DO UPDATE SET permissions = EXCLUDED.permissions,
                  active = true,
                  display_name = EXCLUDED.display_name;

  UPDATE public.staff_invites
    SET status = 'accepted', accepted_user_id = auth.uid(), accepted_at = now()
    WHERE id = inv.id;

  -- Ensure the invitee carries the team role (drop any default business_owner)
  DELETE FROM public.user_roles WHERE user_id = auth.uid() AND role = 'business_owner';
  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), v_role::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  SELECT business_name INTO v_owner_name FROM public.profiles WHERE id = inv.business_owner_id;

  -- Audit log entry for the owner
  INSERT INTO public.audit_log (user_id, action, details, performed_by, performed_by_name)
  VALUES (
    inv.business_owner_id,
    'team_invite_accepted',
    'Invite accepted by ' || COALESCE(NULLIF(_full_name, ''), inv.email),
    auth.uid(),
    COALESCE(NULLIF(_full_name, ''), inv.email)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'business_owner_id', inv.business_owner_id,
    'business_name', v_owner_name,
    'role', v_role
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.adjust_stock_on_sale_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.product_id IS NOT NULL THEN
    UPDATE public.products SET stock = stock - NEW.quantity WHERE id = NEW.product_id;
  ELSIF TG_OP = 'DELETE' AND OLD.product_id IS NOT NULL THEN
    UPDATE public.products SET stock = stock + OLD.quantity WHERE id = OLD.product_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_platform_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'total_users', (SELECT count(*) FROM public.profiles),
    'trial_users', (SELECT count(*) FROM public.profiles WHERE subscription_status = 'trial'),
    'active_users', (SELECT count(*) FROM public.profiles WHERE subscription_status = 'active'),
    'expired_users', (SELECT count(*) FROM public.profiles WHERE subscription_status = 'expired'),
    'suspended_users', (SELECT count(*) FROM public.profiles WHERE suspended = true),
    'monthly_subs', (SELECT count(*) FROM public.profiles WHERE subscription_plan = 'monthly' AND subscription_status = 'active'),
    'annual_subs', (SELECT count(*) FROM public.profiles WHERE subscription_plan = 'annual' AND subscription_status = 'active'),
    'pending_payments', (SELECT count(*) FROM public.subscription_payments WHERE status = 'pending'),
    'signups_last_30d', (SELECT count(*) FROM public.profiles WHERE created_at > now() - interval '30 days')
  ) INTO result;

  RETURN result;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_user_activity()
 RETURNS TABLE(id uuid, email text, display_name text, business_name text, phone text, role text, subscription_plan text, subscription_status text, suspended boolean, created_at timestamp with time zone, last_login_at timestamp with time zone, last_activity_at timestamp with time zone, login_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT p.id,
         p.email,
         p.display_name,
         p.business_name,
         p.phone,
         p.role,
         p.subscription_plan::text,
         p.subscription_status::text,
         p.suspended,
         p.created_at,
         p.last_login_at,
         p.last_activity_at,
         p.login_count
    FROM public.profiles p
   ORDER BY p.last_activity_at DESC NULLS LAST;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.ensure_referral_code(_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_code text;
BEGIN
  SELECT code INTO v_code FROM public.referral_codes WHERE user_id = _user_id;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;

  LOOP
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    BEGIN
      INSERT INTO public.referral_codes (user_id, code) VALUES (_user_id, v_code);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.ensure_referrals_columns()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _missing text[] := ARRAY[]::text[];
  _added text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.referrals') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'referrals table not found');
  END IF;

  SELECT array_agg(c)
    INTO _missing
  FROM unnest(ARRAY['referred_email','reward_months','referrer_business_id']) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'referrals' AND column_name = c
  );

  _missing := COALESCE(_missing, ARRAY[]::text[]);

  IF 'referred_email' = ANY(_missing) THEN
    ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS referred_email text;
    _added := _added || 'referred_email'::text;
  END IF;

  IF 'reward_months' = ANY(_missing) THEN
    ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS reward_months integer NOT NULL DEFAULT 0;
    _added := _added || 'reward_months'::text;
  END IF;

  IF 'referrer_business_id' = ANY(_missing) THEN
    ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS referrer_business_id uuid;
    UPDATE public.referrals SET referrer_business_id = referrer_user_id WHERE referrer_business_id IS NULL;
    CREATE INDEX IF NOT EXISTS referrals_referrer_business_idx
      ON public.referrals (referrer_business_id, created_at DESC);
    _added := _added || 'referrer_business_id'::text;
  END IF;

  RETURN jsonb_build_object('ok', true, 'missing', to_jsonb(_missing), 'added', to_jsonb(_added));
END;
$function$
;
CREATE OR REPLACE FUNCTION public.ensure_unique_store_slug(_base text, _owner uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  base TEXT := public.slugify(_base);
  candidate TEXT := base;
  n INT := 2;
BEGIN
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE store_slug = candidate AND id <> _owner) LOOP
    candidate := base || '-' || n::text;
    n := n + 1;
  END LOOP;
  RETURN candidate;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.gen_tracking_code()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  candidate TEXT;
  attempts INT := 0;
BEGIN
  LOOP
    -- KT- + 10 chars of base36-ish from a random UUID (upper-case hex trimmed)
    candidate := 'KT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    PERFORM 1 FROM public.orders WHERE tracking_code = candidate;
    IF NOT FOUND THEN
      RETURN candidate;
    END IF;
    attempts := attempts + 1;
    IF attempts > 8 THEN
      RETURN 'KT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
    END IF;
  END LOOP;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_table_columns(_table_name text)
 RETURNS TABLE(column_name text, data_type text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.column_name::text, c.data_type::text
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = _table_name
$function$
;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, trial_start_date, trial_end_date)
  VALUES (NEW.id, NEW.email, now(), now() + INTERVAL '15 days')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'business_owner')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.handle_restock_stock_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text;
begin
  if tg_op = 'DELETE' then
    if old.product_id is not null then
      delete from public.stock_movements
      where reference_id = old.id
        and reason in ('restock', 'opening_stock')
        and product_id = old.product_id
        and user_id = old.user_id;

      perform public.sync_product_stock(old.product_id, old.user_id);
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.product_id is not null then
      delete from public.stock_movements
      where reference_id = old.id
        and reason in ('restock', 'opening_stock')
        and product_id = old.product_id
        and user_id = old.user_id;

      perform public.sync_product_stock(old.product_id, old.user_id);
    end if;
  end if;

  if new.status <> 'cancelled' and new.product_id is not null then
    v_reason := case when coalesce(new.is_opening_stock, false) then 'opening_stock' else 'restock' end;

    insert into public.stock_movements (
      user_id,
      product_id,
      change,
      reason,
      note,
      reference_id,
      added_by_name
    )
    values (
      new.user_id,
      new.product_id,
      abs(coalesce(new.quantity_added, 0)),
      v_reason,
      coalesce(new.note, new.reference, case when coalesce(new.is_opening_stock, false) then 'Opening Stock' else 'Restock' end),
      new.id,
      new.recorded_by_name
    )
    on conflict do nothing;

    perform public.sync_product_stock(new.product_id, new.user_id);
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.handle_sale_item_stock_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'DELETE' then
    if old.product_id is not null then
      delete from public.stock_movements
      where reference_id = old.id
        and reason = 'sold'
        and product_id = old.product_id
        and user_id = old.user_id;

      perform public.sync_product_stock(old.product_id, old.user_id);
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.product_id is not null then
      delete from public.stock_movements
      where reference_id = old.id
        and reason = 'sold'
        and product_id = old.product_id
        and user_id = old.user_id;

      perform public.sync_product_stock(old.product_id, old.user_id);
    end if;
  end if;

  if new.product_id is not null then
    insert into public.stock_movements (
      user_id,
      product_id,
      change,
      reason,
      note,
      reference_id,
      added_by_name
    )
    values (
      new.user_id,
      new.product_id,
      -abs(coalesce(new.quantity, 0)),
      'sold',
      coalesce(nullif(new.product_name, ''), 'Sale item'),
      new.id,
      null
    )
    on conflict do nothing;

    perform public.sync_product_stock(new.product_id, new.user_id);
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$function$
;
CREATE OR REPLACE FUNCTION public.is_business_member(_owner_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_members
    WHERE business_owner_id = _owner_id
      AND staff_user_id = auth.uid()
      AND active = true
  );
$function$
;
CREATE OR REPLACE FUNCTION public.is_business_member_module(_owner_id uuid, _module text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.business_owner_id = _owner_id
      AND sm.staff_user_id = auth.uid()
      AND sm.active = true
      AND (
        -- Owner-role staff or missing modules field => full access (back-compat)
        COALESCE(sm.permissions ->> 'role', 'staff') IN ('business_owner','owner','admin')
        OR sm.permissions -> 'modules' IS NULL
        OR jsonb_typeof(sm.permissions -> 'modules') <> 'array'
        OR sm.permissions -> 'modules' ? _module
      )
  );
$function$
;
CREATE OR REPLACE FUNCTION public.log_stock_movement_on_sale_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.product_id IS NOT NULL THEN
    INSERT INTO public.stock_movements (user_id, product_id, change, reason, reference_id, note)
    VALUES (NEW.user_id, NEW.product_id, -NEW.quantity, 'sold', NEW.sale_id, NEW.product_name);
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.offline_can_write(_owner uuid, _module text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND _owner IS NOT NULL
     AND (auth.uid() = _owner OR public.is_business_member_module(_owner, _module));
$function$
;
CREATE OR REPLACE FUNCTION public.prevent_profile_privileged_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(auth.uid(), 'super_admin') THEN
    RETURN NEW;
  END IF;

  -- Allow security-definer trigger contexts (no auth.uid) to update these fields,
  -- e.g. the referral reward trigger extending subscription_end_date.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.subscription_start_date IS DISTINCT FROM OLD.subscription_start_date
     OR NEW.subscription_end_date IS DISTINCT FROM OLD.subscription_end_date
     OR NEW.suspended IS DISTINCT FROM OLD.suspended
     OR NEW.trial_start_date IS DISTINCT FROM OLD.trial_start_date
     OR NEW.trial_end_date IS DISTINCT FROM OLD.trial_end_date THEN
    RAISE EXCEPTION 'Not authorized to modify subscription or suspension fields';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.preview_staff_invite(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv public.staff_invites%ROWTYPE;
  v_owner_name text;
BEGIN
  SELECT * INTO inv FROM public.staff_invites WHERE token = _token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT business_name INTO v_owner_name FROM public.profiles WHERE id = inv.business_owner_id;

  RETURN jsonb_build_object(
    'found', true,
    'email', inv.email,
    'display_name', inv.display_name,
    'role', COALESCE(inv.permissions ->> 'role', 'staff'),
    'modules', COALESCE(inv.permissions -> 'modules', '[]'::jsonb),
    'status', inv.status,
    'expires_at', inv.expires_at,
    'business_owner_id', inv.business_owner_id,
    'business_name', v_owner_name
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.process_referral_reward()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ref public.referrals%ROWTYPE;
  v_current_end timestamptz;
BEGIN
  IF NEW.status <> 'approved' OR NEW.plan <> 'annual' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_ref FROM public.referrals
   WHERE referred_user_id = NEW.user_id AND status = 'pending';
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT subscription_end_date INTO v_current_end FROM public.profiles WHERE id = v_ref.referrer_user_id;

  UPDATE public.profiles
     SET subscription_end_date = GREATEST(COALESCE(v_current_end, now()), now()) + interval '30 days',
         updated_at = now()
   WHERE id = v_ref.referrer_user_id;

  UPDATE public.referrals
     SET status = 'successful',
         rewarded_at = now(),
         reward_payment_id = NEW.id,
         updated_at = now()
   WHERE id = v_ref.id;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.public_confirm_order_receipt(_code text, _phone_last4 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o RECORD;
  phone_digits text;
BEGIN
  IF _code IS NULL OR _phone_last4 IS NULL OR length(_phone_last4) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  SELECT id, business_id, customer_phone, status, customer_confirmed_at, tracking_code
    INTO o
    FROM public.orders
   WHERE tracking_code = _code
   LIMIT 1;

  IF o.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  phone_digits := regexp_replace(COALESCE(o.customer_phone, ''), '\D', '', 'g');
  IF right(phone_digits, 4) <> right(regexp_replace(_phone_last4, '\D', '', 'g'), 4) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'phone_mismatch');
  END IF;

  IF o.customer_confirmed_at IS NOT NULL OR o.status = 'completed' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'business_id', o.business_id, 'order_id', o.id, 'tracking_code', o.tracking_code);
  END IF;

  UPDATE public.orders
     SET status = 'completed',
         customer_confirmed_at = now(),
         delivered_at = COALESCE(delivered_at, now()),
         updated_at = now()
   WHERE id = o.id;

  RETURN jsonb_build_object('ok', true, 'business_id', o.business_id, 'order_id', o.id, 'tracking_code', o.tracking_code);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.public_confirm_order_receipt_by_code(_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o RECORD;
BEGIN
  IF _code IS NULL OR btrim(_code) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  SELECT id, business_id, status, customer_confirmed_at, customer_name, tracking_code
    INTO o
    FROM public.orders
   WHERE tracking_code = _code
   LIMIT 1;

  IF o.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF o.customer_confirmed_at IS NOT NULL OR o.status = 'completed' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'business_id', o.business_id, 'order_id', o.id, 'customer_name', o.customer_name, 'tracking_code', o.tracking_code);
  END IF;

  IF o.status NOT IN ('delivered', 'out_for_delivery', 'ready_for_pickup') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_yet_delivered', 'status', o.status);
  END IF;

  UPDATE public.orders
     SET status = 'completed',
         customer_confirmed_at = now(),
         delivered_at = COALESCE(delivered_at, now()),
         updated_at = now()
   WHERE id = o.id;

  RETURN jsonb_build_object('ok', true, 'business_id', o.business_id, 'order_id', o.id, 'customer_name', o.customer_name, 'tracking_code', o.tracking_code);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.public_get_order_by_tracking(_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o RECORD;
  biz RECORD;
  its JSONB;
BEGIN
  SELECT id, business_id, customer_name, tracking_code, status, payment_status,
         total, subtotal, discount, delivery_fee, fulfillment_type,
         order_date, delivered_at, estimated_delivery_date, customer_confirmed_at,
         carrier_name, carrier_phone, tracking_notes, delivery_location, notes,
         payment_method, customer_payment_name, customer_payment_reference
    INTO o
    FROM public.orders
   WHERE tracking_code = _code
   LIMIT 1;

  IF o.id IS NULL THEN RETURN NULL; END IF;

  SELECT business_name, logo_url, phone, store_slug
    INTO biz FROM public.profiles WHERE id = o.business_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', product_name, 'quantity', quantity, 'unit_price', unit_price, 'line_total', line_total
  )), '[]'::jsonb)
    INTO its FROM public.order_items WHERE order_id = o.id;

  RETURN jsonb_build_object(
    'tracking_code', o.tracking_code,
    'status', o.status,
    'payment_status', o.payment_status,
    'payment_method', o.payment_method,
    'customer_name', o.customer_name,
    'total', o.total,
    'subtotal', o.subtotal,
    'discount', o.discount,
    'delivery_fee', COALESCE(o.delivery_fee, 0),
    'fulfillment_type', COALESCE(o.fulfillment_type, 'delivery'),
    'order_date', o.order_date,
    'delivered_at', o.delivered_at,
    'estimated_delivery_date', o.estimated_delivery_date,
    'customer_confirmed_at', o.customer_confirmed_at,
    'carrier_name', CASE WHEN o.status = 'out_for_delivery' THEN o.carrier_name ELSE NULL END,
    'carrier_phone', CASE WHEN o.status = 'out_for_delivery' THEN o.carrier_phone ELSE NULL END,
    'tracking_notes', CASE WHEN o.status = 'out_for_delivery' THEN o.tracking_notes ELSE NULL END,
    'delivery_location', o.delivery_location,
    'notes', o.notes,
    'customer_payment_name', o.customer_payment_name,
    'customer_payment_reference', o.customer_payment_reference,
    'items', its,
    'business', jsonb_build_object(
      'name', biz.business_name,
      'logo_url', biz.logo_url,
      'phone', biz.phone,
      'slug', biz.store_slug
    )
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.public_get_store(_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  biz RECORD;
  items JSONB;
BEGIN
  SELECT id, business_name, logo_url, phone, location,
         online_ordering_enabled, store_show_stock, store_enable_notes,
         store_enable_delivery_address, store_enable_product_images, store_slug,
         store_payment_methods, store_payment_instructions, orders_auto_publish_products,
         store_default_delivery_fee, store_allow_pickup, store_allow_delivery
    INTO biz
    FROM public.profiles
   WHERE store_slug = _slug
   LIMIT 1;

  IF biz.id IS NULL OR biz.online_ordering_enabled IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(p)), '[]'::jsonb)
    INTO items
    FROM (
      SELECT id, name, online_description, price,
             CASE WHEN biz.store_show_stock THEN stock ELSE NULL END AS stock,
             (COALESCE(stock, 0) > 0) AS available,
             CASE WHEN biz.store_enable_product_images THEN image_url ELSE NULL END AS image_url,
             category
        FROM public.products
       WHERE user_id = biz.id
         AND COALESCE(is_archived, false) = false
         AND (
           biz.orders_auto_publish_products = true
           OR available_online = true
         )
       ORDER BY name ASC
    ) p;

  RETURN jsonb_build_object(
    'business', jsonb_build_object(
      'name', biz.business_name,
      'logo_url', biz.logo_url,
      'phone', biz.phone,
      'location', biz.location,
      'slug', biz.store_slug,
      'show_stock', biz.store_show_stock,
      'enable_notes', biz.store_enable_notes,
      'enable_delivery_address', biz.store_enable_delivery_address,
      'enable_product_images', biz.store_enable_product_images,
      'payment_methods', COALESCE(biz.store_payment_methods, ARRAY['cash_on_delivery']::text[]),
      'payment_instructions', biz.store_payment_instructions,
      'default_delivery_fee', COALESCE(biz.store_default_delivery_fee, 0),
      'allow_pickup', COALESCE(biz.store_allow_pickup, true),
      'allow_delivery', COALESCE(biz.store_allow_delivery, true)
    ),
    'products', items
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.recompute_product_stock()
 RETURNS TABLE(product_id uuid, new_stock numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  return query
  with ledger as (
    select p.id as product_id,
           coalesce(sum(sm.change), 0)::numeric as new_stock
    from public.products p
    left join public.stock_movements sm
      on sm.product_id = p.id
     and sm.user_id = p.user_id
    where p.user_id = auth.uid()
    group by p.id
  ), updated as (
    update public.products p
    set stock = ledger.new_stock,
        updated_at = now()
    from ledger
    where p.id = ledger.product_id
      and p.user_id = auth.uid()
    returning p.id, p.stock
  )
  select updated.id, updated.stock from updated;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.record_user_login()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles
     SET last_login_at = now(),
         last_activity_at = now(),
         login_count = COALESCE(login_count, 0) + 1
   WHERE id = uid;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.restore_business_backup(_payload jsonb, _mode text DEFAULT 'fresh'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_mode text := coalesce(_mode, 'fresh');
  v_version int;
  v_created timestamptz;
  v_biz jsonb;
  v_restore_id uuid := gen_random_uuid();
  rec jsonb;
  new_id uuid;
  src uuid;
  counts jsonb := '{}'::jsonb;
  skipped jsonb := '{}'::jsonb;
  c int;
  s int;
  v_display text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM public.staff_members sm WHERE sm.staff_user_id = uid AND sm.active) THEN
    RAISE EXCEPTION 'Only the business owner can restore a backup';
  END IF;
  IF v_mode NOT IN ('fresh','new_business','merge') THEN
    RAISE EXCEPTION 'Unsupported restore mode';
  END IF;
  IF coalesce(_payload->>'format','') <> 'kuditrack-backup' THEN
    RAISE EXCEPTION 'Invalid backup file';
  END IF;
  v_version := coalesce((_payload->>'version')::int, 0);
  IF v_version < 1 THEN RAISE EXCEPTION 'Invalid backup version'; END IF;
  IF v_version > 1 THEN RAISE EXCEPTION 'This backup was created with a newer version of KudiTrack and cannot currently be restored.'; END IF;

  v_created := nullif(_payload->>'created_at','')::timestamptz;
  v_biz := coalesce(_payload->'business', '{}'::jsonb);
  SELECT coalesce(display_name, business_name, '') INTO v_display FROM public.profiles WHERE id = uid;

  SELECT count(*) INTO c FROM public.restore_record_map m WHERE m.user_id = uid;

  -- business profile (non-privileged fields only), fresh mode only
  IF v_mode = 'fresh' THEN
    UPDATE public.profiles p SET
      business_name = coalesce(nullif(v_biz->>'business_name',''), p.business_name),
      business_type = coalesce(nullif(v_biz->>'business_type',''), p.business_type),
      phone = coalesce(nullif(v_biz->>'phone',''), p.phone),
      location = coalesce(nullif(v_biz->>'location',''), p.location),
      num_employees = coalesce(nullif(v_biz->>'num_employees',''), p.num_employees),
      logo_url = coalesce(nullif(v_biz->>'logo_url',''), p.logo_url),
      currency = coalesce(nullif(_payload->>'currency',''), p.currency),
      opening_cash_balance = coalesce((v_biz->>'opening_cash_balance')::numeric, p.opening_cash_balance),
      allow_sales_without_stock = coalesce((v_biz->>'allow_sales_without_stock')::boolean, p.allow_sales_without_stock),
      store_show_stock = coalesce((v_biz->>'store_show_stock')::boolean, p.store_show_stock),
      store_enable_notes = coalesce((v_biz->>'store_enable_notes')::boolean, p.store_enable_notes),
      store_enable_delivery_address = coalesce((v_biz->>'store_enable_delivery_address')::boolean, p.store_enable_delivery_address),
      store_enable_product_images = coalesce((v_biz->>'store_enable_product_images')::boolean, p.store_enable_product_images),
      store_default_delivery_fee = coalesce((v_biz->>'store_default_delivery_fee')::numeric, p.store_default_delivery_fee),
      store_payment_instructions = coalesce(nullif(v_biz->>'store_payment_instructions',''), p.store_payment_instructions)
    WHERE p.id = uid;
  END IF;

  -- CUSTOMERS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'customers','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='customers' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    IF v_mode = 'merge' AND EXISTS (
      SELECT 1 FROM public.customers x WHERE x.user_id = uid
        AND lower(x.name) = lower(coalesce(rec->>'name','')) AND coalesce(x.phone,'') = coalesce(rec->>'phone','')
    ) THEN
      SELECT x.id INTO new_id FROM public.customers x WHERE x.user_id=uid AND lower(x.name)=lower(coalesce(rec->>'name','')) AND coalesce(x.phone,'')=coalesce(rec->>'phone','') LIMIT 1;
      IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'customers',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
      s := s+1; CONTINUE;
    END IF;
    INSERT INTO public.customers (user_id, name, phone, email, note, created_at)
    VALUES (uid, coalesce(rec->>'name','Customer'), rec->>'phone', rec->>'email', rec->>'note', coalesce(nullif(rec->>'created_at','')::timestamptz, now()))
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'customers',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('customers', c); skipped := skipped || jsonb_build_object('customers', s);

  -- PRODUCTS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'products','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='products' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    IF v_mode = 'merge' AND EXISTS (
      SELECT 1 FROM public.products x WHERE x.user_id=uid AND lower(x.name)=lower(coalesce(rec->>'name','')) AND coalesce(x.sku,'')=coalesce(rec->>'sku','')
    ) THEN
      SELECT x.id INTO new_id FROM public.products x WHERE x.user_id=uid AND lower(x.name)=lower(coalesce(rec->>'name','')) AND coalesce(x.sku,'')=coalesce(rec->>'sku','') LIMIT 1;
      IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'products',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
      s := s+1; CONTINUE;
    END IF;
    INSERT INTO public.products (user_id, name, sku, price, cost, stock, low_stock_threshold, category, is_archived, image_url, available_online, online_description, created_at)
    VALUES (uid, coalesce(rec->>'name','Product'), rec->>'sku', coalesce((rec->>'price')::numeric,0), coalesce((rec->>'cost')::numeric,0),
            coalesce((rec->>'stock')::numeric,0), coalesce((rec->>'low_stock_threshold')::numeric,0), coalesce(nullif(rec->>'category',''),'General'),
            coalesce((rec->>'is_archived')::boolean,false), rec->>'image_url', coalesce((rec->>'available_online')::boolean,false), rec->>'online_description',
            coalesce(nullif(rec->>'created_at','')::timestamptz, now()))
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'products',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('products', c); skipped := skipped || jsonb_build_object('products', s);

  -- BANK ACCOUNTS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'bank_accounts','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='bank_accounts' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    INSERT INTO public.bank_accounts (user_id, bank_name, account_name, account_number, branch, mobile_money_name, mobile_money_number, account_type, note)
    VALUES (uid, coalesce(rec->>'bank_name',''), coalesce(rec->>'account_name',''), coalesce(rec->>'account_number',''), rec->>'branch',
            rec->>'mobile_money_name', rec->>'mobile_money_number', coalesce(nullif(rec->>'account_type',''),'bank'), rec->>'note')
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'bank_accounts',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('bank_accounts', c); skipped := skipped || jsonb_build_object('bank_accounts', s);

  -- RESTOCKS (inventory ledger). Triggers regenerate stock movements + linked expenses.
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'inventory','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='restocks' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    INSERT INTO public.restocks (user_id, product_id, product_name, category, quantity_added, cost_price_per_unit, total_cost, payment_method, note, reference, recorded_by_name, restock_date, status, is_opening_stock)
    VALUES (uid,
            (SELECT m.new_id FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='products' AND m.source_id = nullif(rec->>'product_id','')::uuid),
            coalesce(rec->>'product_name','Product'), coalesce(nullif(rec->>'category',''),'General'),
            coalesce((rec->>'quantity_added')::numeric,0), coalesce((rec->>'cost_price_per_unit')::numeric,0), coalesce((rec->>'total_cost')::numeric,0),
            coalesce(nullif(rec->>'payment_method',''),'cash'), rec->>'note', rec->>'reference', rec->>'recorded_by_name',
            coalesce(nullif(rec->>'restock_date','')::timestamptz, now()), coalesce(nullif(rec->>'status',''),'active'), coalesce((rec->>'is_opening_stock')::boolean,false))
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'restocks',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('inventory', c); skipped := skipped || jsonb_build_object('inventory', s);

  -- EXPENSES (skip restock-generated ones, they are recreated by the restock trigger)
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'expenses','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    IF coalesce(rec->>'description','') LIKE '%[RESTOCK:%' THEN s := s+1; CONTINUE; END IF;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='expenses' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    INSERT INTO public.expenses (user_id, amount, category, note, expense_date, description, payment_method, recorded_by_name)
    VALUES (uid, coalesce((rec->>'amount')::numeric,0), coalesce(nullif(rec->>'category',''),'Other'), rec->>'note',
            coalesce(nullif(rec->>'expense_date','')::timestamptz, now()), rec->>'description', rec->>'payment_method', rec->>'recorded_by_name')
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'expenses',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('expenses', c); skipped := skipped || jsonb_build_object('expenses', s);

  -- OTHER INCOME
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'other_income','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='other_income' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    INSERT INTO public.other_income (user_id, source, amount, note, income_date, category, payment_method, description, recorded_by_name)
    VALUES (uid, rec->>'source', coalesce((rec->>'amount')::numeric,0), rec->>'note',
            coalesce(nullif(rec->>'income_date','')::timestamptz, now()), rec->>'category', rec->>'payment_method', rec->>'description', rec->>'recorded_by_name')
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'other_income',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('other_income', c); skipped := skipped || jsonb_build_object('other_income', s);

  -- SAVINGS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'savings','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='savings' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    INSERT INTO public.savings (user_id, amount, savings_date, type, institution, account_name, note, source, reference, bank_account_id)
    VALUES (uid, coalesce((rec->>'amount')::numeric,0), coalesce(nullif(rec->>'savings_date','')::timestamptz, now()),
            nullif(rec->>'type','')::savings_type, rec->>'institution', rec->>'account_name', rec->>'note', rec->>'source', rec->>'reference',
            (SELECT m.new_id FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='bank_accounts' AND m.source_id = nullif(rec->>'bank_account_id','')::uuid))
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'savings',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('savings', c); skipped := skipped || jsonb_build_object('savings', s);

  -- INVESTMENTS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'investments','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='investments' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    INSERT INTO public.investments (user_id, name, amount, investment_date, status, note)
    VALUES (uid, coalesce(rec->>'name','Investment'), coalesce((rec->>'amount')::numeric,0),
            coalesce(nullif(rec->>'investment_date','')::timestamptz, now()), coalesce(nullif(rec->>'status',''),'active'), rec->>'note')
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'investments',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('investments', c); skipped := skipped || jsonb_build_object('investments', s);

  -- SALES (order-linked sales are recreated by the orders trigger, so they are skipped here)
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'sales','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    IF nullif(rec->>'order_id','') IS NOT NULL THEN s := s+1; CONTINUE; END IF;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='sales' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    INSERT INTO public.sales (user_id, business_id, total, cost_total, subtotal, discount, amount_paid, balance, payment_method, payment_status,
                              customer_name, customer_phone, customer_id, staff_name, note, notes, status, sale_channel, sale_date, due_date)
    VALUES (uid, uid, coalesce((rec->>'total')::numeric,0), coalesce((rec->>'cost_total')::numeric,0), coalesce((rec->>'subtotal')::numeric,0),
            coalesce((rec->>'discount')::numeric,0), coalesce((rec->>'amount_paid')::numeric,0), coalesce((rec->>'balance')::numeric,0),
            coalesce(nullif(rec->>'payment_method',''),'cash'), coalesce(nullif(rec->>'payment_status',''),'paid'),
            rec->>'customer_name', rec->>'customer_phone',
            (SELECT m.new_id FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='customers' AND m.source_id = nullif(rec->>'customer_id','')::uuid),
            rec->>'staff_name', rec->>'note', rec->>'notes', coalesce(nullif(rec->>'status',''),'completed'),
            coalesce(nullif(rec->>'sale_channel',''),'in_store'),
            coalesce(nullif(rec->>'sale_date','')::timestamptz, now()), nullif(rec->>'due_date','')::timestamptz)
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'sales',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('sales', c); skipped := skipped || jsonb_build_object('sales', s);

  -- SALE ITEMS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'sale_items','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    SELECT m.new_id INTO new_id FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='sales' AND m.source_id = nullif(rec->>'sale_id','')::uuid;
    IF new_id IS NULL THEN s := s+1; CONTINUE; END IF;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='sale_items' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    INSERT INTO public.sale_items (sale_id, user_id, business_id, product_id, product_name, sku, quantity, unit_price, unit_cost, cost_price, line_total)
    VALUES (new_id, uid, uid,
            (SELECT m.new_id FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='products' AND m.source_id = nullif(rec->>'product_id','')::uuid),
            coalesce(rec->>'product_name','Item'), rec->>'sku', coalesce((rec->>'quantity')::numeric,0), coalesce((rec->>'unit_price')::numeric,0),
            coalesce((rec->>'unit_cost')::numeric,0), coalesce((rec->>'cost_price')::numeric,0), coalesce((rec->>'line_total')::numeric,0))
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'sale_items',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('sale_items', c); skipped := skipped || jsonb_build_object('sale_items', s);

  -- ORDERS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'orders','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='orders' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    INSERT INTO public.orders (business_id, customer_name, customer_phone, delivery_location, notes, subtotal, discount, total, amount_paid, balance,
                               payment_method, payment_status, status, created_by_name, assigned_to_name, due_date, delivered_at, order_date,
                               carrier_name, carrier_phone, tracking_notes, source, estimated_delivery_date, delivery_fee, fulfillment_type,
                               customer_payment_name, customer_payment_reference)
    VALUES (uid, rec->>'customer_name', rec->>'customer_phone', rec->>'delivery_location', rec->>'notes',
            coalesce((rec->>'subtotal')::numeric,0), coalesce((rec->>'discount')::numeric,0), coalesce((rec->>'total')::numeric,0),
            coalesce((rec->>'amount_paid')::numeric,0), coalesce((rec->>'balance')::numeric,0),
            coalesce(nullif(rec->>'payment_method',''),'cash'), coalesce(nullif(rec->>'payment_status',''),'unpaid'),
            coalesce(nullif(rec->>'status',''),'pending'), rec->>'created_by_name', rec->>'assigned_to_name',
            nullif(rec->>'due_date','')::timestamptz, nullif(rec->>'delivered_at','')::timestamptz,
            coalesce(nullif(rec->>'order_date','')::timestamptz, now()),
            rec->>'carrier_name', rec->>'carrier_phone', rec->>'tracking_notes', coalesce(nullif(rec->>'source',''),'manual'),
            nullif(rec->>'estimated_delivery_date','')::date, coalesce((rec->>'delivery_fee')::numeric,0),
            coalesce(nullif(rec->>'fulfillment_type',''),'delivery'), rec->>'customer_payment_name', rec->>'customer_payment_reference')
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'orders',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('orders', c); skipped := skipped || jsonb_build_object('orders', s);

  -- ORDER ITEMS
  c := 0; s := 0;
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'order_items','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    SELECT m.new_id INTO new_id FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='orders' AND m.source_id = nullif(rec->>'order_id','')::uuid;
    IF new_id IS NULL THEN s := s+1; CONTINUE; END IF;
    IF src IS NOT NULL AND EXISTS (SELECT 1 FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='order_items' AND m.source_id=src) THEN s := s+1; CONTINUE; END IF;
    INSERT INTO public.order_items (business_id, order_id, product_id, product_name, sku, quantity, unit_price, cost_price, line_total)
    VALUES (uid, new_id,
            (SELECT m.new_id FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='products' AND m.source_id = nullif(rec->>'product_id','')::uuid),
            coalesce(rec->>'product_name','Item'), rec->>'sku', coalesce((rec->>'quantity')::numeric,0), coalesce((rec->>'unit_price')::numeric,0),
            coalesce((rec->>'cost_price')::numeric,0), coalesce((rec->>'line_total')::numeric,0))
    RETURNING id INTO new_id;
    IF src IS NOT NULL THEN INSERT INTO public.restore_record_map(user_id,entity,source_id,new_id,restore_id) VALUES (uid,'order_items',src,new_id,v_restore_id) ON CONFLICT DO NOTHING; END IF;
    c := c+1;
  END LOOP;
  counts := counts || jsonb_build_object('order_items', c); skipped := skipped || jsonb_build_object('order_items', s);

  -- Reconcile stock levels to the values captured in the backup
  FOR rec IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'products','[]'::jsonb)) LOOP
    src := nullif(rec->>'id','')::uuid;
    IF src IS NULL THEN CONTINUE; END IF;
    UPDATE public.products p SET stock = coalesce((rec->>'stock')::numeric, p.stock)
    WHERE p.user_id = uid
      AND p.id = (SELECT m.new_id FROM public.restore_record_map m WHERE m.user_id=uid AND m.entity='products' AND m.source_id=src);
  END LOOP;

  INSERT INTO public.restore_logs (id, user_id, business_id, backup_version, backup_created_at, backup_business_name, restore_mode, status, restored_counts, skipped_counts)
  VALUES (v_restore_id, uid, uid, v_version, v_created, nullif(v_biz->>'business_name',''), v_mode, 'success', counts, skipped);

  INSERT INTO public.audit_log (user_id, action, details, performed_by, performed_by_name)
  VALUES (uid, 'backup_restored',
          'Restored backup (' || v_mode || ') v' || v_version || ' - ' || coalesce(v_biz->>'business_name','business'),
          uid, v_display);

  RETURN jsonb_build_object('ok', true, 'restore_id', v_restore_id, 'mode', v_mode, 'restored', counts, 'skipped', skipped);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_invoice_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_num int;
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '\D', '', 'g'), '')::int), 0) + 1
      INTO next_num
      FROM public.sales WHERE user_id = NEW.user_id;
    NEW.invoice_number := 'INV-' || LPAD(next_num::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_sale_document_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_num int;
  prefix text;
BEGIN
  IF NEW.document_number IS NULL OR NEW.document_number = '' THEN
    prefix := CASE WHEN NEW.kind = 'invoice' THEN 'INV' ELSE 'RCT' END;
    SELECT COALESCE(MAX(NULLIF(regexp_replace(document_number, '\D', '', 'g'), '')::int), 0) + 1
      INTO next_num
      FROM public.sale_documents
      WHERE user_id = NEW.user_id AND kind = NEW.kind;
    NEW.document_number := prefix || '-' || LPAD(next_num::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.slugify(_input text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  s TEXT;
BEGIN
  s := lower(coalesce(_input, ''));
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := regexp_replace(s, '^-+|-+$', '', 'g');
  IF s = '' THEN s := 'store'; END IF;
  RETURN s;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_expenses_text_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.description is null and new.note is not null then new.description := new.note; end if;
  if new.note is null and new.description is not null then new.note := new.description; end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_offline_customer(_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _owner uuid := NULLIF(_payload->>'owner_id','')::uuid;
  _txn text := NULLIF(_payload->>'client_txn_id','');
  _name text := NULLIF(trim(_payload->>'name'),'');
  _id uuid;
BEGIN
  IF NOT public.offline_can_write(_owner, 'customers') THEN
    RAISE EXCEPTION 'Not allowed to write customers for this business';
  END IF;
  IF _txn IS NULL THEN RAISE EXCEPTION 'client_txn_id is required'; END IF;
  IF _name IS NULL THEN RAISE EXCEPTION 'Customer name is required'; END IF;

  SELECT id INTO _id FROM public.customers WHERE user_id = _owner AND client_txn_id = _txn;
  IF _id IS NOT NULL THEN
    RETURN jsonb_build_object('status','duplicate','customer_id',_id);
  END IF;

  SELECT id INTO _id FROM public.customers
   WHERE user_id = _owner AND lower(name) = lower(_name)
   ORDER BY created_at LIMIT 1;
  IF _id IS NOT NULL THEN
    UPDATE public.customers SET client_txn_id = _txn WHERE id = _id AND client_txn_id IS NULL;
    RETURN jsonb_build_object('status','matched','customer_id',_id);
  END IF;

  INSERT INTO public.customers (user_id, name, phone, email, note, client_txn_id, created_offline)
  VALUES (_owner, _name, NULLIF(_payload->>'phone',''), NULLIF(_payload->>'email',''),
          NULLIF(_payload->>'note',''), _txn, COALESCE((_payload->>'created_offline')::boolean, true))
  RETURNING id INTO _id;

  RETURN jsonb_build_object('status','created','customer_id',_id);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_offline_expense(_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _owner uuid := NULLIF(_payload->>'owner_id','')::uuid;
  _txn text := NULLIF(_payload->>'client_txn_id','');
  _id uuid;
BEGIN
  IF NOT public.offline_can_write(_owner, 'expenses') THEN
    RAISE EXCEPTION 'Not allowed to record expenses for this business';
  END IF;
  IF _txn IS NULL THEN RAISE EXCEPTION 'client_txn_id is required'; END IF;

  SELECT id INTO _id FROM public.expenses WHERE user_id = _owner AND client_txn_id = _txn;
  IF _id IS NOT NULL THEN RETURN jsonb_build_object('status','duplicate','expense_id',_id); END IF;

  INSERT INTO public.expenses (user_id, amount, category, description, note, payment_method,
                               expense_date, recorded_by, recorded_by_name, client_txn_id, created_offline)
  VALUES (_owner, COALESCE((_payload->>'amount')::numeric,0),
          COALESCE(NULLIF(_payload->>'category',''),'Other'),
          NULLIF(_payload->>'description',''), NULLIF(_payload->>'note',''),
          NULLIF(_payload->>'payment_method',''),
          COALESCE((_payload->>'expense_date')::timestamptz, now()),
          auth.uid(), NULLIF(_payload->>'recorded_by_name',''), _txn, true)
  RETURNING id INTO _id;

  RETURN jsonb_build_object('status','created','expense_id',_id);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_offline_income(_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _owner uuid := NULLIF(_payload->>'owner_id','')::uuid;
  _txn text := NULLIF(_payload->>'client_txn_id','');
  _id uuid;
BEGIN
  IF NOT public.offline_can_write(_owner, 'other_income') THEN
    RAISE EXCEPTION 'Not allowed to record income for this business';
  END IF;
  IF _txn IS NULL THEN RAISE EXCEPTION 'client_txn_id is required'; END IF;

  SELECT id INTO _id FROM public.other_income WHERE user_id = _owner AND client_txn_id = _txn;
  IF _id IS NOT NULL THEN RETURN jsonb_build_object('status','duplicate','income_id',_id); END IF;

  INSERT INTO public.other_income (user_id, amount, source, category, description, note,
                                   payment_method, income_date, recorded_by, recorded_by_name,
                                   client_txn_id, created_offline)
  VALUES (_owner, COALESCE((_payload->>'amount')::numeric,0),
          NULLIF(_payload->>'source',''), NULLIF(_payload->>'category',''),
          NULLIF(_payload->>'description',''), NULLIF(_payload->>'note',''),
          NULLIF(_payload->>'payment_method',''),
          COALESCE((_payload->>'income_date')::timestamptz, now()),
          auth.uid(), NULLIF(_payload->>'recorded_by_name',''), _txn, true)
  RETURNING id INTO _id;

  RETURN jsonb_build_object('status','created','income_id',_id);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_offline_sale(_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _owner uuid := NULLIF(_payload->>'owner_id','')::uuid;
  _txn text := NULLIF(_payload->>'client_txn_id','');
  _items jsonb := COALESCE(_payload->'items','[]'::jsonb);
  _item jsonb;
  _sale_id uuid;
  _customer_id uuid;
  _customer_name text := NULLIF(trim(_payload->>'customer_name'),'');
  _allow_no_stock boolean := false;
  _shortfall numeric := 0;
  _requested numeric;
  _available numeric;
  _pid uuid;
  _total numeric := COALESCE((_payload->>'total')::numeric, 0);
  _paid numeric := COALESCE((_payload->>'amount_paid')::numeric, 0);
BEGIN
  IF NOT public.offline_can_write(_owner, 'sales') THEN
    RAISE EXCEPTION 'Not allowed to record sales for this business';
  END IF;
  IF _txn IS NULL THEN RAISE EXCEPTION 'client_txn_id is required'; END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Sale has no items'; END IF;

  SELECT id INTO _sale_id FROM public.sales WHERE user_id = _owner AND client_txn_id = _txn;
  IF _sale_id IS NOT NULL THEN
    RETURN jsonb_build_object('status','duplicate','sale_id',_sale_id);
  END IF;

  SELECT COALESCE(allow_sales_without_stock,false) INTO _allow_no_stock
    FROM public.profiles WHERE id = _owner;

  -- Conflict check against CURRENT cloud stock (other devices may have sold
  -- the same items while this device was offline).
  FOR _pid, _requested IN
    SELECT (value->>'product_id')::uuid, SUM(COALESCE((value->>'quantity')::numeric,0))
      FROM jsonb_array_elements(_items)
     WHERE NULLIF(value->>'product_id','') IS NOT NULL
     GROUP BY 1
  LOOP
    SELECT COALESCE(stock,0) INTO _available FROM public.products WHERE id = _pid AND user_id = _owner;
    IF _available IS NULL THEN
      RETURN jsonb_build_object('status','conflict','reason','product_missing',
        'message','A product on this sale no longer exists in your catalogue.');
    END IF;
    _shortfall := _shortfall + GREATEST(0, _requested - GREATEST(0, _available));
  END LOOP;

  IF _shortfall > 0 AND NOT _allow_no_stock THEN
    RETURN jsonb_build_object('status','conflict','reason','insufficient_stock',
      'message','Stock changed while you were offline, so this sale would push inventory negative.');
  END IF;

  -- Customer resolution: prefer an already-synced offline customer.
  IF NULLIF(_payload->>'customer_client_txn_id','') IS NOT NULL THEN
    SELECT id INTO _customer_id FROM public.customers
     WHERE user_id = _owner AND client_txn_id = _payload->>'customer_client_txn_id';
  END IF;
  IF _customer_id IS NULL AND NULLIF(_payload->>'customer_id','') IS NOT NULL THEN
    SELECT id INTO _customer_id FROM public.customers
     WHERE user_id = _owner AND id = (_payload->>'customer_id')::uuid;
  END IF;
  IF _customer_id IS NULL AND _customer_name IS NOT NULL AND lower(_customer_name) <> 'walk-in' THEN
    SELECT id INTO _customer_id FROM public.customers
     WHERE user_id = _owner AND lower(name) = lower(_customer_name) ORDER BY created_at LIMIT 1;
    IF _customer_id IS NULL THEN
      INSERT INTO public.customers (user_id, name, phone, created_offline)
      VALUES (_owner, _customer_name, NULLIF(_payload->>'customer_phone',''),
              COALESCE((_payload->>'created_offline')::boolean, true))
      RETURNING id INTO _customer_id;
    END IF;
  END IF;

  INSERT INTO public.sales (
    user_id, business_id, customer_id, customer_name, customer_phone,
    staff_id, staff_name, sale_date, due_date, subtotal, discount, total,
    cost_total, amount_paid, balance, payment_method, payment_status,
    status, sale_channel, notes, client_txn_id, created_offline,
    client_device_id, synced_at
  ) VALUES (
    _owner, _owner, _customer_id, COALESCE(_customer_name,'Walk-in'),
    NULLIF(_payload->>'customer_phone',''),
    auth.uid(), NULLIF(_payload->>'staff_name',''),
    COALESCE((_payload->>'sale_date')::timestamptz, now()),
    NULLIF(_payload->>'due_date','')::timestamptz,
    COALESCE((_payload->>'subtotal')::numeric,0),
    COALESCE((_payload->>'discount')::numeric,0),
    _total,
    COALESCE((_payload->>'cost_total')::numeric,0),
    _paid,
    COALESCE((_payload->>'balance')::numeric, GREATEST(0, _total - _paid)),
    COALESCE(NULLIF(_payload->>'payment_method',''),'cash'),
    COALESCE(NULLIF(_payload->>'payment_status',''),'paid'),
    'completed', COALESCE(NULLIF(_payload->>'sale_channel',''),'pos'),
    NULLIF(_payload->>'notes',''), _txn,
    COALESCE((_payload->>'created_offline')::boolean, true),
    NULLIF(_payload->>'client_device_id',''), now()
  ) RETURNING id INTO _sale_id;

  FOR _item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    INSERT INTO public.sale_items (
      sale_id, user_id, business_id, product_id, product_name, sku,
      quantity, unit_price, unit_cost, cost_price, line_total
    ) VALUES (
      _sale_id, _owner, _owner, NULLIF(_item->>'product_id','')::uuid,
      COALESCE(NULLIF(_item->>'product_name',''),'Line item'),
      NULLIF(_item->>'sku',''),
      COALESCE((_item->>'quantity')::numeric,0),
      COALESCE((_item->>'unit_price')::numeric,0),
      COALESCE((_item->>'unit_cost')::numeric,0),
      COALESCE((_item->>'unit_cost')::numeric,0),
      COALESCE((_item->>'line_total')::numeric,0)
    );
  END LOOP;

  INSERT INTO public.audit_log (user_id, action, details, performed_by, performed_by_name)
  VALUES (_owner, 'offline_sale_synced',
          format('Offline sale %s synced (device %s)', _txn, COALESCE(_payload->>'client_device_id','unknown')),
          auth.uid(), NULLIF(_payload->>'staff_name',''));

  RETURN jsonb_build_object('status','created','sale_id',_sale_id,'shortfall',_shortfall);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_other_income_source()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.source is null or new.source = '' then
    new.source := coalesce(new.category, 'Other');
  end if;
  if new.category is null or new.category = '' then
    new.category := coalesce(new.source, 'Other');
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_product_stock(_product_id uuid, _user_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stock numeric := 0;
begin
  if _product_id is null or _user_id is null then
    return 0;
  end if;

  select coalesce(sum(sm.change), 0)
    into v_stock
  from public.stock_movements sm
  where sm.product_id = _product_id
    and sm.user_id = _user_id;

  update public.products p
  set stock = v_stock,
      updated_at = now()
  where p.id = _product_id
    and p.user_id = _user_id;

  return v_stock;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_restock_to_expense()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tag text;
  v_description text;
  v_should_have_expense boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.expenses
     WHERE user_id = OLD.user_id
       AND description LIKE '%[RESTOCK:' || OLD.id::text || ']%';
    RETURN OLD;
  END IF;

  -- Guard: only sync when the owning user still exists
  IF NEW.user_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = NEW.user_id) THEN
    RETURN NEW;
  END IF;

  v_tag := '[RESTOCK:' || NEW.id::text || ']';
  v_description := 'Inventory Purchase (Restock) - ' || COALESCE(NULLIF(NEW.product_name, ''), 'Product')
                   || ' x' || COALESCE(NEW.quantity_added, 0)::text
                   || ' ' || v_tag;

  v_should_have_expense := COALESCE(NEW.status, 'active') <> 'cancelled'
                           AND COALESCE(NEW.is_opening_stock, false) = false
                           AND COALESCE(NEW.total_cost, 0) > 0;

  DELETE FROM public.expenses
   WHERE user_id = NEW.user_id
     AND description LIKE '%[RESTOCK:' || NEW.id::text || ']%';

  IF v_should_have_expense THEN
    INSERT INTO public.expenses (
      user_id, amount, category, description, note,
      expense_date, payment_method, recorded_by, recorded_by_name
    ) VALUES (
      NEW.user_id, NEW.total_cost, 'Restock', v_description,
      COALESCE(NEW.note, NEW.reference),
      NEW.restock_date, COALESCE(NEW.payment_method, 'cash'),
      NEW.recorded_by, NEW.recorded_by_name
    );
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_savings_type_source()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- type is an enum (savings_type) with values like 'bank','mobile_money','susu' (best-effort match).
  if new.source is null and new.type is not null then
    new.source := new.type::text;
  end if;
  if (new.type is null) and new.source is not null then
    begin
      new.type := (new.source::public.savings_type);
    exception when others then
      -- If the source string doesn't match the enum (e.g. 'mobile_money'), default to 'bank'.
      begin
        new.type := 'bank'::public.savings_type;
      exception when others then null;
      end;
    end;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.tg_marketing_reviews_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.tg_order_items_lock_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  parent_status text;
  parent_id uuid := COALESCE(NEW.order_id, OLD.order_id);
BEGIN
  IF parent_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP <> 'UPDATE' THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT status INTO parent_status FROM public.orders WHERE id = parent_id;
  IF parent_status IN ('delivered','completed') THEN
    RAISE EXCEPTION 'Order is % and items cannot be modified.', parent_status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.tg_orders_lock_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF OLD.status NOT IN ('delivered','completed') THEN RETURN NEW; END IF;

  -- Allow the one legal status transition and internal bookkeeping fields.
  IF OLD.status = 'delivered' AND NEW.status = 'completed' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Order is % and cannot change status.', OLD.status USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.customer_name IS DISTINCT FROM OLD.customer_name
     OR NEW.customer_phone IS DISTINCT FROM OLD.customer_phone
     OR NEW.delivery_location IS DISTINCT FROM OLD.delivery_location
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.discount IS DISTINCT FROM OLD.discount
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee
     OR NEW.amount_paid IS DISTINCT FROM OLD.amount_paid
     OR NEW.balance IS DISTINCT FROM OLD.balance
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.fulfillment_type IS DISTINCT FROM OLD.fulfillment_type
     OR NEW.carrier_name IS DISTINCT FROM OLD.carrier_name
     OR NEW.carrier_phone IS DISTINCT FROM OLD.carrier_phone
     OR NEW.tracking_notes IS DISTINCT FROM OLD.tracking_notes
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.estimated_delivery_date IS DISTINCT FROM OLD.estimated_delivery_date
     OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    RAISE EXCEPTION 'Order is % and cannot be modified.', OLD.status USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.tg_orders_rollback_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.sale_items WHERE sale_id IN (SELECT id FROM public.sales WHERE order_id = OLD.id);
  DELETE FROM public.sales WHERE order_id = OLD.id;
  RETURN OLD;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.tg_orders_set_confirmation_token()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.confirmation_token IS NULL OR NEW.confirmation_token = '' THEN
    NEW.confirmation_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    NEW.confirmation_token := substr(NEW.confirmation_token, 1, 36);
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.tg_orders_set_tracking_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.tracking_code IS NULL OR NEW.tracking_code = '' THEN
    NEW.tracking_code := public.gen_tracking_code();
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.tg_orders_sync_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing_sale_id uuid;
  new_sale_id uuid;
  should_sync boolean := false;
  v_cost_total numeric := 0;
BEGIN
  IF NEW.status NOT IN ('delivered','completed') THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    should_sync := true;
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    should_sync := true;
  END IF;

  IF NOT should_sync THEN RETURN NEW; END IF;

  SELECT id INTO existing_sale_id FROM public.sales WHERE order_id = NEW.id LIMIT 1;
  IF existing_sale_id IS NOT NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(COALESCE(oi.cost_price,0) * COALESCE(oi.quantity,0)), 0)
    INTO v_cost_total
    FROM public.order_items oi WHERE oi.order_id = NEW.id;

  INSERT INTO public.sales (
    user_id, business_id, sale_date, customer_name, customer_phone,
    staff_id, staff_name, subtotal, discount, total, cost_total, amount_paid, balance,
    payment_method, payment_status, notes, status, sale_channel, due_date, order_id
  ) VALUES (
    NEW.business_id, NEW.business_id, COALESCE(NEW.delivered_at, now()),
    NEW.customer_name, NEW.customer_phone,
    COALESCE(NEW.assigned_to, NEW.created_by, NEW.business_id),
    COALESCE(NEW.assigned_to_name, NEW.created_by_name, ''),
    COALESCE(NEW.subtotal, 0), COALESCE(NEW.discount, 0), COALESCE(NEW.total, 0),
    v_cost_total,
    COALESCE(NEW.amount_paid, 0), COALESCE(NEW.balance, 0),
    COALESCE(NEW.payment_method, 'cash'), COALESCE(NEW.payment_status, 'unpaid'),
    NEW.notes, 'delivered', 'order', NEW.due_date, NEW.id
  ) RETURNING id INTO new_sale_id;

  INSERT INTO public.sale_items (
    user_id, business_id, sale_id, product_id, product_name, sku,
    quantity, unit_price, unit_cost, cost_price, line_total
  )
  SELECT NEW.business_id, NEW.business_id, new_sale_id, oi.product_id, oi.product_name,
         COALESCE(oi.sku, ''), oi.quantity, oi.unit_price,
         COALESCE(oi.cost_price, 0), COALESCE(oi.cost_price, 0), oi.line_total
    FROM public.order_items oi
   WHERE oi.order_id = NEW.id;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.tg_profiles_set_store_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.store_slug IS NULL AND NEW.business_name IS NOT NULL AND btrim(NEW.business_name) <> '' THEN
    NEW.store_slug := public.ensure_unique_store_slug(NEW.business_name, NEW.id);
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.tg_surveys_set_enabled_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.enabled = true AND (TG_OP = 'INSERT' OR OLD.enabled = false OR OLD.enabled IS NULL) THEN
    NEW.enabled_at := now();
  ELSIF NEW.enabled = false THEN
    -- keep last enabled_at as historical marker; or clear it. Keep it for eligibility comparisons.
    NEW.enabled_at := NEW.enabled_at;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.touch_user_activity()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  prev timestamptz;
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  SELECT last_activity_at INTO prev FROM public.profiles WHERE id = uid;

  IF prev IS NULL OR prev < now() - interval '5 minutes' THEN
    UPDATE public.profiles
       SET last_activity_at = now()
     WHERE id = uid;
  END IF;
END;
$function$
;

-- ============ TRIGGERS ============
CREATE TRIGGER announcements_updated_at BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bank_accounts_updated BEFORE UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER currencies_set_updated_at BEFORE UPDATE ON public.currencies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER dashboard_preferences_set_updated_at BEFORE UPDATE ON public.dashboard_preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_email_recipients_updated BEFORE UPDATE ON public.email_campaign_recipients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_email_campaigns_updated BEFORE UPDATE ON public.email_campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_email_media_updated BEFORE UPDATE ON public.email_media_library FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_email_templates_updated BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER exchange_rates_set_updated_at BEFORE UPDATE ON public.exchange_rates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_expenses_updated BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sync_expenses_text BEFORE INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION sync_expenses_text_columns();
CREATE TRIGGER trg_investments_updated BEFORE UPDATE ON public.investments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_investor_funding_updated BEFORE UPDATE ON public.investor_funding FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_marketing_reviews_updated_at BEFORE UPDATE ON public.marketing_reviews FOR EACH ROW EXECUTE FUNCTION tg_marketing_reviews_set_updated_at();
CREATE TRIGGER order_items_lock_completed BEFORE DELETE OR UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION tg_order_items_lock_completed();
CREATE TRIGGER orders_set_tracking_code BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION tg_orders_set_tracking_code();
CREATE TRIGGER orders_lock_completed BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION tg_orders_lock_completed();
CREATE TRIGGER orders_set_confirmation_token BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION tg_orders_set_confirmation_token();
CREATE TRIGGER orders_rollback_sale BEFORE DELETE ON public.orders FOR EACH ROW EXECUTE FUNCTION tg_orders_rollback_sale();
CREATE TRIGGER orders_sync_sale AFTER INSERT OR UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION tg_orders_sync_sale();
CREATE TRIGGER other_income_updated_at BEFORE UPDATE ON public.other_income FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sync_other_income_source BEFORE INSERT OR UPDATE ON public.other_income FOR EACH ROW EXECUTE FUNCTION sync_other_income_source();
CREATE TRIGGER trg_payment_methods_updated BEFORE UPDATE ON public.payment_methods FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_platform_ads_updated BEFORE UPDATE ON public.platform_ads FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_platform_support_settings_updated BEFORE UPDATE ON public.platform_support_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER pricing_plans_set_updated_at BEFORE UPDATE ON public.pricing_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_prevent_profile_privileged_updates BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION prevent_profile_privileged_updates();
CREATE TRIGGER profiles_set_store_slug BEFORE INSERT OR UPDATE OF business_name, store_slug ON public.profiles FOR EACH ROW EXECUTE FUNCTION tg_profiles_set_store_slug();
CREATE TRIGGER referrals_set_updated_at BEFORE UPDATE ON public.referrals FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sync_restock_to_expense AFTER INSERT OR DELETE OR UPDATE ON public.restocks FOR EACH ROW EXECUTE FUNCTION sync_restock_to_expense();
CREATE TRIGGER trg_restocks_updated_at BEFORE UPDATE ON public.restocks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_handle_restock_stock_ledger AFTER INSERT OR DELETE OR UPDATE ON public.restocks FOR EACH ROW EXECUTE FUNCTION handle_restock_stock_ledger();
CREATE TRIGGER update_restocks_updated_at BEFORE UPDATE ON public.restocks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sale_documents_set_updated_at BEFORE UPDATE ON public.sale_documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sale_documents_set_number BEFORE INSERT ON public.sale_documents FOR EACH ROW EXECUTE FUNCTION set_sale_document_number();
CREATE TRIGGER trg_handle_sale_item_stock_ledger AFTER INSERT OR DELETE OR UPDATE ON public.sale_items FOR EACH ROW EXECUTE FUNCTION handle_sale_item_stock_ledger();
CREATE TRIGGER trg_sales_updated BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sales_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_set_invoice_number BEFORE INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION set_invoice_number();
CREATE TRIGGER trg_savings_updated_at BEFORE UPDATE ON public.savings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_savings_updated_at BEFORE UPDATE ON public.savings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sync_savings_type_source BEFORE INSERT OR UPDATE ON public.savings FOR EACH ROW EXECUTE FUNCTION sync_savings_type_source();
CREATE TRIGGER staff_invites_set_updated_at BEFORE UPDATE ON public.staff_invites FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER staff_members_set_updated_at BEFORE UPDATE ON public.staff_members FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER statement_deliveries_set_updated_at BEFORE UPDATE ON public.statement_deliveries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER statement_settings_set_updated_at BEFORE UPDATE ON public.statement_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER subscription_payments_referral_reward AFTER UPDATE ON public.subscription_payments FOR EACH ROW EXECUTE FUNCTION process_referral_reward();
CREATE TRIGGER trg_sub_payments_updated BEFORE UPDATE ON public.subscription_payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_survey_questions_updated_at BEFORE UPDATE ON public.survey_questions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_survey_user_status_updated_at BEFORE UPDATE ON public.survey_user_status FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER surveys_set_enabled_at BEFORE INSERT OR UPDATE OF enabled ON public.surveys FOR EACH ROW EXECUTE FUNCTION tg_surveys_set_enabled_at();
CREATE TRIGGER trg_surveys_updated_at BEFORE UPDATE ON public.surveys FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============ GRANTS ============
-- Reproduces the exact privilege set of the source project.
grant usage on schema public to anon, authenticated, service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.ad_applications to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.ad_applications to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.ad_applications to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.announcements to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.announcements to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.announcements to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.audit_log to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.audit_log to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.audit_log to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.bank_accounts to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.bank_accounts to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.bank_accounts to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.currencies to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.currencies to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.currencies to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.customers to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.customers to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.customers to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.dashboard_preferences to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.dashboard_preferences to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.dashboard_preferences to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.email_audit_log to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.email_audit_log to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.email_audit_log to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.email_campaign_recipients to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.email_campaign_recipients to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.email_campaign_recipients to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.email_campaigns to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.email_campaigns to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.email_campaigns to service_role;

grant SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.email_marketing_unsubscribes to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.email_marketing_unsubscribes to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.email_marketing_unsubscribes to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.email_media_library to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.email_media_library to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.email_media_library to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.email_templates to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.email_templates to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.email_templates to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.exchange_rates to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.exchange_rates to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.exchange_rates to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.expenses to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.expenses to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.expenses to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.feedback_messages to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.feedback_messages to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.feedback_messages to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.investments to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.investments to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.investments to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.investor_funding to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.investor_funding to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.investor_funding to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.marketing_reviews to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.marketing_reviews to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.marketing_reviews to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.order_items to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.order_items to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.order_items to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.orders to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.orders to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.orders to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.other_income to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.other_income to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.other_income to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.payment_methods to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.payment_methods to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.payment_methods to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.platform_ads to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.platform_ads to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.platform_ads to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.platform_support_settings to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.platform_support_settings to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.platform_support_settings to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.pricing_plans to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.pricing_plans to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.pricing_plans to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.products to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.products to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.products to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.profiles to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.profiles to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.profiles to service_role;

grant INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.referral_codes to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.referral_codes to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.referral_codes to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.referrals to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.referrals to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.referrals to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.restocks to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.restocks to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.restocks to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.restore_logs to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.restore_logs to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.restore_logs to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.restore_record_map to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.restore_record_map to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.restore_record_map to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.sale_documents to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.sale_documents to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.sale_documents to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.sale_items to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.sale_items to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.sale_items to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.sales to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.sales to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.sales to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.savings to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.savings to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.savings to service_role;

grant INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.signup_otps to anon;
grant SELECT, TRUNCATE, REFERENCES, TRIGGER on public.signup_otps to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.signup_otps to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.sms_logs to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.sms_logs to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.sms_logs to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.staff_invites to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.staff_invites to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.staff_invites to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.staff_members to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.staff_members to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.staff_members to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.statement_deliveries to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.statement_deliveries to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.statement_deliveries to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.statement_settings to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.statement_settings to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.statement_settings to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.stock_movements to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.stock_movements to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.stock_movements to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.subscription_payments to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.subscription_payments to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.subscription_payments to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.support_messages to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.support_messages to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.support_messages to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.survey_questions to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.survey_questions to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.survey_questions to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.survey_response_answers to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.survey_response_answers to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.survey_response_answers to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.survey_responses to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.survey_responses to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.survey_responses to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.survey_user_status to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.survey_user_status to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.survey_user_status to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.surveys to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.surveys to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.surveys to service_role;

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.user_roles to anon;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.user_roles to authenticated;
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.user_roles to service_role;

-- function execute (default supabase behaviour)
grant execute on all functions in schema public to anon, authenticated, service_role;

-- ============ RLS ENABLE ============
alter table public.currencies enable row level security;
alter table public.support_messages enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.other_income enable row level security;
alter table public.user_roles enable row level security;
alter table public.announcements enable row level security;
alter table public.platform_support_settings enable row level security;
alter table public.email_campaign_recipients enable row level security;
alter table public.referrals enable row level security;
alter table public.pricing_plans enable row level security;
alter table public.order_items enable row level security;
alter table public.restore_record_map enable row level security;
alter table public.restore_logs enable row level security;
alter table public.staff_members enable row level security;
alter table public.orders enable row level security;
alter table public.sale_documents enable row level security;
alter table public.survey_responses enable row level security;
alter table public.survey_response_answers enable row level security;
alter table public.customers enable row level security;
alter table public.restocks enable row level security;
alter table public.sms_logs enable row level security;
alter table public.staff_invites enable row level security;
alter table public.dashboard_preferences enable row level security;
alter table public.statement_settings enable row level security;
alter table public.statement_deliveries enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.investor_funding enable row level security;
alter table public.profiles enable row level security;
alter table public.expenses enable row level security;
alter table public.investments enable row level security;
alter table public.marketing_reviews enable row level security;
alter table public.feedback_messages enable row level security;
alter table public.ad_applications enable row level security;
alter table public.survey_user_status enable row level security;
alter table public.savings enable row level security;
alter table public.referral_codes enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.signup_otps enable row level security;
alter table public.sales enable row level security;
alter table public.audit_log enable row level security;
alter table public.products enable row level security;
alter table public.email_marketing_unsubscribes enable row level security;
alter table public.email_audit_log enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_media_library enable row level security;
alter table public.sale_items enable row level security;
alter table public.survey_questions enable row level security;
alter table public.platform_ads enable row level security;
alter table public.payment_methods enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.stock_movements enable row level security;
alter table public.surveys enable row level security;

-- ============ POLICIES ============
create policy 'Anyone can submit ad application' on public.ad_applications as PERMISSIVE for INSERT to public with check (((status = 'pending'::text) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL)));
create policy 'Super admins delete ad applications' on public.ad_applications as PERMISSIVE for DELETE to public using (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'Super admins read ad applications' on public.ad_applications as PERMISSIVE for SELECT to public using (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'Super admins update ad applications' on public.ad_applications as PERMISSIVE for UPDATE to public using (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'announcements managed by super admin' on public.announcements as PERMISSIVE for ALL to public using (has_role(auth.uid(), 'super_admin'::app_role)) with check (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'announcements readable by audience' on public.announcements as PERMISSIVE for SELECT to public using (((auth.uid() IS NOT NULL) AND (publish_at <= now()) AND (((target_user_id IS NULL) AND (target_plan IS NULL)) OR (target_user_id = auth.uid()) OR (target_plan IN ( SELECT profiles.subscription_plan
   FROM profiles
  WHERE (profiles.id = auth.uid()))))));
create policy 'audit_log insert own' on public.audit_log as PERMISSIVE for INSERT to authenticated with check (((auth.uid() = user_id) AND (performed_by = auth.uid()) AND (char_length(action) <= 80) AND ((details IS NULL) OR (char_length(details) <= 1000))));
create policy 'audit_log select own' on public.audit_log as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy 'bank_accounts delete own' on public.bank_accounts as PERMISSIVE for DELETE to public using ((auth.uid() = user_id));
create policy 'bank_accounts insert own' on public.bank_accounts as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));
create policy 'bank_accounts select own' on public.bank_accounts as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy 'bank_accounts team delete' on public.bank_accounts as PERMISSIVE for DELETE to public using (is_business_member_module(user_id, 'savings'::text));
create policy 'bank_accounts team insert' on public.bank_accounts as PERMISSIVE for INSERT to public with check (is_business_member_module(user_id, 'savings'::text));
create policy 'bank_accounts team select' on public.bank_accounts as PERMISSIVE for SELECT to public using (is_business_member_module(user_id, 'savings'::text));
create policy 'bank_accounts team update' on public.bank_accounts as PERMISSIVE for UPDATE to public using (is_business_member_module(user_id, 'savings'::text)) with check (is_business_member_module(user_id, 'savings'::text));
create policy 'bank_accounts update own' on public.bank_accounts as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id));
create policy 'Currencies readable by everyone' on public.currencies as PERMISSIVE for SELECT to public using (true);
create policy 'Super admins manage currencies' on public.currencies as PERMISSIVE for ALL to authenticated using (has_role(auth.uid(), 'super_admin'::app_role)) with check (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'customers delete own' on public.customers as PERMISSIVE for DELETE to public using ((auth.uid() = user_id));
create policy 'customers insert own' on public.customers as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));
create policy 'customers select own' on public.customers as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy 'customers team delete' on public.customers as PERMISSIVE for DELETE to public using (is_business_member_module(user_id, 'customers'::text));
create policy 'customers team insert' on public.customers as PERMISSIVE for INSERT to public with check (is_business_member_module(user_id, 'customers'::text));
create policy 'customers team select' on public.customers as PERMISSIVE for SELECT to public using (is_business_member_module(user_id, 'customers'::text));
create policy 'customers team update' on public.customers as PERMISSIVE for UPDATE to public using (is_business_member_module(user_id, 'customers'::text)) with check (is_business_member_module(user_id, 'customers'::text));
create policy 'customers update own' on public.customers as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id));
create policy 'Users manage their own dashboard preferences' on public.dashboard_preferences as PERMISSIVE for ALL to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy 'Super admins add audit entries' on public.email_audit_log as PERMISSIVE for INSERT to public with check (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'Super admins view audit log' on public.email_audit_log as PERMISSIVE for SELECT to public using (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'Super admins manage recipients' on public.email_campaign_recipients as PERMISSIVE for ALL to public using (has_role(auth.uid(), 'super_admin'::app_role)) with check (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'Super admins manage campaigns' on public.email_campaigns as PERMISSIVE for ALL to public using (has_role(auth.uid(), 'super_admin'::app_role)) with check (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'Super admins can delete unsubscribes' on public.email_marketing_unsubscribes as PERMISSIVE for DELETE to public using (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'Super admins view unsubscribes' on public.email_marketing_unsubscribes as PERMISSIVE for SELECT to public using (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'Users can unsubscribe their own email' on public.email_marketing_unsubscribes as PERMISSIVE for INSERT to authenticated with check (((user_id = auth.uid()) AND (lower(email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)))));
create policy 'Super admins manage media' on public.email_media_library as PERMISSIVE for ALL to public using (has_role(auth.uid(), 'super_admin'::app_role)) with check (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'Super admins manage templates' on public.email_templates as PERMISSIVE for ALL to public using (has_role(auth.uid(), 'super_admin'::app_role)) with check (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'Exchange rates readable by everyone' on public.exchange_rates as PERMISSIVE for SELECT to public using (true);
create policy 'expenses delete own' on public.expenses as PERMISSIVE for DELETE to public using ((auth.uid() = user_id));
create policy 'expenses insert own' on public.expenses as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));
create policy 'expenses select own' on public.expenses as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy 'expenses team delete' on public.expenses as PERMISSIVE for DELETE to public using (is_business_member_module(user_id, 'expenses'::text));
create policy 'expenses team insert' on public.expenses as PERMISSIVE for INSERT to public with check (is_business_member_module(user_id, 'expenses'::text));
create policy 'expenses team select' on public.expenses as PERMISSIVE for SELECT to public using (is_business_member_module(user_id, 'expenses'::text));
create policy 'expenses team update' on public.expenses as PERMISSIVE for UPDATE to public using (is_business_member_module(user_id, 'expenses'::text)) with check (is_business_member_module(user_id, 'expenses'::text));
create policy 'expenses update own' on public.expenses as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id));
create policy 'Anyone can submit feedback' on public.feedback_messages as PERMISSIVE for INSERT to public with check (((status = 'new'::text) AND (resolved_by IS NULL) AND (resolved_at IS NULL)));
create policy 'Super admins delete feedback' on public.feedback_messages as PERMISSIVE for DELETE to public using (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'Super admins read feedback' on public.feedback_messages as PERMISSIVE for SELECT to public using (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'Super admins update feedback' on public.feedback_messages as PERMISSIVE for UPDATE to public using (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'investments delete own' on public.investments as PERMISSIVE for DELETE to public using ((auth.uid() = user_id));
create policy 'investments insert own' on public.investments as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));
create policy 'investments select own' on public.investments as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy 'investments team delete' on public.investments as PERMISSIVE for DELETE to public using (is_business_member_module(user_id, 'savings'::text));
create policy 'investments team insert' on public.investments as PERMISSIVE for INSERT to public with check (is_business_member_module(user_id, 'savings'::text));
create policy 'investments team select' on public.investments as PERMISSIVE for SELECT to public using (is_business_member_module(user_id, 'savings'::text));
create policy 'investments team update' on public.investments as PERMISSIVE for UPDATE to public using (is_business_member_module(user_id, 'savings'::text)) with check (is_business_member_module(user_id, 'savings'::text));
create policy 'investments update own' on public.investments as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id));
create policy 'investor_funding delete own' on public.investor_funding as PERMISSIVE for DELETE to public using ((auth.uid() = user_id));
create policy 'investor_funding insert own' on public.investor_funding as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));
create policy 'investor_funding select own' on public.investor_funding as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy 'investor_funding update own' on public.investor_funding as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id));
create policy 'marketing_reviews public read visible' on public.marketing_reviews as PERMISSIVE for SELECT to public using ((visible = true));
create policy 'marketing_reviews super admin all' on public.marketing_reviews as PERMISSIVE for ALL to public using (has_role(auth.uid(), 'super_admin'::app_role)) with check (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'order_items own all' on public.order_items as PERMISSIVE for ALL to public using ((auth.uid() = business_id)) with check ((auth.uid() = business_id));
create policy 'order_items team all' on public.order_items as PERMISSIVE for ALL to public using (is_business_member_module(business_id, 'orders'::text)) with check (is_business_member_module(business_id, 'orders'::text));
create policy 'orders owner delete' on public.orders as PERMISSIVE for DELETE to public using ((auth.uid() = business_id));
create policy 'orders owner insert' on public.orders as PERMISSIVE for INSERT to public with check ((auth.uid() = business_id));
create policy 'orders owner select' on public.orders as PERMISSIVE for SELECT to public using ((auth.uid() = business_id));
create policy 'orders owner update' on public.orders as PERMISSIVE for UPDATE to public using ((auth.uid() = business_id)) with check ((auth.uid() = business_id));
create policy 'orders team insert' on public.orders as PERMISSIVE for INSERT to public with check (is_business_member_module(business_id, 'orders'::text));
create policy 'orders team select' on public.orders as PERMISSIVE for SELECT to public using (is_business_member_module(business_id, 'orders'::text));
create policy 'orders team update' on public.orders as PERMISSIVE for UPDATE to public using (is_business_member_module(business_id, 'orders'::text)) with check (is_business_member_module(business_id, 'orders'::text));
create policy 'other_income delete own' on public.other_income as PERMISSIVE for DELETE to public using ((auth.uid() = user_id));
create policy 'other_income insert own' on public.other_income as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));
create policy 'other_income select own' on public.other_income as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy 'other_income team delete' on public.other_income as PERMISSIVE for DELETE to public using (is_business_member_module(user_id, 'other_income'::text));
create policy 'other_income team insert' on public.other_income as PERMISSIVE for INSERT to public with check (is_business_member_module(user_id, 'other_income'::text));
create policy 'other_income team select' on public.other_income as PERMISSIVE for SELECT to public using (is_business_member_module(user_id, 'other_income'::text));
create policy 'other_income team update' on public.other_income as PERMISSIVE for UPDATE to public using (is_business_member_module(user_id, 'other_income'::text)) with check (is_business_member_module(user_id, 'other_income'::text));
create policy 'other_income update own' on public.other_income as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id));
create policy 'payment_methods managed by super admin' on public.payment_methods as PERMISSIVE for ALL to public using (has_role(auth.uid(), 'super_admin'::app_role)) with check (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'payment_methods readable by signed-in' on public.payment_methods as PERMISSIVE for SELECT to public using (((auth.uid() IS NOT NULL) AND (active = true)));
create policy 'ads managed by super admin' on public.platform_ads as PERMISSIVE for ALL to public using (has_role(auth.uid(), 'super_admin'::app_role)) with check (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'ads readable by signed-in' on public.platform_ads as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy 'support settings managed by super admin' on public.platform_support_settings as PERMISSIVE for ALL to public using (has_role(auth.uid(), 'super_admin'::app_role)) with check (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'support settings readable by signed-in' on public.platform_support_settings as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy 'Anyone can read active pricing plans' on public.pricing_plans as PERMISSIVE for SELECT to public using (((is_active = true) OR has_role(auth.uid(), 'super_admin'::app_role)));
create policy 'Super admins manage pricing plans' on public.pricing_plans as PERMISSIVE for ALL to public using (has_role(auth.uid(), 'super_admin'::app_role)) with check (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'products delete own' on public.products as PERMISSIVE for DELETE to public using ((auth.uid() = user_id));
create policy 'products insert own' on public.products as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));
create policy 'products select own' on public.products as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy 'products team delete' on public.products as PERMISSIVE for DELETE to public using (is_business_member_module(user_id, 'products'::text));
create policy 'products team insert' on public.products as PERMISSIVE for INSERT to public with check (is_business_member_module(user_id, 'products'::text));
create policy 'products team select' on public.products as PERMISSIVE for SELECT to public using (is_business_member_module(user_id, 'products'::text));
create policy 'products team update' on public.products as PERMISSIVE for UPDATE to public using (is_business_member_module(user_id, 'products'::text)) with check (is_business_member_module(user_id, 'products'::text));
create policy 'products update own' on public.products as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id));
create policy 'Staff can view their business owner profile' on public.profiles as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM staff_members sm
  WHERE ((sm.business_owner_id = profiles.id) AND (sm.staff_user_id = auth.uid()) AND (sm.active = true)))));
create policy 'Super admins can update all profiles' on public.profiles as PERMISSIVE for UPDATE to public using (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'Super admins can view all profiles' on public.profiles as PERMISSIVE for SELECT to public using (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'Users can insert their own profile' on public.profiles as PERMISSIVE for INSERT to public with check ((auth.uid() = id));
create policy 'Users can update their own profile' on public.profiles as PERMISSIVE for UPDATE to authenticated using ((auth.uid() = id)) with check ((auth.uid() = id));
create policy 'Users can view their own profile' on public.profiles as PERMISSIVE for SELECT to public using ((auth.uid() = id));
create policy 'ref codes owner read' on public.referral_codes as PERMISSIVE for SELECT to authenticated using ((user_id = auth.uid()));
create policy 'ref codes self insert' on public.referral_codes as PERMISSIVE for INSERT to authenticated with check ((user_id = auth.uid()));
create policy 'referrals read participants' on public.referrals as PERMISSIVE for SELECT to authenticated using (((referrer_user_id = auth.uid()) OR (referred_user_id = auth.uid())));
create policy 'restocks delete own' on public.restocks as PERMISSIVE for DELETE to authenticated using ((auth.uid() = user_id));
create policy 'restocks insert own' on public.restocks as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = user_id));
create policy 'restocks select own' on public.restocks as PERMISSIVE for SELECT to authenticated using ((auth.uid() = user_id));
create policy 'restocks team delete' on public.restocks as PERMISSIVE for DELETE to public using (is_business_member_module(user_id, 'inventory'::text));
create policy 'restocks team insert' on public.restocks as PERMISSIVE for INSERT to public with check (is_business_member_module(user_id, 'inventory'::text));
create policy 'restocks team select' on public.restocks as PERMISSIVE for SELECT to public using (is_business_member_module(user_id, 'inventory'::text));
create policy 'restocks team update' on public.restocks as PERMISSIVE for UPDATE to public using (is_business_member_module(user_id, 'inventory'::text)) with check (is_business_member_module(user_id, 'inventory'::text));
create policy 'restocks update own' on public.restocks as PERMISSIVE for UPDATE to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy 'own restore logs read' on public.restore_logs as PERMISSIVE for SELECT to authenticated using ((user_id = auth.uid()));
create policy 'own restore map read' on public.restore_record_map as PERMISSIVE for SELECT to authenticated using ((user_id = auth.uid()));
create policy 'sale_documents delete own' on public.sale_documents as PERMISSIVE for DELETE to public using ((auth.uid() = user_id));
create policy 'sale_documents insert own' on public.sale_documents as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));
create policy 'sale_documents select own' on public.sale_documents as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy 'sale_documents team delete' on public.sale_documents as PERMISSIVE for DELETE to public using (is_business_member_module(user_id, 'sales'::text));
create policy 'sale_documents team insert' on public.sale_documents as PERMISSIVE for INSERT to public with check (is_business_member_module(user_id, 'sales'::text));
create policy 'sale_documents team select' on public.sale_documents as PERMISSIVE for SELECT to public using (is_business_member_module(user_id, 'sales'::text));
create policy 'sale_documents team update' on public.sale_documents as PERMISSIVE for UPDATE to public using (is_business_member_module(user_id, 'sales'::text)) with check (is_business_member_module(user_id, 'sales'::text));
create policy 'sale_documents update own' on public.sale_documents as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id));
create policy 'sale_items delete own' on public.sale_items as PERMISSIVE for DELETE to public using ((auth.uid() = user_id));
create policy 'sale_items insert own' on public.sale_items as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));
create policy 'sale_items select own' on public.sale_items as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy 'sale_items team delete' on public.sale_items as PERMISSIVE for DELETE to public using (is_business_member_module(user_id, 'sales'::text));
create policy 'sale_items team insert' on public.sale_items as PERMISSIVE for INSERT to public with check (is_business_member_module(user_id, 'sales'::text));
create policy 'sale_items team select' on public.sale_items as PERMISSIVE for SELECT to public using (is_business_member_module(user_id, 'sales'::text));
create policy 'sale_items team update' on public.sale_items as PERMISSIVE for UPDATE to public using (is_business_member_module(user_id, 'sales'::text)) with check (is_business_member_module(user_id, 'sales'::text));
create policy 'sale_items update own' on public.sale_items as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id));
create policy 'sales delete own' on public.sales as PERMISSIVE for DELETE to public using ((auth.uid() = user_id));
create policy 'sales insert own' on public.sales as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));
create policy 'sales select own' on public.sales as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy 'sales team delete' on public.sales as PERMISSIVE for DELETE to public using (is_business_member_module(user_id, 'sales'::text));
create policy 'sales team insert' on public.sales as PERMISSIVE for INSERT to public with check (is_business_member_module(user_id, 'sales'::text));
create policy 'sales team select' on public.sales as PERMISSIVE for SELECT to public using (is_business_member_module(user_id, 'sales'::text));
create policy 'sales team update' on public.sales as PERMISSIVE for UPDATE to public using (is_business_member_module(user_id, 'sales'::text)) with check (is_business_member_module(user_id, 'sales'::text));
create policy 'sales update own' on public.sales as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id));
create policy 'savings delete own' on public.savings as PERMISSIVE for DELETE to public using ((auth.uid() = user_id));
create policy 'savings insert own' on public.savings as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));
create policy 'savings select own' on public.savings as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy 'savings team delete' on public.savings as PERMISSIVE for DELETE to public using (is_business_member_module(user_id, 'savings'::text));
create policy 'savings team insert' on public.savings as PERMISSIVE for INSERT to public with check (is_business_member_module(user_id, 'savings'::text));
create policy 'savings team select' on public.savings as PERMISSIVE for SELECT to public using (is_business_member_module(user_id, 'savings'::text));
create policy 'savings team update' on public.savings as PERMISSIVE for UPDATE to public using (is_business_member_module(user_id, 'savings'::text)) with check (is_business_member_module(user_id, 'savings'::text));
create policy 'savings update own' on public.savings as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id));
create policy 'otp owner read' on public.signup_otps as PERMISSIVE for SELECT to authenticated using ((user_id = auth.uid()));
create policy 'Owners can view their SMS logs' on public.sms_logs as PERMISSIVE for SELECT to authenticated using ((auth.uid() = business_id));
create policy 'invites invitee accept' on public.staff_invites as PERMISSIVE for UPDATE to public using (((auth.uid() IS NOT NULL) AND (lower(email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text))) AND (status = 'pending'::text))) with check (((auth.uid() IS NOT NULL) AND (lower(email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text))) AND (status = ANY (ARRAY['accepted'::text, 'declined'::text])) AND (accepted_user_id = auth.uid()) AND (permissions = ( SELECT si.permissions
   FROM staff_invites si
  WHERE (si.id = staff_invites.id))) AND (email = ( SELECT si.email
   FROM staff_invites si
  WHERE (si.id = staff_invites.id))) AND (business_owner_id = ( SELECT si.business_owner_id
   FROM staff_invites si
  WHERE (si.id = staff_invites.id))) AND (token = ( SELECT si.token
   FROM staff_invites si
  WHERE (si.id = staff_invites.id))) AND (expires_at = ( SELECT si.expires_at
   FROM staff_invites si
  WHERE (si.id = staff_invites.id)))));
create policy 'invites owner delete' on public.staff_invites as PERMISSIVE for DELETE to public using ((auth.uid() = business_owner_id));
create policy 'invites owner insert' on public.staff_invites as PERMISSIVE for INSERT to public with check ((auth.uid() = business_owner_id));
create policy 'invites owner select' on public.staff_invites as PERMISSIVE for SELECT to public using ((auth.uid() = business_owner_id));
create policy 'invites owner update' on public.staff_invites as PERMISSIVE for UPDATE to public using ((auth.uid() = business_owner_id));
create policy 'staff owner manage' on public.staff_members as PERMISSIVE for ALL to public using ((auth.uid() = business_owner_id)) with check ((auth.uid() = business_owner_id));
create policy 'staff self read' on public.staff_members as PERMISSIVE for SELECT to public using ((auth.uid() = staff_user_id));
create policy 'Owners view own statement deliveries' on public.statement_deliveries as PERMISSIVE for SELECT to authenticated using ((business_id = auth.uid()));
create policy 'Super admins view statement deliveries' on public.statement_deliveries as PERMISSIVE for SELECT to authenticated using (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'Super admins manage statement settings' on public.statement_settings as PERMISSIVE for ALL to authenticated using (has_role(auth.uid(), 'super_admin'::app_role)) with check (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'stock_movements delete own' on public.stock_movements as PERMISSIVE for DELETE to public using ((auth.uid() = user_id));
create policy 'stock_movements insert own' on public.stock_movements as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));
create policy 'stock_movements select own' on public.stock_movements as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy 'stock_movements team delete' on public.stock_movements as PERMISSIVE for DELETE to public using (is_business_member_module(user_id, 'inventory'::text));
create policy 'stock_movements team insert' on public.stock_movements as PERMISSIVE for INSERT to public with check (is_business_member_module(user_id, 'inventory'::text));
create policy 'stock_movements team select' on public.stock_movements as PERMISSIVE for SELECT to public using (is_business_member_module(user_id, 'inventory'::text));
create policy 'stock_movements team update' on public.stock_movements as PERMISSIVE for UPDATE to public using (is_business_member_module(user_id, 'inventory'::text)) with check (is_business_member_module(user_id, 'inventory'::text));
create policy 'stock_movements update own' on public.stock_movements as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id));
create policy 'sub_payments admin update' on public.subscription_payments as PERMISSIVE for UPDATE to public using (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'sub_payments user insert own' on public.subscription_payments as PERMISSIVE for INSERT to public with check (((auth.uid() = user_id) AND (status = 'pending'::text) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL)));
create policy 'sub_payments user view own' on public.subscription_payments as PERMISSIVE for SELECT to public using (((auth.uid() = user_id) OR has_role(auth.uid(), 'super_admin'::app_role)));
create policy 'support messages super admin delete' on public.support_messages as PERMISSIVE for DELETE to public using (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'support messages super admin read' on public.support_messages as PERMISSIVE for SELECT to public using ((has_role(auth.uid(), 'super_admin'::app_role) OR (auth.uid() = user_id)));
create policy 'support messages super admin update' on public.support_messages as PERMISSIVE for UPDATE to public using (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'support messages user insert' on public.support_messages as PERMISSIVE for INSERT to public with check (((auth.uid() IS NOT NULL) AND (user_id = auth.uid())));
create policy 'auth view questions for visible surveys' on public.survey_questions as PERMISSIVE for SELECT to authenticated using ((has_role(auth.uid(), 'super_admin'::app_role) OR (EXISTS ( SELECT 1
   FROM surveys s
  WHERE ((s.id = survey_questions.survey_id) AND (s.enabled = true))))));
create policy 'super admin manage questions' on public.survey_questions as PERMISSIVE for ALL to authenticated using (has_role(auth.uid(), 'super_admin'::app_role)) with check (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'insert answers for own response' on public.survey_response_answers as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1
   FROM survey_responses r
  WHERE ((r.id = survey_response_answers.response_id) AND (r.user_id = auth.uid())))));
create policy 'view answers for own or admin' on public.survey_response_answers as PERMISSIVE for SELECT to authenticated using ((has_role(auth.uid(), 'super_admin'::app_role) OR (EXISTS ( SELECT 1
   FROM survey_responses r
  WHERE ((r.id = survey_response_answers.response_id) AND (r.user_id = auth.uid()))))));
create policy 'user insert own response' on public.survey_responses as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = user_id));
create policy 'user view own or admin view all' on public.survey_responses as PERMISSIVE for SELECT to authenticated using (((auth.uid() = user_id) OR has_role(auth.uid(), 'super_admin'::app_role)));
create policy 'user manage own status' on public.survey_user_status as PERMISSIVE for ALL to authenticated using (((auth.uid() = user_id) OR has_role(auth.uid(), 'super_admin'::app_role))) with check (((auth.uid() = user_id) OR has_role(auth.uid(), 'super_admin'::app_role)));
create policy 'auth view enabled surveys' on public.surveys as PERMISSIVE for SELECT to authenticated using (((enabled = true) OR has_role(auth.uid(), 'super_admin'::app_role)));
create policy 'super admin manage surveys' on public.surveys as PERMISSIVE for ALL to authenticated using (has_role(auth.uid(), 'super_admin'::app_role)) with check (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'Super admins manage roles' on public.user_roles as PERMISSIVE for ALL to public using (has_role(auth.uid(), 'super_admin'::app_role)) with check (has_role(auth.uid(), 'super_admin'::app_role));
create policy 'Users can view their own roles' on public.user_roles as PERMISSIVE for SELECT to public using (((auth.uid() = user_id) OR has_role(auth.uid(), 'super_admin'::app_role)));

-- ============ REALTIME PUBLICATION ============
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.sales;
alter publication supabase_realtime add table public.sale_items;
alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.other_income;
alter publication supabase_realtime add table public.announcements;
alter publication supabase_realtime add table public.subscription_payments;
alter publication supabase_realtime add table public.stock_movements;
alter publication supabase_realtime add table public.savings;
alter publication supabase_realtime add table public.restocks;
alter publication supabase_realtime add table public.bank_accounts;
alter publication supabase_realtime add table public.investments;
alter publication supabase_realtime add table public.investor_funding;
alter publication supabase_realtime add table public.platform_ads;
alter publication supabase_realtime add table public.marketing_reviews;
