import { createClient } from 'npm:@supabase/supabase-js@2.110.0';
import { consumeRateLimit } from '../_shared/rate-limit.ts';

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
      mode?: 'link' | 'password' | 'email';
      email?: unknown;
      full_name?: unknown;
      phone?: unknown;
      role?: unknown;
      modules?: unknown;
      password?: unknown;
    }
  | { action: 'refresh_invite'; invite_id?: unknown }
  | { action: 'revoke_invite'; invite_id?: unknown }
  | { action: 'remove'; member_id?: unknown; user_id?: unknown }
  | {
      action: 'update';
      member_id?: unknown;
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
const ROLE_MODULES: Record<TeamRole, string[]> = {
  admin: [...VALID_MODULES],
  manager: ['dashboard', 'sales', 'products', 'inventory', 'damaged_goods', 'customers', 'orders', 'other_income', 'expenses', 'savings', 'reports', 'announcements'],
  salesperson: ['dashboard', 'sales', 'customers', 'orders', 'announcements'],
  cashier: ['dashboard', 'sales', 'customers', 'announcements'],
  distributor: ['dashboard', 'inventory', 'orders', 'announcements'],
  staff: ['dashboard', 'announcements'],
};
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
      const { data: membership } = await admin
        .from('staff_members')
        .select('permissions')
        .eq('business_id', businessId)
        .eq('staff_user_id', callerId)
        .eq('active', true)
        .is('removed_at', null)
        .maybeSingle();
      const permissions = membership?.permissions as { role?: unknown; modules?: unknown } | null;
      canManage = Boolean(
        Array.isArray(permissions?.modules)
          ? permissions.modules.includes('staff')
          : permissions?.role === 'admin'
      );
    }
    if (!canManage) return json(403, { error: 'forbidden' });

    const body = await req.json().catch(() => null) as Action | null;
    if (!body) return json(400, { error: 'invalid_request' });

    if (body.action === 'invite') {
      const mode = body.mode ?? 'link';
      const email = String(body.email ?? '').trim().toLowerCase();
      const fullName = String(body.full_name ?? '').trim().slice(0, 120);
      const phone = String(body.phone ?? '').trim().slice(0, 30) || null;
      const role = String(body.role ?? '') as TeamRole;
      const modules = Array.isArray(body.modules)
        ? body.modules.filter((value): value is string => typeof value === 'string' && VALID_MODULES.has(value))
        : ROLE_MODULES[role] ?? [];

      if (!EMAIL_PATTERN.test(email) || email.length > 254) return json(400, { error: 'valid_email_required' });
      if (mode === 'password' && !fullName) return json(400, { error: 'full_name_required' });
      if (!VALID_ROLES.has(role)) return json(400, { error: 'invalid_role' });
      if (role === 'admin' && !isOwner) return json(403, { error: 'only_owner_can_assign_admin' });
      if (mode !== 'link' && mode !== 'password' && mode !== 'email') return json(400, { error: 'invalid_invite_mode' });
      if (userData.user.email?.toLowerCase() === email) return json(400, { error: 'cannot_invite_yourself' });
      const withinInviteLimit = await consumeRateLimit({
        req,
        action: 'team_invite_create',
        entity: callerId,
        keyScope: 'client_entity',
        limit: 20,
        windowSeconds: 3600,
      });
      if (!withinInviteLimit) return json(429, { error: 'invite_rate_limited' });

      const { data: currentMembers, error: currentMembersError } = await admin
        .from('staff_members')
        .select('id, staff_user_id, email, active, removed_at')
        .eq('business_owner_id', business.owner_user_id);
      if (currentMembersError) throw new Error('Could not inspect current team members');
      const matchingMember = (currentMembers ?? []).find((member) =>
        !member.removed_at && member.email?.toLowerCase() === email
      );
      if (matchingMember?.active && matchingMember.staff_user_id) {
        return json(409, { error: 'team_member_already_active' });
      }

      if (mode === 'link' || mode === 'email') {
        const inviteToken = crypto.randomUUID().replaceAll('-', '');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: pendingInvites, error: pendingLookupError } = await admin
          .from('staff_invites')
          .select('id, email')
          .eq('business_owner_id', business.owner_user_id)
          .eq('status', 'pending');
        if (pendingLookupError) throw new Error('Could not inspect current invitations');
        const existingInvite = (pendingInvites ?? []).find((invite) => invite.email?.toLowerCase() === email);
        const inviteValues = {
          business_owner_id: business.owner_user_id,
          business_id: businessId,
          email,
          display_name: fullName || null,
          phone,
          token: inviteToken,
          status: 'pending',
          expires_at: expiresAt,
          accepted_at: null,
          accepted_user_id: null,
          permissions: { role, modules },
        };
        const inviteQuery = existingInvite
          ? admin.from('staff_invites').update(inviteValues).eq('id', existingInvite.id)
          : admin.from('staff_invites').insert(inviteValues);
        const { data: invite, error: inviteError } = await inviteQuery
          .select('id, token, expires_at')
          .single();
        if (inviteError || !invite) return json(500, { error: 'could_not_create_team_invite' });

        let emailDelivery: 'not_requested' | 'sent' | 'existing_account' | 'failed' = 'not_requested';
        if (mode === 'email') {
          if (await emailAlreadyExists(admin, email)) {
            emailDelivery = 'existing_account';
          } else {
            const appUrl = (Deno.env.get('APP_PUBLIC_URL') || 'https://kuditrack.online').replace(/\/+$/, '');
            const { error: authInviteError } = await admin.auth.admin.inviteUserByEmail(email, {
              data: { display_name: fullName, phone },
              redirectTo: `${appUrl}/invite/${invite.token}`,
            });
            emailDelivery = authInviteError ? 'failed' : 'sent';
          }
        }

        await admin.from('audit_log').insert({
          user_id: null,
          business_id: businessId,
          action: 'team_invite_created',
          details: `Created ${mode} invite for ${email} as ${role}`,
          performed_by: callerId,
          performed_by_name: callerProfile?.display_name || '',
        });

        return json(200, {
          ok: true,
          invite_id: invite.id,
          token: invite.token,
          expires_at: invite.expires_at,
          mode,
          role,
          email_delivery: emailDelivery,
        });
      }

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

      const restoredPlaceholder = matchingMember && !matchingMember.staff_user_id
        ? matchingMember
        : null;
      const memberValues = {
        business_owner_id: business.owner_user_id,
        business_id: businessId,
        staff_user_id: newUserId,
        display_name: fullName,
        email,
        permissions: { role, modules },
        active: true,
        removed_at: null,
      };
      const memberQuery = restoredPlaceholder
        ? admin.from('staff_members').update(memberValues).eq('id', restoredPlaceholder.id)
        : admin.from('staff_members').upsert(memberValues, { onConflict: 'business_owner_id,staff_user_id' });
      const { error: memberError } = await memberQuery;
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

    if (body.action === 'refresh_invite' || body.action === 'revoke_invite') {
      const inviteId = String(body.invite_id ?? '').trim();
      if (!UUID_PATTERN.test(inviteId)) return json(400, { error: 'valid_invite_id_required' });

      const { data: invite, error: inviteLookupError } = await admin
        .from('staff_invites')
        .select('id, status')
        .eq('id', inviteId)
        .eq('business_owner_id', business.owner_user_id)
        .maybeSingle();
      if (inviteLookupError) throw new Error('Could not locate team invitation');
      if (!invite) return json(404, { error: 'team_invite_not_found' });
      if (invite.status === 'accepted') return json(409, { error: 'accepted_invite_cannot_be_changed' });

      if (body.action === 'revoke_invite') {
        const { error: revokeError } = await admin
          .from('staff_invites')
          .update({ status: 'revoked' })
          .eq('id', inviteId)
          .eq('business_owner_id', business.owner_user_id);
        if (revokeError) return json(500, { error: 'could_not_revoke_team_invite' });
        return json(200, { ok: true, invite_id: inviteId, status: 'revoked' });
      }

      const nextToken = crypto.randomUUID().replaceAll('-', '');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: refreshed, error: refreshError } = await admin
        .from('staff_invites')
        .update({
          token: nextToken,
          expires_at: expiresAt,
          status: 'pending',
          accepted_at: null,
          accepted_user_id: null,
        })
        .eq('id', inviteId)
        .eq('business_owner_id', business.owner_user_id)
        .select('id, token, expires_at')
        .single();
      if (refreshError || !refreshed) return json(500, { error: 'could_not_refresh_team_invite' });
      return json(200, { ok: true, ...refreshed, status: 'pending' });
    }

    if (body.action === 'remove') {
      let memberId = String(body.member_id ?? '').trim();
      if (memberId && !UUID_PATTERN.test(memberId)) return json(400, { error: 'valid_member_id_required' });

      // Older clients only send the Auth user ID. New clients send the membership
      // ID so restored staff rows without an Auth account can also be removed.
      if (!memberId) {
        const targetId = String(body.user_id ?? '').trim();
        if (!UUID_PATTERN.test(targetId)) return json(400, { error: 'valid_member_id_required' });
        const { data: member, error: lookupError } = await admin
          .from('staff_members')
          .select('id')
          .eq('business_id', businessId)
          .eq('staff_user_id', targetId)
          .is('removed_at', null)
          .maybeSingle();
        if (lookupError) throw new Error('Could not locate team membership');
        if (!member) return json(404, { error: 'team_member_not_found' });
        memberId = member.id;
      }

      const { data: targetMember, error: targetLookupError } = await admin
        .from('staff_members')
        .select('staff_user_id, permissions')
        .eq('id', memberId)
        .eq('business_id', businessId)
        .is('removed_at', null)
        .maybeSingle();
      if (targetLookupError) throw new Error('Could not locate team membership');
      if (!targetMember) return json(404, { error: 'team_member_not_found' });
      if (targetMember.staff_user_id === callerId) return json(400, { error: 'cannot_remove_yourself' });
      const targetPermissions = targetMember.permissions as { role?: string } | null;
      if (!isOwner && targetPermissions?.role === 'admin') {
        return json(403, { error: 'only_owner_can_remove_admin' });
      }

      const { data: result, error: removeError } = await admin.rpc('remove_business_team_membership', {
        p_business_id: businessId,
        p_member_id: memberId,
        p_actor_id: callerId,
      });
      if (removeError) {
        if (removeError.code === 'P0002') return json(404, { error: 'team_member_not_found' });
        if (removeError.code === '42501') return json(403, { error: 'forbidden' });
        if (removeError.code === '22023') return json(400, { error: removeError.message });
        console.error('[manage-business-user] remove failed', removeError.code || 'database_error');
        return json(500, { error: 'could_not_remove_team_member' });
      }
      if (!result?.ok) return json(500, { error: 'removal_not_confirmed' });
      return json(200, result);
    }

    if (body.action === 'update') {
      const memberId = String(body.member_id ?? '').trim();
      const requestedUserId = String(body.user_id ?? '').trim();
      const fullName = String(body.full_name ?? '').trim().slice(0, 120);
      const role = String(body.role ?? '') as TeamRole;
      const modules = Array.isArray(body.modules)
        ? body.modules.filter((value): value is string => typeof value === 'string' && VALID_MODULES.has(value))
        : [];
      const active = typeof body.active === 'boolean' ? body.active : true;

      if (memberId ? !UUID_PATTERN.test(memberId) : !UUID_PATTERN.test(requestedUserId)) {
        return json(400, { error: 'valid_member_id_required' });
      }
      if (!VALID_ROLES.has(role)) return json(400, { error: 'invalid_role' });
      if (role === 'admin' && !isOwner) return json(403, { error: 'only_owner_can_assign_admin' });

      let memberQuery = admin
        .from('staff_members')
        .select('id, staff_user_id, display_name, permissions')
        .eq('business_id', businessId)
        .is('removed_at', null);
      memberQuery = memberId ? memberQuery.eq('id', memberId) : memberQuery.eq('staff_user_id', requestedUserId);
      const { data: member, error: lookupError } = await memberQuery.maybeSingle();
      if (lookupError) throw new Error('Could not locate team membership');
      if (!member) return json(404, { error: 'team_member_not_found' });
      const targetId = member.staff_user_id;
      if (targetId === business.owner_user_id) return json(400, { error: 'business_owner_cannot_be_modified' });
      if (targetId === callerId) return json(400, { error: 'cannot_change_your_own_permissions' });
      const currentPermissions = member.permissions as { role?: string } | null;
      if (!isOwner && currentPermissions?.role === 'admin') {
        return json(403, { error: 'only_owner_can_update_admin' });
      }

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

      if (targetId) {
        const { error: roleDeleteError } = await admin.from('user_roles').delete().eq('user_id', targetId).eq('business_id', businessId).neq('role', 'super_admin');
        if (roleDeleteError) throw new Error('Could not update team role');
        if (active) {
          const { error: roleError } = await admin.from('user_roles').insert({ user_id: targetId, role, business_id: businessId });
          if (roleError) throw new Error('Could not update team role');
          const { error: profileError } = await admin.from('profiles').update({ business_id: businessId, onboarding_completed: true }).eq('user_id', targetId);
          if (profileError) throw new Error('Could not update team profile');
        } else {
          const { error: profileError } = await admin.from('profiles').update({ business_id: null, onboarding_completed: false }).eq('user_id', targetId).eq('business_id', businessId);
          if (profileError) throw new Error('Could not update team profile');
        }
      }

      await admin.from('audit_log').insert({
        user_id: targetId,
        business_id: businessId,
        action: active ? 'team_user_updated' : 'team_user_suspended',
        details: `${active ? 'Updated' : 'Suspended'} ${fullName || member.display_name || 'team member'} as ${role}`,
        performed_by: callerId,
        performed_by_name: callerProfile?.display_name || '',
      });

      return json(200, { ok: true, member_id: member.id, user_id: targetId, active, role });
    }

    return json(400, { error: 'unknown_action' });
  } catch (error) {
    console.error('[manage-business-user] request failed', error instanceof Error ? error.name : 'unknown_error');
    return json(500, { error: 'request_failed' });
  }
});
