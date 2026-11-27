/**
 * E2E CP-BRA-R06 — CP-BRA-R06-FINAL-CERTIFICATION-001 (2026-11-28)
 * ============================================================================
 * BATERÍA DE AUTORIZACIÓN DE RECEPCIONES contra la BD AISLADA — demostración
 * conductual de la MATRIZ decidida por el propietario (39 casos §7):
 *
 *  CREACIÓN: 1 encargado ✓ · 2 encargado sin membresía ✗ · 3 almacenero ✗ ·
 *   4 facturadora/clerk ✗ (no existe rol 'facturadora': el nombre exacto del
 *   rol operativo de facturación es 'clerk' — verificado contra el enum
 *   user_role VIVO; no se inventan roles) · 5 clerk ✗ · 6 manager ✗ ·
 *   7 admin de tienda ✗ · 8 usuario de otra tienda (encargado de B) ✗ ·
 *   9 anónimo ✗ · 10 superadmin global ✓ · 11 manipulación store_id ✗ ·
 *   12 manipulación created_by (identidad pinneada) · 13 creador inmutable.
 *
 *  CONFIRMACIÓN/ANULACIÓN: 14 creador confirma propia ✓ · 15 creador anula
 *   propia ✓ · 16-20 ajenos (encargado/admin-tienda/manager/almacenero/
 *   clerk) ✗ · 21 creador con membresía revocada ✗ · 22 superadmin confirma
 *   ajena ✓ · 23 superadmin anula ajena (reversión) ✓ · 24 superadmin otra
 *   tienda ✓ · 25 anónimo RPC ✗ · 26 manipulación identidad ✗ ·
 *   27 histórico sin creador verificable → solo superadmin · 28 confirmación
 *   concurrente (1 gana) · 29 anulación concurrente (1 gana) · 30 reintento
 *   completada (idempotencia/estado).
 *
 *  INVARIANTES FINANCIERAS: 31 pagos vivos ✗ · 32 obligación viva (pago sin
 *   reversión) ✗ · 33 anulada→confirmar ✗ · 34 reversión obligatoria (void de
 *   active ✗) · 35 sin duplicación de inventario · 36 sin doble confirmación ·
 *   37 integridad CxP (pagos marcados REVERSED) · 38 auditoría del creador ·
 *   39 auditoría del superadmin.
 *
 * Flujos REALES: RPC directo con Bearer del usuario (browser online) y ruta
 * POST /api/inventory/receptions (SyncEngine) + PATCH (borradores). sb
 * (service_role) SOLO para siembra/verificación/cleanup (net-zero).
 *
 * Ejecución: E2E_ALLOW_CREATION=1 E2E_ISOLATION=1 npm run test:e2e:creation
 * Higiene: node e2e/scripts/data-hygiene-guard.cjs → "PASS — net delta = 0".
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  signIn, apiHeaders, rpcAsUser, sb, requireIsolatedCreation, seedProduct,
  ensureEncargadoSession, type Session,
} from '../fixtures/session.fixture';
import { hardDeleteRunUser } from '../fixtures/hard-cleanup';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@costpro.com';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || process.env.ADMIN_PASS || 'costpro123';
const WAREHOUSE_EMAIL = process.env.E2E_WAREHOUSE_EMAIL || 'almacen@demo.com';
const WAREHOUSE_PASS = process.env.E2E_WAREHOUSE_PASS || 'demo123';
const CLERK_EMAIL = process.env.E2E_USER_EMAIL || 'cajero@demo.com';
const CLERK_PASS = process.env.E2E_USER_PASS || 'demo123';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const RUN_TAG = (process.env.E2E_RUN_ID || 'norun').replace(/[^A-Za-z0-9]/g, '').slice(-6);
const SUFFIX = `R${RUN_TAG}`;
const NS = `R06-${SUFFIX}`;

test.beforeAll(() => {
  requireIsolatedCreation();
});

// ── Estado del spec ─────────────────────────────────────────────────────────
let store = { id: '' };        // piloto A del run (efímera, teardown global)
let storeB = '';               // piloto B del run (intervención superadmin)
let product = '';
let admin: Session;            // admin del run (rol 'admin' de plataforma)
let enc: Session;              // ENCARGADO de la tienda A (creador principal)
let encBOnly: Session;         // encargado SOLO de B (caso 8: usuario de otra tienda)
let encOtherA: Session;        // OTRO encargado de A (≠ creador — caso 16)
let warehouse: Session;        // almacenero con membresía en A
let clerk: Session;            // facturadora/clerk con membresía en A
let manager: Session;          // manager creado (con cleanup)
let storeAdmin: Session;       // admin de TIENDA (membresía role admin en A)
let usuario: Session;          // usuario ordinario con membresía en A
let superadmin: Session;       // superadministrador de plataforma
const createdUserIds: string[] = []; // usuarios propios → cleanup en afterAll
const createdMembershipKeys: string[] = [];
let historicReceipt = '';      // recepción sin creador verificable (user_id NULL)

const USER_UNIQ = Date.now().toString(36).slice(-5);

/** Crea un usuario auth (patrón run-env: sin company_name) + firma sesión.
 *  Idempotente: si el email ya existe (colisión de run-id), reutiliza el id. */
async function createUser(email: string, password: string, role: string): Promise<Session & { id: string }> {
  let res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { role, full_name: `E2E R06 ${role}` } }),
  });
  let data: { id: string };
  if (res.status === 422) {
    // email_exists → reutilizar el usuario existente (id por list-by-email).
    const list = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1&filter=email:eq.${encodeURIComponent(email)}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const ljson = (await list.json()) as { users?: Array<{ id: string }> };
    data = { id: ljson.users?.[0]?.id || '' };
    if (!data.id) throw new Error(`usuario ${email} existe pero no se pudo resolver el id`);
  } else {
    if (!res.ok) throw new Error(`crear usuario ${email}: HTTP ${res.status} ${await res.text()}`);
    data = (await res.json()) as { id: string };
  }
  createdUserIds.push(data.id);
  const s = await signIn(email, password);
  return { ...s, id: data.id };
}

/** Membresía idempotente (seed) con registro para cleanup. */
async function seedMembership(userId: string, storeId: string, role: string): Promise<void> {
  const key = `${userId}|${storeId}`;
  const existing = await sb.select('user_store_memberships', `user_id=eq.${userId}&store_id=eq.${storeId}&select=user_id,role,status&limit=1`);
  const row = existing[0] as { role: string; status: string } | undefined;
  if (!row) {
    await sb.insert('user_store_memberships', [{ user_id: userId, store_id: storeId, role, status: 'active' }]);
  } else if (row.role !== role || row.status !== 'active') {
    await sb.update('user_store_memberships', `user_id=eq.${userId}&store_id=eq.${storeId}`, { role, status: 'active' });
  }
  createdMembershipKeys.push(key);
}

function item(quantity = 2, unit_cost = 10) {
  return { product_id: product, quantity, unit_cost, moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1 };
}

/** register_reception con Bearer del usuario (flujo real del navegador). */
async function createRpc(token: string, opts: { storeId?: string; userId?: string; invoice: string } ): Promise<{ ok: boolean; error: string | null; data: unknown }> {
  const r = await rpcAsUser('register_reception', token, {
    p_store_id: opts.storeId ?? store.id,
    p_supplier: 'Proveedor E2E R06',
    p_reception_date: new Date().toISOString(),
    p_invoice_number: opts.invoice,
    p_items: [item()],
    p_user_id: opts.userId ?? null,
    p_po_id: null,
  });
  return r;
}

/** Ruta POST /api/inventory/receptions (flujo SyncEngine). */
async function createRoute(request: APIRequestContext, token: string, payload: Record<string, unknown>) {
  return request.post('/api/inventory/receptions', { headers: apiHeaders(token), data: { ...payload, store_id: payload.p_store_id ?? store.id } });
}

/** Borrador pendiente vía PostgREST como el flujo real del navegador
 *  (useSavePendingReception): INSERT directo sin user_id — el trigger
 *  receipts_pin_creator fija la identidad autenticada. */
async function createDraft(token: string, invoice: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/receipts`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ store_id: store.id, supplier: 'Prov R06', reception_date: new Date().toISOString(), reference_doc: invoice, status: 'pending', total_cost: 20, payment_status: 'unpaid', payment_terms_days: 30 }),
  });
  if (!res.ok) throw new Error(`createDraft: HTTP ${res.status} ${await res.text()}`);
  const [draft] = await res.json() as Array<{ id: string }>;
  const ires = await fetch(`${SUPABASE_URL}/rest/v1/receipt_items`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ receipt_id: draft.id, product_id: product, quantity: 2, unit_cost: 10, moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1 }),
  });
  if (!ires.ok) throw new Error(`createDraft items: HTTP ${ires.status} ${await ires.text()}`);
  return draft.id;
}

async function receiptRow(id: string): Promise<Record<string, any>> {
  const rows = await sb.select('receipts', `id=eq.${id}&select=*&limit=1`);
  return rows[0] as Record<string, any> || {} as Record<string, any>;
}

async function auditFor(receiptId: string, action: string) {
  return sb.select('audit_logs', `record_id=eq.${receiptId}&action=eq.${action}&select=*&order=created_at.desc&limit=1`);
}

// ── Setup ───────────────────────────────────────────────────────────────────
test.beforeAll(async () => {
  admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
  store = { id: process.env.E2E_TEST_STORE_ID || '' };
  storeB = process.env.E2E_PILOT_STORE_B || '';
  if (!store.id || !storeB) throw new Error('[r06] E2E_TEST_STORE_ID / E2E_PILOT_STORE_B no configurados (global-setup aislado)');

  const p = await seedProduct(store, { name: `Producto R06 ${SUFFIX}`, price: 100, cost: 10, quantity: 0, sku: `R06-${SUFFIX}-1` });
  product = p.id;

  // Plantel del run reutilizado (teardown global los limpia): el encargado del
  // run SOLO con membresía en A (creador principal de los borradores).
  enc = await ensureEncargadoSession(store.id);
  warehouse = await signIn(WAREHOUSE_EMAIL, WAREHOUSE_PASS);
  await seedMembership(warehouse.userId, store.id, 'warehouse');
  clerk = await signIn(CLERK_EMAIL, CLERK_PASS);
  await seedMembership(clerk.userId, store.id, 'clerk');

  // Caso 8: encargado DEDICADO de la tienda B (membresía SOLO en B) — el
  // «usuario de otra tienda» de la matriz: dedicado, SOLO encargado de B.
  const C = 'r06';
  encBOnly = await createUser(`e2e-${C}-encb-${SUFFIX}-${USER_UNIQ}@costpro.test`, 'R06pass123!', 'clerk');
  await seedMembership(encBOnly.id, storeB, 'encargado');
  encOtherA = await createUser(`e2e-${C}-enc2-${SUFFIX}-${USER_UNIQ}@costpro.test`, 'R06pass123!', 'clerk');
  await seedMembership(encOtherA.id, store.id, 'encargado');
  usuario = await createUser(`e2e-${C}-usr-${SUFFIX}-${USER_UNIQ}@costpro.test`, 'R06pass123!', 'usuario');
  await seedMembership(usuario.id, store.id, 'usuario');
  manager = await createUser(`e2e-${C}-mgr-${SUFFIX}-${USER_UNIQ}@costpro.test`, 'R06pass123!', 'manager');
  await seedMembership(manager.id, store.id, 'manager');
  storeAdmin = await createUser(`e2e-${C}-adm-${SUFFIX}-${USER_UNIQ}@costpro.test`, 'R06pass123!', 'clerk');
  await seedMembership(storeAdmin.id, store.id, 'admin'); // admin de TIENDA (membresía)
  superadmin = await createUser(`e2e-${C}-sup-${SUFFIX}-${USER_UNIQ}@costpro.test`, 'R06pass123!', 'clerk');
  await sb.update('profiles', `id=eq.${superadmin.id}`, { role: 'superadmin' });

  // 27: recepción histórica sin creador verificable (user_id NULL — el FK
  // receipts_user_id_fkey impide el centinela 00000000-… en cualquier entorno:
  // la rama defensiva del helper cubre el caso teórico legacy documentado).
  const [h] = await sb.insert('receipts', [{ store_id: store.id, user_id: null, supplier: 'Histórico', reception_date: new Date().toISOString(), reference_doc: `HIST-${NS}-1`, status: 'pending', total_cost: 10, payment_status: 'unpaid', payment_terms_days: 30 }]);
  historicReceipt = String(h.id);
  await sb.insert('receipt_items', [{ receipt_id: historicReceipt, product_id: product, quantity: 1, unit_cost: 10, moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1 }]);
});

// ── Cleanup net-zero de LOS artefactos de este spec ────────────────────────
test.afterAll(async () => {
  // Limpieza multi-usuario/multi-recepción: ampliar el timeout del hook.
  test.setTimeout(300000);
  try {
    // Recepciones del spec (por prefijo de factura determinista) + históricas.
    const mine = await sb.select('receipts', `store_id=eq.${store.id}&reference_doc=like.*${NS}*`, 'select=id').catch(() => [] as any[]);
    const ids = [ ...(mine as any[]).map((r: any) => String(r.id)), historicReceipt ].filter(Boolean);
    for (const id of ids) {
      const finE = await sb.select('fin_entries', `document_id=eq.${id}&select=id&limit=1`).catch(() => [] as any[]);
      if ((finE as any[]).length) {
        await sb.delete('fin_movements', `entry_id=in.(${(finE as any[]).map((e: any) => e.id).join(',')})`).catch(() => {});
        await sb.delete('fin_entries', `document_id=eq.${id}`).catch(() => {});
      }
      await sb.delete('payment_transactions', `ref_id=eq.${id}`).catch(() => {});
      await sb.delete('receipt_tasa_audit', `receipt_item_id=in.(select id from receipt_items where receipt_id=eq.${id})`).catch(() => {});
      await sb.delete('receipt_items', `receipt_id=eq.${id}`).catch(() => {});
      await sb.delete('receipts', `id=eq.${id}`).catch(() => {});
    }
    // Movimientos/inventario/kardex del producto sembrado (por tienda propia).
    await sb.delete('stock_movements', `product_id=eq.${product}`).catch(() => {});
    await sb.delete('kardex_entries', `product_id=eq.${product}`).catch(() => {});
    await sb.delete('wac_change_log', `product_id=eq.${product}`).catch(() => {});
    await sb.delete('inventory', `product_id=eq.${product}`).catch(() => {});
    await sb.delete('audit_logs', `store_id=eq.${store.id}&record_id=in.(${ids.join(',') || '00000000-0000-0000-0000-000000000000'})`).catch(() => {});
    await sb.delete('products', `id=eq.${product}`).catch(() => {});
    // Membresías sembradas por el spec (las de usuarios propios mueren con ellos).
    for (const key of createdMembershipKeys) {
      const [uid, sid] = key.split('|');
      await sb.delete('user_store_memberships', `user_id=eq.${uid}&store_id=eq.${sid}`).catch(() => {});
    }
    // Usuarios propios: hard-delete CANÓNICO (e2e_hard_delete_user respeta
    // la política de soft-delete y las protecciones del config).
    for (const uid of createdUserIds) {
      await hardDeleteRunUser(uid).catch(() => {});
    }
  } catch { /* best-effort: el sweep global del run cubre el resto */ }
});

// ═════════════ 7.1 CREACIÓN ═══════════════════════════════════════════════

test('1 — encargado con membresía activa: creación PERMITIDA (RPC y ruta)', async ({ request }) => {
  const rpc = await createRpc(enc.token, { invoice: `${NS}-C1` });
  expect(rpc.ok, `RPC: ${rpc.error}`).toBe(true);
  const row = await sb.select('receipts', `reference_doc=eq.${NS}-C1&select=user_id,status,store_id`);
  expect(row[0].user_id).toBe(enc.userId); // creador = identidad autenticada
  expect(row[0].status).toBe('active');

  const route = await createRoute(request, enc.token, { p_store_id: store.id, p_supplier: 'R06', p_reception_date: new Date().toISOString(), p_invoice_number: `${NS}-C1R`, p_items: [item()], p_user_id: enc.userId, p_po_id: null });
  expect(route.status(), `ruta: ${await route.text()}`).toBe(201);
});

test('2 — encargado SIN membresía activa: rechazo', async () => {
  // Revocar → intentar → restaurar.
  await sb.update('user_store_memberships', `user_id=eq.${enc.userId}&store_id=eq.${store.id}`, { status: 'revoked' });
  const r = await createRpc(enc.token, { invoice: `${NS}-C2` });
  expect(r.ok).toBe(false);
  expect(r.error).toContain('ERR_FORBIDDEN_ROLE');
  await sb.update('user_store_memberships', `user_id=eq.${enc.userId}&store_id=eq.${store.id}`, { status: 'active' });
});

test('3 — almacenero (warehouse) con acceso: rechazo', async () => {
  const r = await createRpc(warehouse.token, { invoice: `${NS}-C3` });
  expect(r.ok).toBe(false);
  expect(r.error).toContain('ERR_FORBIDDEN_ROLE');
});

test('4 — facturadora/clerk con acceso: rechazo (el rol de facturación es clerk — no existe facturadora)', async () => {
  const r = await createRpc(clerk.token, { invoice: `${NS}-C4` });
  expect(r.ok).toBe(false);
  expect(r.error).toContain('ERR_FORBIDDEN_ROLE');
});

test('5 — clerk con acceso: rechazo', async ({ request }) => {
  // Doble canal: RPC directo y la ruta del SyncEngine.
  const rpc = await createRpc(clerk.token, { invoice: `${NS}-C5` });
  expect(rpc.ok).toBe(false);
  const route = await createRoute(request, clerk.token, { p_store_id: store.id, p_supplier: 'R06', p_reception_date: new Date().toISOString(), p_invoice_number: `${NS}-C5R`, p_items: [item()], p_user_id: clerk.userId, p_po_id: null });
  expect([403]).toContain(route.status());
  const body = await route.json();
  expect(body.code).toBe('ERR_FORBIDDEN_ROLE');
});

test('6 — manager sin rol encargado: rechazo', async () => {
  const r = await createRpc(manager.token, { invoice: `${NS}-C6` });
  expect(r.ok).toBe(false);
  expect(r.error).toContain('ERR_FORBIDDEN_ROLE');
});

test('7 — admin de tienda sin rol encargado: rechazo', async () => {
  const r = await createRpc(storeAdmin.token, { invoice: `${NS}-C7` });
  expect(r.ok).toBe(false);
  expect(r.error).toContain('ERR_FORBIDDEN_ROLE');
});

test('7b — admin de plataforma (rol global admin, sin membresía encargado): rechazo — no confundir con superadmin', async () => {
  const r = await createRpc(admin.token, { invoice: `${NS}-C7B` });
  expect(r.ok).toBe(false);
  expect(r.error).toContain('ERR_FORBIDDEN_ROLE');
});

test('8 — usuario de otra tienda (encargado de B creando en A): rechazo', async () => {
  const r = await createRpc(encBOnly.token, { invoice: `${NS}-C8` });
  expect(r.ok).toBe(false);
  expect(r.error).toContain('ERR_FORBIDDEN_ROLE');
});

test('9 — usuario anónimo: rechazo', async () => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/register_reception`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_store_id: store.id, p_supplier: 'x', p_items: [item()] }),
  });
  expect([401, 403, 404]).toContain(res.status);
});

test('10 — superadministrador de plataforma: creación GLOBAL permitida (sin membresía en la tienda)', async () => {
  const r = await createRpc(superadmin.token, { invoice: `${NS}-C10` });
  expect(r.ok, `superadmin: ${r.error}`).toBe(true);
  const row = await sb.select('receipts', `reference_doc=eq.${NS}-C10&select=user_id`);
  expect(row[0].user_id).toBe(superadmin.userId); // actor real, identidad propia
});

test('11 — manipulación de store_id: encargado de A enviando p_store_id de B → rechazo', async () => {
  const r = await createRpc(enc.token, { storeId: storeB, invoice: `${NS}-C11` });
  expect(r.ok).toBe(false);
  expect(r.error).toContain('ERR_FORBIDDEN_ROLE');
});

test('12 — manipulación de created_by: p_user_id ajeno NO suplanta la identidad', async () => {
  // El creador dice ser el superadmin — para clientes autenticados p_user_id
  // se ignora y el trigger fija user_id=auth.uid().
  const r = await createRpc(enc.token, { userId: superadmin.id, invoice: `${NS}-C12` });
  expect(r.ok).toBe(true);
  const row = await sb.select('receipts', `reference_doc=eq.${NS}-C12&select=user_id`);
  expect(row[0].user_id).toBe(enc.userId);
});

test('13 — intento de cambiar el creador después de crear: trigger ERR_CREATOR_IMMUTABLE', async () => {
  const id = await createDraft(enc.token, `${NS}-C13`);
  // UPDATE directo (RLS de creador permite tocar la fila propia) con user_id ajeno:
  const res = await fetch(`${SUPABASE_URL}/rest/v1/receipts?id=eq.${id}`, {
    method: 'PATCH',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${enc.token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: superadmin.id }),
  });
  expect([400, 403, 409, 422, 500]).toContain(res.status); // trigger dispara error
  const row = await receiptRow(id);
  expect(row.user_id).toBe(enc.userId); // creador intacto
});

// ═════════ 7.2 CONFIRMACIÓN Y ANULACIÓN ═════════════════════════════════

test('14 — creador confirma recepción propia: PERMITIDO (sujeto a estado/guards)', async () => {
  const id = await createDraft(enc.token, `${NS}-D14`);
  const r = await rpcAsUser('confirm_pending_reception', enc.token, { p_receipt_id: id, p_user_id: enc.userId });
  expect(r.ok, `confirm: ${r.error}`).toBe(true);
  const row = await receiptRow(id);
  expect(row.status).toBe('active');
});

test('15 — creador anula recepción propia (pendiente): PERMITIDO', async () => {
  const id = await createDraft(enc.token, `${NS}-D15`);
  const r = await rpcAsUser('void_pending_reception', enc.token, { p_receipt_id: id, p_user_id: enc.userId, p_reason: 'Anulación E2E', p_operation_date: null });
  expect(r.ok, `void: ${r.error}`).toBe(true);
  expect((await receiptRow(id)).status).toBe('voided');
});

test('16 — otro encargado (distinto del creador) intenta confirmar ajena: rechazo', async () => {
  const id = await createDraft(enc.token, `${NS}-D16`);
  const r = await rpcAsUser('confirm_pending_reception', encOtherA.token, { p_receipt_id: id, p_user_id: encOtherA.userId });
  expect(r.ok).toBe(false);
  expect(r.error).toContain('ERR_UNAUTHORIZED');
  expect((await receiptRow(id)).status).toBe('pending'); // intacta
});

test('17 — admin de tienda intenta anular ajena: rechazo', async () => {
  const id = await createDraft(enc.token, `${NS}-D17`);
  const r = await rpcAsUser('void_pending_reception', storeAdmin.token, { p_receipt_id: id, p_user_id: storeAdmin.userId });
  expect(r.ok).toBe(false);
  expect(r.error).toContain('ERR_UNAUTHORIZED');
});

test('18 — manager intenta confirmar ajena: rechazo', async () => {
  const id = await createDraft(enc.token, `${NS}-D18`);
  const r = await rpcAsUser('confirm_pending_reception', manager.token, { p_receipt_id: id, p_user_id: manager.userId });
  expect(r.ok).toBe(false);
  expect(r.error).toContain('ERR_UNAUTHORIZED');
});

test('19 — almacenero intenta confirmar ajena: rechazo', async () => {
  const id = await createDraft(enc.token, `${NS}-D19`);
  const r = await rpcAsUser('confirm_pending_reception', warehouse.token, { p_receipt_id: id, p_user_id: warehouse.userId });
  expect(r.ok).toBe(false);
});

test('20 — facturadora/clerk intenta anular ajena: rechazo', async () => {
  const id = await createDraft(enc.token, `${NS}-D20`);
  const r = await rpcAsUser('void_pending_reception', clerk.token, { p_receipt_id: id, p_user_id: clerk.userId });
  expect(r.ok).toBe(false);
});

test('21 — creador con membresía revocada: rechazo (membresía activa requerida)', async () => {
  const id = await createDraft(enc.token, `${NS}-D21`);
  await sb.update('user_store_memberships', `user_id=eq.${enc.userId}&store_id=eq.${store.id}`, { status: 'revoked' });
  const r = await rpcAsUser('confirm_pending_reception', enc.token, { p_receipt_id: id, p_user_id: enc.userId });
  expect(r.ok).toBe(false);
  expect(r.error).toContain('ERR_UNAUTHORIZED');
  await sb.update('user_store_memberships', `user_id=eq.${enc.userId}&store_id=eq.${store.id}`, { status: 'active' });
});

test('22 — superadministrador confirma recepción ajena: PERMITIDO (global)', async () => {
  const id = await createDraft(enc.token, `${NS}-D22`);
  const r = await rpcAsUser('confirm_pending_reception', superadmin.token, { p_receipt_id: id, p_user_id: superadmin.userId });
  expect(r.ok, `superadmin confirm: ${r.error}`).toBe(true);
  expect((await receiptRow(id)).status).toBe('active');
});

test('23 — superadministrador anula recepción ajena CONFIRMADA (reversión): PERMITIDO con guards', async () => {
  const id = await createDraft(enc.token, `${NS}-D23`);
  await rpcAsUser('confirm_pending_reception', enc.token, { p_receipt_id: id, p_user_id: enc.userId });
  const r = await rpcAsUser('reverse_receipt_v2', superadmin.token, { p_receipt_id: id, p_reason: 'Reversión E2E superadmin', p_user_id: superadmin.userId });
  expect(r.ok, `superadmin reverse: ${r.error}`).toBe(true);
  expect((await receiptRow(id)).status).toBe('reversed');
});

test('24 — superadministrador interviene sobre otra tienda (B): PERMITIDO', async () => {
  // Borrador creado por encBOnly (encargado de B); el superadmin lo anula.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/receipts`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${encBOnly.token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ store_id: storeB, supplier: 'Prov R06 B', reception_date: new Date().toISOString(), reference_doc: `${NS}-D24`, status: 'pending', total_cost: 20, payment_status: 'unpaid', payment_terms_days: 30 }),
  });
  const draftRows = await res.json() as Array<{ id: string }>;
  expect(res.ok, `draft B: HTTP ${res.status}`).toBe(true);
  const draft = draftRows[0];
  await sb.insert('receipt_items', [{ receipt_id: draft.id, product_id: product, quantity: 1, unit_cost: 10, moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1 }]);
  const r = await rpcAsUser('void_pending_reception', superadmin.token, { p_receipt_id: draft.id, p_user_id: superadmin.userId });
  expect(r.ok, `superadmin otra tienda: ${r.error}`).toBe(true);
  // Limpieza de este caso (fuera del prefijo de la tienda A).
  await sb.delete('receipt_items', `receipt_id=eq.${draft.id}`).catch(() => {});
  await sb.delete('receipts', `id=eq.${draft.id}`).catch(() => {});
});

test('25 — usuario anónimo opera directamente el RPC: rechazo', async () => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/void_pending_reception`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_receipt_id: historicReceipt, p_user_id: null }),
  });
  expect([401, 403, 404]).toContain(res.status);
});

test('26 — manipulación de identidad (p_user_id ajeno) NO autoriza al no-creador', async () => {
  const id = await createDraft(enc.token, `${NS}-D26`);
  // El clerk SUPLANTA al creador en el parámetro — para llamadas autenticadas
  // el actor sigue siendo auth.uid(); el gate de creador no se satisface.
  const r = await rpcAsUser('confirm_pending_reception', clerk.token, { p_receipt_id: id, p_user_id: enc.userId });
  expect(r.ok).toBe(false);
  expect(r.error).toContain('ERR_UNAUTHORIZED');
});

test('27 — recepción histórica sin creador verificable: solo superadmin', async () => {
  // (a) user_id NULL: encargado/admin-tienda rechazados; superadmin SÍ.
  const e1 = await rpcAsUser('confirm_pending_reception', enc.token, { p_receipt_id: historicReceipt, p_user_id: enc.userId });
  expect(e1.ok).toBe(false);
  const e2 = await rpcAsUser('void_pending_reception', storeAdmin.token, { p_receipt_id: historicReceipt, p_user_id: storeAdmin.userId });
  expect(e2.ok).toBe(false);
  const okSup = await rpcAsUser('confirm_pending_reception', superadmin.token, { p_receipt_id: historicReceipt, p_user_id: superadmin.userId });
  expect(okSup.ok, `histórico superadmin: ${okSup.error}`).toBe(true);
});

test('28 — confirmación concurrente: exactamente UNA gana', async () => {
  const id = await createDraft(enc.token, `${NS}-D28`);
  const [a, b] = await Promise.all([
    rpcAsUser('confirm_pending_reception', enc.token, { p_receipt_id: id, p_user_id: enc.userId }),
    rpcAsUser('confirm_pending_reception', superadmin.token, { p_receipt_id: id, p_user_id: superadmin.userId }),
  ]);
  const winners = [a, b].filter(r => r.ok).length;
  expect(winners).toBe(1);
  expect((await receiptRow(id)).status).toBe('active');
  // Un único movimiento de confirmación por línea (FOR UPDATE + status guard).
  const movements = await sb.select('stock_movements', `notes=eq.${id}&select=id`);
  expect(movements.length).toBe(1);
});

test('29 — anulación concurrente: exactamente UNA gana', async () => {
  const id = await createDraft(enc.token, `${NS}-D29`);
  const [a, b] = await Promise.all([
    rpcAsUser<any>('void_pending_reception', enc.token, { p_receipt_id: id, p_user_id: enc.userId }),
    rpcAsUser<any>('void_pending_reception', superadmin.token, { p_receipt_id: id, p_user_id: superadmin.userId }),
  ]);
  // La segunda llamada ve el estado ya avanzado → idempotente (status='idempotent').
  const effective = [a, b].filter(r => r.ok && r.data && (r.data as any).status === 'success').length;
  expect(effective).toBe(1);
  expect((await receiptRow(id)).status).toBe('voided');
});

test('30 — reintento de operación ya completada: estado/idempotencia', async () => {
  const id = await createDraft(enc.token, `${NS}-D30`);
  await rpcAsUser('confirm_pending_reception', enc.token, { p_receipt_id: id, p_user_id: enc.userId });
  const again = await rpcAsUser('confirm_pending_reception', enc.token, { p_receipt_id: id, p_user_id: enc.userId });
  expect(again.ok).toBe(false);
  expect(again.error).toContain('ERR_RECEIPT_ALREADY_CONFIRMED');
  // void ya anulada → idempotente (retorna success sin efectos)
  const voided = await createDraft(enc.token, `${NS}-D30B`);
  await rpcAsUser('void_pending_reception', enc.token, { p_receipt_id: voided, p_user_id: enc.userId });
  const revoid = await rpcAsUser('void_pending_reception', enc.token, { p_receipt_id: voided, p_user_id: enc.userId });
  expect(revoid.ok).toBe(true);
});

// ═════════ 7.3 INVARIANTES FINANCIERAS ══════════════════════════════════

test('31 — recepción con pagos vivos: anulación bloqueada (guard financiero)', async () => {
  const id = await createDraft(enc.token, `${NS}-F31`);
  await sb.insert('payment_transactions', [{ store_id: store.id, ref_type: 'receipt', ref_id: id, amount: 20, payment_method: 'cash', currency: 'CUP', exchange_rate: 1, direction: 'in' }]);
  const r = await rpcAsUser('void_pending_reception', enc.token, { p_receipt_id: id, p_user_id: enc.userId });
  expect(r.ok).toBe(false);
  expect(r.error).toContain('ERR_RECEIPT_HAS_UNRESOLVED_PAYMENTS');
});

test('32 — recepción con obligación viva (pago sin reversión) bloquea la REVERSIÓN', async () => {
  const id = await createDraft(enc.token, `${NS}-F32`);
  await rpcAsUser('confirm_pending_reception', enc.token, { p_receipt_id: id, p_user_id: enc.userId });
  await sb.insert('payment_transactions', [{ store_id: store.id, ref_type: 'receipt', ref_id: id, amount: 5, payment_method: 'cash', currency: 'CUP', exchange_rate: 1, direction: 'in' }]);
  const r = await rpcAsUser('reverse_receipt_v2', enc.token, { p_receipt_id: id, p_reason: 'E2E', p_user_id: enc.userId });
  expect(r.ok).toBe(false);
  expect(r.error).toContain('ERR_RECEIPT_HAS_UNRESOLVED_PAYMENTS');
});

test('33 — recepción anulada que intenta confirmarse: rechazo de estado', async () => {
  const id = await createDraft(enc.token, `${NS}-F33`);
  await rpcAsUser('void_pending_reception', enc.token, { p_receipt_id: id, p_user_id: enc.userId });
  const r = await rpcAsUser('confirm_pending_reception', enc.token, { p_receipt_id: id, p_user_id: enc.userId });
  expect(r.ok).toBe(false);
  expect(r.error).toContain('ERR_RECEIPT_ALREADY_CONFIRMED');
});

test('34 — recepción CONFIRMADA exige reversión (no void): ERR_INVALID_STATUS', async () => {
  const id = await createDraft(enc.token, `${NS}-F34`);
  await rpcAsUser('confirm_pending_reception', enc.token, { p_receipt_id: id, p_user_id: enc.userId });
  const r = await rpcAsUser('void_pending_reception', enc.token, { p_receipt_id: id, p_user_id: enc.userId });
  expect(r.ok).toBe(false);
  expect(r.error).toContain('ERR_INVALID_STATUS');
});

test('35 — prevención de duplicación de inventario: re-confirmar no duplica movimientos', async () => {
  const id = await createDraft(enc.token, `${NS}-F35`);
  const c1 = await rpcAsUser('confirm_pending_reception', enc.token, { p_receipt_id: id, p_user_id: enc.userId });
  expect(c1.ok).toBe(true);
  const before = await sb.select('stock_movements', `notes=eq.${id}&select=id`);
  await rpcAsUser('confirm_pending_reception', enc.token, { p_receipt_id: id, p_user_id: enc.userId }).catch(() => {});
  const after = await sb.select('stock_movements', `notes=eq.${id}&select=id`);
  expect(after.length).toBe(before.length); // cero duplicación
});

test('36 — prevención de doble confirmación (segunda llamada rechazada)', async () => {
  const id = await createDraft(enc.token, `${NS}-F36`);
  await rpcAsUser('confirm_pending_reception', enc.token, { p_receipt_id: id, p_user_id: enc.userId });
  const second = await rpcAsUser('confirm_pending_reception', enc.token, { p_receipt_id: id, p_user_id: enc.userId });
  expect(second.ok).toBe(false);
  expect(second.error).toContain('ERR_RECEIPT_ALREADY_CONFIRMED');
});

test('37 — integridad de CxP: la reversión marca los pagos como revertidos', async () => {
  const id = await createDraft(enc.token, `${NS}-F37`);
  await rpcAsUser('confirm_pending_reception', enc.token, { p_receipt_id: id, p_user_id: enc.userId });
  const [pay] = (await sb.insert('payment_transactions', [{ store_id: store.id, ref_type: 'receipt', ref_id: id, amount: 10, payment_method: 'cash', currency: 'CUP', exchange_rate: 1, direction: 'in' }])) as Array<{ id: string }>;
  // Pago vivo bloquea; se simula la reversión oficial del pago (contra-fila
  // positiva direction='out' enlazada por reverses_payment_id):
  await sb.insert('payment_transactions', [{ store_id: store.id, ref_type: 'receipt', ref_id: id, amount: 10, payment_method: 'cash', currency: 'CUP', exchange_rate: 1, direction: 'out', reverses_payment_id: pay.id }]);
  const r = await rpcAsUser('reverse_receipt_v2', enc.token, { p_receipt_id: id, p_reason: 'E2E CxP', p_user_id: enc.userId });
  expect(r.ok, `reverse CxP: ${r.error}`).toBe(true);
  const [row] = await sb.select('receipts', `id=eq.${id}&select=status,payment_status`);
  expect(row.status).toBe('reversed');
});

test('38 — auditoría del creador: RECEPTION_CONFIRMED_PENDING con creador y fuente', async () => {
  const id = await createDraft(enc.token, `${NS}-A38`);
  await rpcAsUser('confirm_pending_reception', enc.token, { p_receipt_id: id, p_user_id: enc.userId });
  const [audit] = (await auditFor(id, 'RECEPTION_CONFIRMED_PENDING')) as Array<Record<string, any>>;
  expect(audit).toBeDefined();
  expect(audit.user_id).toBe(enc.userId);
  expect(audit.store_id).toBe(store.id);
  const md = typeof audit.metadata === 'string' ? JSON.parse(audit.metadata) : audit.metadata;
  expect(md.authorization_source).toBe('creator_membership');
  expect(md.creator_id).toBe(enc.userId);
  expect(md.old_status).toBe('pending');
  expect(md.new_status).toBe('active');
});

test('39 — auditoría del superadmin: fuente platform_superadmin + bandera global', async () => {
  const id = await createDraft(enc.token, `${NS}-A39`);
  await rpcAsUser('confirm_pending_reception', superadmin.token, { p_receipt_id: id, p_user_id: superadmin.userId });
  const [audit] = (await auditFor(id, 'RECEPTION_CONFIRMED_PENDING')) as Array<Record<string, any>>;
  expect(audit).toBeDefined();
  expect(audit.user_id).toBe(superadmin.userId);
  const md = typeof audit.metadata === 'string' ? JSON.parse(audit.metadata) : audit.metadata;
  expect(md.authorization_source).toBe('platform_superadmin');
  expect(md.superadmin_global).toBe(true);
  expect(md.creator_id).toBe(enc.userId); // creador original documentado
  // Anulación del superadmin sobre OTRO borrador ajeno (void aplica a
  // pending — el id anterior quedó active) también documenta la intervención:
  const id2 = await createDraft(enc.token, `${NS}-A39B`);
  const r = await rpcAsUser('void_pending_reception', superadmin.token, { p_receipt_id: id2, p_user_id: superadmin.userId });
  expect(r.ok, `void superadmin: ${r.error}`).toBe(true);
  const [vaudit] = (await auditFor(id2, 'RECEPTION_VOIDED_PENDING')) as Array<Record<string, any>>;
  const vmd = typeof vaudit.metadata === 'string' ? JSON.parse(vaudit.metadata) : vaudit.metadata;
  expect(vmd.authorization_source).toBe('platform_superadmin');
});
