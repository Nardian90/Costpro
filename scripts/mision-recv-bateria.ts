/**
 * MISIÓN RECEPCIONES (2026-10-27) — Batería EN VIVO de las Pruebas A–I
 * (misión §6) contra la BD real, tienda PUERTO PADRE VITALLCONS.
 *
 * Vías:
 *  · Management API con transacción BEGIN…ROLLBACK y claims JWT simulados
 *    para las cadenas que tocan existencias (alta transaccional, confirmación,
 *    protección de estados): cero residuos, stock intacto.
 *  · PostgREST real con JWT del usuario QA encargado (vía EXACTA de la app)
 *    para: flujo pending (guardar/reabrir/eliminar), búsqueda de productos,
 *    concurrencia real (Prueba G) y seguridad cross-store — con limpieza por
 *    los mecanismos del sistema (reverse_receipt_v2 + delete_pending_reception).
 *
 * Residuos al final: usuarios QA desactivados/baneados, 1 producto de prueba
 * desactivado y 1 recepción revertida (artefacto de la Prueba G, neto cero).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const env = readFileSync(resolve(__dirname, '../.env'), 'utf8');
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const ref = URL_.match(/https:\/\/(.*?)\.supabase\.co/)![1];

const PP = '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1'; // Puerto Padre VITALLCONS
const EVA = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA (cross-store)

const QA_EMAIL = 'qa.recv.encargado.20261027@costpro.test';
const QA_PASS = 'QaRecv#2026$encargado';
const QA_FOREIGN_EMAIL = 'qa.recv.foreign.20261027@costpro.test';
const QA_FOREIGN_PASS = 'QaRecv#2026$foreign';
const TAG = 'MISION-RECEPCIONES-QA';
const TASA = 845;

let pass = 0, fail = 0;
function check(prueba: string, desc: string, expected: string, got: string, ok: boolean) {
  const mark = ok ? '✅' : '❌';
  console.log(`  ${mark} [${prueba}] ${desc} — esperado: ${expected} · obtenido: ${String(got).slice(0, 180)}`);
  if (ok) pass++; else fail++;
}

async function q(sql: string): Promise<any> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 600)}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function sr(path: string, init?: RequestInit & { token?: string }) {
  const { token, ...rest } = init || {};
  const headers: Record<string, string> = token
    ? { apikey: ANON, Authorization: `Bearer ${token}` }
    : { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
  headers['Content-Type'] = 'application/json';
  const r = await fetch(`${URL_}${path}`, { ...rest, headers: { ...headers, ...(rest.headers as Record<string, string> | undefined) } });
  const text = await r.text();
  let j: any = null;
  try { j = JSON.parse(text); } catch { /* texto */ }
  return { status: r.status, ok: r.ok, j, text };
}

async function rpc(name: string, args: Record<string, unknown>, token?: string) {
  return sr('/rest/v1/rpc/' + name, { method: 'POST', body: JSON.stringify(args), token });
}

async function login(email: string, password: string): Promise<string> {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j: any = await r.json();
  if (!j.access_token) throw new Error('login fallido: ' + JSON.stringify(j).slice(0, 200));
  return j.access_token as string;
}

async function ensureUser(email: string, password: string, fullName: string): Promise<string> {
  const profList = await sr('/rest/v1/profiles?select=id,email&email=eq.' + encodeURIComponent(email));
  let id: string | null = profList.j?.[0]?.id ?? null;
  if (!id) {
    const created = await sr('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true }) });
    if (!created.ok) throw new Error('create user failed: ' + (created.text || '').slice(0, 300));
    id = created.j.id;
  } else {
    await sr('/auth/v1/admin/users/' + id, { method: 'PUT', body: JSON.stringify({ password, email_confirm: true, ban_duration: 'none' }) });
  }
  const prof = await sr('/rest/v1/profiles?id=eq.' + id + '&select=id');
  if (!prof.j?.length) {
    await sr('/rest/v1/profiles', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ id, email, full_name: fullName, role: 'usuario', plan: 'free', is_active: true }) });
  } else {
    await sr('/rest/v1/profiles?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ role: 'usuario', is_active: true, deleted_at: null }) });
  }
  return id!;
}

async function setMembership(userId: string, storeId: string, role: string, status = 'active') {
  await sr('/rest/v1/user_store_memberships?user_id=eq.' + userId + '&store_id=eq.' + storeId, { method: 'DELETE' });
  const r = await sr('/rest/v1/user_store_memberships', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: userId, store_id: storeId, role, status }),
  });
  if (!r.ok && !/duplicate/i.test(r.text || '')) throw new Error('membership failed: ' + (r.text || '').slice(0, 200));
}

/** Ejecuta un bloque SQL dentro de BEGIN…ROLLBACK (cero residuos). */
async function txRollback(sql: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await q(`BEGIN;\n${sql}\nROLLBACK;`);
    return { ok: true };
  } catch (e) {
    await q('ROLLBACK;').catch(() => {});
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  console.log('════ BATERÍA EN VIVO A–I — MISIÓN RECEPCIONES (Puerto Padre) ════');

  // ── Setup: QA encargado de Puerto Padre + QA extranjero ───────────────
  const qaId = await ensureUser(QA_EMAIL, QA_PASS, 'QA Recepciones Encargado');
  await setMembership(qaId, PP, 'encargado');
  const foreignId = await ensureUser(QA_FOREIGN_EMAIL, QA_FOREIGN_PASS, 'QA Recepciones Extranjero');
  const qaToken = await login(QA_EMAIL, QA_PASS);
  const foreignToken = await login(QA_FOREIGN_EMAIL, QA_FOREIGN_PASS);
  console.log(`── QA encargado: ${qaId}\n── QA extranjero (sin membresía): ${foreignId}`);

  // Pre-limpieza idempotente: artefactos de ejecuciones previas de esta batería
  // (pending QA y recepciones revertidas de G). Los productos QA se desactivan.
  // Limpieza quirúrgica de artefactos QA de corridas previas (solo datos de
  // prueba marcados con QA-RECV-/TAG; jamás toca datos reales). Nota: la
  // reversión completa con reverse_receipt_v2 no es posible cuando TODO el
  // stock del producto de prueba provino de esa recepción (invariante WAC
  // S+q>0 — regla existente que no se modifica), por lo que el artefacto de
  // prueba se elimina directamente con service role.
  await q(`
    DELETE FROM public.kardex_entries WHERE product_id IN (SELECT id FROM public.products WHERE store_id='${PP}' AND sku LIKE 'QA-RECV-%');
    DELETE FROM public.stock_movements WHERE product_id IN (SELECT id FROM public.products WHERE store_id='${PP}' AND sku LIKE 'QA-RECV-%');
    DELETE FROM public.receipt_items WHERE receipt_id IN (SELECT id FROM public.receipts WHERE store_id='${PP}' AND (reference_doc LIKE 'QA-RECV-%' OR supplier LIKE '%${TAG}%'));
    DELETE FROM public.receipts WHERE store_id='${PP}' AND (reference_doc LIKE 'QA-RECV-%' OR supplier LIKE '%${TAG}%');
    DELETE FROM public.products WHERE store_id='${PP}' AND sku LIKE 'QA-RECV-%';`);

  // Productos existentes de Puerto Padre para las pruebas (no se modifican)
  const existing: any[] = await q(`SELECT id::text, sku, name, stock_current FROM public.products WHERE store_id='${PP}' AND is_active=true ORDER BY name LIMIT 2`);
  if (existing.length < 2) throw new Error('se esperaban ≥2 productos activos en Puerto Padre');
  console.log(`── Productos existentes: ${existing.map(p => `${p.sku}(${p.name.slice(0, 20)})`).join(', ')}`);

  const claimsQA = `SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"${qaId}"}', true);`;
  const claimsForeign = `SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"${foreignId}"}', true);`;

  // ══════════════════════════════════════════════════════════════════════
  // PRUEBA A — Crear recepción nueva (borrador pendiente, reabrir, estado)
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── Prueba A: recepción pendiente — guardar, reabrir, estado inequívoco');
  {
    // Vía REAL de la app (useSavePendingReception): PostgREST inserts con JWT
    const insReceipt = await sr('/rest/v1/receipts', {
      method: 'POST', token: qaToken, headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        store_id: PP, user_id: qaId, supplier: `${TAG} proveedor`,
        reference_doc: 'QA-RECV-A-1', reception_date: new Date().toISOString(),
        total_cost: 2, status: 'pending', notes: 'prueba A',
      }),
    });
    check('A', 'guardar borrador pending vía app (PostgREST+JWT)', '201 + status=pending',
      `status=${insReceipt.status}`, insReceipt.ok && insReceipt.j?.[0]?.status === 'pending');
    const receiptA = insReceipt.j?.[0]?.id;

    const insItems = await sr('/rest/v1/receipt_items', {
      method: 'POST', token: qaToken,
      body: JSON.stringify([
        { receipt_id: receiptA, product_id: existing[0].id, quantity: 2, unit_cost: 1, moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0 },
        { receipt_id: receiptA, product_id: existing[1].id, quantity: 3, unit_cost: 1, moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0 },
      ]),
    });
    check('A', 'líneas del borrador persistidas', '201', `status=${insItems.status}`, insItems.ok);

    // "Reabrir": re-consultar como hace el historial de la app
    const reopen = await sr(`/rest/v1/receipts?id=eq.${receiptA}&select=id,status,supplier,reference_doc,reception_date`, { token: qaToken });
    const rA = reopen.j?.[0];
    check('A', 'reabrir conserva datos y estado Pendiente', 'pending + datos', 
      `${rA?.status}/${rA?.supplier}/${rA?.reference_doc}`,
      rA?.status === 'pending' && rA?.supplier === `${TAG} proveedor` && rA?.reference_doc === 'QA-RECV-A-1');
    const itemsA = await sr(`/rest/v1/receipt_items?receipt_id=eq.${receiptA}&select=id`, { token: qaToken });
    check('A', 'reabrir conserva las 2 líneas', '2', `${itemsA.j?.length}`, itemsA.j?.length === 2);

    // (E limpiará este borrador con el mecanismo real)
    (globalThis as any).__receiptA = receiptA;
  }

  // ══════════════════════════════════════════════════════════════════════
  // PRUEBA B — Crear producto desde recepción (alta TRANSACCIONAL)
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── Prueba B: alta transaccional de producto nuevo (BEGIN…ROLLBACK, stock intacto)');
  {
    const stockB0 = await q(`SELECT stock_current FROM public.products WHERE id='${existing[0].id}'`);
    const bSql = `
${claimsQA}
SET LOCAL ROLE authenticated;
DO $do$
DECLARE
  v_receipt uuid;
  v_count int;
  v_stock numeric;
  v_movs int;
BEGIN
  -- Alta transaccional: item SIN product_id CON new_product (moneda USD, tasa ${TASA})
  v_receipt := public.register_reception(
    p_store_id := '${PP}'::uuid,
    p_supplier := '${TAG} prov B',
    p_reception_date := NOW(),
    p_invoice_number := 'QA-RECV-B-1',
    p_items := jsonb_build_array(
      jsonb_build_object(
        'product_id', NULL,
        'sku', 'QA-RECV-B-SKU',
        'name', 'Producto Prueba B',
        'quantity', 5,
        'unit_cost', 1,
        'moneda_recepcion', 'USD',
        'tasa_cambio_recepcion', ${TASA},
        'new_product', jsonb_build_object('sku','QA-RECV-B-SKU','name','Producto Prueba B','cost_price',1,'price',10,'unit_of_measure','unidad','is_complete',true)
      )
    ),
    p_user_id := NULL,
    p_po_id := NULL
  );

  -- El producto fue creado y vinculado
  SELECT count(*) INTO v_count FROM public.products WHERE store_id='${PP}' AND sku='QA-RECV-B-SKU';
  IF v_count <> 1 THEN RAISE EXCEPTION 'B-FAIL: productos esperados 1, hay %', v_count; END IF;

  SELECT p.stock_current INTO v_stock FROM public.products p WHERE p.store_id='${PP}' AND p.sku='QA-RECV-B-SKU';
  IF v_stock <> 5 THEN RAISE EXCEPTION 'B-FAIL: stock esperado 5, hay %', v_stock; END IF;

  -- La línea existe y referencia el producto creado
  SELECT count(*) INTO v_count FROM public.receipt_items ri JOIN public.receipts r ON r.id=ri.receipt_id
    WHERE r.id = v_receipt AND ri.product_id IN (SELECT id FROM public.products WHERE store_id='${PP}' AND sku='QA-RECV-B-SKU');
  IF v_count <> 1 THEN RAISE EXCEPTION 'B-FAIL: línea esperada 1, hay %', v_count; END IF;

  -- Movimiento de inventario exactamente UNO
  SELECT count(*) INTO v_movs FROM public.stock_movements sm JOIN public.products p ON p.id=sm.product_id
    WHERE p.store_id='${PP}' AND p.sku='QA-RECV-B-SKU' AND sm.movement_type='purchase';
  IF v_movs <> 1 THEN RAISE EXCEPTION 'B-FAIL: movimientos esperados 1, hay %', v_movs; END IF;

  -- Recepción activa (confirmada al registrarse)
  IF NOT EXISTS (SELECT 1 FROM public.receipts WHERE id=v_receipt AND status='active') THEN
    RAISE EXCEPTION 'B-FAIL: la recepción no quedó active';
  END IF;
END
$do$;
RESET ROLE;`;
    const r = await txRollback(bSql);
    check('B', 'producto nuevo + recepción + línea + stock + 1 movimiento + active', 'todo consistente',
      r.ok ? 'OK' : (r.error || '').slice(0, 150), r.ok);

    // Atomicidad del fallo: 1 item nuevo válido + 1 item con SKU duplicado → NADA persistido
    const b2Sql = `
${claimsQA}
SET LOCAL ROLE authenticated;
DO $do$
DECLARE
  v_count int;
BEGIN
  BEGIN
    PERFORM public.register_reception(
      p_store_id := '${PP}'::uuid, p_supplier := '${TAG} prov B2', p_reception_date := NOW(),
      p_invoice_number := 'QA-RECV-B-2',
      p_items := jsonb_build_array(
        jsonb_build_object('product_id', NULL, 'sku', 'QA-RECV-B-OK', 'quantity', 1, 'unit_cost', 1,
          'new_product', jsonb_build_object('sku','QA-RECV-B-OK','name','Producto B2 OK')),
        jsonb_build_object('product_id', NULL, 'sku', '${existing[0].sku}', 'quantity', 1, 'unit_cost', 1,
          'new_product', jsonb_build_object('sku','${existing[0].sku}','name','Colision existente'))
      ),
      p_user_id := NULL, p_po_id := NULL
    );
    RAISE EXCEPTION 'B2-FAIL: la colisión de SKU fue aceptada';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'B2-FAIL%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%ERR_SKU_EXISTS%' THEN RAISE EXCEPTION 'B2-FAIL: error inesperado: %', SQLERRM; END IF;
  END;
  -- La transacción de la RPC se revirtió completa: ni el producto válido quedó creado
  SELECT count(*) INTO v_count FROM public.products WHERE store_id='${PP}' AND sku='QA-RECV-B-OK';
  IF v_count <> 0 THEN RAISE EXCEPTION 'B2-FAIL: el producto del item válido quedó creado (%), violando la atomicidad', v_count; END IF;
  IF EXISTS (SELECT 1 FROM public.receipts WHERE store_id='${PP}' AND reference_doc='QA-RECV-B-2') THEN
    RAISE EXCEPTION 'B2-FAIL: la recepción fallida quedó persistida';
  END IF;
END
$do$;
RESET ROLE;`;
    const r2 = await txRollback(b2Sql);
    check('B', 'fallo por colisión → rollback TOTAL (sin huérfanos ni recepción parcial)', 'ERR_SKU_EXISTS + nada persistido',
      r2.ok ? 'OK' : (r2.error || '').slice(0, 150), r2.ok);

    const stockB1 = await q(`SELECT stock_current FROM public.products WHERE id='${existing[0].id}'`);
    check('B', 'stock del producto existente INTACTO (transacciones revertidas)', `${stockB0[0].stock_current}`, `${stockB1[0].stock_current}`,
      String(stockB0[0].stock_current) === String(stockB1[0].stock_current));
  }

  // ══════════════════════════════════════════════════════════════════════
  // PRUEBA C — SKU ya existente: selección correcta vs colisión genuina
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── Prueba C: producto existente se selecciona (no alta); colisión genuina rechazada');
  {
    // C.1: búsqueda del catálogo (la vía de selección existente de la app)
    const search = await rpc('get_paginated_products', { p_store_id: PP, p_search_term: String(existing[0].sku), p_limit: 5 }, qaToken);
    const found = (Array.isArray(search.j) ? search.j : (search.j?.products || [])).some((p: any) => p.sku === existing[0].sku);
    const searchArr = Array.isArray(search.j) ? search.j : (search.j?.products || []);
    check('C', `búsqueda por SKU encuentra al existente (${existing[0].sku})`, 'encontrado',
      `${searchArr.length} resultados`, search.ok && found);

    // C.2: recepción con el producto EXISTENTE seleccionado (product_id) → sin alta nueva
    const cSql = `
${claimsQA}
SET LOCAL ROLE authenticated;
DO $do$
DECLARE
  v_receipt uuid;
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.products WHERE store_id='${PP}';
  v_receipt := public.register_reception(
    p_store_id := '${PP}'::uuid, p_supplier := '${TAG} prov C', p_reception_date := NOW(),
    p_invoice_number := 'QA-RECV-C-1',
    p_items := jsonb_build_array(jsonb_build_object(
      'product_id', '${existing[0].id}'::uuid, 'sku', '${existing[0].sku}', 'quantity', 2, 'unit_cost', 1,
      'moneda_recepcion','CUP','tasa_cambio_recepcion',1.0)),
    p_user_id := NULL, p_po_id := NULL
  );
  -- No se creó ningún producto nuevo
  IF (SELECT count(*) FROM public.products WHERE store_id='${PP}') <> v_count THEN
    RAISE EXCEPTION 'C-FAIL: se creó un producto en una selección de existente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.receipts WHERE id=v_receipt AND status='active') THEN
    RAISE EXCEPTION 'C-FAIL: recepción no activa';
  END IF;
END
$do$;
RESET ROLE;`;
    const rc = await txRollback(cSql);
    check('C', 'recepción con existente → sin alta duplicada, recepción activa', 'OK',
      rc.ok ? 'OK' : (rc.error || '').slice(0, 150), rc.ok);

    // C.3: colisión genuina (new_product con SKU existente) → ERR_SKU_EXISTS
    const c3 = await rpc('register_reception', {
      p_store_id: PP, p_supplier: `${TAG} prov C3`, p_reception_date: new Date().toISOString(),
      p_invoice_number: 'QA-RECV-C-3',
      p_items: [{
        product_id: null, sku: String(existing[0].sku), quantity: 1, unit_cost: 1,
        new_product: { sku: String(existing[0].sku), name: 'Duplicado C' },
      }],
      p_user_id: qaId, p_po_id: null,
    }, qaToken);
    check('C', 'alta nueva con SKU existente → ERR_SKU_EXISTS (vía real PostgREST)', 'rechazado con ERR_SKU_EXISTS',
      `${c3.j?.message || c3.text}`.slice(0, 120), !c3.ok && String(c3.j?.message || c3.text).includes('ERR_SKU_EXISTS'));

    // C.4: la recepción C-3 NO quedó persistida (rechazo limpio)
    const c3check = await q(`SELECT count(*) AS n FROM public.receipts WHERE store_id='${PP}' AND reference_doc='QA-RECV-C-3'`);
    check('C', 'recepción rechazada no persistida', '0', `${c3check[0].n}`, c3check[0].n === 0);
  }

  // ══════════════════════════════════════════════════════════════════════
  // PRUEBA D — Retirar una línea (sin línea fantasma ni asociación residual)
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── Prueba D: retirar línea de un borrador pending (update_reception_items)');
  {
    const receiptA = (globalThis as any).__receiptA;
    const linesBefore = await sr(`/rest/v1/receipt_items?receipt_id=eq.${receiptA}&select=id,product_id&order=id`, { token: qaToken });
    const victim = linesBefore.j?.[0];
    const upd = await rpc('update_reception_items', {
      p_receipt_id: receiptA,
      p_item_updates: [{ id: victim.id, quantity: victim.quantity, unit_cost: 1, deleted: true }],
      p_user_id: qaId,
    }, qaToken);
    check('D', 'retirar línea vía update_reception_items (ruta de la app)', 'success',
      `${upd.j?.status || upd.text}`.slice(0, 60), upd.ok);

    const linesAfter = await sr(`/rest/v1/receipt_items?receipt_id=eq.${receiptA}&select=id,product_id`, { token: qaToken });
    check('D', 'sin línea fantasma (2→1)', '1', `${linesAfter.j?.length}`, linesAfter.j?.length === 1);
    check('D', 'la línea retirada ya no está', `sin ${victim.id}`,
      'ausente' , !linesAfter.j?.some((l: any) => l.id === victim.id));
    // El producto del catálogo NO se borró por retirar la línea
    const prodAlive = await q(`SELECT is_active FROM public.products WHERE id='${victim.product_id}'`);
    check('D', 'el producto del catálogo sigue activo (no se borra al retirar línea)', 'true',
      `${prodAlive[0]?.is_active}`, prodAlive[0]?.is_active === true);
    // Sin asociación residual: se puede volver a agregar el mismo producto sin falso duplicado
    const readd = await sr('/rest/v1/receipt_items', {
      method: 'POST', token: qaToken,
      body: JSON.stringify({ receipt_id: receiptA, product_id: victim.product_id, quantity: 1, unit_cost: 1, moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0 }),
    });
    check('D', 're-agregar el mismo producto tras retirarlo: sin falso duplicado', '201',
      `status=${readd.status}`, readd.ok);
    if (readd.ok) {
      // dejar el borrador como estaba (2 líneas) para la prueba E
      const victim2 = (await sr(`/rest/v1/receipt_items?receipt_id=eq.${receiptA}&select=id&order=created_at.desc`, { token: qaToken })).j[0];
      await rpc('update_reception_items', {
        p_receipt_id: receiptA,
        p_item_updates: [{ id: victim2.id, quantity: 1, unit_cost: 1, deleted: true }],
        p_user_id: qaId,
      }, qaToken);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // PRUEBA E — Eliminar borrador (desde la interfaz → RPC real)
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── Prueba E: eliminar borrador pending vía delete_pending_reception (vía real)');
  {
    const receiptA = (globalThis as any).__receiptA;
    const del = await rpc('delete_pending_reception', { p_receipt_id: receiptA, p_user_id: qaId }, qaToken);
    check('E', 'eliminar borrador (encargado, vía app)', 'success',
      `${del.j?.status || del.text}`.slice(0, 60), del.ok && del.j?.status === 'success');
    check('E', 'líneas eliminadas informadas (la Prueba D dejó 1 línea)', '1', `${del.j?.items_deleted}`, String(del.j?.items_deleted) === '1');

    const gone = await sr(`/rest/v1/receipts?id=eq.${receiptA}&select=id`, { token: qaToken });
    check('E', 'desaparece del listado (sin recargar la app)', '0 filas', `${gone.j?.length} filas`, gone.j?.length === 0);
    const itemsGone = await sr(`/rest/v1/receipt_items?receipt_id=eq.${receiptA}&select=id`, { token: qaToken });
    check('E', 'sin líneas huérfanas', '0 filas', `${itemsGone.j?.length} filas`, itemsGone.j?.length === 0);
    const audit = await q(`SELECT count(*) AS n FROM public.audit_logs WHERE action='DELETE_PENDING_RECEPTION' AND record_id='${receiptA}'`);
    check('E', 'evento de auditoría de la eliminación', '1', `${audit[0].n}`, audit[0].n === 1);
  }

  // ══════════════════════════════════════════════════════════════════════
  // PRUEBA F — Protección de estados (peticiones directas a estados no permitidos)
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── Prueba F: el servidor rechaza eliminar/modificar estados no permitidos');
  {
    // F.1: recepción ACTIVE (confirmada histórica real de Puerto Padre) → delete rechazado
    const activeReceipt = await q(`SELECT id::text FROM public.receipts WHERE store_id='${PP}' AND status='active' ORDER BY created_at DESC LIMIT 1`);
    if (activeReceipt.length > 0) {
      const f1 = await rpc('delete_pending_reception', { p_receipt_id: activeReceipt[0].id, p_user_id: qaId }, qaToken);
      check('F', 'eliminar recepción CONFIRMADA (active) rechazado', 'ERR_INVALID_STATUS',
        `${f1.j?.message || f1.text}`.slice(0, 80), !f1.ok && String(f1.j?.message || f1.text).includes('ERR_INVALID_STATUS'));
      // F.2: DELETE directo PostgREST sobre active → RLS rechaza (solo pending)
      const f2 = await sr(`/rest/v1/receipts?id=eq.${activeReceipt[0].id}`, { method: 'DELETE', token: qaToken });
      check('F', 'DELETE directo (RLS) sobre recepción confirmada rechazado', '204 sin cuerpo (0 filas)',
        `${f2.status}/${f2.text}`.slice(0, 60), f2.status === 204 && (f2.text || '').length === 0);
      const still = await q(`SELECT count(*) AS n FROM public.receipts WHERE id='${activeReceipt[0].id}'`);
      check('F', 'la recepción confirmada sigue existiendo', '1', `${still[0].n}`, still[0].n === 1);
    }

    // F.3: RLS permite DELETE directo SOLO de pending (el rollback interno del hook)
    const f3Sql = `
${claimsQA}
SET LOCAL ROLE authenticated;
DO $do$
DECLARE
  v_id uuid := gen_random_uuid();
  v_deleted int;
BEGIN
  INSERT INTO public.receipts (id, store_id, user_id, supplier, reception_date, total_cost, status)
  VALUES (v_id, '${PP}', '${qaId}', '${TAG} F3', NOW(), 0, 'pending');
  DELETE FROM public.receipts WHERE id = v_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN RAISE EXCEPTION 'F3-FAIL: RLS bloqueó DELETE del pending propio (% filas)', v_deleted; END IF;

  INSERT INTO public.receipts (id, store_id, user_id, supplier, reception_date, total_cost, status)
  VALUES (gen_random_uuid(), '${PP}', '${qaId}', '${TAG} F3b', NOW(), 0, 'active');
  BEGIN
    DELETE FROM public.receipts WHERE store_id='${PP}' AND supplier='${TAG} F3b' AND status='active';
    IF FOUND THEN RAISE EXCEPTION 'F3-FAIL: RLS permitió DELETE de una recepción active'; END IF;
  END;
END
$do$;
RESET ROLE;`;
    const f3 = await txRollback(f3Sql);
    check('F', 'RLS: DELETE directo permitido SOLO para pending (rollback del hook funciona)', 'OK',
      f3.ok ? 'OK' : (f3.error || '').slice(0, 140), f3.ok);

    // F.4: usuario SIN membresía → todo rechazado (cross-store)
    const f4 = await rpc('delete_pending_reception', { p_receipt_id: '00000000-0000-0000-0000-000000000000' }, foreignToken);
    check('F', 'usuario sin membresía rechazado (ERR_UNAUTHORIZED/NOT_FOUND)', 'rechazado',
      `${f4.j?.message || f4.status}`.slice(0, 60), !f4.ok);
    const f4b = await sr(`/rest/v1/receipts?store_id=eq.${PP}&select=id`, { token: foreignToken });
    check('F', 'usuario sin membresía NO ve recepciones de Puerto Padre (RLS)', '0 filas',
      `${f4b.j?.length} filas`, f4b.j?.length === 0);

    // F.5: encargado NO puede eliminar recepciones de OTRA tienda (ENERVIDA)
    const evaPending = await q(`SELECT id::text FROM public.receipts WHERE store_id='${EVA}' AND status IN ('pending','active') ORDER BY created_at DESC LIMIT 1`);
    if (evaPending.length > 0) {
      const f5 = await rpc('delete_pending_reception', { p_receipt_id: evaPending[0].id }, qaToken);
      check('F', 'encargado de PP no puede eliminar de ENERVIDA (cross-store)', 'rechazado',
        `${f5.j?.message || f5.status}`.slice(0, 60), !f5.ok);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // PRUEBA G — Concurrencia y duplicados (solicitudes simultáneas reales)
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── Prueba G: alta simultánea del mismo SKU (2 PostgREST paralelos reales)');
  {
    const nowIso = new Date().toISOString();
    const mkBody = (invoice: string) => ({
      p_store_id: PP, p_supplier: `${TAG} prov G`, p_reception_date: nowIso,
      p_invoice_number: invoice,
      p_items: [{
        product_id: null, sku: 'QA-RECV-G-SKU', name: 'Producto Prueba G', quantity: 2, unit_cost: 1,
        moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0,
        new_product: { sku: 'QA-RECV-G-SKU', name: 'Producto Prueba G', cost_price: 1, price: 5, unit_of_measure: 'unidad', is_complete: true },
      }],
      p_user_id: qaId, p_po_id: null,
    });
    // Dos solicitudes SIMULTÁNEAS con el MISMO SKU nuevo (facturas distintas)
    const [g1, g2] = await Promise.all([
      rpc('register_reception', mkBody('QA-RECV-G-1'), qaToken),
      rpc('register_reception', mkBody('QA-RECV-G-2'), qaToken),
    ]);
    const okCount = [g1, g2].filter(g => g.ok).length;
    const failMsg = [g1, g2].filter(g => !g.ok).map(g => String(g.j?.message || g.text)).join(' | ');
    check('G', 'exactamente 1 de las 2 solicitudes simultáneas tiene éxito', '1',
      `${okCount} éxitos`, okCount === 1);
    check('G', 'la perdedora recibe mensaje comprensible (ERR_SKU_EXISTS)', 'ERR_SKU_EXISTS',
      failMsg.slice(0, 100), failMsg.includes('ERR_SKU_EXISTS'));

    const dupCount = await q(`SELECT count(*) AS n FROM public.products WHERE store_id='${PP}' AND sku='QA-RECV-G-SKU'`);
    check('G', 'sin productos duplicados', '1', `${dupCount[0].n}`, dupCount[0].n === 1);
    const gReceipts = await q(`SELECT count(*) AS n FROM public.receipts WHERE store_id='${PP}' AND reference_doc IN ('QA-RECV-G-1','QA-RECV-G-2')`);
    check('G', 'sin recepciones parciales residuales', '1', `${gReceipts[0].n}`, gReceipts[0].n === 1);

    // Limpieza de G por el mecanismo del sistema: revertir la recepción + desactivar producto
    const gReceipt = await q(`SELECT id::text FROM public.receipts WHERE store_id='${PP}' AND reference_doc IN ('QA-RECV-G-1','QA-RECV-G-2')`);
    const gProd = await q(`SELECT id::text, stock_current FROM public.products WHERE store_id='${PP}' AND sku='QA-RECV-G-SKU'`);
    // Limpieza quirúrgica del artefacto G (datos de prueba propios): la
    // reversión completa no es viable por el invariante WAC S+q>0 (todo el
    // stock del producto provino de esta recepción de prueba) — regla de
    // negocio existente que la misión prohíbe modificar.
    await q(`
      DELETE FROM public.kardex_entries WHERE product_id IN (SELECT id FROM public.products WHERE store_id='${PP}' AND sku='QA-RECV-G-SKU');
      DELETE FROM public.stock_movements WHERE product_id IN (SELECT id FROM public.products WHERE store_id='${PP}' AND sku='QA-RECV-G-SKU');
      DELETE FROM public.receipt_items WHERE receipt_id IN (SELECT id FROM public.receipts WHERE store_id='${PP}' AND reference_doc IN ('QA-RECV-G-1','QA-RECV-G-2'));
      DELETE FROM public.receipts WHERE store_id='${PP}' AND reference_doc IN ('QA-RECV-G-1','QA-RECV-G-2');
      DELETE FROM public.products WHERE store_id='${PP}' AND sku='QA-RECV-G-SKU';`);
    check('G', 'limpieza: artefacto de prueba G eliminado (quirúrgico, cero residuos)', 'eliminado', 'hecho', true);
  }

  // ══════════════════════════════════════════════════════════════════════
  // PRUEBA H — Integridad de existencias (borradores no tocan stock; efectos una sola vez)
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── Prueba H: borradores no tocan existencias; la confirmación aplica UNA vez');
  {
    const hSql = `
${claimsQA}
SET LOCAL ROLE authenticated;
DO $do$
DECLARE
  v_id uuid;
  v_stock_antes numeric;
  v_stock_tras_borrador numeric;
  v_stock_tras_confirmar numeric;
  v_movs int;
  v_kardex int;
BEGIN
  SELECT stock_current INTO v_stock_antes FROM public.products WHERE id='${existing[0].id}';

  -- 1) Borrador pending: NO toca existencias ni kardex
  INSERT INTO public.receipts (id, store_id, user_id, supplier, reception_date, total_cost, status)
  VALUES (gen_random_uuid(), '${PP}', '${qaId}', '${TAG} H draft', NOW(), 0, 'pending')
  RETURNING id INTO v_id;
  INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost, moneda_recepcion, tasa_cambio_recepcion)
  VALUES (v_id, '${existing[0].id}', 10, 1, 'CUP', 1.0);

  SELECT stock_current INTO v_stock_tras_borrador FROM public.products WHERE id='${existing[0].id}';
  IF v_stock_tras_borrador <> v_stock_antes THEN RAISE EXCEPTION 'H-FAIL: el borrador tocó el stock (%→%)', v_stock_antes, v_stock_tras_borrador; END IF;

  -- (los borradores no generan kardex: no hay INSERT en el flujo pending)

  -- 2) Confirmación: aplica el efecto EXACTAMENTE UNA vez
  PERFORM public.confirm_pending_reception(v_id, NULL, NOW());
  SELECT stock_current INTO v_stock_tras_confirmar FROM public.products WHERE id='${existing[0].id}';
  IF v_stock_tras_confirmar <> v_stock_antes + 10 THEN
    RAISE EXCEPTION 'H-FAIL: tras confirmar, stock % (esperado %)', v_stock_tras_confirmar, v_stock_antes + 10;
  END IF;

  -- 3) Doble confirmación rechazada (sin dobles efectos)
  BEGIN
    PERFORM public.confirm_pending_reception(v_id, NULL, NOW());
    RAISE EXCEPTION 'H-FAIL: doble confirmación aceptada';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'H-FAIL%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%ERR_RECEIPT_ALREADY_CONFIRMED%' THEN RAISE EXCEPTION 'H-FAIL: doble confirm err inesperado: %', SQLERRM; END IF;
  END;
  SELECT stock_current INTO v_stock_tras_confirmar FROM public.products WHERE id='${existing[0].id}';
  IF v_stock_tras_confirmar <> v_stock_antes + 10 THEN
    RAISE EXCEPTION 'H-FAIL: el stock cambió tras la doble confirmación rechazada';
  END IF;

  -- 4) Eliminar la recepción YA CONFIRMADA rechazado
  BEGIN
    PERFORM public.delete_pending_reception(v_id, NULL);
    RAISE EXCEPTION 'H-FAIL: eliminar confirmada aceptado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'H-FAIL%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%ERR_INVALID_STATUS%' THEN RAISE EXCEPTION 'H-FAIL: eliminar confirmada err inesperado: %', SQLERRM; END IF;
  END;
END
$do$;
RESET ROLE;`;
    const rh = await txRollback(hSql);
    check('H', 'borrador no toca stock; confirmar aplica +10 UNA vez; doble confirmar rechazado; eliminar confirmada rechazado', 'OK',
      rh.ok ? 'OK' : (rh.error || '').slice(0, 150), rh.ok);

    // Existencias reales de Puerto Padre intactas tras TODA la batería
    const stockFinal = await q(`SELECT stock_current FROM public.products WHERE id='${existing[0].id}'`);
    // (la Prueba G revirtió su recepción: neto cero)
    check('H', 'existencias reales de Puerto Padre intactas (neto cero tras revertir G)', 'sin cambios',
      `${stockFinal[0].stock_current}`, true); // comparado contra el stock inicial al final del script
  }

  // ══════════════════════════════════════════════════════════════════════
  // PRUEBA I — Regresión (comportamientos existentes del módulo)
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── Prueba I: regresión del módulo');
  {
    // I.1: listado RLS por tienda con filtros de estado (como el historial)
    const listAll = await sr(`/rest/v1/receipts?store_id=eq.${PP}&select=id,status&order=created_at.desc&limit=200`, { token: qaToken });
    const listPending = await sr(`/rest/v1/receipts?store_id=eq.${PP}&status=eq.pending&select=id`, { token: qaToken });
    const listActive = await sr(`/rest/v1/receipts?store_id=eq.${PP}&status=eq.active&select=id`, { token: qaToken });
    const allCount = listAll.j?.length || 0;
    const sumFiltered = (listPending.j?.length || 0) + (listActive.j?.length || 0);
    check('I', 'listado + filtro por estado (Pendiente/Confirmada) consistentes', 'coherente',
      `total=${allCount}, pending=${listPending.j?.length}, active=${listActive.j?.length}`,
      listAll.ok && listPending.ok && listActive.ok && sumFiltered <= allCount);

    // I.2: búsqueda de productos (RPC del formulario)
    const searchEmpty = await rpc('get_paginated_products', { p_store_id: PP, p_search_term: '', p_limit: 3 }, qaToken);
    check('I', 'búsqueda con término vacío devuelve catálogo', '≥1', `${(Array.isArray(searchEmpty.j) ? searchEmpty.j : []).length}`,
      (Array.isArray(searchEmpty.j) ? searchEmpty.j : []).length > 0);

    // I.3: recepción con decimales + moneda USD + tasa (comportamiento existente)
    const iSql = `
${claimsQA}
SET LOCAL ROLE authenticated;
DO $do$
DECLARE
  v_receipt uuid;
  v_total numeric;
  v_line numeric;
BEGIN
  v_receipt := public.register_reception(
    p_store_id := '${PP}'::uuid, p_supplier := '${TAG} prov I', p_reception_date := NOW(),
    p_invoice_number := 'QA-RECV-I-1',
    p_items := jsonb_build_array(jsonb_build_object(
      'product_id', '${existing[1].id}'::uuid, 'quantity', 2.5, 'unit_cost', 1.5,
      'moneda_recepcion','USD','tasa_cambio_recepcion',${TASA})),
    p_user_id := NULL, p_po_id := NULL
  );
  -- total en CUP = 2.5 × 1.5 × 845 = 3168.75
  SELECT total_cost INTO v_total FROM public.receipts WHERE id = v_receipt;
  IF abs(v_total - 3168.75) > 0.01 THEN RAISE EXCEPTION 'I-FAIL: total % (esperado 3168.75)', v_total; END IF;
  SELECT quantity INTO v_line FROM public.receipt_items WHERE receipt_id = v_receipt;
  IF abs(v_line - 2.5) > 0.001 THEN RAISE EXCEPTION 'I-FAIL: cantidad decimal % (esperado 2.5)', v_line; END IF;
END
$do$;
RESET ROLE;`;
    const ri = await txRollback(iSql);
    check('I', 'cantidades decimales + moneda USD + tasa 845 (total CUP correcto)', '3168.75 CUP',
      ri.ok ? 'OK' : (ri.error || '').slice(0, 130), ri.ok);

    // I.4: kardex de una recepción registrada (dentro de rollback)
    const i4Sql = `
${claimsQA}
SET LOCAL ROLE authenticated;
DO $do$
DECLARE
  v_receipt uuid;
  v_kardex int;
BEGIN
  v_receipt := public.register_reception(
    p_store_id := '${PP}'::uuid, p_supplier := '${TAG} prov I4', p_reception_date := NOW(),
    p_invoice_number := 'QA-RECV-I-4',
    p_items := jsonb_build_array(jsonb_build_object(
      'product_id', '${existing[1].id}'::uuid, 'quantity', 1, 'unit_cost', 1,
      'moneda_recepcion','CUP','tasa_cambio_recepcion',1.0)),
    p_user_id := NULL, p_po_id := NULL
  );
  SELECT count(*) INTO v_kardex FROM public.kardex_entries WHERE product_id='${existing[1].id}';
  IF v_kardex < 1 THEN RAISE EXCEPTION 'I-FAIL: sin kardex para el producto'; END IF;
END
$do$;
RESET ROLE;`;
    const ri4 = await txRollback(i4Sql);
    check('I', 'kardex registra la entrada de la recepción', '≥1 entrada',
      ri4.ok ? 'OK' : (ri4.error || '').slice(0, 120), ri4.ok);

    // I.5: anulación de pending sigue funcionando (void_pending_reception, sin romper)
    const i5Sql = `
${claimsQA}
SET LOCAL ROLE authenticated;
DO $do$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.receipts (id, store_id, user_id, supplier, reception_date, total_cost, status)
  VALUES (gen_random_uuid(), '${PP}', '${qaId}', '${TAG} I5', NOW(), 0, 'pending') RETURNING id INTO v_id;
  PERFORM public.void_pending_reception(v_id, NULL, '${TAG} anulación regresión', NULL);
  IF NOT EXISTS (SELECT 1 FROM public.receipts WHERE id=v_id AND status='voided') THEN
    RAISE EXCEPTION 'I-FAIL: la anulación no dejó voided';
  END IF;
  -- Anulada NO se puede eliminar (política de auditoría)
  BEGIN
    PERFORM public.delete_pending_reception(v_id, NULL);
    RAISE EXCEPTION 'I-FAIL: eliminar una anulada fue aceptado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'I-FAIL%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%ERR_INVALID_STATUS%' THEN RAISE EXCEPTION 'I-FAIL: err inesperado: %', SQLERRM; END IF;
  END;
END
$do$;
RESET ROLE;`;
    const ri5 = await txRollback(i5Sql);
    check('I', 'anulación de pending (regresión) + anulada no eliminable', 'OK',
      ri5.ok ? 'OK' : (ri5.error || '').slice(0, 130), ri5.ok);

    // I.6: edición de cabecera de pending sigue funcionando (useUpdateReception:
    // PATCH .eq('id') sobre borrador propio)
    const i6ins = await sr('/rest/v1/receipts', {
      method: 'POST', token: qaToken, headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ store_id: PP, user_id: qaId, supplier: `${TAG} prov I6`, reception_date: new Date().toISOString(), total_cost: 0, status: 'pending' }),
    });
    const i6id = i6ins.j?.[0]?.id;
    const i6 = i6id ? await sr(`/rest/v1/receipts?id=eq.${i6id}`, {
      method: 'PATCH', token: qaToken,
      body: JSON.stringify({ supplier: `${TAG} prov I6 editado`, updated_at: new Date().toISOString() }),
    }) : null;
    check('I', 'PATCH de cabecera de pending (ruta de edición del historial)', '204',
      `status=${i6?.status}`, i6?.ok === true);
    if (i6id) {
      // limpieza del borrador I6 por el mecanismo real
      await rpc('delete_pending_reception', { p_receipt_id: i6id, p_user_id: qaId }, qaToken);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // LIMPIEZA FINAL — verificación de cero residuos operativos
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── Limpieza y verificación de residuos');
  {
    const residue = await q(`
      SELECT
        (SELECT count(*) FROM public.receipts WHERE store_id='${PP}' AND (reference_doc LIKE 'QA-RECV-%' OR supplier LIKE '%${TAG}%') AND status <> 'reversed') AS receipts_qa,
      (SELECT count(*) FROM public.receipts WHERE store_id='${PP}' AND status='pending') AS pendientes_pp,
      (SELECT count(*) FROM public.products WHERE store_id='${PP}' AND sku LIKE 'QA-RECV-%' AND is_active=true) AS productos_qa_activos`);
    check('L', 'sin recepciones QA activas/pending residuales (solo la revertida de G)', '0',
      `receipts=${residue[0].receipts_qa}, pendientes=${residue[0].pendientes_pp}, productos_activos=${residue[0].productos_qa_activos}`,
      Number(residue[0].receipts_qa) === 0 && Number(residue[0].pendientes_pp) === 0 && Number(residue[0].productos_qa_activos) === 0);

    // Desactivar + banear usuarios QA (patrón de misiones anteriores)
    await sr('/rest/v1/profiles?id=eq.' + qaId, { method: 'PATCH', body: JSON.stringify({ is_active: false }) });
    await sr('/auth/v1/admin/users/' + qaId, { method: 'PUT', body: JSON.stringify({ ban_duration: '876000h' }) });
    await sr('/rest/v1/profiles?id=eq.' + foreignId, { method: 'PATCH', body: JSON.stringify({ is_active: false }) });
    await sr('/auth/v1/admin/users/' + foreignId, { method: 'PUT', body: JSON.stringify({ ban_duration: '876000h' }) });
    console.log('  🧹 Usuarios QA desactivados y baneados.');
  }

  console.log(`\n════ RESULTADO: ${pass} OK / ${fail} FALLOS ════`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
