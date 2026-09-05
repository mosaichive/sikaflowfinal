import { createClient } from 'npm:@supabase/supabase-js@2.110.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

type TeamRole = 'admin' | 'manager' | 'staff' | 'salesperson' | 'cashier' | 'distributor';
type Action =
  | {
      action: 'invite';
      mode?: 'password' | 'email';
      email?: unknown;
      full_name?: unknown;
      phone?: unknown;
      role?: unknown;
      modules?: unknown;
      password?: unknown;
    }
  | { action: 'remove'; user_id?: unknown }
  | {
      action: 'update';
      user_id?: unknown;
      full_name?: unknown;
      role?: unknown;
      modules?: unknown;
      active?: unknown;
    };

const VALID_ROLES = new Set<TeamRole>(['admin', 'manager', 'staff', 'salesperson', 'cashier', 'distributor']);
const VALID_MODULES = new Set([
  'dashboard', 'sales', 'products', 'inventory', 'damaged_goods', 'customers',
  'orders', 'other_income', 'expenses', 'savings', 'reports', 'staff',
  'announcements', 'settings',
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function emailAlreadyExists(admin: ReturnType<typeof createClient>, email: string) {
  const perPage = 1000;
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error('Could not verify the invitee');
    if ((data.users ?? []).some((candidate) => candidate.email?.toLowerCase() === email)) return true;
    if ((data.users ?? []).length < perPage) return false;
  }
  throw new Error('Could not verify the invitee');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  try {
    const supabaseUrl = requiredEnv('SUPABASE_URL');
    const anonKey = requiredEnv('SUPABASE_ANON_KEY');
    const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'unauthorized' });

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json(401, { error: 'unauthorized' });

    const callerId = userData.user.id;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [{ data: ownedBusiness }, { data: callerProfile }] = await Promise.all([
      admin.from('businesses').select('id, owner_user_id, name').eq('owner_user_id', callerId).limit(1).maybeSingle(),
      admin.from('profiles').select('business_id, display_name').eq('user_id', callerId).maybeSingle(),
    ]);

    const businessId = ownedBusiness?.id ?? callerProfile?.business_id ?? null;
    if (!businessId) return json(403, { error: 'business_access_required' });

    const { data: business } = ownedBusiness
      ? { data: ownedBusiness }
      : await admin.from('businesses').select('id, owner_user_id, name').eq('id', businessId).maybeSingle();
    if (!business?.owner_user_id) return json(403, { error: 'business_access_required' });

    const isOwner = business.owner_user_id === callerId;
    let canManage = isOwner;
    if (!canManage) {
      const [{ data: roleRow }, { data: membership }] = await Promise.all([
        admin.from('user_roles').select('id').eq('user_id', callerId).eq('business_id', businessId).eq('role', 'admin').maybeSingle(),
        admin.from('staff_members').select('permissions').eq('business_id', businessId).eq('staff_user_id', callerId).eq('active', true).maybeSingle(),
      ]);
      const permissions = membership?.permissions as { role?: unknown; modules?: unknown } | null;
      canManage = Boolean(
        roleRow ||
        permissions?.role === 'admin' ||
        (Array.isArray(permissions?.modules) && permissions.modules.includes('staff'))
      );
    }
    if (!canManage) return json(403, { error: 'forbidden' });

    const body = await req.json().catch(() => null) as Action | null;
    if (!body) return json(400, { error: 'invalid_request' });

    if (body.action === 'invite') {
      const mode = body.mode ?? 'password';
      const email = String(body.email ?? '').trim().toLowerCase();
      const fullName = String(body.full_name ?? '').trim().slice(0, 120);
      const phone = String(body.phone ?? '').trim().slice(0, 30) || null;
      const role = String(body.role ?? '') as TeamRole;
      const modules = Array.isArray(body.modules)
        ? body.modules.filter((value): value is string => typeof value === 'string' && VALID_MODULES.has(value))
        : [];

      if (!EMAIL_PATTERN.test(email) || email.length > 254) return json(400, { error: 'valid_email_required' });
      if (!fullName) return json(400, { error: 'full_name_required' });
      if (!VALID_ROLES.has(role)) return json(400, { error: 'invalid_role' });
      if (role === 'admin' && !isOwner) return json(403, { error: 'only_owner_can_assign_admin' });
      if (mode !== 'password' && mode !== 'email') return json(400, { error: 'invalid_invite_mode' });

      if (await emailAlreadyExists(admin, email)) {
        return json(409, { error: 'account_already_exists' });
      }

      let newUserId: string | null = null;
      if (mode === 'password') {
        const password = typeof body.password === 'string' ? body.password : '';
        if (password.length < 12) return json(400, { error: 'temporary_password_must_be_12_characters' });
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { display_name: fullName, phone, must_change_password: true },
        });
        if (createError || !created.user) return json(400, { error: 'could_not_create_team_member' });
        newUserId = created.user.id;
      } else {
        const appUrl = (Deno.env.get('APP_PUBLIC_URL') || 'https://sikaflowsystem.vercel.app').replace(/\/+$/, '');
        const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
          data: { display_name: fullName, phone },
          redirectTo: `${appUrl}/auth/callback`,
        });
        if (inviteError || !invited.user) return json(400, { error: 'could_not_send_invitation' });
        newUserId = invited.user.id;
      }

      const rollbackNewUser = async () => {
        if (newUserId) await admin.auth.admin.deleteUser(newUserId).catch(() => undefined);
      };

      const { error: profileError } = await admin.from('profiles').upsert({
        id: newUserId,
        user_id: newUserId,
        business_id: businessId,
        email,
        display_name: fullName,
        phone,
        onboarding_completed: true,
      }, { onConflict: 'user_id' });
      if (profileError) {
        await rollbackNewUser();
        return json(500, { error: 'could_not_create_team_profile' });
      }

      const { error: roleError } = await admin.from('user_roles').insert({ user_id: newUserId, role, business_id: businessId });
      if (roleError) {
        await rollbackNewUser();
        return json(500, { error: 'could_not_assign_team_role' });
      }

      const { error: memberError } = await admin.from('staff_members').upsert({
        business_owner_id: business.owner_user_id,
        business_id: businessId,
        staff_user_id: newUserId,
        display_name: fullName,
        email,
        permissions: { role, modules },
        active: true,
      }, { onConflict: 'business_owner_id,staff_user_id' });
      if (memberError) {
        await rollbackNewUser();
        return json(500, { error: 'could_not_link_team_member' });
      }

      await admin.from('audit_log').insert({
        user_id: newUserId,
        business_id: businessId,
        action: 'team_user_invited',
        details: `Invited ${fullName} as ${role} via ${mode}`,
        performed_by: callerId,
        performed_by_name: callerProfile?.display_name || '',
      });

      return json(200, { ok: true, user_id: newUserId, mode, role });
    }

    if (body.action === 'remove') {
      const targetId = String(body.user_id ?? '').trim();
      if (!UUID_PATTERN.test(targetId)) return json(400, { error: 'valid_user_id_required' });
      if (targetId === callerId || targetId === business.owner_user_id) return json(400, { error: 'business_owner_cannot_be_removed' });

      const { data: member } = await admin
        .from('staff_members')
        .select('id, display_name')
        .eq('business_id', businessId)
        .eq('staff_user_id', targetId)
        .eq('active', true)
        .maybeSingle();
      if (!member) return json(404, { error: 'team_member_not_found' });

      const { error: memberError } = await admin.from('staff_members').update({ active: false }).eq('id', member.id).eq('business_id', businessId);
      if (memberError) throw new Error('Could not revoke team membership');

      await admin.from('user_roles').delete().eq('user_id', targetId).eq('business_id', businessId).neq('role', 'super_admin');
      await admin.from('profiles').update({ business_id: null, onboarding_completed: false }).eq('user_id', targetId).eq('business_id', businessId);

      await admin.from('audit_log').insert({
        user_id: targetId,
        business_id: businessId,
        action: 'team_user_removed',
        details: `Revoked workspace access for ${member.display_name || 'team member'}`,
        performed_by: callerId,
        performed_by_name: callerProfile?.display_name || '',
      });

      return json(200, { ok: true, removed_user_id: targetId, auth_user_preserved: true });
    }

    if (body.action === 'update') {
      const targetId = String(body.user_id ?? '').trim();
      const fullName = String(body.full_name ?? '').trim().slice(0, 120);
      const role = String(body.role ?? '') as TeamRole;
      const modules = Array.isArray(body.modules)
        ? body.modules.filter((value): value is string => typeof value === 'string' && VALID_MODULES.has(value))
        : [];
      const active = typeof body.active === 'boolean' ? body.active : true;

      if (!UUID_PATTERN.test(targetId)) return json(400, { error: 'valid_user_id_required' });
      if (!VALID_ROLES.has(role)) return json(400, { error: 'invalid_role' });
      if (role === 'admin' && !isOwner) return json(403, { error: 'only_owner_can_assign_admin' });
      if (targetId === business.owner_user_id) return json(400, { error: 'business_owner_cannot_be_modified' });

      const { data: member } = await admin
        .from('staff_members')
        .select('id, display_name')
        .eq('business_id', businessId)
        .eq('staff_user_id', targetId)
        .maybeSingle();
      if (!member) return json(404, { error: 'team_member_not_found' });

      const { error: memberError } = await admin
        .from('staff_members')
        .update({
          active,
          display_name: fullName || member.display_name,
          permissions: { role, modules },
        })
        .eq('id', member.id)
        .eq('business_id', businessId);
      if (memberError) throw new Error('Could not update team membership');

      await admin.from('user_roles').delete().eq('user_id', targetId).eq('business_id', businessId).neq('role', 'super_admin');
      if (active) {
        const { error: roleError } = await admin.from('user_roles').insert({ user_id: targetId, role, business_id: businessId });
        if (roleError) throw new Error('Could not update team role');
        await admin.from('profiles').update({ business_id: businessId, onboarding_completed: true }).eq('user_id', targetId);
      } else {
        await admin.from('profiles').update({ business_id: null, onboarding_completed: false }).eq('user_id', targetId).eq('business_id', businessId);
      }

      await admin.from('audit_log').insert({
        user_id: targetId,
        business_id: businessId,
        action: active ? 'team_user_updated' : 'team_user_suspended',
        details: `${active ? 'Updated' : 'Suspended'} ${fullName || member.display_name || 'team member'} as ${role}`,
        performed_by: callerId,
        performed_by_name: callerProfile?.display_name || '',
      });

      return json(200, { ok: true, user_id: targetId, active, role });
    }

    return json(400, { error: 'unknown_action' });
  } catch (error) {
    console.error('[manage-business-user] request failed', error instanceof Error ? error.name : 'unknown_error');
    return json(500, { error: 'request_failed' });
  }
});
