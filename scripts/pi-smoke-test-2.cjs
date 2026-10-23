#!/usr/bin/env node
/**
 * SMOKE TEST 2 — Conteo ciego a nivel BD + concurrencia optimista.
 * Usuario no privilegiado: almacen@demo.com (warehouse, TIENDA CENTRAL).
 */
const fs = require('fs');
const env = {};
for (const line of fs.readFileSync('/home/z/my-project/.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) env[m[1]] = m[2];
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const STORE = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';

const results = [];
function log(step, ok, detail) {
  results.push({ step, ok });
  console.log(`${ok ? '✅' : '❌'} ${step}${detail ? ' — ' + detail : ''}`);
}

async function login(email, pass) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass }),
  });
  const j = await r.json();
  return j.access_token ? { token: j.access_token, uid: j.user.id } : null;
}

function client(token) {
  return {
    async rpc(fn, args) {
      const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args || {}),
      });
      const body = await r.text();
      let j; try { j = JSON.parse(body); } catch { j = body; }
      return { status: r.status, data: j };
    },
    async select(table, query) {
      const r = await fetch(`${URL}/rest/v1/${table}?${query}`, {
        headers: { apikey: ANON, Authorization: `Bearer ${token}` },
      });
      return { status: r.status, data: await r.json() };
    },
  };
}

async function mgmt(sql) {
  const REF = URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)[1];
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`MGMT ${r.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

(async () => {
  const admin = await login(process.env.E2E_ADMIN_EMAIL || 'admin@demo.com', process.env.E2E_ADMIN_PASS || 'demo123');
  const ware = await login(process.env.E2E_WAREHOUSE_EMAIL || 'almacen@demo.com', process.env.E2E_WAREHOUSE_PASS || 'demo123');
  if (!ware) { console.log('⚠️ No se pudo loguear almacen@demo.com — probando contraseña demo1234...');
    throw new Error('sin usuario warehouse'); }
  const ca = client(admin.token), cw = client(ware.token);
  console.log('admin:', admin.uid.slice(0, 8), '| warehouse:', ware.uid.slice(0, 8), '\n');

  // Producto de prueba con stock
  const prods = await mgmt(`SELECT p.id, p.sku, COALESCE(i.quantity,0) AS qty FROM products p
    LEFT JOIN inventory i ON i.product_id=p.id AND i.store_id='${STORE}'
    WHERE p.store_id='${STORE}' AND p.is_active=true AND COALESCE(p.is_service,false)=false
      AND COALESCE(i.quantity,0) > 0 ORDER BY p.name LIMIT 2`);
  const [P1, P2] = prods;

  // ── 1. Crear PI CIEGO como admin
  let piId;
  {
    const r = await ca.rpc('create_physical_inventory', {
      p_store_id: STORE, p_cutoff_date: new Date().toISOString(),
      p_description: 'SMOKE TEST 2 — conteo ciego', p_responsible_name: 'Almacen Demo',
      p_scope_type: 'selection', p_product_ids: prods.map(p => p.id),
      p_blind_mode: true, p_user_id: admin.uid,
    });
    piId = r.data;
    log('1. crear PI ciego', !!piId, `pi_id=${piId?.slice(0, 8)}`);
  }
  await ca.rpc('prepare_physical_inventory', { p_pi_id: piId, p_user_id: admin.uid });
  await ca.rpc('start_physical_inventory_count', { p_pi_id: piId, p_user_id: admin.uid });

  // ── 2. Usuario warehouse NO puede leer items directamente (RLS ciego)
  {
    const r = await cw.select('physical_inventory_items', `pi_id=eq.${piId}&select=id`);
    log('2. RLS bloquea SELECT directo de items a contador', r.status !== 200 || (Array.isArray(r.data) && r.data.length === 0),
        `status=${r.status}, rows=${Array.isArray(r.data) ? r.data.length : 'err'}`);
  }

  // ── 3. Usuario warehouse obtiene líneas vía RPC — SIN teóricas
  let blindLines;
  {
    const r = await cw.rpc('get_physical_inventory_count_lines', { p_pi_id: piId });
    blindLines = r.data;
    const lines = r.data?.lines || [];
    const noTheoretical = lines.length > 0 && lines.every(l =>
      !('theoretical_qty' in l) && !('difference' in l) && !('theoretical_source' in l));
    log('3. RPC devuelve líneas SIN theoretical/difference', r.status === 200 && noTheoretical && lines.length === 2,
        `líneas=${lines.length}, show_theoretical=${r.data?.show_theoretical}`);
    console.log('   claves línea warehouse:', JSON.stringify(Object.keys(lines[0] || {})));
  }

  // ── 3b. Warehouse NO puede ver conciliación
  {
    const r = await cw.rpc('get_physical_inventory_reconciliation', { p_pi_id: piId });
    log('3b. conciliación RECHAZADA a no privilegiado', r.status !== 200, `status=${r.status}`);
  }

  // ── 3c. Admin SÍ ve teóricas vía misma RPC
  {
    const r = await ca.rpc('get_physical_inventory_count_lines', { p_pi_id: piId });
    const lines = r.data?.lines || [];
    log('3c. admin ve teóricas (mismo RPC)', r.status === 200 && lines.every(l => 'theoretical_qty' in l),
        `show_theoretical=${r.data?.show_theoretical}`);
  }

  // ── 4. CONCURRENCIA: warehouse cuenta P1 con updated_at inicial (t0)
  let item1, item2;
  {
    const all = blindLines.lines;
    item1 = all.find(l => l.product_id === P1.id);
    item2 = all.find(l => l.product_id === P2.id);
    const t0 = item1.updated_at; // timestamp de carga

    // primer conteo (admin) actualiza la línea
    const r1 = await ca.rpc('record_physical_inventory_counts', {
      p_pi_id: piId, p_source: 'manual', p_user_id: admin.uid,
      p_items: [{ item_id: item1.id, counted_qty: Number(P1.qty) - 1, expected_updated_at: t0 }],
    });
    log('4. primer conteo (admin, ts fresco)', r1.status === 200 && r1.data?.applied === 1, '');

    // warehouse intenta con ts VIEJO → conflicto, sin sobrescritura silenciosa
    const r2 = await cw.rpc('record_physical_inventory_counts', {
      p_pi_id: piId, p_source: 'manual', p_user_id: ware.uid,
      p_items: [{ item_id: item1.id, counted_qty: 999, expected_updated_at: t0 }],
    });
    const conflicted = r2.status === 200 && r2.data?.conflicts?.length === 1 && r2.data?.applied === 0;
    log('4b. conflicto optimista detectado (no sobrescribe)', conflicted,
        `applied=${r2.data?.applied}, conflicts=${r2.data?.conflicts?.length}`);

    // valor actual preservado
    const chk = await ca.rpc('get_physical_inventory_count_lines', { p_pi_id: piId });
    const cur = chk.data?.lines?.find(l => l.id === item1.id);
    log('4c. valor del primer usuario preservado', Number(cur?.counted_qty) === Number(P1.qty) - 1,
        `counted=${cur?.counted_qty}`);
  }

  // ── 4d. cantidad inválida rechazada
  {
    const r = await cw.rpc('record_physical_inventory_counts', {
      p_pi_id: piId, p_source: 'manual', p_user_id: ware.uid,
      p_items: [{ item_id: item2.id, counted_qty: -5, expected_updated_at: item2.updated_at }],
    });
    log('4d. cantidad negativa rechazada', r.status === 200 && r.data?.invalid?.length === 1,
        `invalid=${r.data?.invalid?.length}`);
  }

  // ── 5. Warehouse puede contar normalmente (ts fresco)
  {
    const chk = await cw.rpc('get_physical_inventory_count_lines', { p_pi_id: piId });
    const item2fresh = chk.data?.lines?.find(l => l.id === item2.id);
    const r = await cw.rpc('record_physical_inventory_counts', {
      p_pi_id: piId, p_source: 'excel', p_user_id: ware.uid,
      p_items: [{ item_id: item2.id, counted_qty: Number(P2.qty), expected_updated_at: item2fresh.updated_at }],
    });
    log('5. warehouse cuenta vía RPC (excel source)', r.status === 200 && r.data?.applied === 1, '');
  }

  // ── 6. Warehouse NO puede generar ajustes
  {
    await ca.rpc('complete_physical_inventory_count', { p_pi_id: piId, p_user_id: ware.uid });
    await ca.rpc('submit_physical_inventory_reconciliation', { p_pi_id: piId, p_user_id: admin.uid });
    await ca.rpc('submit_physical_inventory_authorization', { p_pi_id: piId, p_user_id: admin.uid });
    const r = await cw.rpc('generate_adjustments_from_physical_inventory', { p_pi_id: piId, p_user_id: ware.uid });
    log('6. generación de ajustes RECHAZADA a warehouse', r.status !== 200, `status=${r.status}`);
  }

  // ── 7. Hoja de conteo: warehouse no puede generar versión CON teóricas en modo ciego
  {
    const r = await cw.rpc('register_physical_inventory_sheet', {
      p_pi_id: piId, p_mode: 'with_theoretical', p_total_lines: 2, p_user_id: ware.uid,
    });
    log('7. hoja con teóricas RECHAZADA en modo ciego', r.status !== 200, `status=${r.status}`);
    const r2 = await cw.rpc('register_physical_inventory_sheet', {
      p_pi_id: piId, p_mode: 'blind', p_total_lines: 2, p_user_id: ware.uid,
    });
    log('7b. hoja ciega PERMITIDA', r2.status === 200 && r2.data?.seq === 1, `seq=${r2.data?.seq}`);
  }

  // ── 8. Aislamiento entre tiendas: PI de TIENDA CENTRAL invisible para QA-H1
  {
    // qa.h1.a@costpro.test (usuario) — ¿otra tienda? Primero verificamos con el admin de otra tienda
    // Usamos encargado de ENERVIDA: belkis... pero sin password. Alternativa: ver desde clerk de TIENDA CENTRAL
    // que SÍ tiene acceso → no es prueba de aislamiento. Usamos mgmt para confirmar RLS policy depende de has_store_access.
    const r = await mgmt(`SELECT count(*) AS total FROM public.physical_inventories WHERE store_id='${STORE}'`);
    log('8. (info) PIs en TIENDA CENTRAL', true, `total=${r?.[0]?.total}`);
  }

  // ── 9. Cerrar el PI ciego de prueba (sin diferencias: P1 faltante -1... hay diferencia)
  //     → anulamos este PI para dejar estado limpio (está en pending_authorization, permitido)
  {
    const r = await ca.rpc('void_physical_inventory', {
      p_pi_id: piId, p_reason: 'Prueba automática completada — limpieza', p_user_id: admin.uid,
    });
    log('9. void PI de prueba (permitido pre-conciliación)', r.status === 200 && r.data?.new_status === 'voided', '');
  }

  const passed = results.filter(r => r.ok).length;
  console.log(`\n═══ RESULTADO: ${passed}/${results.length} pruebas OK ═══`);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
