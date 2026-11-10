#!/usr/bin/env node
/**
 * verify-fc-user-template-flow.mjs — FC-USR-TEMPLATE (misión 2026-11-10)
 * ============================================================================
 * Verificación READ-ONLY y REPETIBLE del soporte de BD para la conexión
 * Producto ↔ Ficha de Costo con plantillas de usuario.
 *
 * NO modifica datos. NO aplica migraciones (la solución no requiere cambios
 * de esquema: reutiliza product_cost_sheets + products.cost_sheet_id y
 * cost_sheet_templates tal como existen).
 *
 * Solo usa peticiones GET de PostgREST (sin señal de escritura → fuera del
 * manifiesto de escritores de scripts/lib/check-writers.mjs).
 *
 * Uso:
 *   E2E_SUPABASE_URL=... E2E_SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/verify-fc-user-template-flow.mjs
 *
 * Verifica:
 *   1. Tabla cost_sheet_templates: columnas esperadas (plantillas de usuario).
 *   2. Tabla product_cost_sheets: columnas esperadas (asociación, incl.
 *      template_id TEXT y deleted_at para soft-delete).
 *   3. Columna products.cost_sheet_id + fc_auto_enabled (enlace persistente).
 *   4. store_cost_templates: estructura de la plantilla predeterminada por
 *      tienda (intacta).
 *   5. Acceso anónimo bloqueado (auth/RLS requieren sesión).
 */

const SUPABASE_URL = process.env.E2E_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('✗ Faltan E2E_SUPABASE_URL / E2E_SUPABASE_SERVICE_ROLE_KEY (o equivalentes).');
  process.exit(2);
}

async function restGet(path, key) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

(async () => {
  console.log(`\nVerificación FC-USR-TEMPLATE — BD: ${SUPABASE_URL}\n`);

  // 1. cost_sheet_templates (plantillas de usuario — «Mis Plantillas Guardadas»)
  const cst = await restGet(
    'cost_sheet_templates?select=id,name,description,category,data,type,created_by,store_id,created_at,updated_at&limit=0',
    SERVICE_KEY,
  );
  check(
    'cost_sheet_templates columnas completas (id,name,description,category,data,type,created_by,store_id,...)',
    cst.status === 200,
    `HTTP ${cst.status}`,
  );

  // 2. product_cost_sheets (asociación producto↔FC)
  const pcs = await restGet(
    'product_cost_sheets?select=id,product_id,store_id,template_id,modalidad,calculated_data,cost_price,cost_price_updated_at,sync_status,created_at,updated_at,deleted_at&limit=0',
    SERVICE_KEY,
  );
  check(
    'product_cost_sheets columnas completas (incl. template_id TEXT y deleted_at)',
    pcs.status === 200,
    `HTTP ${pcs.status}`,
  );

  // 3. products.cost_sheet_id (enlace persistente) + fc_auto_enabled
  const prods = await restGet('products?select=cost_sheet_id,fc_auto_enabled&limit=0', SERVICE_KEY);
  check(
    'products.cost_sheet_id + fc_auto_enabled presentes (enlace persistente)',
    prods.status === 200,
    `HTTP ${prods.status}`,
  );

  // 4. store_cost_templates (plantilla predeterminada por tienda, intacta)
  const sct = await restGet(
    'store_cost_templates?select=store_id,template_id,template_data,modalidad,pdf_format,is_active&limit=0',
    SERVICE_KEY,
  );
  check(
    'store_cost_templates estructura (plantilla predeterminada por tienda, intacta)',
    sct.status === 200,
    `HTTP ${sct.status}`,
  );

  // 5. Anónimo: RLS filtra (SELECT TO authenticated → lista vacía, no error)
  if (ANON_KEY) {
    const anon = await restGet('product_cost_sheets?select=id&limit=10', ANON_KEY);
    const rows = Array.isArray(anon.json) ? anon.json.length : null;
    check(
      'Rol anónimo NO ve product_cost_sheets (RLS: SELECT TO authenticated)',
      anon.status === 200 && rows === 0,
      `HTTP ${anon.status}, filas: ${rows}`,
    );
  } else {
    console.log('  (info) Sin ANON_KEY en el entorno — check anónimo omitido.');
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n${failed.length === 0 ? 'PASS' : 'FAIL'} — ${results.length - failed.length}/${results.length} verificaciones OK\n`);
  process.exit(failed.length === 0 ? 0 : 1);
})();
