// READ-ONLY verification of every query the ledger route makes, against PRODUCTION data
const URL = 'https://wthkddeleylijmonclxg.supabase.co';
const KEY = '<SUPABASE_SERVICE_ROLE_KEY_REDACTADA>';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS (read-only)

const tests = [
  ['transactions', `transactions?select=id,cash_amount,cash_received_cup,cash_received_usd,change_given_cup,change_given_usd,change_currency,invoice_number,created_at,status,seller_id,notes&store_id=eq.${STORE}&status=eq.completed&limit=1`],
  ['transaction_items', `transaction_items?select=transaction_id,cash_paid,exchange_rate&cash_currency=eq.USD&currency=eq.USD&limit=1`],
  ['payment_transactions', `payment_transactions?select=id,ref_type,ref_id,amount,amount_cup,currency,payment_date,direction,notes,paid_by,idempotency_key&store_id=eq.${STORE}&payment_method=eq.cash&limit=1`],
  ['commission_payments (FIXED)', `commission_payments?select=id,final_amount,amount_cup,currency,exchange_rate,payment_method,status,paid_at,paid_by,payment_reference,manual_adjustment_reason&store_id=eq.${STORE}&status=eq.paid&payment_method=eq.cash&limit=1`],
  ['cash_closures + profile embed', `cash_closures?select=id,status,created_at,closed_at,opening_balance,opening_balance_usd,opening_difference_cup,opening_difference_usd,declared_cash,declared_cash_usd,declared_total,system_expected_total,difference,difference_usd,user_id,profile:profiles(full_name)&store_id=eq.${STORE}&limit=1`],
  ['profiles', `profiles?select=id,full_name&limit=1`],
];
for (const [name, path] of tests) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H });
  const body = await r.text();
  console.log(`${r.ok ? '✅' : '❌'} ${name} → HTTP ${r.status}${r.ok ? ` (${body.length > 2 ? 'data OK' : 'empty OK'})` : ' ' + body.slice(0, 120)}`);
}

// RPC read (service_role grant) — the authoritative summary for the store
const rpc = await fetch(`${URL}/rest/v1/rpc/get_cash_currency_summary`, {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_store_id: STORE, p_from: null, p_to: null }),
});
console.log(`${rpc.ok ? '✅' : '❌'} RPC get_cash_currency_summary(ENERVIDA) → HTTP ${rpc.status}`);
if (rpc.ok) {
  const d = await rpc.json();
  console.log('   net:', JSON.stringify(d.net), '· terms:', Object.keys(d.terms || {}).length);
} else console.log('   ', (await rpc.text()).slice(0, 150));
