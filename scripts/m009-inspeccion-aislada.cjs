#!/usr/bin/env node
/**
 * m009-inspeccion-aislada.cjs — ADN-009. Inspección READ-ONLY de la BD AISLADA
 * (CostproE2E, lguovmvrozxgssupkwpf) vía pg directo (E2E_SUPABASE_DB_URL).
 * Re-ejecutable. SOLO SELECT/consulta de catálogos — cero escrituras.
 */
const { Client } = require('pg');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first'); // sandbox sin ruta IPv6 → forzar A record

const DB_URL = process.env.E2E_SUPABASE_DB_URL;
if (!DB_URL) { console.error('FALLO: E2E_SUPABASE_DB_URL requerido'); process.exit(2); }
if (!/lguovmvrozxgssupkwpf/.test(DB_URL)) { console.error('FALLO: la URL no es la BD aislada esperada'); process.exit(2); }

// El host directo db.<ref>.supabase.co es IPv6-only desde este sandbox →
// pooler de sesión (:5432, IPv4) manteniendo CADA cliente como sesión real
// (necesario para SELECT ... FOR UPDATE retenido entre sentencias).
function isolatedClientConfig() {
  const u = new URL(DB_URL);
  const password = decodeURIComponent(u.password);
  return {
    host: process.env.E2E_POOLER_HOST || 'aws-0-us-east-1.pooler.supabase.com',
    port: Number(process.env.E2E_POOLER_PORT || 5432),
    user: `postgres.lguovmvrozxgssupkwpf`,
    database: 'postgres',
    password,
    ssl: { rejectUnauthorized: false },
  };
}

const QUERIES = {
  acl_batch: `SELECT array_to_string(proacl::text[], ', ') acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='register_supplier_payment_batch'`,
  batch_whitelist: `SELECT substring(prosrc from position('NOT IN (' in prosrc) for 100) w FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='register_supplier_payment_batch'`,
  idem_unique: `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='payment_transactions' AND indexdef ILIKE '%idempotency_key%'`,
  audit_cols: `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' ORDER BY ordinal_position`,
  sentinel: `SELECT public.e2e_is_isolated_db() AS isolated`,
  counts: `SELECT (SELECT count(*) FROM received_services) svc, (SELECT count(*) FROM payment_transactions) pays, (SELECT count(*) FROM stores) stores, (SELECT count(*) FROM user_store_memberships) membs, (SELECT count(*) FROM suppliers) suppliers`,
  ext_map: `SELECT payment_method,currency,is_active FROM fin_account_mapping WHERE payment_method='external_transfer' ORDER BY currency`,
};

(async () => {
  const c = new Client(isolatedClientConfig());
  await c.connect();
  const out = {};
  for (const [k, sql] of Object.entries(QUERIES)) {
    try { out[k] = (await c.query(sql)).rows; }
    catch (e) { out[k] = [{ error: e.message }]; }
  }
  console.log(JSON.stringify(out, null, 1));
  await c.end();
})();
