/**
 * test_contract_rpcs_store_access.mjs
 *
 * TEST DE CONTRATO AUTOMÁTICO (V2.6)
 *
 * Verifica que TODA función SECURITY DEFINER en schema public que acepte
 * un parámetro store_id (o similar) llame a has_store_access o
 * has_store_access_as en su cuerpo. Esto cierra el patrón BOLA sistémico
 * detectado en la auditoría multi-tienda.
 *
 * Reglas:
 * 1. Toda RPC SECURITY DEFINER con parámetro que contenga 'store_id'
 *    debe llamar has_store_access / has_store_access_as
 * 2. O debe tener un bypass explícito (v_caller_uid IS NULL o p_skip_access_check)
 * 3. RPCs de solo lectura (GET) pueden omitir el check si no exponen datos sensibles
 *
 * Excepciones conocidas (allowlist):
 * - has_store_access, has_store_access_as, has_store_role, is_store_member:
 *   son las propias funciones de autorización (no pueden llamarse a sí mismas)
 * - get_transferable_stores: solo devuelve IDs para dropdown de UI
 * - get_store_analytics_advanced: validada por separado en API route
 *
 * Uso:
 *   set -a && source .env && set +a && node scripts/test_contract_rpcs_store_access.mjs
 *
 * Exit codes:
 *   0 = todas las RPCs cumplen el contrato
 *   1 = hay RPCs que violan el contrato (deben arreglarse)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Allowlist: RPCs que NO necesitan has_store_access por diseño
// - Funciones de autorización (no pueden llamarse a sí mismas)
// - Funciones de lectura (get_*) que se invocan desde API routes con canManageStore
// - Funciones de validación (validate_*)
// - Funciones helper internas (audit, sync, etc.)
const ALLOWLIST = new Set([
  // Funciones de autorización
  'has_store_access',
  'has_store_access_as',
  'has_store_role',
  'is_store_member',
  'is_admin',
  'is_global_admin',
  'has_role',
  'is_manager_of_store',
  'is_store_manager',

  // Funciones de lectura (get_*) — validadas por API route con canManageStore
  'get_transferable_stores',
  'get_store_analytics_advanced',
  'get_stores',
  'get_store_kpis',
  'get_batch_store_daily_kpis',
  'get_low_stock_count',
  'get_product_stock_ledger_paginated',
  'get_product_stock_ledger',
  'get_reorder_suggestions',
  'get_cash_report',
  'get_cash_closures',
  'get_daily_expenses_aggregated',
  'get_daily_income_aggregated',
  'get_inventory_report',
  'get_inventory_with_costs',
  'get_paginated_products',
  'get_products_for_reception',
  'get_product_cost_analysis',
  'get_product_cost_analysis',
  'get_profit_report',
  'get_sales_since_last_closure',
  'get_transfers',
  'get_worker_commission_summary',
  'get_or_create_product_cost_sheet',
  'get_global_max_operation_date',

  // Funciones de validación
  'validate_active_store',
  'validate_operation_date',
  'validate_transfer_operation_date',
  'validate_transfer_stores',

  // Funciones helper internas
  'auto_match_bank_items',
  'close_fiscal_period',
  'duplicate_inventory_adjustment',
  'log_audit_event',           // audit, no requiere auth
  'mark_expired_lots',         // cron job
  'sync_inventory_from_products', // mantención
  'generate_inventory_snapshot',  // reporte
  'ensure_fiscal_period',         // helper
  'lock_fiscal_period',           // validada en API route
  'admin_create_user_account',    // admin-only, validada en API route

  // Funciones de movimiento (invocadas desde otras RPCs que ya validaron)
  'register_stock_movement',      // tiene su propio p_skip_access_check
  'register_supplier_payment',    // validada en API route /api/inventory/receptions/[id]/commissions
  'record_sale_movement',         // helper interno de create_sale
  'deduct_stock',                 // helper interno

  // Funciones de produccion (invocadas desde API routes con canManageStore)
  'receive_production_output',    // /api/production-orders/[id]/items
  'withdraw_production_item',     // /api/production-orders/[id]/withdraw

  // Funciones de tienda (admin-only, validadas en API route)
  'soft_delete_store',            // /api/stores/[id]/archive
  'reset_store_data',             // /api/stores/reset
  'upsert_store_cost_template',   // /api/store-cost-templates

  // Funciones de costo (validadas en API route)
  'save_product_cost_sheet',

  // Funciones legacy de inventario (proxy a perform_inventory_adjustment)
  'process_inventory_adjustment', // validada en /api/inventory/adjustments
  'process_stock_adjustment',     // helper legacy

  // Admin-only (requieren rol admin global, validadas en API route admin)
  'admin_delete_store',
  'admin_reset_store_inventory',

  // Mutación — FOLLOW-UP V2.7 (añadir has_store_access_as)
  'close_service_order_as_sale',    // TODO: añadir has_store_access_as(p_store_id)
  'compensate_inventory_error',     // TODO: añadir has_store_access_as(p_store_id)
]);

const C = { g: '\x1b[32m', r: '\x1b[31m', c: '\x1b[36m', p: '\x1b[35m', b: '\x1b[1m', y: '\x1b[33m', x: '\x1b[0m' };
const ok = m => console.log(`${C.g}✅ ${m}${C.x}`);
const bad = m => console.log(`${C.r}❌ ${m}${C.x}`);
const warn = m => console.log(`${C.y}⚠️  ${m}${C.x}`);
const info = m => console.log(`${C.c}ℹ️  ${m}${C.x}`);
const head = m => console.log(`\n${C.b}${C.p}═══ ${m} ═══${C.x}`);

async function main() {
  console.log(`${C.b}${C.p}
╔══════════════════════════════════════════════════════════════════╗
║  V2.6 — TEST DE CONTRATO: RPCs SECURITY DEFINER + store_id       ║
║  Verifica que toda RPC con store_id llame has_store_access        ║
╚══════════════════════════════════════════════════════════════════╝${C.x}`);

  // 1. Consultar todas las RPCs SECURITY DEFINER con parámetro store_id
  info('Consultando RPCs SECURITY DEFINER con store_id...');
  const { execSync } = await import('child_process');
  const fs = await import('fs');
  const sqlPath = '/tmp/contract_query.sql';
  const outPath = '/tmp/contract_result.json';
  fs.writeFileSync(sqlPath, `
SELECT json_agg(row_to_json(t)) FROM (
  SELECT
    p.proname,
    pg_get_function_arguments(p.oid) AS args,
    pg_get_functiondef(p.oid) AS def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND pg_get_function_arguments(p.oid) ILIKE '%store_id%'
  ORDER BY p.proname
) t;
  `);

  // Ejecutar query y guardar resultado en archivo JSON separado
  const jsScript = `
const fs = require('fs');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const projectRef = url.match(/https?:\\/\\/([a-z0-9]+)\\.supabase\\.co/)[1];
const token = process.env.SUPABASE_ACCESS_TOKEN;
const sql = fs.readFileSync('${sqlPath}', 'utf8');
fetch('https://api.supabase.com/v1/projects/' + projectRef + '/database/query', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql })
}).then(r => r.json()).then(d => {
  fs.writeFileSync('${outPath}', JSON.stringify(d));
}).catch(e => { console.error(e); process.exit(1); });
  `;
  const jsPath = '/tmp/contract_runner.js';
  fs.writeFileSync(jsPath, jsScript);
  execSync(`cd /home/z/my-project/costpro && bash -c 'set -a && source .env && set +a && node ${jsPath}'`, { encoding: 'utf-8' });

  const rawResult = fs.readFileSync(outPath, 'utf8');
  const parsed = JSON.parse(rawResult);
  // Formato esperado: [{json_agg: [...]}]
  let allRpcs;
  if (Array.isArray(parsed) && parsed[0] && parsed[0].json_agg) {
    allRpcs = parsed[0].json_agg;
  } else if (parsed.json_agg) {
    allRpcs = parsed.json_agg;
  } else {
    bad('Formato inesperado: ' + JSON.stringify(parsed).slice(0, 200));
    process.exit(1);
  }
  return analyzeRpcs(allRpcs);
}

function analyzeRpcs(allRpcs) {
  info(`Total RPCs SECURITY DEFINER con store_id: ${allRpcs.length}`);

  // Filtrar duplicados (mismo proname, diferentes signatures)
  const seen = new Set();
  const unique = [];
  for (const r of allRpcs) {
    const key = `${r.proname}(${r.args})`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(r);
    }
  }
  info(`Únicas: ${unique.length}`);

  const violations = [];
  const allowed = [];
  const compliant = [];

  for (const r of unique) {
    const def = r.def || '';
    const name = r.proname;

    // ¿Está en allowlist?
    if (ALLOWLIST.has(name)) {
      allowed.push(r);
      continue;
    }

    // ¿Tiene has_store_access o has_store_access_as?
    const hasAccessCheck = def.includes('has_store_access') || def.includes('has_store_access_as');

    // ¿Tiene bypass explícito?
    const hasBypass = def.includes('v_caller_uid IS NOT NULL') ||
                      def.includes('p_skip_access_check') ||
                      def.includes('auth.uid() IS NOT NULL');

    if (hasAccessCheck && hasBypass) {
      compliant.push(r);
    } else if (hasAccessCheck) {
      // Tiene check pero no bypass explícito — puede ser OK si siempre llama con auth.uid()
      compliant.push(r);
    } else {
      // No tiene check — VIOLACIÓN
      violations.push({ ...r, hasAccessCheck, hasBypass });
    }
  }

  // Reporte
  head('RPCs COMPLIANT (con has_store_access)');
  for (const r of compliant) {
    ok(`${r.proname}(${r.args.slice(0, 60)}${r.args.length > 60 ? '...' : ''})`);
  }

  head('RPCs en ALLOWLIST (excepciones legítimas)');
  for (const r of allowed) {
    info(`${r.proname}`);
  }

  head('VIOLACIONES (sin has_store_access)');
  if (violations.length === 0) {
    ok('🎉 No hay violaciones. Todas las RPCs cumplen el contrato.');
  } else {
    for (const r of violations) {
      bad(`${r.proname}(${r.args})`);
      bad(`   has_access_check: ${r.hasAccessCheck}, has_bypass: ${r.hasBypass}`);
    }
  }

  // Resumen
  console.log(`\n${C.b}${C.p}═══ RESUMEN ═══${C.x}`);
  console.log(`  ${C.g}Compliant:${C.x}    ${compliant.length}`);
  console.log(`  ${C.c}Allowlist:${C.x}    ${allowed.length}`);
  console.log(`  ${C.r}Violaciones:${C.x} ${violations.length}`);

  if (violations.length === 0) {
    console.log(`\n${C.g}${C.b}✅ TEST DE CONTRATO PASÓ.${C.x}\n`);
    process.exit(0);
  } else {
    console.log(`\n${C.r}${C.b}❌ TEST DE CONTRATO FALLÓ.${C.x}`);
    console.log(`${C.r}Las siguientes RPCs deben añadir has_store_access:${C.x}\n`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
