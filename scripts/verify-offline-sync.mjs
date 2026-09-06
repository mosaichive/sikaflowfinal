import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey) {
  throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const service = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = `Offline-${crypto.randomUUID()}-T9!`;
const users = [];
const clients = [service];
let businessId = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function client() {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function createUser(label) {
  const email = `codex-offline-${label}-${runId}@example.invalid`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `Offline ${label}` },
  });
  if (error || !data.user) throw error ?? new Error(`Could not create ${label} user.`);
  users.push(data.user.id);

  const supabase = client();
  clients.push(supabase);
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, email, supabase };
}

async function callSync(supabase, functionName, payload) {
  const { data, error } = await supabase.rpc(functionName, { _payload: payload });
  if (error) throw error;
  return data;
}

async function waitForSubscription(channel) {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Realtime subscription timed out.')), 12_000);
    channel.subscribe((status, error) => {
      if (error) {
        clearTimeout(timeout);
        reject(error);
      } else if (status === 'SUBSCRIBED') {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}

async function run() {
  const owner = await createUser('owner');
  const teammate = await createUser('team');
  const outsider = await createUser('outsider');

  const { data: createdBusiness, error: businessError } = await owner.supabase.rpc(
    'ensure_business_workspace_membership',
    { _business_id: null, _display_name: `Offline Sync ${runId}`, _phone: '' },
  );
  if (businessError || !createdBusiness) throw businessError ?? new Error('Business setup failed.');
  businessId = createdBusiness;

  const { error: staffError } = await service.from('staff_members').insert({
    business_id: businessId,
    business_owner_id: owner.id,
    staff_user_id: teammate.id,
    display_name: 'Offline Team',
    email: teammate.email,
    active: true,
    permissions: { role: 'manager', modules: ['sales', 'customers', 'expenses', 'other_income'] },
  });
  if (staffError) throw staffError;

  const { data: product, error: productError } = await service
    .from('products')
    .insert({
      business_id: businessId,
      user_id: owner.id,
      name: 'Offline Test Item',
      sku: `OFF-${runId}`,
      category: 'Test',
      cost_price: 10,
      selling_price: 25,
      quantity: 10,
      stock: 10,
    })
    .select('id')
    .single();
  if (productError || !product) throw productError ?? new Error('Product setup failed.');

  const customerPayload = {
    business_id: businessId,
    client_txn_id: `${runId}-customer`,
    client_device_id: 'integration-test',
    name: 'Offline Customer',
    phone: '0244000000',
    notes: 'Offline integration test',
  };
  const firstCustomer = await callSync(owner.supabase, 'sync_offline_customer', customerPayload);
  const duplicateCustomer = await callSync(owner.supabase, 'sync_offline_customer', customerPayload);
  assert(firstCustomer.status === 'synced', 'Customer did not sync.');
  assert(duplicateCustomer.status === 'duplicate', 'Customer idempotency failed.');

  const expense = await callSync(teammate.supabase, 'sync_offline_expense', {
    business_id: businessId,
    client_txn_id: `${runId}-expense`,
    amount: 42.5,
    category: 'Transport',
    description: 'Offline expense',
    payment_method: 'momo',
  });
  const income = await callSync(teammate.supabase, 'sync_offline_income', {
    business_id: businessId,
    client_txn_id: `${runId}-income`,
    amount: 80,
    category: 'Commission',
    description: 'Offline income',
    payment_method: 'bank_transfer',
  });
  assert(expense.status === 'synced', 'Expense did not sync.');
  assert(income.status === 'synced', 'Other income did not sync.');

  let resolveRealtime;
  let rejectRealtime;
  const realtimeSale = new Promise((resolve, reject) => {
    resolveRealtime = resolve;
    rejectRealtime = reject;
  });
  const realtimeTimeout = setTimeout(
    () => rejectRealtime(new Error('Cross-user Realtime event timed out.')),
    12_000,
  );
  const realtimeChannel = owner.supabase
    .channel(`offline-sync-test-${runId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'sales' },
      (event) => {
        if (event.new?.business_id !== businessId) return;
        clearTimeout(realtimeTimeout);
        resolveRealtime(event);
      },
    );
  await waitForSubscription(realtimeChannel);
  const salePayload = {
    business_id: businessId,
    client_txn_id: `${runId}-sale`,
    client_device_id: 'integration-test',
    customer_client_txn_id: customerPayload.client_txn_id,
    customer_name: 'Offline Customer',
    payment_method: 'cash',
    amount_paid: 75,
    total: 1,
    items: [{ product_id: product.id, quantity: 3, unit_price: 25 }],
  };
  const firstSale = await callSync(teammate.supabase, 'sync_offline_sale', salePayload);
  const duplicateSale = await callSync(teammate.supabase, 'sync_offline_sale', salePayload);
  assert(firstSale.status === 'synced', 'Sale did not sync.');
  assert(duplicateSale.status === 'duplicate', 'Sale idempotency failed.');

  const { data: ownerSale, error: ownerSaleError } = await owner.supabase
    .from('sales')
    .select('id')
    .eq('id', firstSale.sale_id)
    .maybeSingle();
  if (ownerSaleError) throw ownerSaleError;
  assert(ownerSale?.id === firstSale.sale_id, 'The owner cannot read the team-created sale under RLS.');

  const realtime = await realtimeSale;
  await realtimeChannel.unsubscribe();
  assert(realtime.new?.id === firstSale.sale_id, 'Realtime delivered the wrong sale.');

  const { data: savedSale, error: saleReadError } = await service
    .from('sales')
    .select('total,customer_id,created_offline')
    .eq('id', firstSale.sale_id)
    .single();
  if (saleReadError) throw saleReadError;
  assert(Number(savedSale.total) === 75, 'Server did not recompute the sale total.');
  assert(savedSale.customer_id === firstCustomer.customer_id, 'Queued customer was not linked to the sale.');
  assert(savedSale.created_offline === true, 'Offline attribution was not stored.');

  const { data: stock, error: stockError } = await service
    .from('products')
    .select('quantity,stock')
    .eq('id', product.id)
    .single();
  if (stockError) throw stockError;
  assert(Number(stock.quantity) === 7 && Number(stock.stock) === 7, 'Stock was not reduced exactly once.');

  const { count: customerCount, error: countError } = await service
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('client_txn_id', customerPayload.client_txn_id);
  if (countError) throw countError;
  assert(customerCount === 1, 'Duplicate customer row was created.');

  const { error: crossTenantError } = await outsider.supabase.rpc('sync_offline_customer', {
    _payload: {
      ...customerPayload,
      client_txn_id: `${runId}-cross-tenant`,
      name: 'Blocked Outsider',
    },
  });
  assert(crossTenantError, 'Cross-tenant write was not rejected.');

  const { data: aiResult, error: aiError } = await owner.supabase.functions.invoke('ai-assistant', {
    body: {
      messages: [{ role: 'user', content: 'How much did I sell today?' }],
      context: { businessId: 'caller-controlled-context-must-be-ignored' },
    },
  });
  if (aiError) throw aiError;
  assert(aiResult?.provider_disabled === true, 'Disabled cloud AI did not request on-device fallback.');
  assert(aiResult?.action === null, 'Disabled cloud AI unexpectedly returned an action.');

  console.log('Offline sync verification passed: scoped writes, idempotency, stock, cross-user Realtime, and private AI fallback.');
}

async function cleanup() {
  if (businessId) {
    const { error } = await service.from('businesses').delete().eq('id', businessId);
    if (error) console.error(`Cleanup warning (business): ${error.message}`);
  }
  if (users.length > 0) {
    await service.from('staff_members').delete().in('staff_user_id', users);
    await service.from('user_roles').delete().in('user_id', users);
    await service.from('profiles').delete().in('user_id', users);
    for (const id of users) {
      const { error } = await service.auth.admin.deleteUser(id);
      if (error) console.error(`Cleanup warning (auth user): ${error.message}`);
    }
  }
}

try {
  await run();
} finally {
  await cleanup();
  await Promise.all(clients.map((supabase) => supabase.removeAllChannels()));
}
