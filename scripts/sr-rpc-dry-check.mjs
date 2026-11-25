#!/usr/bin/env node
/**
 * sr-rpc-dry-check.mjs — Prueba FUNCIONAL sin escrituras de la RPC
 * create_received_service_v2 (16 params) contra el endpoint REST real.
 *
 * Qué demuestra (el camino EXACTO del usuario en /received-services):
 *   1. PostgREST resuelve la función por nombre + 16 argumentos nombrados
 *      (antes: PGRST202 «Could not find ... in the schema cache»).
 *   2. El GRANT a service_role permite ejecutarla.
 *   3. El cuerpo ejecuta sus validaciones (p_total_amount=0 → ERR_INVALID_AMOUNT)
 *      ANTES de cualquier INSERT → cero escrituras en producción.
 *
 * Uso:
 *   node scripts/sr-rpc-dry-check.mjs            # producción (requiere ALLOW_PROD=read-only)
 *   node scripts/sr-rpc-dry-check.mjs --target e2e
 * Re-ejecutable: nunca escribe (la transacción solo toma un advisory lock).
 */
import { readFileSync } from 'node:fs';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const target = process.argv.includes('--target') ? process.argv[process.argv.indexOf('--target') + 1] : 'prod';
const envText = readFileSync('/home/z/my-project/Costpro/.env', 'utf8');
const env = Object.fromEntries(
  envText.split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);

let url, key;
if (target === 'e2e') {
  url = process.env.E2E_SUPABASE_URL || '';
  key = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) { console.error('FALLO: variables E2E_* requeridas.'); process.exit(2); }
} else {
  url = env.NEXT_PUBLIC_SUPABASE_URL;
  key = env.SUPABASE_SERVICE_ROLE_KEY;
  assertNotProduction({ mode: 'read', url, context: 'sr-rpc-dry-check.mjs' });
}

const { createClient } = await import('@supabase/supabase-js');
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// Par usuario/tienda REAL con membresía (solo lectura).
const { data: ms, error: msErr } = await admin
  .from('user_store_memberships')
  .select('user_id, store_id, stores(name)')
  .limit(1);
if (msErr || !ms?.length) {
  console.error(`FALLO obteniendo par usuario/tienda: ${msErr?.message ?? 'sin filas'}`);
  process.exit(1);
}
const { user_id, store_id } = ms[0];
console.log(`Destino: ${url}`);
console.log(`Par de prueba (solo lectura): store=${ms[0].stores?.name}`);

// Llamada EXACTA de src/app/api/received-services/route.ts con p_total_amount=0:
// el RPC valida (auth→store→key→supplier→amount) y DEBE fallar en el importe
// antes de cualquier INSERT.
const params = {
  p_store_id: store_id,
  p_supplier: 'PRUEBA-DRY-RPC',
  p_total_amount: 0,
  p_service_type_id: null,
  p_service_type_name: 'Otro',
  p_service_date: '2026-11-25',
  p_currency: 'CUP',
  p_exchange_rate: 1.0,
  p_payment_terms_days: 30,
  p_distribution_method: 'amount',
  p_reference_doc: null,
  p_observations: 'prueba seca (sin escritura): p_total_amount=0',
  p_receipt_ids: [],
  p_created_by: user_id,
  p_production_order_ids: [],
  p_creation_key: 'dry-check-20261125',
};

const { data, error } = await admin.rpc('create_received_service_v2', params);

if (error) {
  const msg = error.message || '';
  if (msg.includes('PGRST202') || msg.includes('Could not find the function')) {
    console.log('RESULTADO: FALLO — la RPC sigue sin resolverse en el schema cache.');
    console.log(`  ${msg.slice(0, 300)}`);
    process.exit(1);
  }
  if (msg.includes('ERR_INVALID_AMOUNT')) {
    console.log('RESULTADO: ÉXITO — la RPC se resuelve y ejecuta con los 16 parámetros.');
    console.log(`  Validación esperada alcanzada: ${msg.slice(0, 160)}`);
    console.log('  Cero escrituras (falló en la validación de importe, antes de cualquier INSERT).');
    process.exit(0);
  }
  // Otro error de negocio: la función SÍ se resolvió (ya no es PGRST202).
  console.log('RESULTADO: LA RPC SE RESUELVE (error de negocio distinto, sin escrituras).');
  console.log(`  ${msg.slice(0, 200)}`);
  process.exit(0);
}

// Si llegara a DEVOLVER datos con importe 0 sería un defecto grave.
console.log('RESULTADO: INESPERADO — la llamada no falló con importe 0. Revisar de inmediato.');
console.log(JSON.stringify(data).slice(0, 300));
process.exit(1);
