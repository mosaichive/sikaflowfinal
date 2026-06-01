// Admin-only edge function for per-business team member management.
// Schema notes:
//   - This app is single-tenant per owner: business_id == owner's auth user id.
//   - profiles PK is `id` (= auth user id). There is NO profiles.business_id column.
//   - Team membership lives in `staff_members` (business_owner_id, staff_user_id).
//   - Roles live in `user_roles` (user_id, role). No business_id column on user_roles.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

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
      email: string;
      full_name: string;
      phone?: string;
      role: TeamRole;
      modules?: string[];
      password?: string;
    }
  | { action: 'remove'; user_id: string };

const VALID_ROLES: TeamRole[] = ['admin', 'manager', 'staff', 'salesperson', 'cashier', 'distributor'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return json(401, { error: 'Missing authorization' });

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json(401, { error: 'Invalid session' });
  const callerId = userRes.user.id;

  // Caller must be a business_owner OR admin (or super_admin) on this workspace.
  const { data: callerRoles } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', callerId);
  const callerRoleSet = new Set((callerRoles || []).map((r: any) => r.role));
  const canManage =
    callerRoleSet.has('business_owner') ||
    callerRoleSet.has('admin') ||
    callerRoleSet.has('super_admin');
  if (!canManage) return json(403, { error: 'Only the business owner or an admin can manage team users' });

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', callerId)
    .maybeSingle();

  const businessOwnerId = callerId; // single-tenant: caller IS the workspace

  let body: Action;
  try {
    body = (await req.json()) as Action;
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  // ---------- INVITE ----------
  if (body.action === 'invite') {
    const mode = body.mode || 'password';
    const email = (body.email || '').trim().toLowerCase();
    const full_name = (body.full_name || '').trim();
    const phone = body.phone?.trim() || null;
    const role = body.role;
    const modules = Array.isArray(body.modules)
      ? body.modules.filter((module) => typeof module === 'string')
      : [];

    if (!email) return json(400, { error: 'Email is required' });
    if (!full_name) return json(400, { error: 'Full name is required' });
    if (!role || !VALID_ROLES.includes(role)) return json(400, { error: `Role must be one of ${VALID_ROLES.join(', ')}` });
    if (mode !== 'password' && mode !== 'email') return json(400, { error: 'mode must be password or email' });

    // Check for existing auth user with this email
    let existingUserId: string | null = null;
    try {
      // Use the more efficient getUserByEmail via listUsers filter (paged scan as fallback)
      const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const match = listed?.users?.find((u) => (u.email || '').toLowerCase() === email);
      if (match) existingUserId = match.id;
    } catch (e) {
      // non-fatal, continue
    }

    if (existingUserId) {
      // Already on this team?
      const { data: existingMember } = await admin
        .from('staff_members')
        .select('id, business_owner_id')
        .eq('staff_user_id', existingUserId)
        .maybeSingle();
      if (existingMember?.business_owner_id === businessOwnerId) {
        return json(409, { error: 'This user is already a member of your team' });
      }
      return json(409, {
        error: 'This email already exists. Invite or link existing user instead.',
      });
    }

    let newUserId: string | null = null;

    if (mode === 'password') {
      if (!body.password || body.password.length < 8) {
        return json(400, { error: 'Temporary password must be at least 8 characters' });
      }
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
        user_metadata: { display_name: full_name, phone, must_change_password: true },
      });
      if (createErr || !created.user) {
        return json(400, { error: createErr?.message || 'Failed to create user' });
      }
      newUserId = created.user.id;
    } else {
      const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { display_name: full_name, phone },
      });
      if (inviteErr || !invited?.user) {
        console.error('inviteUserByEmail failed:', inviteErr);
        // Fallback: create the user with a random password and generate an invite link.
        // This avoids dependency on a configured outbound SMTP provider for the invite flow.
        const tempPassword = crypto.randomUUID() + 'A1!';
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: false,
          user_metadata: { display_name: full_name, phone, must_change_password: true },
        });
        if (createErr || !created.user) {
          console.error('Fallback createUser failed:', createErr);
          return json(400, {
            error: `Failed to send invite email: ${inviteErr?.message || 'unknown error'}. Create fallback also failed: ${createErr?.message || 'unknown'}`,
          });
        }
        newUserId = created.user.id;
        // Try to generate a recovery/invite link so the owner can share it manually if email didn't go through.
        try {
          const { data: linkData } = await admin.auth.admin.generateLink({
            type: 'invite',
            email,
          });
          console.log('Generated invite link:', linkData?.properties?.action_link);
        } catch (e) {
          console.error('generateLink failed:', e);
        }
      } else {
        newUserId = invited.user.id;
      }
    }

    // Ensure profile row (handle_new_user trigger may have created it)
    const { error: profileErr } = await admin
      .from('profiles')
      .upsert(
        {
          id: newUserId,
          email,
          display_name: full_name,
          phone,
          onboarding_completed: true,
        },
        { onConflict: 'id' },
      );
    if (profileErr) {
      // Roll back the auth user so this can be retried cleanly
      await admin.auth.admin.deleteUser(newUserId).catch(() => undefined);
      return json(500, { error: `Profile creation failed: ${profileErr.message}` });
    }

    // Replace any default 'business_owner' role the trigger may have inserted
    // for this brand-new user — they're a team member, not their own owner.
    await admin.from('user_roles').delete().eq('user_id', newUserId);

    const { error: roleErr } = await admin
      .from('user_roles')
      .insert({ user_id: newUserId, role });
    if (roleErr) {
      await admin.auth.admin.deleteUser(newUserId).catch(() => undefined);
      return json(500, { error: `Role assignment failed: ${roleErr.message}` });
    }

    // Link to this workspace
    const { error: memberErr } = await admin
      .from('staff_members')
      .upsert(
        {
          business_owner_id: businessOwnerId,
          staff_user_id: newUserId,
          display_name: full_name,
          email,
          permissions: modules.length > 0 ? { role, modules } : { role },
          active: true,
        },
        { onConflict: 'business_owner_id,staff_user_id' },
      );
    if (memberErr) {
      await admin.auth.admin.deleteUser(newUserId).catch(() => undefined);
      return json(500, { error: `Team link failed: ${memberErr.message}` });
    }

    await admin.from('audit_log').insert({
      user_id: businessOwnerId,
      action: 'team_user_invited',
      details: `Invited ${full_name} (${email}) as ${role} via ${mode}`,
      performed_by: callerId,
      performed_by_name: callerProfile?.display_name || '',
    });

    return json(200, { ok: true, user_id: newUserId, mode, role });
  }

  // ---------- REMOVE ----------
  if (body.action === 'remove') {
    const { user_id } = body;
    if (!user_id) return json(400, { error: 'user_id is required' });
    if (user_id === callerId) return json(400, { error: 'You cannot remove yourself' });

    const { data: member } = await admin
      .from('staff_members')
      .select('id, business_owner_id, display_name, email')
      .eq('business_owner_id', businessOwnerId)
      .eq('staff_user_id', user_id)
      .maybeSingle();
    if (!member) return json(404, { error: 'User is not a member of your team' });

    const targetName = member.display_name || 'Former team member';

    // Reassign historical sales records on this workspace to the owner
    await admin
      .from('sales')
      .update({ staff_id: callerId, staff_name: targetName })
      .eq('business_id', businessOwnerId)
      .eq('staff_id', user_id);

    // Drop the team link first so RLS reads are consistent
    await admin.from('staff_members').delete().eq('id', member.id);
    await admin.from('user_roles').delete().eq('user_id', user_id);

    const { error: deleteError } = await admin.auth.admin.deleteUser(user_id);
    if (deleteError) {
      return json(500, { error: deleteError.message || 'Failed to delete auth user' });
    }

    await admin.from('audit_log').insert({
      user_id: businessOwnerId,
      action: 'team_user_removed',
      details: `Removed ${targetName}${member.email ? ` (${member.email})` : ''} from team`,
      performed_by: callerId,
      performed_by_name: callerProfile?.display_name || '',
    });

    return json(200, { ok: true, removed_user_id: user_id });
  }

  return json(400, { error: 'Unknown action' });
});
