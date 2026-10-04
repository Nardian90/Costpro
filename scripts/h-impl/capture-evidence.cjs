#!/usr/bin/env node
/**
 * H-IMPL — Captura de evidencia runtime LIVE post-implementación (read-only).
 * Genera audit-evidence/FASE-H1-IMPL/live-post-hardening.txt
 */
const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..', '..');
const env = {};
for (const line of fs.readFileSync(path.join(REPO, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const REF = env.NEXT_PUBLIC_SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)[1];
async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  return r.json();
}
const OUT = [];
(async () => {
  OUT.push(`# EVIDENCIA LIVE POST-HARDENING — ${new Date().toISOString()}`);
  OUT.push(`# Proyecto: ${REF} (Supabase LIVE, via Management API)\n`);

  OUT.push('## 1. ACL create_sale_v2 (/24)');
  (await q(`SELECT COALESCE(array_to_string(proacl,','),'(NULL=default)') AS acl, prosecdef, pg_get_userbyid(proowner) AS owner
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_sale_v2';`))
    .forEach(r => OUT.push(JSON.stringify(r)));

  OUT.push('\n## 2. Privilegios efectivos anon/PUBLIC sobre create_sale_v2');
  (await q(`SELECT has_function_privilege('anon','public.create_sale_v2(uuid,uuid,jsonb,text,text,numeric,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,uuid,text,uuid,text,timestamp with time zone,uuid,text,jsonb,text)','EXECUTE') AS anon_can_execute;`))
    .forEach(r => OUT.push(JSON.stringify(r)));

  OUT.push('\n## 3. ACL update_transaction_taxes (/3 endurecida)');
  (await q(`SELECT COALESCE(array_to_string(proacl,','),'(NULL=default)') AS acl, prosecdef, pg_get_userbyid(proowner) AS owner
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='update_transaction_taxes';`))
    .forEach(r => OUT.push(JSON.stringify(r)));

  OUT.push('\n## 4. Huella del cuerpo endurecido (create_sale_v2)');
  (await q(`SELECT length(pg_get_functiondef(p.oid)) AS def_chars,
    position('ERR_UNAUTHORIZED' in pg_get_functiondef(p.oid)) AS auth_offset,
    position('''idempotent''' in pg_get_functiondef(p.oid)) AS idem_offset,
    (pg_get_functiondef(p.oid) ~ 'tax_configurations') AS refs_taxcfg,
    (pg_get_functiondef(p.oid) ~ 'store_exchange_rates') AS refs_storerates,
    (pg_get_functiondef(p.oid) ~ 'exchange_rates') AS refs_globalrates,
    (pg_get_functiondef(p.oid) ~ 'ERR_RATE_STALE') AS has_stale_gate,
    (pg_get_functiondef(p.oid) ~ 'ERR_SELLER_MISMATCH') AS has_seller_binding,
    (pg_get_functiondef(p.oid) ~ 'ERR_IDEMPOTENCY_KEY_REUSE') AS has_idem_conflict,
    (pg_get_functiondef(p.oid) ~ 'ERR_INVALID_DISCOUNT') AS has_neg_discount,
    (pg_get_functiondef(p.oid) ~ 'ERR_APPLIED_TAX_INVALID') AS has_tax_validation
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_sale_v2';`))
    .forEach(r => OUT.push(JSON.stringify(r, null, 1)));

  OUT.push('\n## 5. Constraints fiscales/tasas');
  (await q(`SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint WHERE conname IN ('tax_configurations_value_positive','store_rates_positive') ORDER BY conname;`))
    .forEach(r => OUT.push(JSON.stringify(r)));

  OUT.push('\n## 6. Policies tax_configurations');
  (await q(`SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname='public' AND tablename='tax_configurations' ORDER BY policyname;`))
    .forEach(r => OUT.push(JSON.stringify(r)));

  OUT.push('\n## 7. Policies store_exchange_rates');
  (await q(`SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname='public' AND tablename='store_exchange_rates' ORDER BY policyname;`))
    .forEach(r => OUT.push(JSON.stringify(r)));

  OUT.push('\n## 8. update_transaction_taxes — firma y huella del cuerpo');
  (await q(`SELECT pg_get_function_identity_arguments(p.oid) AS args,
    (pg_get_functiondef(p.oid) ~ 'ERR_TRANSACTION_STATE') AS has_state_check,
    (pg_get_functiondef(p.oid) ~ 'ERR_REASON_REQUIRED') AS has_reason_check,
    (pg_get_functiondef(p.oid) ~ 'ERR_TOTAL_BELOW_PAYMENTS') AS has_pt002,
    (pg_get_functiondef(p.oid) ~ 'has_store_role_as') AS has_store_scoping,
    (pg_get_functiondef(p.oid) ~ 'tax_configurations') AS refs_taxcfg
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='update_transaction_taxes';`))
    .forEach(r => OUT.push(JSON.stringify(r, null, 1)));

  OUT.push('\n## 9. idempotency_registry — mecanismo en producción');
  (await q(`SELECT count(*) AS total_rows, count(*) FILTER (WHERE operation='create_sale_v2') AS v2_rows
    FROM public.idempotency_registry;`))
    .forEach(r => OUT.push(JSON.stringify(r)));

  OUT.push('\n## 10. Muestra de auditoría extendida (CREATE_SALE_V2 con client/server rate)');
  (await q(`SELECT created_at, action, metadata->>'client_rate' AS client_rate, metadata->>'server_rate' AS server_rate,
    metadata->>'rate_source' AS rate_source, metadata->>'idempotency_param_hash' AS param_hash
    FROM public.audit_logs WHERE action='CREATE_SALE_V2' AND metadata ? 'server_rate'
    ORDER BY created_at DESC LIMIT 3;`))
    .forEach(r => OUT.push(JSON.stringify(r)));

  const dest = path.join(REPO, 'audit-evidence', 'FASE-H1-IMPL', 'live-post-hardening.txt');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, OUT.join('\n'));
  console.log(`✅ evidencia LIVE capturada: ${dest} (${OUT.length} bloques)`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
