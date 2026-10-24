// READ-ONLY reproduction of the production incident (PostgREST select, zero writes)
const URL = 'https://wthkddeleylijmonclxg.supabase.co';
const KEY = '<SUPABASE_SERVICE_ROLE_KEY_REDACTADA>';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// 1. Reproduce EXACTLY the buggy select from src/app/api/cash-flow/ledger/route.ts:303
console.log('=== REPRO: buggy select (read-only) ===');
const bad = await fetch(`${URL}/rest/v1/commission_payments?select=id,amount,amount_cup,currency,exchange_rate,payment_method,status,paid_at,paid_by,notes&store_id=eq.00000000-0000-0000-0000-000000000000&limit=1`, { headers: H });
console.log('HTTP', bad.status);
console.log('BODY', JSON.stringify(await bad.json()));

// 2. Verify the CORRECT select works
console.log('\n=== VERIFY: corrected select (read-only) ===');
const good = await fetch(`${URL}/rest/v1/commission_payments?select=id,final_amount,amount_cup,currency,exchange_rate,payment_method,status,paid_at,paid_by,manual_adjustment_reason,payment_reference&limit=0`, { headers: H });
console.log('HTTP', good.status);
const goodBody = await good.json();
console.log('BODY (limit=0):', JSON.stringify(goodBody));

// 3. Check get_cash_currency_summary RPC exists (the authoritative mirror)
console.log('\n=== RPC get_cash_currency_summary presence (read-only introspection) ===');
const rpcRes = await fetch(`${URL}/rest/v1/rpc/get_cash_currency_summary`, { method: 'HEAD', headers: H });
console.log('HTTP', rpcRes.status);
