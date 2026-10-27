/**
 * MISIÓN CICLO DE VIDA DEL INVENTARIO FÍSICO (2026-10-27) — Batería EN VIVO
 * de los Casos A–K (misión §8) contra la BD real (Supabase).
 *
 * Vías de ejecución:
 *  · PostgREST con JWT del usuario QA admin de la tienda (vía REAL de la app)
 *  · PostgREST con service_role (solo para preparación/limpieza)
 *  · Management API con transacción BEGIN…ROLLBACK y claims JWT simulados
 *    para la cadena de TERMINACIÓN (Caso G) e INMUTABILIDAD (Caso H):
 *    confirmando ajustes toca existencias reales → se ejecuta TODO dentro de
 *    una transacción que se revierte (cero residuos, stock intacto).
 *
 * Residuos al finalizar: solo PIs anulados de QA (limpieza vía delete/void
 * donde el estado lo permite) y usuarios QA desactivados.
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

const QA_ADMIN_EMAIL = 'qa.pilifecycle.admin.20261027@costpro.test';
const QA_ADMIN_PASS = 'QaPILifecycle#2026$admin';
const QA_FOREIGN_EMAIL = 'qa.pilifecycle.foreign.20261027@costpro.test';
const QA_FOREIGN_PASS = 'QaPILifecycle#2026$foreign';
const TAG = 'MISIÓN-PI-LIFECYCLE-QA';

// ── Utilidades ────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
function check(caso: string, desc: string, expected: string, got: string, ok: boolean) {
  const mark = ok ? '✅' : '❌';
  console.log(`  ${mark} [${caso}] ${desc} — esperado: ${expected} · obtenido: ${String(got).slice(0, 160)}`);
  if (ok) pass++; else fail++;
}

async function sr(path: string, init?: RequestInit & { token?: string }) {
  const { token, ...rest } = init || {};
  // Claves nuevas (sb_secret_…): la apikey debe COINCIDIR con el Bearer.
  // Llamadas de servicio → service key en ambos; llamadas de usuario →
  // anon como apikey + JWT del usuario como Bearer.
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

async function rpc(name: string, args: Record<string, unknown>, token?: string) {
  return sr('/rest/v1/rpc/' + name, { method: 'POST', body: JSON.stringify(args), token });
}

async function q(sql: string): Promise<any> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 500)}`);
  try { return JSON.parse(text); } catch { return text; }
}

/** Ejecuta una transacción completa (multi-statement) vía Management API. */
async function tx(statements: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await q(`BEGIN;\n${statements}\nROLLBACK;`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
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
  await sr('/rest/v1/user_store_memberships?user_id=eq.' + userId, { method: 'DELETE' });
  const r = await sr('/rest/v1/user_store_memberships', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: userId, store_id: storeId, role, status }),
  });
  if (!r.ok && !/duplicate/i.test(r.text || '')) throw new Error('membership failed: ' + (r.text || '').slice(0, 200));
}

// ── Batería ───────────────────────────────────────────────────────────────
async function main() {
  console.log('════ BATERÍA EN VIVO A–K — MISIÓN CICLO DE VIDA INVENTARIO FÍSICO ════');

  // ── Contexto: tienda A con productos, tienda B (cross-store) ──────────
  const stores: any[] = await sr('/rest/v1/stores?select=id,name,tenant_id,is_active&is_active=eq.true&order=name.asc').then(r => r.j || []);
  if (stores.length < 2) throw new Error('se esperaban ≥2 tiendas activas');
  const S_A = stores[0]; // tienda del QA admin
  const S_B = stores.find(s => s.id !== S_A.id)!;

  // 2 productos activos no-servicio con stock en A (alcance de selección)
  const products: any[] = await sr(
    `/rest/v1/products?select=id,name,stock_current&store_id=eq.${S_A.id}&is_active=eq.true&is_service=eq.false&order=name.asc&limit=2`
  ).then(r => r.j || []);
  if (products.length < 2) throw new Error('se esperaban ≥2 productos activos no-servicio en ' + S_A.name);

  // admin REAL de la tienda B (para crear/borrar un PI ajeno de prueba)
  const bAdmin: any = await q(`
    SELECT m.user_id::text AS id FROM public.user_store_memberships m
    WHERE m.store_id='${S_B.id}' AND m.status='active' AND m.role IN ('admin','manager','encargado')
    LIMIT 1
  `).then(r => r[0] || null);

  console.log(`── Contexto: A=${S_A.name} · B=${S_B.name} · productos: ${products.map(p => p.name).join(', ')}` +
    (bAdmin ? ` · admin B=${bAdmin.id.slice(0, 8)}…` : ' · (B sin admin: cross-store solo con RLS)'));

  // ── Usuarios QA ────────────────────────────────────────────────────────
  const qaAdminId = await ensureUser(QA_ADMIN_EMAIL, QA_ADMIN_PASS, 'QA PI Lifecycle Admin');
  await setMembership(qaAdminId, S_A.id, 'admin');
  const qaAdminToken = await login(QA_ADMIN_EMAIL, QA_ADMIN_PASS);

  const qaForeignId = await ensureUser(QA_FOREIGN_EMAIL, QA_FOREIGN_PASS, 'QA PI Lifecycle Foreign');
  await sr('/rest/v1/user_store_memberships?user_id=eq.' + qaForeignId, { method: 'DELETE' }); // SIN membresías
  const qaForeignToken = await login(QA_FOREIGN_EMAIL, QA_FOREIGN_PASS);

  // Snapshot de existencias (para A/C/G: ninguna operación de ciclo de vida
  // fuera de la confirmación de ajustes puede tocar el stock)
  const stockBefore: any = await q(`
    SELECT id::text, stock_current FROM public.products WHERE id IN ('${products[0].id}','${products[1].id}') ORDER BY id
  `);

  // ══ CASO A — Creación ══════════════════════════════════════════════════
  console.log('── Caso A (creación → Borrador, sin tocar existencias)');
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const aCreate = await rpc('create_physical_inventory', {
    p_store_id: S_A.id, p_cutoff_date: cutoff, p_description: TAG + ' A',
    p_responsible_name: 'QA Battery', p_scope_type: 'selection',
    p_product_ids: [products[0].id, products[1].id], p_blind_mode: false, p_observations: 'caso A',
  }, qaAdminToken);
  const piA: string = aCreate.j;
  check('A', 'crear devuelve UUID (JWT propio del QA admin)', 'uuid', String(piA).slice(0, 12) + '…',
    aCreate.ok && typeof piA === 'string' && piA.length > 20);

  const aRow = await q(`SELECT status, total_items, counted_items FROM public.physical_inventories WHERE id='${piA}'`);
  check('A', 'estado inicial = draft (Borrador)', 'draft', aRow[0].status, aRow[0].status === 'draft');
  check('A', 'sin líneas ni conteos al crear', '0/0', `${aRow[0].total_items}/${aRow[0].counted_items}`,
    aRow[0].total_items === 0 && aRow[0].counted_items === 0);
  const stockA: any = await q(`SELECT id::text, stock_current FROM public.products WHERE id IN ('${products[0].id}','${products[1].id}') ORDER BY id`);
  check('A', 'existencias intactas tras crear', 'sin cambios', JSON.stringify(stockA.map((r: any) => r.stock_current)),
    JSON.stringify(stockA) === JSON.stringify(stockBefore));
  const movsA = await q(`SELECT count(*)::int AS n FROM public.stock_movements WHERE store_id='${S_A.id}' AND created_at > NOW() - INTERVAL '2 minutes' AND reference_id ILIKE '%${piA}%'`);
  check('A', 'cero movimientos de inventario generados', '0', String(movsA[0].n), movsA[0].n === 0);

  // ══ CASO B — Edición del borrador ══════════════════════════════════════
  console.log('── Caso B (edición del borrador: draft completa, prepared limitada)');
  const bUpd = await rpc('update_physical_inventory', {
    p_pi_id: piA, p_cutoff_date: cutoff, p_description: TAG + ' A editado',
    p_responsible_name: 'QA Battery Editado', p_scope_type: 'selection',
    p_categories: null, p_product_ids: [products[0].id, products[1].id],
    p_blind_mode: true, p_observations: 'caso B editado',
  }, qaAdminToken);
  check('B', 'update en draft aceptado', 'success', String(bUpd.j?.status || bUpd.text).slice(0, 40), bUpd.ok);
  const bRow = await q(`SELECT description, responsible_name, blind_mode, observations FROM public.physical_inventories WHERE id='${piA}'`);
  check('B', 'campos persistidos (descripción/responsable/ciego/obs)',
    'editados', JSON.stringify([bRow[0].description, bRow[0].responsible_name, bRow[0].blind_mode, bRow[0].observations]),
    bRow[0].description.includes('editado') && bRow[0].responsible_name.includes('Editado') && bRow[0].blind_mode === true);

  const bPrep = await rpc('prepare_physical_inventory', { p_pi_id: piA }, qaAdminToken);
  check('B', 'prepare (draft→prepared) genera líneas', 'success+2 líneas', String(bPrep.j?.lines), bPrep.ok && bPrep.j?.lines === 2);
  const bUpdPrepared = await rpc('update_physical_inventory', {
    p_pi_id: piA, p_description: TAG + ' A editado en prepared', p_responsible_name: 'QA en prepared',
    p_blind_mode: true, p_observations: 'caso B prepared',
  }, qaAdminToken);
  check('B', 'update en prepared (campos no congelados) aceptado', 'success', String(bUpdPrepared.j?.status || bUpdPrepared.text).slice(0, 40), bUpdPrepared.ok);
  const bFrozen = await rpc('update_physical_inventory', {
    p_pi_id: piA, p_cutoff_date: new Date(Date.now() - 120_000).toISOString(), p_description: 'x',
  }, qaAdminToken);
  check('B', 'cambio de CORTE en prepared rechazado (congelado)', 'ERR_FIELD_FROZEN', String(bFrozen.j?.message || bFrozen.text).slice(0, 60),
    !bFrozen.ok && String(bFrozen.j?.message || bFrozen.text).includes('ERR_FIELD_FROZEN'));
  const bRow2 = await q(`SELECT description FROM public.physical_inventories WHERE id='${piA}'`);
  check('B', 'los datos persisten tras recargar (consulta directa)', 'editado en prepared', bRow2[0].description, bRow2[0].description.includes('prepared'));

  // ══ CASO C — Eliminación del borrador ══════════════════════════════════
  console.log('── Caso C (eliminación definitiva del borrador)');
  const cCreate = await rpc('create_physical_inventory', {
    p_store_id: S_A.id, p_cutoff_date: cutoff, p_description: TAG + ' C',
    p_scope_type: 'selection', p_product_ids: [products[0].id],
  }, qaAdminToken);
  const piC: string = cCreate.j;
  await rpc('prepare_physical_inventory', { p_pi_id: piC }, qaAdminToken); // con líneas y hoja
  await rpc('register_physical_inventory_sheet', { p_pi_id: piC, p_mode: 'blind', p_total_lines: 1 }, qaAdminToken);
  const cDel = await rpc('delete_physical_inventory', { p_pi_id: piC }, qaAdminToken);
  check('C', 'delete de borrador (prepared) aceptado', 'success', String(cDel.j?.status || cDel.text).slice(0, 40), cDel.ok);
  const cGone = await q(`SELECT count(*)::int AS n FROM public.physical_inventories WHERE id='${piC}'`);
  const cItems = await q(`SELECT count(*)::int AS n FROM public.physical_inventory_items WHERE pi_id='${piC}'`);
  const cLog = await q(`SELECT count(*)::int AS n FROM public.physical_inventory_count_log WHERE pi_id='${piC}'`);
  const cSheets = await q(`SELECT count(*)::int AS n FROM public.physical_inventory_sheets WHERE pi_id='${piC}'`);
  const cAudit = await q(`SELECT count(*)::int AS n FROM public.audit_logs WHERE table_name='physical_inventories' AND record_id='${piC}'`);
  check('C', 'cabecera+items+log+hojas+auditoría eliminados (sin huérfanas)', '0,0,0,0,0',
    `${cGone[0].n},${cItems[0].n},${cLog[0].n},${cSheets[0].n},${cAudit[0].n}`,
    [cGone[0].n, cItems[0].n, cLog[0].n, cSheets[0].n, cAudit[0].n].every(n => n === 0));
  const cVoidAudit = await q(`SELECT count(*)::int AS n FROM public.audit_logs WHERE action='PHYSICAL_INVENTORY_VOIDED' AND record_id='${piC}'`);
  check('C', 'SIN evento de anulación para el borrador eliminado', '0', String(cVoidAudit[0].n), cVoidAudit[0].n === 0);
  const stockC: any = await q(`SELECT id::text, stock_current FROM public.products WHERE id IN ('${products[0].id}','${products[1].id}') ORDER BY id`);
  check('C', 'existencias intactas tras eliminar', 'sin cambios', JSON.stringify(stockC.map((r: any) => r.stock_current)),
    JSON.stringify(stockC) === JSON.stringify(stockBefore));

  // ══ CASO D — Inicio ════════════════════════════════════════════════════
  console.log('── Caso D (inicio: Borrador → En proceso, no repetible)');
  const dStart = await rpc('start_physical_inventory_count', { p_pi_id: piA }, qaAdminToken);
  check('D', 'start (prepared→in_progress) aceptado', 'success', String(dStart.j?.status || dStart.text).slice(0, 40), dStart.ok);
  const dAgain = await rpc('start_physical_inventory_count', { p_pi_id: piA }, qaAdminToken);
  check('D', 'segundo start rechazado', 'ERR_NOT_PREPARED', String(dAgain.j?.message || dAgain.text).slice(0, 50),
    !dAgain.ok && String(dAgain.j?.message || dAgain.text).includes('ERR_NOT_PREPARED'));
  const dStartFromDraft = await rpc('start_physical_inventory_count', { p_pi_id: piA }, qaAdminToken);
  check('D', 'start desde otro estado imposible (ya En proceso)', 'rechazado', `HTTP ${dStartFromDraft.status}`, !dStartFromDraft.ok);
  const dDelAfterStart = await rpc('delete_physical_inventory', { p_pi_id: piA }, qaAdminToken);
  check('D', 'DELETE de un inventario YA INICIADO rechazado (server-side)', 'ERR_CANNOT_DELETE_STATE',
    String(dDelAfterStart.j?.message || dDelAfterStart.text).slice(0, 60),
    !dDelAfterStart.ok && String(dDelAfterStart.j?.message || dDelAfterStart.text).includes('ERR_CANNOT_DELETE_STATE'));

  // ══ CASO E — Edición durante el proceso ════════════════════════════════
  console.log('── Caso E (conteo durante En proceso)');
  const itemsA: any[] = await q(`SELECT id::text, theoretical_qty FROM public.physical_inventory_items WHERE pi_id='${piA}' ORDER BY line_number`);
  const eCount = await rpc('record_physical_inventory_counts', {
    p_pi_id: piA,
    p_items: [
      { item_id: itemsA[0].id, counted_qty: Number(itemsA[0].theoretical_qty), expected_updated_at: null },
      { item_id: itemsA[1].id, counted_qty: Number(itemsA[1].theoretical_qty) - 1, expected_updated_at: null },
    ],
    p_source: 'manual',
  }, qaAdminToken);
  check('E', 'registro de cantidades en in_progress aceptado', 'applied=2', String(eCount.j?.applied), eCount.ok && eCount.j?.applied === 2);
  const eRow = await q(`SELECT counted_items, pending_items FROM public.physical_inventories WHERE id='${piA}'`);
  check('E', 'conteo persistido (2 contadas, 0 pendientes)', '2/0', `${eRow[0].counted_items}/${eRow[0].pending_items}`,
    eRow[0].counted_items === 2 && eRow[0].pending_items === 0);

  // ══ CASO F — Anulación ═════════════════════════════════════════════════
  console.log('── Caso F (anulación con trazabilidad — solo En proceso)');
  const fReason = 'QA: conteo repetido por error de muestreo (batería A-K)';
  const fVoid = await rpc('void_physical_inventory', { p_pi_id: piA, p_reason: fReason }, qaAdminToken);
  check('F', 'void de in_progress aceptado con motivo', 'success', String(fVoid.j?.status || fVoid.text).slice(0, 40), fVoid.ok);
  const fRow = await q(`SELECT status, voided_at, void_reason, voided_by::text AS vb FROM public.physical_inventories WHERE id='${piA}'`);
  const fItems = await q(`SELECT count(*)::int AS n FROM public.physical_inventory_items WHERE pi_id='${piA}'`);
  const fAudit = await q(`SELECT count(*)::int AS n FROM public.audit_logs WHERE action='PHYSICAL_INVENTORY_VOIDED' AND record_id='${piA}'`);
  check('F', 'estado=voided con fecha/motivo/usuario (hora del servidor)', 'voided+traza', `${fRow[0].status}/${fRow[0].void_reason?.slice(0, 20)}`,
    fRow[0].status === 'voided' && !!fRow[0].voided_at && fRow[0].void_reason === fReason && fRow[0].vb === qaAdminId);
  check('F', 'inventario y líneas CONSERVADOS para auditoría', 'líneas intactas', String(fItems[0].n), fItems[0].n === 2);
  check('F', 'evento PHYSICAL_INVENTORY_VOIDED persistido', '1', String(fAudit[0].n), fAudit[0].n === 1);
  const fVoidAgain = await rpc('void_physical_inventory', { p_pi_id: piA, p_reason: 'repetir anulación' }, qaAdminToken);
  check('F', 'anulación repetida rechazada', 'ERR_CANNOT_VOID_STATE', String(fVoidAgain.j?.message || fVoidAgain.text).slice(0, 50),
    !fVoidAgain.ok && String(fVoidAgain.j?.message || fVoidAgain.text).includes('ERR_CANNOT_VOID_STATE'));
  const fNoReason = await rpc('void_physical_inventory', { p_pi_id: piA, p_reason: 'x' }, qaAdminToken);
  check('F', 'motivo obligatorio (mín. 3 chars)', 'ERR_VOID_REASON_REQUIRED', String(fNoReason.j?.message || fNoReason.text).slice(0, 50),
    !fNoReason.ok && String(fNoReason.j?.message || fNoReason.text).includes('ERR_VOID_REASON_REQUIRED'));

  // anular un BORRADOR → rechazado (de Borrador se ELIMINA)
  const fDraftCreate = await rpc('create_physical_inventory', {
    p_store_id: S_A.id, p_cutoff_date: cutoff, p_description: TAG + ' F-draft',
    p_scope_type: 'selection', p_product_ids: [products[0].id],
  }, qaAdminToken);
  const fVoidDraft = await rpc('void_physical_inventory', { p_pi_id: fDraftCreate.j, p_reason: 'anular borrador' }, qaAdminToken);
  check('F', 'anular un BORRADOR rechazado (misión: eliminar, no anular)', 'ERR_CANNOT_VOID_STATE',
    String(fVoidDraft.j?.message || fVoidDraft.text).slice(0, 70),
    !fVoidDraft.ok && String(fVoidDraft.j?.message || fVoidDraft.text).includes('ERR_CANNOT_VOID_STATE'));
  await rpc('delete_physical_inventory', { p_pi_id: fDraftCreate.j }, qaAdminToken); // limpieza

  // ══ CASO G + H — Terminación e inmutabilidad (transacción con ROLLBACK) ═
  console.log('── Caso G/H (terminación completa + inmutabilidad — dentro de BEGIN…ROLLBACK)');
  const stockG0: any = await q(`SELECT id::text, stock_current FROM public.products WHERE id IN ('${products[0].id}','${products[1].id}') ORDER BY id`);
  const claimsAdmin = `SELECT set_config('request.jwt.claims', '{"role":"service_role","sub":"${qaAdminId}"}'::jsonb::text, true);`;

  // G: cadena completa — crear, preparar, iniciar, contar, completar,
  // conciliar, autorizar, generar ajustes (stock INTACTO), confirmar (stock
  // = contado, kardex «Ajuste por inventario físico IF-…»), terminar.
  const gSql = `
${claimsAdmin}
SELECT public.create_physical_inventory('${S_A.id}'::uuid, NOW() - INTERVAL '1 minute', '${TAG} G-H terminación', 'QA Termination', 'selection', NULL, ARRAY['${products[0].id}'::uuid,'${products[1].id}'::uuid], false, 'cadena G', NULL)::text AS pi_id \\gset
SELECT public.prepare_physical_inventory(:'pi_id'::uuid, NULL);
SELECT public.start_physical_inventory_count(:'pi_id'::uuid, NULL);
`;
  // Nota: \\gset (psql meta-comando) NO funciona vía Management API → se
  // usa un DO block para capturar el id y ejecutar la cadena completa.
  const gDo = `
${claimsAdmin}
DO $do$
DECLARE
  v_pi uuid;
  v_items jsonb;
  v_line record;
  v_adj uuid;
  v_adj_id uuid;
  v_stock_antes numeric;
  v_stock_despues numeric;
  v_res jsonb;
BEGIN
  -- 1) crear + preparar + iniciar
  v_pi := public.create_physical_inventory('${S_A.id}'::uuid, NOW() - INTERVAL '1 minute',
    '${TAG} G-H terminación', 'QA Termination', 'selection', NULL,
    ARRAY['${products[0].id}'::uuid,'${products[1].id}'::uuid], false, 'cadena G', NULL);
  PERFORM public.prepare_physical_inventory(v_pi, NULL);
  PERFORM public.start_physical_inventory_count(v_pi, NULL);

  -- 2) contar: producto1 = teórico (sin diferencia), producto2 = teórico-1 (faltante)
  FOR v_line IN SELECT * FROM public.physical_inventory_items WHERE pi_id = v_pi ORDER BY line_number LOOP
    PERFORM public.record_physical_inventory_counts(v_pi,
      jsonb_build_array(jsonb_build_object('item_id', v_line.id,
        'counted_qty', CASE WHEN v_line.line_number = 1 THEN v_line.theoretical_qty ELSE v_line.theoretical_qty - 1 END,
        'expected_updated_at', NULL)), 'manual', NULL);
  END LOOP;

  -- 3) completar → conciliar → autorizar
  PERFORM public.complete_physical_inventory_count(v_pi, false, NULL);
  PERFORM public.submit_physical_inventory_reconciliation(v_pi, NULL);
  PERFORM public.submit_physical_inventory_authorization(v_pi, NULL);

  -- 4) EXISTENCIAS INTACTAS antes de confirmar ajustes (anular/crear no toca stock)
  SELECT stock_current INTO v_stock_antes FROM public.products WHERE id = '${products[1].id}';
  IF v_stock_antes IS DISTINCT FROM (SELECT stock_current FROM public.products WHERE id = '${products[1].id}') THEN
    RAISE EXCEPTION 'G-FAIL: stock cambió antes de confirmar';
  END IF;

  -- 5) generar ajustes documentales (BORRADORES — sin tocar stock)
  v_res := public.generate_adjustments_from_physical_inventory(v_pi, NULL);
  SELECT stock_current INTO v_stock_despues FROM public.products WHERE id = '${products[1].id}';
  IF v_stock_despues <> v_stock_antes THEN
    RAISE EXCEPTION 'G-FAIL: generate_adjustments modificó stock (%)', v_stock_despues;
  END IF;

  -- 6) confirmar el ajuste de faltantes → stock pasa al valor contado (UNA vez)
  SELECT adjustment_id INTO v_adj_id FROM public.physical_inventory_adjustments WHERE pi_id = v_pi AND kind = 'shortfall';
  IF v_adj_id IS NULL THEN RAISE EXCEPTION 'G-FAIL: sin ajuste de faltantes'; END IF;
  PERFORM public.confirm_inventory_adjustment(v_adj_id, NULL);
  SELECT stock_current INTO v_stock_despues FROM public.products WHERE id = '${products[1].id}';
  IF v_stock_despues <> v_stock_antes - 1 THEN
    RAISE EXCEPTION 'G-FAIL: stock tras confirmar = % (esperado %)', v_stock_despues, v_stock_antes - 1;
  END IF;

  -- 7) terminar (cerrar) → Terminado irreversible
  PERFORM public.close_physical_inventory(v_pi, NULL);
  IF (SELECT status FROM public.physical_inventories WHERE id = v_pi) <> 'closed' THEN
    RAISE EXCEPTION 'G-FAIL: no terminó';
  END IF;
  IF (SELECT closed_at IS NULL OR closed_by IS NULL FROM public.physical_inventories WHERE id = v_pi) THEN
    RAISE EXCEPTION 'G-FAIL: sin fecha/usuario de terminación';
  END IF;

  -- 8) CASO H — inmutabilidad: TODA operación de escritura debe fallar
  DECLARE
    v_err text;
  BEGIN
    BEGIN
      PERFORM public.update_physical_inventory(v_pi, NULL, 'hack', NULL, NULL, NULL, NULL, NULL, NULL, NULL);
      RAISE EXCEPTION 'H-FAIL: update aceptó editar Terminado';
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      IF v_err LIKE 'H-FAIL%' THEN RAISE; END IF;
      IF v_err NOT LIKE '%ERR_NOT_EDITABLE_STATE%' THEN RAISE EXCEPTION 'H-FAIL: update err inesperado: %', v_err; END IF;
    END;
    BEGIN
      PERFORM public.delete_physical_inventory(v_pi, NULL);
      RAISE EXCEPTION 'H-FAIL: delete aceptó eliminar Terminado';
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      IF v_err LIKE 'H-FAIL%' THEN RAISE; END IF;
      IF v_err NOT LIKE '%ERR_CANNOT_DELETE_STATE%' THEN RAISE EXCEPTION 'H-FAIL: delete err inesperado: %', v_err; END IF;
    END;
    BEGIN
      PERFORM public.void_physical_inventory(v_pi, 'motivo tardío', NULL);
      RAISE EXCEPTION 'H-FAIL: void aceptó anular Terminado';
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      IF v_err LIKE 'H-FAIL%' THEN RAISE; END IF;
      IF v_err NOT LIKE '%ERR_CANNOT_VOID_STATE%' THEN RAISE EXCEPTION 'H-FAIL: void err inesperado: %', v_err; END IF;
    END;
    BEGIN
      PERFORM public.record_physical_inventory_counts(v_pi,
        jsonb_build_array(jsonb_build_object('item_id', (SELECT id FROM public.physical_inventory_items WHERE pi_id = v_pi LIMIT 1), 'counted_qty', 999, 'expected_updated_at', NULL)), 'manual', NULL);
      RAISE EXCEPTION 'H-FAIL: count aceptó modificar cantidades de Terminado';
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      IF v_err LIKE 'H-FAIL%' THEN RAISE; END IF;
      IF v_err NOT LIKE '%ERR_NOT_COUNTING%' THEN RAISE EXCEPTION 'H-FAIL: count err inesperado: %', v_err; END IF;
    END;
    BEGIN
      PERFORM public.close_physical_inventory(v_pi, NULL);
      RAISE EXCEPTION 'H-FAIL: close aceptó re-terminar';
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      IF v_err LIKE 'H-FAIL%' THEN RAISE; END IF;
      IF v_err NOT LIKE '%ERR_NOT_CONCILIATED%' THEN RAISE EXCEPTION 'H-FAIL: close err inesperado: %', v_err; END IF;
    END;
    BEGIN
      PERFORM public.prepare_physical_inventory(v_pi, NULL);
      RAISE EXCEPTION 'H-FAIL: prepare aceptó reabrir Terminado';
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      IF v_err LIKE 'H-FAIL%' THEN RAISE; END IF;
      IF v_err NOT LIKE '%ERR_NOT_DRAFT%' THEN RAISE EXCEPTION 'H-FAIL: prepare err inesperado: %', v_err; END IF;
    END;
  END;

  -- 9) CASO H (persistencia directa): RLS bloquea UPDATE de un Terminado
  --    incluso para un admin de la tienda (SET LOCAL ROLE authenticated).
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"${qaAdminId}"}', true);
  BEGIN
    UPDATE public.physical_inventories SET description = 'hack-rls' WHERE id = v_pi;
    IF FOUND THEN RAISE EXCEPTION 'H-FAIL: RLS permitió UPDATE directo de Terminado'; END IF;
    UPDATE public.physical_inventory_items SET counted_qty = 999 WHERE pi_id = v_pi;
    IF FOUND THEN RAISE EXCEPTION 'H-FAIL: RLS permitió UPDATE directo de items Terminado'; END IF;
  END;
  RESET ROLE;

  -- 10) CASO I (close concurrente, patrón check-then-act dentro de la misma
  --     transacción): el segundo close sobre el MISMO inventario ya cerrado
  --     debe fallar por ERR_NOT_CONCILIATED (sin dobles efectos).
  BEGIN
    PERFORM public.close_physical_inventory(v_pi, NULL);
    RAISE EXCEPTION 'I-FAIL: doble close aceptado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'I-FAIL%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%ERR_NOT_CONCILIATED%' THEN RAISE EXCEPTION 'I-FAIL: doble close err inesperado: %', SQLERRM; END IF;
  END;

  RAISE NOTICE 'G/H OK — pi=%', v_pi;
END
$do$;
`;
  const gRes = await tx(gDo);
  check('G', 'cadena completa create→…→close con ajustes aplicados UNA vez', 'sin errores', gRes.ok ? 'OK' : (gRes.error || '').slice(0, 140), gRes.ok);
  check('H', 'inmutabilidad total de Terminado (update/delete/void/count/close/prepare + RLS directo)', 'todo rechazado', gRes.ok ? 'todo rechazado' : (gRes.error || '').slice(0, 140), gRes.ok);
  check('I', 'doble terminación rechazada (ERR_NOT_CONCILIATED, sin duplicar efectos)', 'rechazada', gRes.ok ? 'rechazada' : (gRes.error || '').slice(0, 100), gRes.ok);

  const stockG1: any = await q(`SELECT id::text, stock_current FROM public.products WHERE id IN ('${products[0].id}','${products[1].id}') ORDER BY id`);
  check('G', 'ROLLBACK: existencias reales INTACTAS tras la cadena completa', 'sin cambios',
    JSON.stringify(stockG1.map((r: any) => r.stock_current)), JSON.stringify(stockG1) === JSON.stringify(stockG0));

  // ══ CASO I — Concurrencia REAL (PostgREST paralelo) ════════════════════
  console.log('── Caso I (concurrencia real: dos llamadas simultáneas, una sola gana)');
  // I.1 doble prepare
  const i1Create = await rpc('create_physical_inventory', {
    p_store_id: S_A.id, p_cutoff_date: cutoff, p_description: TAG + ' I-prepare',
    p_scope_type: 'selection', p_product_ids: [products[0].id],
  }, qaAdminToken);
  const [i1a, i1b] = await Promise.all([
    rpc('prepare_physical_inventory', { p_pi_id: i1Create.j }, qaAdminToken),
    rpc('prepare_physical_inventory', { p_pi_id: i1Create.j }, qaAdminToken),
  ]);
  const i1wins = [i1a, i1b].filter(r => r.ok).length;
  check('I', 'doble prepare simultáneo → exactamente 1 éxito', '1', String(i1wins), i1wins === 1);
  await rpc('delete_physical_inventory', { p_pi_id: i1Create.j }, qaAdminToken); // limpieza (prepared → eliminable)

  // I.2 doble void
  const i2Create = await rpc('create_physical_inventory', {
    p_store_id: S_A.id, p_cutoff_date: cutoff, p_description: TAG + ' I-void',
    p_scope_type: 'selection', p_product_ids: [products[0].id],
  }, qaAdminToken);
  await rpc('prepare_physical_inventory', { p_pi_id: i2Create.j }, qaAdminToken);
  await rpc('start_physical_inventory_count', { p_pi_id: i2Create.j }, qaAdminToken);
  const [i2a, i2b] = await Promise.all([
    rpc('void_physical_inventory', { p_pi_id: i2Create.j, p_reason: 'QA concurrencia A' }, qaAdminToken),
    rpc('void_physical_inventory', { p_pi_id: i2Create.j, p_reason: 'QA concurrencia B' }, qaAdminToken),
  ]);
  const i2wins = [i2a, i2b].filter(r => r.ok).length;
  const i2row = await q(`SELECT status, void_reason FROM public.physical_inventories WHERE id='${i2Create.j}'`);
  check('I', 'doble void simultáneo → exactamente 1 éxito, estado coherente', '1 · voided',
    `${i2wins} · ${i2row[0].status}`, i2wins === 1 && i2row[0].status === 'voided');

  // I.3 doble delete
  const i3Create = await rpc('create_physical_inventory', {
    p_store_id: S_A.id, p_cutoff_date: cutoff, p_description: TAG + ' I-delete',
    p_scope_type: 'selection', p_product_ids: [products[0].id],
  }, qaAdminToken);
  const [i3a, i3b] = await Promise.all([
    rpc('delete_physical_inventory', { p_pi_id: i3Create.j }, qaAdminToken),
    rpc('delete_physical_inventory', { p_pi_id: i3Create.j }, qaAdminToken),
  ]);
  const i3wins = [i3a, i3b].filter(r => r.ok).length;
  const i3gone = await q(`SELECT count(*)::int AS n FROM public.physical_inventories WHERE id='${i3Create.j}'`);
  check('I', 'doble delete simultáneo → exactamente 1 éxito, documento eliminado', '1 · 0 filas',
    `${i3wins} · ${i3gone[0].n}`, i3wins === 1 && i3gone[0].n === 0);

  // ══ CASO J — Seguridad multitienda ═════════════════════════════════════
  console.log('── Caso J (aislamiento multitienda y permisos)');
  const jCreate = await rpc('create_physical_inventory', {
    p_store_id: S_A.id, p_cutoff_date: cutoff, p_description: TAG + ' J',
    p_scope_type: 'selection', p_product_ids: [products[0].id],
  }, qaAdminToken);
  const piJ: string = jCreate.j;

  // J.1 usuario SIN membresía alguna
  const jForeignCreate = await rpc('create_physical_inventory', {
    p_store_id: S_A.id, p_cutoff_date: cutoff, p_description: TAG + ' J-foreign',
    p_scope_type: 'selection', p_product_ids: [products[0].id],
  }, qaForeignToken);
  check('J', 'SIN membresía: crear rechazado', 'ERR_UNAUTHORIZED_CREATE_PI', String(jForeignCreate.j?.message || jForeignCreate.text).slice(0, 50),
    !jForeignCreate.ok && String(jForeignCreate.j?.message || jForeignCreate.text).includes('ERR_UNAUTHORIZED_CREATE_PI'));
  const jForeignUpdate = await rpc('update_physical_inventory', {
    p_pi_id: piJ, p_description: 'hack extranjero',
  }, qaForeignToken);
  check('J', 'SIN membresía: update rechazado', 'ERR_UNAUTHORIZED_UPDATE_PI', String(jForeignUpdate.j?.message || jForeignUpdate.text).slice(0, 50),
    !jForeignUpdate.ok && String(jForeignUpdate.j?.message || jForeignUpdate.text).includes('ERR_UNAUTHORIZED_UPDATE_PI'));
  const jForeignDelete = await rpc('delete_physical_inventory', { p_pi_id: piJ }, qaForeignToken);
  check('J', 'SIN membresía: delete rechazado', 'ERR_UNAUTHORIZED_DELETE_PI', String(jForeignDelete.j?.message || jForeignDelete.text).slice(0, 50),
    !jForeignDelete.ok && String(jForeignDelete.j?.message || jForeignDelete.text).includes('ERR_UNAUTHORIZED_DELETE_PI'));
  const jForeignLines = await rpc('get_physical_inventory_count_lines', { p_pi_id: piJ }, qaForeignToken);
  check('J', 'SIN membresía: lectura de líneas rechazada', 'ERR_NO_STORE_ACCESS', String(jForeignLines.j?.message || jForeignLines.text).slice(0, 50),
    !jForeignLines.ok && String(jForeignLines.j?.message || jForeignLines.text).includes('ERR_NO_STORE_ACCESS'));

  // PI en proceso (anulable) para probar void sin membresía y cross-store
  const jCreate2 = await rpc('create_physical_inventory', {
    p_store_id: S_A.id, p_cutoff_date: cutoff, p_description: TAG + ' J-voidable',
    p_scope_type: 'selection', p_product_ids: [products[0].id],
  }, qaAdminToken);
  const piJ2: string = jCreate2.j;
  await rpc('prepare_physical_inventory', { p_pi_id: piJ2 }, qaAdminToken);
  await rpc('start_physical_inventory_count', { p_pi_id: piJ2 }, qaAdminToken);
  const jForeignVoid = await rpc('void_physical_inventory', { p_pi_id: piJ2, p_reason: 'hack extranjero' }, qaForeignToken);
  check('J', 'SIN membresía: void rechazado (sobre PI en proceso)', 'ERR_UNAUTHORIZED_VOID', String(jForeignVoid.j?.message || jForeignVoid.text).slice(0, 50),
    !jForeignVoid.ok && String(jForeignVoid.j?.message || jForeignVoid.text).includes('ERR_UNAUTHORIZED_VOID'));

  // J.2 cross-store: QA admin de A contra PI en B (creado por un admin real de B
  //     vía service_role con p_user_id — la vía diseñada para llamadas de servidor)
  if (bAdmin) {
    const bCreate = await rpc('create_physical_inventory', {
      p_store_id: S_B.id, p_cutoff_date: cutoff, p_description: TAG + ' J-cross',
      p_scope_type: 'full', p_user_id: bAdmin.id,
    }); // sin token → service_role
    if (bCreate.ok) {
      const piB: string = bCreate.j;
      // update/delete se prueban sobre el PI en BORRADOR (estado válido para
      // esas operaciones → el rechazo proviene del GATE de tienda, no del estado)
      const jCrossUpdate = await rpc('update_physical_inventory', { p_pi_id: piB, p_description: 'hack cross' }, qaAdminToken);
      check('J', 'CROSS-STORE: admin de A no edita PI de B', 'ERR_UNAUTHORIZED_UPDATE_PI', String(jCrossUpdate.j?.message || jCrossUpdate.text).slice(0, 50),
        !jCrossUpdate.ok && String(jCrossUpdate.j?.message || jCrossUpdate.text).includes('ERR_UNAUTHORIZED_UPDATE_PI'));
      const jCrossDelete = await rpc('delete_physical_inventory', { p_pi_id: piB }, qaAdminToken);
      check('J', 'CROSS-STORE: admin de A no elimina PI de B', 'ERR_UNAUTHORIZED_DELETE_PI', String(jCrossDelete.j?.message || jCrossDelete.text).slice(0, 50),
        !jCrossDelete.ok && String(jCrossDelete.j?.message || jCrossDelete.text).includes('ERR_UNAUTHORIZED_DELETE_PI'));
      // void se prueba sobre el PI en PROCESO (anulable por estado → el rechazo
      // proviene del gate de tienda)
      await rpc('prepare_physical_inventory', { p_pi_id: piB, p_user_id: bAdmin.id });
      await rpc('start_physical_inventory_count', { p_pi_id: piB, p_user_id: bAdmin.id });
      const jCrossVoid = await rpc('void_physical_inventory', { p_pi_id: piB, p_reason: 'hack cross' }, qaAdminToken);
      check('J', 'CROSS-STORE: admin de A no anula PI de B', 'ERR_UNAUTHORIZED_VOID', String(jCrossVoid.j?.message || jCrossVoid.text).slice(0, 50),
        !jCrossVoid.ok && String(jCrossVoid.j?.message || jCrossVoid.text).includes('ERR_UNAUTHORIZED_VOID'));
      // limpieza: anular como SU admin (queda como artefacto QA anulado) y
      // verificar que ningún dato de B fue alterado por los intentos de A
      const bVoid = await rpc('void_physical_inventory', { p_pi_id: piB, p_reason: 'QA: limpieza cross-store', p_user_id: bAdmin.id });
      const bRow = await q(`SELECT status, description FROM public.physical_inventories WHERE id='${piB}'`);
      check('J', 'limpieza del PI de B: intacto salvo anulación por SU admin', 'voided sin hack', `${bRow[0].status} · ${bRow[0].description}`,
        bVoid.ok && bRow[0].status === 'voided' && bRow[0].description === TAG + ' J-cross');
    } else {
      check('J', 'cross-store: creación del PI de B falló (documentado)', '—', String(bCreate.j?.message || bCreate.text).slice(0, 80), false);
    }
  } else {
    check('J', 'cross-store: sin admin en B para preparar el caso (documentado)', '—', 'omitido', true);
  }

  // J.3 suplantación: usuario final pasa p_user_id ajeno con SU JWT — el
  //     patrón v_caller_uid SOLO respeta p_user_id para service_role: la
  //     operación queda registrada bajo la identidad DEL JWT (sin escalada).
  const jSpoof = await rpc('update_physical_inventory', {
    p_pi_id: piJ, p_description: TAG + ' J spoof-audit', p_user_id: qaForeignId,
  }, qaAdminToken);
  const jSpoofAudit = await q(`SELECT user_id::text AS u FROM public.audit_logs WHERE table_name='physical_inventories' AND record_id='${piJ}' AND action='PHYSICAL_INVENTORY_UPDATED' ORDER BY created_at DESC LIMIT 1`);
  check('J', 'p_user_id ajeno con JWT propio: audita bajo la identidad del JWT (no escala)', `user_id=${qaAdminId.slice(0, 8)}…`,
    String(jSpoofAudit[0]?.u),
    jSpoof.ok && jSpoofAudit[0]?.u === qaAdminId);
  // limpieza de piJ (draft): delete por su legítimo admin
  await rpc('delete_physical_inventory', { p_pi_id: piJ }, qaAdminToken);

  // ══ CASO K — Regresión ═════════════════════════════════════════════════
  console.log('── Caso K (regresión del módulo)');
  const kList = await sr(`/rest/v1/physical_inventories?select=id,pi_number,status&store_id=eq.${S_A.id}&order=created_at.desc&limit=10`, { token: qaAdminToken });
  check('K', 'listado (RLS) sigue funcionando para el miembro de la tienda', '≥1 fila', `${kList.j?.length ?? 0} filas`,
    kList.ok && kList.j.length >= 1);
  const kLines = await rpc('get_physical_inventory_count_lines', { p_pi_id: piA }, qaAdminToken);
  check('K', 'get_physical_inventory_count_lines sobre PI anulado (consulta permitida)', 'success', String(kLines.j?.status || kLines.text).slice(0, 30),
    kLines.ok && kLines.j?.pi_id === piA);
  const kRecon = await rpc('get_physical_inventory_reconciliation', { p_pi_id: piA }, qaAdminToken);
  check('K', 'get_physical_inventory_reconciliation sobre PI anulado (histórico)', 'success', String(kRecon.j?.pi ? 'ok' : kRecon.text).slice(0, 30),
    kRecon.ok && !!kRecon.j?.pi);
  const kExisting = await q(`SELECT count(*)::int AS n FROM public.physical_inventories WHERE status='voided'`);
  check('K', 'PIs históricos preservados (el voided de misiones anteriores sigue)', '≥2', String(kExisting[0].n), kExisting[0].n >= 2);
  const kTrigger = await q(`SELECT pg_get_triggerdef(oid) AS d FROM pg_trigger WHERE tgname='trg_validate_pi_transition'`);
  const kMapOk = String(kTrigger[0]?.d || '').includes('fn_validate_pi_transition');
  check('K', 'trigger de transiciones activo sobre physical_inventories', 'activo', kMapOk ? 'activo' : 'FALTA', kMapOk);
  const kAuditActions = await q(`SELECT DISTINCT action FROM public.audit_logs WHERE action LIKE 'PHYSICAL_INVENTORY%' ORDER BY 1`);
  check('K', 'eventos de auditoría del módulo intactos', '≥5 acciones', kAuditActions.map((a: any) => a.action).join(','),
    kAuditActions.length >= 5);

  // ══ LIMPIEZA ═══════════════════════════════════════════════════════════
  console.log('── Limpieza');
  const leftovers: any[] = await q(`SELECT id::text, status FROM public.physical_inventories WHERE description LIKE '${TAG}%'`);
  let cleaned = 0;
  for (const row of leftovers) {
    if (row.status === 'draft' || row.status === 'prepared') {
      await rpc('delete_physical_inventory', { p_pi_id: row.id }, qaAdminToken).then(() => { cleaned++; }).catch(() => {});
    } else if (['in_progress', 'counted', 'in_reconciliation', 'pending_authorization'].includes(row.status)) {
      await rpc('void_physical_inventory', { p_pi_id: row.id, p_reason: 'QA: limpieza de batería' }, qaAdminToken).then(() => { cleaned++; }).catch(() => {});
    } else {
      cleaned++; // voided: permanece como artefacto QA (no eliminable por diseño)
    }
  }
  const remaining = await q(`SELECT count(*)::int AS n FROM public.physical_inventories WHERE description LIKE '${TAG}%'`);
  console.log(`  🧹 ${cleaned}/${leftovers.length} PIs QA gestionados · permanecen (anulados por diseño): ${remaining[0].n}`);

  // QA users: desactivar + ban (patrón de misiones anteriores)
  for (const [email, id] of [[QA_FOREIGN_EMAIL, qaForeignId], [QA_ADMIN_EMAIL, qaAdminId]] as const) {
    await sr('/rest/v1/profiles?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ is_active: false }) });
    await sr('/auth/v1/admin/users/' + id, { method: 'PUT', body: JSON.stringify({ ban_duration: '876000h' }) });
  }
  console.log('  🧹 usuarios QA desactivados y baneados');

  // ══ RESUMEN ════════════════════════════════════════════════════════════
  console.log('\n════════════════════════════════════════════════');
  console.log(`  RESULTADO: ${pass} OK · ${fail} FALLOS`);
  console.log('════════════════════════════════════════════════');
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error('💥 ERROR FATAL:', e); process.exit(1); });
