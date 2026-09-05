// Permanently remove a non-Super-Admin account and any business it owns.
// Database foreign keys perform the tenant-data cleanup in the Auth delete
// transaction. Storage cleanup follows only after that transaction succeeds.
import { createClient } from "npm:@supabase/supabase-js@2.110.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AdminClient = ReturnType<typeof createClient>;
type StoragePrefix = { bucket: string; prefix: string };

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function listFilesRecursively(
  admin: AdminClient,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const files: string[] = [];
  const pageSize = 100;
  let offset = 0;

  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`Could not list ${bucket}/${prefix}`);

    for (const item of data ?? []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) files.push(path);
      else files.push(...await listFilesRecursively(admin, bucket, path));
    }

    if (!data || data.length < pageSize) break;
    offset += data.length;
  }

  return files;
}

async function removeStorageObjects(
  admin: AdminClient,
  prefixes: StoragePrefix[],
) {
  const { data: buckets, error: bucketsError } = await admin.storage.listBuckets();
  if (bucketsError) throw new Error("Could not inspect account storage");

  const existingBuckets = new Set((buckets ?? []).map((bucket) => bucket.id));
  const uniquePrefixes = new Map<string, StoragePrefix>();
  for (const entry of prefixes) {
    uniquePrefixes.set(`${entry.bucket}:${entry.prefix}`, entry);
  }

  let removed = 0;
  for (const { bucket, prefix } of uniquePrefixes.values()) {
    if (!existingBuckets.has(bucket)) continue;
    const files = await listFilesRecursively(admin, bucket, prefix);

    for (let index = 0; index < files.length; index += 100) {
      const chunk = files.slice(index, index + 100);
      const { error } = await admin.storage.from(bucket).remove(chunk);
      if (error) throw new Error(`Could not clear ${bucket}/${prefix}`);
      removed += chunk.length;
    }
  }

  return removed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = requireEnv("SUPABASE_ANON_KEY");
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) return json({ error: "Authentication required" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
    if (userError || !userData.user) return json({ error: "Invalid session" }, 401);

    const { data: aal, error: aalError } =
      await userClient.auth.mfa.getAuthenticatorAssuranceLevel(jwt);
    if (aalError || aal.currentLevel !== "aal2") {
      return json({ error: "MFA verification is required for this action" }, 403);
    }

    const body = await req.json().catch(() => null) as { user_id?: unknown } | null;
    const targetId = typeof body?.user_id === "string" ? body.user_id.trim() : "";
    if (!UUID_PATTERN.test(targetId)) return json({ error: "A valid user ID is required" }, 400);
    if (targetId === userData.user.id) return json({ error: "You cannot delete your own account" }, 400);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: callerRole, error: callerRoleError } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", userData.user.id)
      .eq("role", "super_admin")
      .is("business_id", null)
      .maybeSingle();
    if (callerRoleError || !callerRole) return json({ error: "Forbidden" }, 403);

    const { data: targetRoles, error: targetRolesError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", targetId);
    if (targetRolesError) throw new Error("Could not verify the target account role");
    if ((targetRoles ?? []).some((row) => row.role === "super_admin")) {
      return json({ error: "Another Super Admin cannot be deleted here" }, 400);
    }

    const { data: targetUser, error: targetUserError } =
      await admin.auth.admin.getUserById(targetId);
    if (targetUserError || !targetUser.user) return json({ error: "User not found" }, 404);

    const { data: ownedBusinesses, error: businessesError } = await admin
      .from("businesses")
      .select("id")
      .eq("owner_user_id", targetId);
    if (businessesError) throw new Error("Could not identify the user's businesses");

    // Older owner workspaces used the Auth user UUID as the business UUID even
    // before owner_user_id was populated. Include only that exact legacy shape;
    // never delete a shared employer business merely because a staff profile
    // references it.
    const { data: legacyBusiness, error: legacyBusinessError } = await admin
      .from("businesses")
      .select("id, owner_user_id")
      .eq("id", targetId)
      .maybeSingle();
    if (legacyBusinessError) throw new Error("Could not inspect the legacy workspace");

    const businessIds = new Set((ownedBusinesses ?? []).map((business) => business.id));
    if (legacyBusiness && (!legacyBusiness.owner_user_id || legacyBusiness.owner_user_id === targetId)) {
      businessIds.add(legacyBusiness.id);
    }

    const storagePrefixes: StoragePrefix[] = [
      { bucket: "avatars", prefix: targetId },
      { bucket: "expense-receipts", prefix: targetId },
      { bucket: "other-income-receipts", prefix: targetId },
    ];
    for (const businessId of businessIds) {
      storagePrefixes.push(
        { bucket: "product-images", prefix: businessId },
        { bucket: "business-logos", prefix: businessId },
      );
    }

    // Deleting auth.users is the transactional boundary: owner_user_id cascades
    // to the business, and business_id cascades clear tenant-owned records.
    const { error: deleteError } = await admin.auth.admin.deleteUser(targetId, false);
    if (deleteError) {
      console.error("[admin-delete-user] Auth deletion failed", deleteError.message);
      return json({ error: "The account could not be deleted. No database records were removed." }, 500);
    }

    let storageObjectsRemoved = 0;
    let storageCleanupPending = false;
    try {
      storageObjectsRemoved = await removeStorageObjects(admin, storagePrefixes);
    } catch (storageError) {
      storageCleanupPending = true;
      console.error(
        "[admin-delete-user] Storage cleanup failed after account deletion",
        storageError instanceof Error ? storageError.message : "unknown_error",
      );
    }

    const deletedBusinessIds = [...businessIds];
    const { error: auditError } = await admin.from("platform_audit_log").insert({
      action: "super_admin_delete_user",
      target_business_id: null,
      performed_by: userData.user.id,
      performed_by_email: userData.user.email ?? null,
      details: {
        deleted_user_id: targetId,
        deleted_business_ids: deletedBusinessIds,
        storage_objects_removed: storageObjectsRemoved,
        storage_cleanup_pending: storageCleanupPending,
      },
    });
    if (auditError) console.error("[admin-delete-user] Audit insert failed", auditError.message);

    return json({
      success: true,
      message: "User account and owned business data were permanently deleted.",
      deleted_businesses: deletedBusinessIds.length,
      storage_objects_removed: storageObjectsRemoved,
      storage_cleanup_pending: storageCleanupPending,
    });
  } catch (error) {
    console.error("[admin-delete-user] Request failed", error);
    return json({ error: "The account could not be deleted" }, 500);
  }
});
