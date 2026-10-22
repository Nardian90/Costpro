#!/usr/bin/env node
/**
 * SMOKE TEST del módulo de Inventario Físico — flujo completo vía REST RPC
 * con token de usuario real (admin demo, TIENDA CENTRAL COSTPRO).
 * Escenarios: creación → preparación → conteo → conciliación → ajustes.
 */
const fs = require('fs');
const env = {};
for (const line of fs.readFileSync('/home/z/my-project/.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) env[m[1]] = m[2];
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const STORE = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'; // TIENDA CENTRAL COSTPRO

const results = [];
function log(step, ok, detail) {
  results.push({ step, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${step}${detail ? ' — ' + detail : ''}`);
}

async function login() {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@demo.com', password: 'demo123' }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Login falló: ' + JSON.stringify(j).slice(0, 200));
  return { token: j.access_token, uid: j.user.id };
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
  if (!r.ok) throw new Error(`MGMT ${r.status}: ${body.slice(0, 400)}`);
  return JSON.parse(body);
}

(async () => {
  const { token, uid } = await login();
  const c = client(token);
  console.log('UID:', uid, '\n');

  // ── Productos de prueba con stock conocido
  const prods = await mgmt(`SELECT p.id, p.sku, p.name, COALESCE(i.quantity,0) AS qty
    FROM products p LEFT JOIN inventory i ON i.product_id=p.id AND i.store_id='${STORE}'
    WHERE p.store_id='${STORE}' AND p.is_active=true AND COALESCE(p.is_service,false)=false
      AND COALESCE(i.quantity,0) > 0 ORDER BY p.name LIMIT 3`);
  if (prods.length < 3) throw new Error('Se necesitan 3 productos con stock');
  const [P_MATCH, P_SHORT, P_SURP] = prods;
  console.log('Productos de prueba:', JSON.stringify(prods.map(p => ({ sku: p.sku, qty: p.qty }))), '\n');

  // ── 1. CREAR inventario físico (alcance: selección de 3 productos)
  let piId;
  {
    const r = await c.rpc('create_physical_inventory', {
      p_store_id: STORE,
      p_cutoff_date: new Date().toISOString(),
      p_description: 'SMOKE TEST — inventario físico de verificación',
      p_responsible_name: 'Admin Demo',
      p_scope_type: 'selection',
      p_product_ids: prods.map(p => p.id),
      p_blind_mode: false,
      p_observations: 'Prueba automática del flujo completo',
      p_user_id: uid,
    });
    piId = r.data;
    log('1. create_physical_inventory', r.status === 200 && !!piId, `pi_id=${piId}`);
  }

  // ── 2. PREPARAR (snapshot teórico)
  {
    const r = await c.rpc('prepare_physical_inventory', { p_pi_id: piId, p_user_id: uid });
    log('2. prepare_physical_inventory', r.status === 200 && r.data?.lines === 3,
        JSON.stringify(r.data));
  }

  // ── 2b. Verificar snapshot congelado
  {
    const r = await c.select('physical_inventory_items',
      `pi_id=eq.${piId}&select=line_number,theoretical_qty,products(sku)&order=line_number`);
    const ok = r.status === 200 && r.data.length === 3;
    const matchSnap = ok && Number(r.data.find(i => i.products.sku === P_MATCH.sku)?.theoretical_qty) === Number(P_MATCH.qty);
    log('2b. snapshot teórico congelado', ok && matchSnap,
        `líneas=${r.data?.length}, teórico(${P_MATCH.sku})=${r.data?.[0]?.theoretical_qty} vs stock=${P_MATCH.qty}`);
  }

  // ── 2c. Numeración IF-
  {
    const r = await c.select('physical_inventories', `id=eq.${piId}&select=pi_number,status,total_items`);
    log('2c. numeración IF-YYYY-#####', r.status === 200 && /^IF-\d{4}-\d{5}$/.test(r.data?.[0]?.pi_number || ''),
        `pi_number=${r.data?.[0]?.pi_number}`);
  }

  // ── 3. INICIAR conteo
  {
    const r = await c.rpc('start_physical_inventory_count', { p_pi_id: piId, p_user_id: uid });
    log('3. start_physical_inventory_count', r.status === 200 && r.data?.new_status === 'in_progress', '');
  }

  // ── 3b. IDs de líneas para contar
  let items;
  {
    const r = await c.select('physical_inventory_items',
      `pi_id=eq.${piId}&select=id,product_id,theoretical_qty&order=line_number`);
    items = r.data;
  }

  // ── 4. REGISTRAR cantidades (igual / faltante / sobrante)
  {
    const byProduct = {};
    items.forEach(i => byProduct[i.product_id] = i);
    const payload = [
      { item_id: byProduct[P_MATCH.id].id, counted_qty: Number(P_MATCH.qty), expected_updated_at: null },          // igual
      { item_id: byProduct[P_SHORT.id].id, counted_qty: Math.max(0, Number(P_SHORT.qty) - 3), expected_updated_at: null }, // faltante -3
      { item_id: byProduct[P_SURP.id].id, counted_qty: Number(P_SURP.qty) + 2, expected_updated_at: null },        // sobrante +2
    ];
    const r = await c.rpc('record_physical_inventory_counts', {
      p_pi_id: piId, p_items: payload, p_source: 'manual', p_user_id: uid,
    });
    log('4. record_physical_inventory_counts (igual/-3/+2)', r.status === 200 && r.data?.applied === 3,
        `applied=${r.data?.applied}`);
  }

  // ── 4b. Indicadores del header actualizados
  {
    const r = await c.select('physical_inventories',
      `id=eq.${piId}&select=counted_items,pending_items,shortfall_items,surplus_items`);
    const h = r.data?.[0];
    log('4b. indicadores derivados', h?.counted_items === 3 && h?.shortfall_items === 1 && h?.surplus_items === 1,
        JSON.stringify(h));
  }

  // ── 4c. Prueba de conteo cero explícito ≠ pendiente (clear)
  {
    const r = await c.rpc('record_physical_inventory_counts', {
      p_pi_id: piId, p_items: [{ item_id: items[0].id, counted_qty: null, expected_updated_at: null }],
      p_source: 'manual', p_user_id: uid,
    });
    const chk = await c.select('physical_inventory_items', `id=eq.${items[0].id}&select=counted_qty,status`);
    const okClear = r.status === 200 && chk.data?.[0]?.counted_qty === null && chk.data?.[0]?.status === 'pending';
    // restaurar
    await c.rpc('record_physical_inventory_counts', {
      p_pi_id: piId, p_items: [{ item_id: items[0].id, counted_qty: Number(P_MATCH.qty), expected_updated_at: null }],
      p_source: 'manual', p_user_id: uid,
    });
    log('4c. vacío ≠ cero (clear restaura a pendiente)', okClear,
        `counted_qty tras clear=${chk.data?.[0]?.counted_qty}, status=${chk.data?.[0]?.status}`);
  }

  // ── 5. COMPLETAR → conciliar → autorizar
  {
    const r1 = await c.rpc('complete_physical_inventory_count', { p_pi_id: piId, p_user_id: uid });
    const r2 = await c.rpc('submit_physical_inventory_reconciliation', { p_pi_id: piId, p_user_id: uid });
    const r3 = await c.rpc('submit_physical_inventory_authorization', { p_pi_id: piId, p_user_id: uid });
    log('5. complete→reconcile→authorize', r1.status === 200 && r2.status === 200 && r3.status === 200, '');
  }

  // ── 6. GENERAR AJUSTES (borradores pending, SIN tocar stock)
  const stockBefore = {};
  {
    for (const p of prods) {
      const r = await c.select('inventory', `product_id=eq.${p.id}&store_id=eq.${STORE}&select=quantity`);
      stockBefore[p.id] = Number(r.data?.[0]?.quantity ?? 0);
    }
    const r = await c.rpc('generate_adjustments_from_physical_inventory', { p_pi_id: piId, p_user_id: uid });
    log('6. generate_adjustments (borradores)', r.status === 200 && r.data?.shortfall_items === 1 && r.data?.surplus_items === 1,
        `shortfall=${r.data?.shortfall_items}, surplus=${r.data?.surplus_items}`);

    // stock SIN cambios tras generar borradores
    let unchanged = true;
    for (const p of prods) {
      const r2 = await c.select('inventory', `product_id=eq.${p.id}&store_id=eq.${STORE}&select=quantity`);
      if (Number(r2.data?.[0]?.quantity ?? 0) !== stockBefore[p.id]) unchanged = false;
    }
    log('6b. generación NO modifica existencias', unchanged, '');
  }

  // ── 6c. Ajustes visibles con fuente PI
  let adjShort, adjSurp;
  {
    const r = await c.select('inventory_adjustments',
      `source_physical_inventory_id=eq.${piId}&select=id,reason,status,notes,source_physical_inventory_id`);
    adjShort = r.data?.find(a => a.reason === 'STOCKTAKE_SHRINKAGE');
    adjSurp = r.data?.find(a => a.reason === 'STOCKTAKE_SURPLUS');
    log('6c. ajustes vinculados con source_pi', !!adjShort && !!adjSurp,
        `shortfall_id=${adjShort?.id?.slice(0, 8)}, surplus_id=${adjSurp?.id?.slice(0, 8)}`);
  }

  // ── 6d. items del ajuste de faltante: expected=stock actual, counted=físico
  {
    const r = await c.select('inventory_adjustment_items',
      `adjustment_id=eq.${adjShort.id}&select=product_id,expected_quantity,counted_quantity,difference`);
    const it = r.data?.[0];
    log('6d. items faltante (expected=actual, counted=físico)',
      r.status === 200 && Number(it.expected_quantity) === stockBefore[P_SHORT.id]
        && Number(it.counted_quantity) === Math.max(0, Number(P_SHORT.qty) - 3),
      JSON.stringify(it));
  }

  // ── 7. CONFIRMAR ajuste de FALTANTE → aplica stock + kardex
  {
    const r = await c.rpc('confirm_inventory_adjustment', { p_adjustment_id: adjShort.id, p_user_id: uid });
    log('7. confirm_inventory_adjustment (faltante)', r.status === 200 && r.data?.status === 'success',
        JSON.stringify(r.data));

    const after = await c.select('inventory', `product_id=eq.${P_SHORT.id}&store_id=eq.${STORE}&select=quantity`);
    const newStock = Number(after.data?.[0]?.quantity);
    const expectedStock = Math.max(0, Number(P_SHORT.qty) - 3);
    log('7b. stock tras confirmar faltante', newStock === expectedStock,
        `antes=${stockBefore[P_SHORT.id]}, después=${newStock}, esperado=${expectedStock}`);

    // kardex: movimiento adjustment con referencia al PI
    const mv = await mgmt(`SELECT movement_type, quantity_change, reference_doc, notes
      FROM stock_movements WHERE product_id='${P_SHORT.id}' AND store_id='${STORE}'
      ORDER BY created_at DESC LIMIT 1`);
    const last = mv?.[0];
    const piNum = (await c.select('physical_inventories', `id=eq.${piId}&select=pi_number`)).data?.[0]?.pi_number;
    log('7c. kardex movimiento adjustment', last?.movement_type === 'adjustment' && Number(last?.quantity_change) === -3,
        `type=${last?.movement_type}, qty=${last?.quantity_change}, ref=${last?.reference_doc}`);

    const kx = await mgmt(`SELECT movement_type, quantity, reference_description FROM kardex_entries
      WHERE product_id='${P_SHORT.id}' AND store_id='${STORE}' ORDER BY created_at DESC LIMIT 1`);
    log('7d. kardex_entries generado por trigger', kx?.[0]?.movement_type === 'adjustment', JSON.stringify(kx?.[0]));
    console.log('   (pi_number:', piNum + ')');
  }

  // ── 8. INTENTO de doble aplicación (debe fallar: ya no está pending)
  {
    const r = await c.rpc('confirm_inventory_adjustment', { p_adjustment_id: adjShort.id, p_user_id: uid });
    log('8. doble aplicación RECHAZADA', r.status !== 200, `status=${r.status}`);
  }

  // ── 9. CIERRE rechazado con ajuste surplus PENDING
  {
    const r = await c.rpc('close_physical_inventory', { p_pi_id: piId, p_user_id: uid });
    log('9. cierre bloqueado con ajustes pendientes', r.status !== 200 && String(r.data?.message || '').includes('PEND'),
        String(r.data?.message || '').slice(0, 80));
  }

  // ── 10. ANULAR el ajuste de sobrante (limpieza) y cerrar PI
  {
    const r = await c.rpc('void_inventory_adjustment', { p_adjustment_id: adjSurp.id, p_user_id: uid });
    log('10. void ajuste sobrante (sin tocar stock)', r.status === 200, '');
    const r2 = await c.rpc('close_physical_inventory', { p_pi_id: piId, p_user_id: uid });
    log('10b. close_physical_inventory', r2.status === 200 && r2.data?.new_status === 'closed', JSON.stringify(r2.data));
  }

  // ── 11. Intento de modificar conteo tras cierre (debe fallar)
  {
    const r = await c.rpc('record_physical_inventory_counts', {
      p_pi_id: piId, p_items: [{ item_id: items[0].id, counted_qty: 99, expected_updated_at: null }],
      p_source: 'manual', p_user_id: uid,
    });
    log('11. conteo tras cierre RECHAZADO', r.status !== 200, `status=${r.status}`);
  }

  // ── 12. Log de conteo con historial completo
  {
    const r = await c.select('physical_inventory_count_log',
      `pi_id=eq.${piId}&select=action,old_counted_qty,new_counted_qty,source,user_id&order=created_at`);
    log('12. count_log con historial', r.status === 200 && r.data.length >= 5, `eventos=${r.data?.length}`);
  }

  // ── RESUMEN
  const passed = results.filter(r => r.ok).length;
  console.log(`\n═══ RESULTADO: ${passed}/${results.length} pruebas OK ═══`);
  console.log('\nPI_ID para evidencia:', piId);
  fs.writeFileSync('/home/z/my-project/scripts/pi-smoke-result.json', JSON.stringify({ piId, results }, null, 2));
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
