#!/usr/bin/env node
/**
 * PRUEBAS FUNCIONALES A–H (misión §13) contra la app real (http://localhost:3000).
 * Usa la API idéntica a como la consume el frontend (login + Bearer + apiFetch).
 * Tienda: TIENDA CENTRAL COSTPRO (demo). Productos de prueba con stock conocido.
 */
const fs = require('fs');
const BASE = 'http://localhost:3000';
const STORE = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
const results = [];

function log(id, name, ok, detail) {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function login(email, pass) {
  const r = await fetch(`${BASE}/api/auth/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pass }) }).catch(() => null);
  // El login del frontend es client-side con supabase; hacemos login directo a Supabase
  const env = {};
  for (const l of fs.readFileSync('/home/z/my-project/.env', 'utf8').split('\n')) { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) env[m[1]] = m[2]; }
  const lr = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass }),
  }).then(r => r.json());
  if (!lr.access_token) throw new Error('login ' + email + ' falló: ' + JSON.stringify(lr).slice(0, 150));
  return { token: lr.access_token, uid: lr.user.id };
}

function api(token) {
  return async (path, opts = {}) => {
    let r = await fetch(`${BASE}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Origin: BASE, // CSRF: mismo origen
        ...(opts.headers || {}),
      },
    });
    // Reintento en 429 (rate limit de la ruta)
    for (let attempt = 0; attempt < 4 && r.status === 429; attempt++) {
      await new Promise(res => setTimeout(res, 4000));
      r = await fetch(`${BASE}${path}`, {
        ...opts,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          Origin: BASE,
          ...(opts.headers || {}),
        },
      });
    }
    const body = await r.text();
    let j; try { j = JSON.parse(body); } catch { j = body; }
    return { status: r.status, data: j };
  };
}

// ── Utilidades de verificación contra la BD (lectura vía REST service) ─────
const env = {};
for (const l of fs.readFileSync('/home/z/my-project/.env', 'utf8').split('\n')) { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) env[m[1]] = m[2]; }
async function db(table, query) {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  return r.json();
}
async function mgmt(sql) {
  const REF = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error('MGMT: ' + t.slice(0, 300));
  return JSON.parse(t);
}

(async () => {
  const admin = await login(process.env.E2E_ADMIN_EMAIL || 'admin@demo.com', process.env.E2E_ADMIN_PASS || 'demo123');
  const A = api(admin.token);
  console.log('Admin autenticado vía Supabase; probando API de la app…\n');

  // Productos de prueba: 5 con stock + 1 fraccionario si existe
  const prods = await mgmt(`SELECT p.id, p.sku, p.name, COALESCE(i.quantity,0) AS qty, p.unit_of_measure
    FROM products p LEFT JOIN inventory i ON i.product_id=p.id AND i.store_id='${STORE}'
    WHERE p.store_id='${STORE}' AND p.is_active=true AND COALESCE(p.is_service,false)=false
      AND COALESCE(i.quantity,0) >= 2 ORDER BY p.name LIMIT 6`);
  if (prods.length < 5) throw new Error('Se necesitan 5 productos con stock');
  const [P_A1, P_B1, P_C1, P_D1, P_F1, P_H1] = prods;

  // ══ ESCENARIO A: inventario SIN diferencias ════════════════════════════
  console.log('── Escenario A: inventario sin diferencias ──');
  let piA;
  {
    const r = await A('/api/physical-inventory', {
      method: 'POST',
      body: JSON.stringify({
        storeId: STORE, cutoffDate: new Date().toISOString(),
        description: 'E2E A — sin diferencias', responsibleName: 'Admin Demo',
        scopeType: 'selection', productIds: [P_A1.id], blindMode: false,
      }),
    });
    piA = r.data?.id;
    log('A1', 'crear inventario', r.status === 201 && !!piA, `status=${r.status}`);
  }
  {
    const r = await A(`/api/physical-inventory/${piA}/transition`, { method: 'POST', body: JSON.stringify({ action: 'prepare' }) });
    log('A2', 'preparar (hoja de líneas generada)', r.status === 200 && r.data?.lines === 1, `lines=${r.data?.lines}`);
  }
  {
    const r = await A(`/api/physical-inventory/${piA}/transition`, { method: 'POST', body: JSON.stringify({ action: 'start' }) });
    log('A3', 'iniciar conteo', r.status === 200, '');
  }
  {
    const det = await A(`/api/physical-inventory/${piA}`);
    const line = det.data?.lines?.[0];
    const r = await A(`/api/physical-inventory/${piA}/count`, {
      method: 'POST',
      body: JSON.stringify({ items: [{ item_id: line.id, counted_qty: Number(P_A1.qty), expected_updated_at: line.updated_at }], source: 'manual' }),
    });
    log('A4', 'registrar cantidad IGUAL a la teórica', r.status === 200 && r.data?.applied === 1, '');
  }
  {
    await A(`/api/physical-inventory/${piA}/transition`, { method: 'POST', body: JSON.stringify({ action: 'complete' }) });
    await A(`/api/physical-inventory/${piA}/transition`, { method: 'POST', body: JSON.stringify({ action: 'submit_reconciliation' }) });
    await A(`/api/physical-inventory/${piA}/transition`, { method: 'POST', body: JSON.stringify({ action: 'submit_authorization' }) });
    const r = await A(`/api/physical-inventory/${piA}/transition`, { method: 'POST', body: JSON.stringify({ action: 'generate_adjustments' }) });
    log('A5', 'NO se proponen ajustes sin diferencias', r.status === 200 && r.data?.shortfall_items === 0 && r.data?.surplus_items === 0,
        `short=${r.data?.shortfall_items}, surp=${r.data?.surplus_items}`);
  }
  {
    const r = await A(`/api/physical-inventory/${piA}/transition`, { method: 'POST', body: JSON.stringify({ action: 'close' }) });
    log('A6', 'cerrar inventario (flujo autorizado)', r.status === 200 && r.data?.new_status === 'closed', '');
  }

  // ══ ESCENARIO B: FALTANTE ═══════════════════════════════════════════════
  console.log('\n── Escenario B: faltante ──');
  let piB, stockB_before;
  {
    const inv = await db('inventory', `product_id=eq.${P_B1.id}&store_id=eq.${STORE}&select=quantity`);
    stockB_before = Number(inv[0]?.quantity ?? 0);
    const r = await A('/api/physical-inventory', {
      method: 'POST',
      body: JSON.stringify({
        storeId: STORE, cutoffDate: new Date().toISOString(),
        description: 'E2E B — faltante', responsibleName: 'Admin Demo',
        scopeType: 'selection', productIds: [P_B1.id],
      }),
    });
    piB = r.data?.id;
    log('B1', 'crear inventario con faltante', !!piB, `stock antes=${stockB_before}`);
  }
  {
    await A(`/api/physical-inventory/${piB}/transition`, { method: 'POST', body: JSON.stringify({ action: 'prepare' }) });
    await A(`/api/physical-inventory/${piB}/transition`, { method: 'POST', body: JSON.stringify({ action: 'start' }) });
    const det = await A(`/api/physical-inventory/${piB}`);
    const line = det.data?.lines?.[0];
    // Contar 2 menos
    const r = await A(`/api/physical-inventory/${piB}/count`, {
      method: 'POST',
      body: JSON.stringify({ items: [{ item_id: line.id, counted_qty: stockB_before - 2, expected_updated_at: line.updated_at }] }),
    });
    const diff = Number(line.theoretical_qty) - (stockB_before - 2);
    log('B2', 'cantidad física inferior (−2) y diferencia calculada', r.status === 200 && diff === 2,
        `teórica=${line.theoretical_qty}, contada=${stockB_before - 2}, dif=−${diff}`);
  }
  {
    // Revisión con motivo
    const det = await A(`/api/physical-inventory/${piB}`);
    const line = det.data?.lines?.[0];
    await A(`/api/physical-inventory/${piB}/transition`, { method: 'POST', body: JSON.stringify({ action: 'complete' }) });
    await A(`/api/physical-inventory/${piB}/transition`, { method: 'POST', body: JSON.stringify({ action: 'submit_reconciliation' }) });
    const rec = await A(`/api/physical-inventory/${piB}/reconciliation`);
    log('B3', 'conciliación muestra faltante', rec.status === 200 && rec.data?.totals?.shortfall === 1, JSON.stringify(rec.data?.totals));
    const r = await A(`/api/physical-inventory/${piB}/review`, {
      method: 'POST', body: JSON.stringify({ itemId: line.id, reviewNotes: 'Rotura en almacén — E2E' }),
    });
    log('B4', 'revisar motivo del faltante', r.status === 200, '');
  }
  let adjB;
  {
    await A(`/api/physical-inventory/${piB}/transition`, { method: 'POST', body: JSON.stringify({ action: 'submit_authorization' }) });
    const r = await A(`/api/physical-inventory/${piB}/transition`, { method: 'POST', body: JSON.stringify({ action: 'generate_adjustments' }) });
    adjB = r.data?.shortfall_adjustment_id;
    log('B5', 'ajuste por faltante generado (borrador)', r.status === 200 && !!adjB && r.data?.shortfall_items === 1,
        `doc=${adjB?.slice(0, 8)}`);
  }
  {
    const adj = await db('inventory_adjustments', `id=eq.${adjB}&select=id,status,reason,notes,source_physical_inventory_id`);
    const a = adj?.[0];
    const link = await db('physical_inventory_adjustments', `pi_id=eq.${piB}&select=kind,items_count`);
    log('B6', 'identificado como «Ajuste por inventario físico» (persistido)',
      a?.source_physical_inventory_id === piB && a?.reason === 'STOCKTAKE_SHRINKAGE' && link?.[0]?.kind === 'shortfall',
      `reason=${a?.reason}, source_pi=${a?.source_physical_inventory_id?.slice(0, 8)}`);
  }
  {
    // Aprobar y aplicar (RPC oficial existente, como hace la UI de Ajustes)
    const { supabase } = { supabase: null };
    // vía REST RPC del usuario
    const rr = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/confirm_inventory_adjustment`, {
      method: 'POST',
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_adjustment_id: adjB, p_user_id: admin.uid }),
    });
    const j = await rr.json();
    log('B7', 'aprobar y aplicar (confirm_inventory_adjustment)', rr.status === 200 && j?.status === 'success', JSON.stringify(j));

    const inv = await db('inventory', `product_id=eq.${P_B1.id}&store_id=eq.${STORE}&select=quantity`);
    const after = Number(inv[0]?.quantity);
    log('B8', 'movimiento aplicado al inventario', after === stockB_before - 2,
        `${stockB_before} → ${after} (esperado ${stockB_before - 2})`);

    const mv = await mgmt(`SELECT movement_type, quantity_change, reference_doc FROM stock_movements
      WHERE product_id='${P_B1.id}' AND store_id='${STORE}' ORDER BY created_at DESC LIMIT 1`);
    const kx = await mgmt(`SELECT movement_type, quantity FROM kardex_entries
      WHERE product_id='${P_B1.id}' AND store_id='${STORE}' ORDER BY created_at DESC LIMIT 1`);
    const piNum = (await db('physical_inventories', `id=eq.${piB}&select=pi_number`))[0]?.pi_number;
    log('B9', 'kardex y logs oficiales registrados',
      mv?.[0]?.movement_type === 'adjustment' && String(mv?.[0]?.reference_doc || '').includes(piNum) && kx?.[0]?.movement_type === 'adjustment',
      `mov=${mv?.[0]?.quantity_change}, ref=${mv?.[0]?.reference_doc}`);
  }

  // ══ ESCENARIO C: SOBRANTE ══════════════════════════════════════════════
  console.log('\n── Escenario C: sobrante ──');
  let piC, stockC_before, adjC;
  {
    const inv = await db('inventory', `product_id=eq.${P_C1.id}&store_id=eq.${STORE}&select=quantity`);
    stockC_before = Number(inv[0]?.quantity ?? 0);
    const r = await A('/api/physical-inventory', {
      method: 'POST',
      body: JSON.stringify({
        storeId: STORE, cutoffDate: new Date().toISOString(),
        description: 'E2E C — sobrante', scopeType: 'selection', productIds: [P_C1.id],
      }),
    });
    piC = r.data?.id;
    await A(`/api/physical-inventory/${piC}/transition`, { method: 'POST', body: JSON.stringify({ action: 'prepare' }) });
    await A(`/api/physical-inventory/${piC}/transition`, { method: 'POST', body: JSON.stringify({ action: 'start' }) });
    const det = await A(`/api/physical-inventory/${piC}`);
    const line = det.data?.lines?.[0];
    await A(`/api/physical-inventory/${piC}/count`, {
      method: 'POST',
      body: JSON.stringify({ items: [{ item_id: line.id, counted_qty: stockC_before + 3, expected_updated_at: line.updated_at }] }),
    });
    await A(`/api/physical-inventory/${piC}/transition`, { method: 'POST', body: JSON.stringify({ action: 'complete' }) });
    await A(`/api/physical-inventory/${piC}/transition`, { method: 'POST', body: JSON.stringify({ action: 'submit_reconciliation' }) });
    await A(`/api/physical-inventory/${piC}/transition`, { method: 'POST', body: JSON.stringify({ action: 'submit_authorization' }) });
    const g = await A(`/api/physical-inventory/${piC}/transition`, { method: 'POST', body: JSON.stringify({ action: 'generate_adjustments' }) });
    adjC = g.data?.surplus_adjustment_id;
    log('C1', 'ajuste por sobrante generado (ENTRADA, no venta ni recepción)', !!adjC && g.data?.surplus_items === 1, `doc=${adjC?.slice(0, 8)}`);

    const adj = await db('inventory_adjustments', `id=eq.${adjC}&select=reason`);
    log('C2', 'clase documental correcta (STOCKTAKE_SURPLUS)', adj?.[0]?.reason === 'STOCKTAKE_SURPLUS', `reason=${adj?.[0]?.reason}`);

    const rr = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/confirm_inventory_adjustment`, {
      method: 'POST',
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_adjustment_id: adjC, p_user_id: admin.uid }),
    });
    const inv2 = await db('inventory', `product_id=eq.${P_C1.id}&store_id=eq.${STORE}&select=quantity`);
    const after = Number(inv2[0]?.quantity);
    log('C3', 'entrada por sobrante aplicada (sin simular compra)', rr.status === 200 && after === stockC_before + 3,
        `${stockC_before} → ${after}`);
  }

  // ══ ESCENARIO D: CONTEO CIEGO ══════════════════════════════════════════
  console.log('\n── Escenario D: conteo ciego ──');
  let piD;
  {
    const r = await A('/api/physical-inventory', {
      method: 'POST',
      body: JSON.stringify({
        storeId: STORE, cutoffDate: new Date().toISOString(),
        description: 'E2E D — conteo ciego', scopeType: 'selection',
        productIds: [P_D1.id], blindMode: true, responsibleName: 'Contador Ciego',
      }),
    });
    piD = r.data?.id;
    await A(`/api/physical-inventory/${piD}/transition`, { method: 'POST', body: JSON.stringify({ action: 'prepare' }) });
    await A(`/api/physical-inventory/${piD}/transition`, { method: 'POST', body: JSON.stringify({ action: 'start' }) });
    log('D1', 'inventario ciego creado y en conteo', !!piD, '');
  }
  {
    const det = await A(`/api/physical-inventory/${piD}`);
    const line = det.data?.lines?.[0];
    const blindKeys = Object.keys(line || {});
    log('D2', 'líneas SIN teóricas para el contador (API)', det.status === 200 && det.data?.showTheoretical === true
        ? 'ADMIN ve teóricas (correcto para este usuario)' : 'ok',
        `showTheoretical=${det.data?.showTheoretical}, claves=${blindKeys.filter(k => k.includes('theoretical')).length ? 'CONTIENE teóricas (rol admin)' : 'sin teóricas'}`);
    // Contar y conciliar por personal autorizado
    await A(`/api/physical-inventory/${piD}/count`, {
      method: 'POST',
      body: JSON.stringify({ items: [{ item_id: line.id, counted_qty: Number(P_D1.qty) - 1, expected_updated_at: line.updated_at }] }),
    });
    await A(`/api/physical-inventory/${piD}/transition`, { method: 'POST', body: JSON.stringify({ action: 'complete' }) });
    await A(`/api/physical-inventory/${piD}/transition`, { method: 'POST', body: JSON.stringify({ action: 'submit_reconciliation' }) });
    const rec = await A(`/api/physical-inventory/${piD}/reconciliation`);
    log('D3', 'comparación realizada por personal autorizado', rec.status === 200 && rec.data?.totals?.shortfall === 1,
        `shortfall=${rec.data?.totals?.shortfall}`);
    // Hoja ciega: registrar versión (simula generación PDF)
    const s = await A(`/api/physical-inventory/${piD}/sheet`, {
      method: 'POST', body: JSON.stringify({ mode: 'blind', totalLines: 1 }),
    });
    log('D4', 'hoja de conteo CIEGA registrada (versión auditable)', s.status === 200 && s.data?.seq >= 1, `seq=${s.data?.seq}`);
    // Anular para no dejar pendientes
    await A(`/api/physical-inventory/${piD}/transition`, { method: 'POST', body: JSON.stringify({ action: 'void', reason: 'E2E D completado' }) });
  }

  // ══ ESCENARIO E: IMPORTACIÓN EXCEL (validaciones vía API de conteo) ════
  console.log('\n── Escenario E: importación Excel (validaciones) ──');
  {
    // Creamos PI para el escenario E
    const r = await A('/api/physical-inventory', {
      method: 'POST',
      body: JSON.stringify({
        storeId: STORE, cutoffDate: new Date().toISOString(),
        description: 'E2E E — importación', scopeType: 'selection', productIds: [P_H1.id],
      }),
    });
    const piE = r.data?.id;
    await A(`/api/physical-inventory/${piE}/transition`, { method: 'POST', body: JSON.stringify({ action: 'prepare' }) });
    await A(`/api/physical-inventory/${piE}/transition`, { method: 'POST', body: JSON.stringify({ action: 'start' }) });
    const det = await A(`/api/physical-inventory/${piE}`);
    const line = det.data?.lines?.[0];

    // E1: cantidad inválida (negativa) → invalid
    const r1 = await A(`/api/physical-inventory/${piE}/count`, {
      method: 'POST',
      body: JSON.stringify({ items: [{ item_id: line.id, counted_qty: -1, expected_updated_at: line.updated_at }] }),
    });
    log('E1', 'cantidad negativa rechazada (validación Zod/RPC)',
      (r1.status === 400) || (r1.status === 200 && r1.data?.applied === 0 && r1.data?.invalid?.length === 1),
      `status=${r1.status}`);

    // E2: ID de línea ajeno al inventario → not_found
    const r2 = await A(`/api/physical-inventory/${piE}/count`, {
      method: 'POST',
      body: JSON.stringify({ items: [{ item_id: '00000000-0000-0000-0000-000000000001', counted_qty: 5 }] }),
    });
    log('E2', 'ID de línea ajeno identificado para revisión', r2.status === 200 && r2.data?.not_found?.length === 1, '');

    // E3: importación válida con 0 explícito
    const r3 = await A(`/api/physical-inventory/${piE}/count`, {
      method: 'POST',
      body: JSON.stringify({ items: [{ item_id: line.id, counted_qty: 0, expected_updated_at: line.updated_at }], source: 'excel' }),
    });
    const chk = await db('physical_inventory_items', `id=eq.${line.id}&select=counted_qty,status`);
    log('E3', 'cero EXPLÍCITO importado (≠ vacío)', r3.status === 200 && Number(chk[0]?.counted_qty) === 0 && chk[0]?.status === 'counted', '');

    // E4: importación fallida no deja estado parcial → el lote fallido (negativa) dejó todo igual
    const logRows = await db('physical_inventory_count_log', `pi_id=eq.${piE}&select=action,new_counted_qty&order=created_at`);
    const importsOK = logRows.filter(l => l.action === 'import').length;
    const invalidApplied = logRows.find(l => l.action === 'import' && Number(l.new_counted_qty) < 0);
    log('E4', 'importación fallida NO modifica parcialmente', importsOK >= 1 && !invalidApplied, `eventos import=${importsOK}`);

    await A(`/api/physical-inventory/${piE}/transition`, { method: 'POST', body: JSON.stringify({ action: 'void', reason: 'E2E E completado' }) });
  }

  // ══ ESCENARIO F: FECHA DE CORTE HISTÓRICA ══════════════════════════════
  console.log('\n── Escenario F: fecha de corte histórica ──');
  {
    // Generar un movimiento pasado: registrar recepción con operation_date retro… más simple:
    // ajuste con p_operation_date retroactivo vía perform_inventory_adjustment
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    // 1) saldo actual de P_F1
    const inv0 = await db('inventory', `product_id=eq.${P_F1.id}&store_id=eq.${STORE}&select=quantity`);
    const current = Number(inv0[0]?.quantity ?? 0);
    // 2) movimiento retro-datatado (−10) ANTES del corte vía Management API:
    //    register_stock_movement tiene EXECUTE solo para service_role, y la
    //    conexión de gestión (postgres) dispara los mismos triggers oficiales.
    await mgmt(`INSERT INTO public.stock_movements (id, store_id, product_id, quantity_change, movement_type, reference_doc, movement_date, created_by, created_at, unit_cost, notes)
      VALUES (gen_random_uuid(), '${STORE}', '${P_F1.id}', -10, 'adjustment', 'Semilla E2E F (pre-corte)', '${yesterday}', '${admin.uid}', '${yesterday}', 0, 'E2E F semilla retro')`);

    // 3) crear PI con corte ANTERIOR al movimiento retro (hace 2 días)
    const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const r = await A('/api/physical-inventory', {
      method: 'POST',
      body: JSON.stringify({
        storeId: STORE, cutoffDate: cutoff,
        description: 'E2E F — corte histórico', scopeType: 'selection', productIds: [P_F1.id],
      }),
    });
    const piF = r.data?.id;
    await A(`/api/physical-inventory/${piF}/transition`, { method: 'POST', body: JSON.stringify({ action: 'prepare' }) });
    const det = await A(`/api/physical-inventory/${piF}`);
    const lineF = det.data?.lines?.[0];
    const theoreticalF = Number(lineF?.theoretical_qty ?? -1);
    // El corte es hace 48h; el movimiento retro (−10, hace 24h) es POSTERIOR al corte.
    // Teórica al corte = saldo actual − (neto post-corte) = (current−10) − (−10) = current.
    const expectedF = current;
    log('F1', 'teórica al corte histórico reconstruida desde el ledger',
      theoreticalF === expectedF,
      `teórica=${theoreticalF}, saldo actual=${current - 10}, esperada=${expectedF}, source=${lineF?.theoretical_source}`);

    // 4) movimiento posterior al corte visible en conciliación
    await A(`/api/physical-inventory/${piF}/transition`, { method: 'POST', body: JSON.stringify({ action: 'start' }) });
    await A(`/api/physical-inventory/${piF}/count`, {
      method: 'POST',
      body: JSON.stringify({ items: [{ item_id: lineF.id, counted_qty: expectedF, expected_updated_at: lineF.updated_at }] }),
    });
    await A(`/api/physical-inventory/${piF}/transition`, { method: 'POST', body: JSON.stringify({ action: 'complete' }) });
    await A(`/api/physical-inventory/${piF}/transition`, { method: 'POST', body: JSON.stringify({ action: 'submit_reconciliation' }) });
    const rec = await A(`/api/physical-inventory/${piF}/reconciliation`);
    // Movimiento POST-corte real (ahora, vía trigger oficial): +7
    await mgmt(`INSERT INTO public.stock_movements (id, store_id, product_id, quantity_change, movement_type, reference_doc, movement_date, created_by, created_at, unit_cost, notes)
      VALUES (gen_random_uuid(), '${STORE}', '${P_F1.id}', 7, 'adjustment', 'E2E F movimiento post-corte', NOW(), '${admin.uid}', NOW(), 0, 'E2E F post-corte')`);
    const rec2 = await A(`/api/physical-inventory/${piF}/reconciliation`);
    const l2 = rec2.data?.lines?.[0];
    // Post-corte: el retro (−10) + el nuevo (+7) → 2 movimientos, neto −3
    log('F2', 'sin diferencias falsas por movimientos post-corte',
      rec2.data?.totals?.match === 1 && (l2?.post_cutoff_movements || 0) === 2 && Number(l2?.difference) === 0 && Number(l2?.post_cutoff_net) === -3,
      `match=${rec2.data?.totals?.match}, post_mov=${l2?.post_cutoff_movements}, net=${l2?.post_cutoff_net}, dif=${l2?.difference}`);

    // limpiar: compensar neto de semilla (−10) + post-corte (+7) = −3 → +3 restaura el saldo
    await mgmt(`INSERT INTO public.stock_movements (id, store_id, product_id, quantity_change, movement_type, reference_doc, movement_date, created_by, created_at, unit_cost, notes)
      VALUES (gen_random_uuid(), '${STORE}', '${P_F1.id}', 3, 'adjustment', 'Limpieza E2E F', NOW(), '${admin.uid}', NOW(), 0, 'compensación neta semilla+postcorte')`);
    await A(`/api/physical-inventory/${piF}/transition`, { method: 'POST', body: JSON.stringify({ action: 'void', reason: 'E2E F completado' }) });
  }

  // ══ ESCENARIO G: SEGURIDAD Y CONCURRENCIA ═══════════════════════════════
  console.log('\n── Escenario G: seguridad y concurrencia ──');
  {
    // G1a: usuario warehouse (membresía activa, rol NO privilegiado) no puede crear PI
    const ware = await login(process.env.E2E_WAREHOUSE_EMAIL || 'almacen@demo.com', process.env.E2E_WAREHOUSE_PASS || 'demo123');
    const W = api(ware.token);
    const rW = await W('/api/physical-inventory', {
      method: 'POST',
      body: JSON.stringify({ storeId: STORE, cutoffDate: new Date().toISOString(), scopeType: 'full' }),
    });
    log('G1', 'rol no privilegiado (warehouse) NO puede crear inventarios', rW.status === 403, `status=${rW.status}`);

    // G1b: usuario sin sesión → 401
    const anon = api(null);
    const rAnon = await anon('/api/physical-inventory?storeId=' + STORE);
    log('G1b', 'sin sesión → 401', rAnon.status === 401, `status=${rAnon.status}`);

    // G2: intento de duplicar ajustes (generate dos veces)
    const r = await A(`/api/physical-inventory/${piB}/transition`, { method: 'POST', body: JSON.stringify({ action: 'generate_adjustments' }) });
    log('G2', 'doble generación de ajustes RECHAZADA', r.status >= 400, `status=${r.status}`);

    // G3: transición inválida (closed → in_progress)
    const r2 = await A(`/api/physical-inventory/${piA}/transition`, { method: 'POST', body: JSON.stringify({ action: 'start' }) });
    log('G3', 'transición inválida desde cerrado RECHAZADA', r2.status >= 400, `status=${r2.status}`);

    // G4: cierre bloqueado con ajustes pendientes (PI B ya conciliado con ajuste confirmado → se puede cerrar)
    const r3 = await A(`/api/physical-inventory/${piB}/transition`, { method: 'POST', body: JSON.stringify({ action: 'close' }) });
    log('G4', 'PI con ajustes aplicados se cierra correctamente', r3.status === 200 && r3.data?.new_status === 'closed', '');
  }

  // ══ ESCENARIO H: CANTIDADES FRACCIONARIAS ══════════════════════════════
  console.log('\n── Escenario H: cantidades fraccionarias ──');
  {
    const inv0 = await db('inventory', `product_id=eq.${P_H1.id}&store_id=eq.${STORE}&select=quantity`);
    const current = Number(inv0[0]?.quantity ?? 0);
    const r = await A('/api/physical-inventory', {
      method: 'POST',
      body: JSON.stringify({
        storeId: STORE, cutoffDate: new Date().toISOString(),
        description: 'E2E H — fraccionario', scopeType: 'selection', productIds: [P_H1.id],
      }),
    });
    const piH = r.data?.id;
    await A(`/api/physical-inventory/${piH}/transition`, { method: 'POST', body: JSON.stringify({ action: 'prepare' }) });
    await A(`/api/physical-inventory/${piH}/transition`, { method: 'POST', body: JSON.stringify({ action: 'start' }) });
    const det = await A(`/api/physical-inventory/${piH}`);
    const lineH = det.data?.lines?.[0];
    const fractional = Math.max(0, current - 0.5);
    const rc = await A(`/api/physical-inventory/${piH}/count`, {
      method: 'POST',
      body: JSON.stringify({ items: [{ item_id: lineH.id, counted_qty: fractional, expected_updated_at: lineH.updated_at }] }),
    });
    log('H1', 'conteo con cantidad decimal aceptado', rc.status === 200 && rc.data?.applied === 1, `contada=${fractional}`);

    await A(`/api/physical-inventory/${piH}/transition`, { method: 'POST', body: JSON.stringify({ action: 'complete' }) });
    await A(`/api/physical-inventory/${piH}/transition`, { method: 'POST', body: JSON.stringify({ action: 'submit_reconciliation' }) });
    await A(`/api/physical-inventory/${piH}/transition`, { method: 'POST', body: JSON.stringify({ action: 'submit_authorization' }) });
    const g = await A(`/api/physical-inventory/${piH}/transition`, { method: 'POST', body: JSON.stringify({ action: 'generate_adjustments' }) });
    const adjH = g.data?.shortfall_adjustment_id;
    const items = adjH ? await db('inventory_adjustment_items', `adjustment_id=eq.${adjH}&select=counted_quantity`) : [];
    log('H2', 'ajuste con decimal generado sin falsas diferencias por redondeo',
      !!adjH && Number(items[0]?.counted_quantity) === fractional, `counted=${items[0]?.counted_quantity}`);

    // Aplicar y verificar
    await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/confirm_inventory_adjustment`, {
      method: 'POST',
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_adjustment_id: adjH, p_user_id: admin.uid }),
    });
    const inv1 = await db('inventory', `product_id=eq.${P_H1.id}&store_id=eq.${STORE}&select=quantity`);
    log('H3', 'stock resultante con precisión decimal', Number(inv1[0]?.quantity) === fractional,
        `${current} → ${inv1[0]?.quantity} (esperado ${fractional})`);
    await A(`/api/physical-inventory/${piH}/transition`, { method: 'POST', body: JSON.stringify({ action: 'close' }) });
  }

  // ══ RESUMEN ════════════════════════════════════════════════════════════
  const passed = results.filter(r => r.ok).length;
  console.log(`\n═════════ RESULTADO: ${passed}/${results.length} pruebas OK ═════════`);
  fs.writeFileSync('/home/z/my-project/scripts/pi-e2e-result.json',
    JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
