/**
 * E2E — ADN-SERVICES-RECEIVED-POSTMERGE-HARDENING-009 (proyecto 'creation', BD aislada)
 * ============================================================================
 * Matriz bloqueante §11 — cada prueba REPRODUCE el defecto detectado y demuestra
 * que ya no ocurre (misión §13: "no bastan los tests anteriores"):
 *
 *   P0 §3  external_transfer: recorrido COMPLETO formulario→contabilización
 *          (USD y EUR según catálogo), sin diferencias frontend/API/RPC/CP-FIN;
 *          zelle nuevo NUNCA se persiste como valor (normalización canónica);
 *          combinaciones incompatibles rechazadas temprano.
 *   P0 §4  CONCURRENCIA REAL (dos sesiones de BD): batch vs batch e individual
 *          vs batch sobre el mismo saldo → NUNCA sobrepago, resultado
 *          determinista y conciliado; sin asientos huérfanos ni duplicados.
 *   P0 §5  ACL en RPC directas: sin identidad rechazada; cajero sin gestión
 *          rechazado; usuario de otra tienda rechazado; actor suplantado vía
 *          parámetro IMPOSIBLE (auth.uid() manda).
 *   P0 §6  proveedor de otra tienda / maestro de otro tenant → rechazados.
 *   P1 §7  doble creación con la misma creation_key (CONCURRENTE) → un solo
 *          borrador; reintento secuencial → mismo borrador (duplicate).
 *   P1 §8  reintento tras respuesta perdida → un solo lote financiero (replay).
 *   P1 §9  limpieza (NULL persistido), restablecimiento de fecha al día
 *          operativo Habana y campos omitidos conservados.
 *   Regresión: efectivo CUP, flujo de borradores 008 (crear→editar→confirmar).
 *
 * Limpieza: tiendas efímeras del run con hard delete (net-zero) + usuarios de
 * prueba eliminados (auth admin + memberships).
 * ============================================================================
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { Client } from 'pg';
import {
  signIn, apiHeaders, sb, createTestStore, requireIsolatedCreation, rpcAsService, rpcAsUser,
  SUPABASE_URL, ADMIN_EMAIL,
} from '../fixtures/session.fixture';
import { hardDeleteTestStore } from '../fixtures/hard-cleanup';

requireIsolatedCreation();

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || process.env.ADMIN_PASS || '';
const RUN_ID = process.env.E2E_RUN_ID || new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const POOLER_HOST = process.env.E2E_POOLER_HOST || 'aws-0-us-east-1.pooler.supabase.com';

const HAVANA_TODAY = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Havana' }).format(new Date());

let storeA = '';
let storeB = '';
let adminToken = '';
let adminUserId = '';
const createdStoreIds: string[] = [];
const createdUserIds: string[] = [];
let managerA = { id: '', token: '' };   // gestor autorizado de la tienda A
let clerkA = { id: '', token: '' };     // cajero SIN permiso de gestión
let managerB = { id: '', token: '' };   // gestor de la OTRA tienda
const serviceIds: string[] = [];

/** Sesión pg directa (pooler de sesión) con claims JWT de un actor — los RPC
 *  leen auth.uid()/auth.role() de request.jwt.claims (patrón Supabase). */
async function openPgSession(actorId: string, role = 'authenticated') {
  const dbPass = decodeURIComponent(new URL(process.env.E2E_SUPABASE_DB_URL || '').password);
  const c = new Client({
    host: POOLER_HOST, port: Number(process.env.E2E_POOLER_PORT || 5432),
    user: `postgres.${process.env.E2E_ALLOWED_REMOTE_REF || 'lguovmvrozxgssupkwpf'}`,
    database: 'postgres', password: dbPass, ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  await c.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: actorId, role })]);
  return c;
}

async function createTestUser(email: string, password: string, membershipRole: string, storeId: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`createTestUser ${email}: ${res.status} ${await res.text()}`);
  const { id: userId } = (await res.json()) as { id: string };
  createdUserIds.push(userId);
  await sb.insert('user_store_memberships', [{ user_id: userId, store_id: storeId, role: membershipRole, status: 'active' }]);
  const session = await signIn(email, password);
  expect(session.token).toBeTruthy();
  return { id: userId, token: session.token };
}

test.describe.serial('ADN-009 · endurecimiento post-merge Servicios Recibidos', () => {
  test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
    const auth = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    adminToken = auth.token;
    adminUserId = auth.userId;
    const a = await createTestStore(request, adminToken, 'ADN009 SR A');
    const b = await createTestStore(request, adminToken, 'ADN009 SR B');
    storeA = a.id; storeB = b.id;
    createdStoreIds.push(storeA, storeB);
    await sb.update('profiles', `id=eq.${adminUserId}`, { active_store_id: storeA });
    managerA = await createTestUser(`m009-mgr-a-${RUN_ID}@e2e.costpro.local`, 'M009-pass-1!', 'manager', storeA);
    clerkA = await createTestUser(`m009-clk-a-${RUN_ID}@e2e.costpro.local`, 'M009-pass-2!', 'clerk', storeA);
    managerB = await createTestUser(`m009-mgr-b-${RUN_ID}@e2e.costpro.local`, 'M009-pass-3!', 'manager', storeB);
  });

  test.afterAll(async () => {
    for (const storeId of createdStoreIds) {
      await hardDeleteTestStore(storeId).catch(() => {});
    }
    for (const userId of createdUserIds) {
      await sb.delete('user_store_memberships', `user_id=eq.${userId}`).catch(() => {});
      await sb.delete('profiles', `id=eq.${userId}`).catch(() => {});
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      }).catch(() => {});
    }
  });

  /** POST con backoff del rate limit (10/min en /api/payments). */
  async function withRlBackoff(fn: () => Promise<{ status: number; text: () => Promise<string> }>) {
    let res = await fn();
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 65_000));
      res = await fn();
    }
    return res;
  }

  async function serviceRow(id: string) {
    return (await sb.select<Record<string, any>>('received_services', `id=eq.${id}&select=*`))[0];
  }
  async function paymentsOf(id: string) {
    return sb.select<Record<string, any>>('payment_transactions', `ref_type=eq.service&ref_id=eq.${id}&select=*&order=payment_date.asc`);
  }
  async function finEntriesOf(id: string) {
    return sb.select<Record<string, any>>('fin_entries', `document_type=eq.SERVICIO_RECIBIDO&document_id=eq.${id}&select=*`);
  }
  async function movementsOf(entryIds: string[]) {
    if (entryIds.length === 0) return [];
    return sb.select<Record<string, any>>('fin_movements', `select=*&entry_id=in.(${entryIds.join(',')})`);
  }

  /** Confirma un servicio (borrador → active) por el canal canónico. */
  async function confirmService(serviceId: string) {
    const res = await fetch('http://localhost:3000/api/received-services', {
      method: 'PATCH', headers: apiHeaders(managerA.token),
      body: JSON.stringify({ service_id: serviceId, status: 'active', reason: 'ADN-009' }),
    });
    expect(res.status()).toBe(200);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // P0 §3 — TRANSFERENCIA EXTERIOR: recorrido completo hasta contabilización
  // ══════════════════════════════════════════════════════════════════════════
  test('T1 · Transferencia Exterior USD — registro completo y cuenta ACT_TRANSF_EXTERIOR correcta', async () => {
    test.setTimeout(120_000);
    // Servicio de 40.000 CUP liquidado con Transf. Exterior USD 100 @ 400.
    const res = await withRlBackoff(() => fetch('http://localhost:3000/api/received-services', {
      method: 'POST', headers: apiHeaders(managerA.token),
      body: JSON.stringify({
        store_id: storeA, supplier: 'Proveedor Exterior USD', total_amount: 40000,
        currency: 'CUP', exchange_rate: 1, service_date: HAVANA_TODAY(),
      }),
    }));
    expect(res.status()).toBe(201);
    const { data: created } = await res.json();
    serviceIds.push(created.id);
    await confirmService(created.id);

    const pay = await withRlBackoff(() => fetch('http://localhost:3000/api/payments', {
      method: 'POST', headers: apiHeaders(managerA.token),
      body: JSON.stringify({
        ref_type: 'service', ref_id: created.id,
        payments: [{ payment_method: 'external_transfer', amount: 100, currency: 'USD', exchange_rate: 400, reference: 'EXT-USD-1' }],
        idempotency_key: `m009-ext-usd-${RUN_ID}`,
      }),
    }));
    expect(pay.status()).toBe(201);

    const rows = await paymentsOf(created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].payment_method).toBe('external_transfer');   // valor canónico persistido
    expect(Number(rows[0].amount)).toBe(100);
    expect(Number(rows[0].amount_cup)).toBe(40000);             // equivalente contable a tasa servidor

    // CP-FIN: un asiento 'pago' por componente con la cuenta canónica.
    const entries = await finEntriesOf(created.id);
    const movs = await movementsOf(entries.map((e) => e.id));
    const cuentas = new Set(movs.map((m) => m.category_code));
    expect(cuentas.has('ACT_TRANSF_EXTERIOR')).toBe(true);
    expect(cuentas.has('PAS_SERV_PEND')).toBe(true);
    const deb = movs.filter((m) => m.sense === 'debito').reduce((s, m) => s + Number(m.amount_cup), 0);
    const cred = movs.filter((m) => m.sense === 'credito').reduce((s, m) => s + Number(m.amount_cup), 0);
    expect(Math.abs(deb - cred)).toBeLessThan(0.01);            // partida doble equilibrada
    const pasNet = movs.filter((m) => m.category_code === 'PAS_SERV_PEND')
      .reduce((s, m) => s + (m.sense === 'credito' ? Number(m.amount_cup) : -Number(m.amount_cup)), 0);
    expect(Math.abs(pasNet)).toBeLessThan(0.01);                // obligación cancelada a cero
  });

  test('T2 · Transferencia Exterior EUR — registrada si el catálogo la permite (misma cuenta)', async () => {
    test.setTimeout(120_000);
    const cat = await sb.select<Record<string, any>>('fin_account_mapping', `payment_method=eq.external_transfer&currency=eq.EUR&select=is_active`);
    const eurPermitida = cat[0]?.is_active === true;
    const res = await withRlBackoff(() => fetch('http://localhost:3000/api/received-services', {
      method: 'POST', headers: apiHeaders(managerA.token),
      body: JSON.stringify({
        store_id: storeA, supplier: 'Proveedor Exterior EUR', total_amount: 44000,
        currency: 'CUP', exchange_rate: 1, service_date: HAVANA_TODAY(),
      }),
    }));
    expect(res.status()).toBe(201);
    const { data: created } = await res.json();
    serviceIds.push(created.id);
    await confirmService(created.id);

    const pay = await withRlBackoff(() => fetch('http://localhost:3000/api/payments', {
      method: 'POST', headers: apiHeaders(managerA.token),
      body: JSON.stringify({
        ref_type: 'service', ref_id: created.id,
        payments: [{ payment_method: 'external_transfer', amount: 100, currency: 'EUR', exchange_rate: 440, reference: 'EXT-EUR-1' }],
        idempotency_key: `m009-ext-eur-${RUN_ID}`,
      }),
    }));
    if (eurPermitida) {
      expect(pay.status()).toBe(201);
      const rows = await paymentsOf(created.id);
      expect(rows[0].payment_method).toBe('external_transfer');
      const entries = await finEntriesOf(created.id);
      const movs = await movementsOf(entries.map((e) => e.id));
      expect(new Set(movs.map((m) => m.category_code)).has('ACT_TRANSF_EXTERIOR')).toBe(true);
    } else {
      expect(pay.status()).toBe(400);  // catálogo cerrado → rechazo, jamás escritura
    }
  });

  test('T3 · Nuevo pago legacy zelle → NUNCA se persiste como valor (normalizado al canónico)', async () => {
    test.setTimeout(120_000);
    const res = await withRlBackoff(() => fetch('http://localhost:3000/api/received-services', {
      method: 'POST', headers: apiHeaders(managerA.token),
      body: JSON.stringify({
        store_id: storeA, supplier: 'Proveedor Legacy', total_amount: 400,
        currency: 'CUP', exchange_rate: 1, service_date: HAVANA_TODAY(),
      }),
    }));
    const { data: created } = await res.json();
    serviceIds.push(created.id);
    await confirmService(created.id);

    const pay = await withRlBackoff(() => fetch('http://localhost:3000/api/payments', {
      method: 'POST', headers: apiHeaders(managerA.token),
      body: JSON.stringify({
        ref_type: 'service', ref_id: created.id,
        payments: [{ payment_method: 'zelle', amount: 1, currency: 'USD', exchange_rate: 400, reference: 'LEGACY-ZELLE' }],
        idempotency_key: `m009-zelle-${RUN_ID}`,
      }),
    }));
    expect(pay.status()).toBe(201);  // compat de ingesta: se acepta y se normaliza

    const rows = await paymentsOf(created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].payment_method).toBe('external_transfer');   // canónico en la fila NUEVA
    // y NINGUNA fila nueva del documento lleva 'zelle' (escritura nueva rechazada)
    expect(rows.every((r: any) => r.payment_method !== 'zelle')).toBe(true);
  });

  test('T4 · Combinación incompatible (external_transfer + CUP) → rechazo accionable, cero escrituras', async () => {
    test.setTimeout(120_000);
    const res = await withRlBackoff(() => fetch('http://localhost:3000/api/received-services', {
      method: 'POST', headers: apiHeaders(managerA.token),
      body: JSON.stringify({
        store_id: storeA, supplier: 'Proveedor Rechazo', total_amount: 500,
        currency: 'CUP', exchange_rate: 1, service_date: HAVANA_TODAY(),
      }),
    }));
    const { data: created } = await res.json();
    serviceIds.push(created.id);
    await confirmService(created.id);

    const pay = await withRlBackoff(() => fetch('http://localhost:3000/api/payments', {
      method: 'POST', headers: apiHeaders(managerA.token),
      body: JSON.stringify({
        ref_type: 'service', ref_id: created.id,
        payments: [{ payment_method: 'external_transfer', amount: 10, currency: 'CUP', exchange_rate: 1 }],
      }),
    }));
    expect(pay.status()).toBe(400);
    const body = await pay.json();
    expect(body.error).toContain('ERR_COMPONENT_INVALID');
    expect((await paymentsOf(created.id)).length).toBe(0);      // cero escrituras
  });

  // ══════════════════════════════════════════════════════════════════════════
  // P0 §4 — CONCURRENCIA REAL (dos sesiones de BD)
  // ══════════════════════════════════════════════════════════════════════════
  test('T5 · Pago batch CONCURRENTE (batch vs batch) → sin sobrepago, resultado conciliado', async () => {
    test.setTimeout(180_000);
    const res = await withRlBackoff(() => fetch('http://localhost:3000/api/received-services', {
      method: 'POST', headers: apiHeaders(managerA.token),
      body: JSON.stringify({
        store_id: storeA, supplier: 'Concurrencia BB', total_amount: 100,
        currency: 'CUP', exchange_rate: 1, service_date: HAVANA_TODAY(),
      }),
    }));
    const { data: created } = await res.json();
    serviceIds.push(created.id);
    await confirmService(created.id);

    const pg1 = await openPgSession(managerA.id);
    const pg2 = await openPgSession(managerB.id);
    try {
      const lot = () => JSON.stringify([{ payment_method: 'cash', amount: 60, currency: 'CUP', exchange_rate: 1 }]);
      const [r1, r2] = await Promise.allSettled([
        pg1.query('SELECT public.register_supplier_payment_batch($1, \'service\', $2, $3::jsonb, $4::uuid, NULL, $5) AS out', [storeA, created.id, lot('k1'), managerA.id, `m009-conc-bb-1-${RUN_ID}`]),
        pg2.query('SELECT public.register_supplier_payment_batch($1, \'service\', $2, $3::jsonb, $4::uuid, NULL, $5) AS out', [storeA, created.id, lot('k2'), managerB.id, `m009-conc-bb-2-${RUN_ID}`]),
      ]);
      const outcomes = [r1, r2].map((r) => (r.status === 'fulfilled' ? 'ok' : String((r as PromiseRejectedResult).reason).slice(0, 400)));
      const ok = outcomes.filter((o) => o === 'ok').length;
      // 60 + 60 > 100: con la serialización compartida EXACTAMENTE uno confirma;
      // el otro lee el saldo ya actualizado y muere con ERR_BATCH_OVERPAY.
      expect(ok).toBe(1);
      const failed = outcomes.find((o) => o !== 'ok') as string;
      expect(failed).toContain('ERR_BATCH_OVERPAY');

      // Conciliado: el total de pagos JAMÁS supera el importe exigible.
      const rows = await paymentsOf(created.id);
      const total = rows.reduce((s, r) => s + Number(r.amount), 0);
      expect(total).toBeLessThanOrEqual(100 + 1e-6);
      expect(rows).toHaveLength(1);
      // Sin asientos huérfanos ni duplicados: 1 pago → 1 asiento equilibrado.
      const entries = await finEntriesOf(created.id);
      expect(entries.filter((e) => (e as any).entry_type === 'pago').length).toBe(1);
      const movs = await movementsOf(entries.map((e) => e.id));
      const deb = movs.filter((m) => m.sense === 'debito').reduce((s, m) => s + Number(m.amount_cup), 0);
      const cred = movs.filter((m) => m.sense === 'credito').reduce((s, m) => s + Number(m.amount_cup), 0);
      expect(Math.abs(deb - cred)).toBeLessThan(0.01);
    } finally {
      await pg1.end().catch(() => {});
      await pg2.end().catch(() => {});
    }
  });

  test('T6 · Pago INDIVIDUAL concurrente con un batch → sin sobrepago (mismo mecanismo)', async () => {
    test.setTimeout(180_000);
    const res = await withRlBackoff(() => fetch('http://localhost:3000/api/received-services', {
      method: 'POST', headers: apiHeaders(managerA.token),
      body: JSON.stringify({
        store_id: storeA, supplier: 'Concurrencia IB', total_amount: 100,
        currency: 'CUP', exchange_rate: 1, service_date: HAVANA_TODAY(),
      }),
    }));
    const { data: created } = await res.json();
    serviceIds.push(created.id);
    await confirmService(created.id);

    const pg1 = await openPgSession(managerA.id);
    const pg2 = await openPgSession(managerB.id);
    try {
      const [r1, r2] = await Promise.allSettled([
        pg1.query('SELECT public.register_supplier_payment($1, \'service\', $2, 60, \'cash\', $3::uuid, \'CUP\', 1, NULL, NULL, $4, NULL)', [storeA, created.id, managerA.id, `m009-conc-ib-1-${RUN_ID}`]),
        pg2.query('SELECT public.register_supplier_payment_batch($1, \'service\', $2, $3::jsonb, $4::uuid, NULL, $5)', [storeA, created.id, JSON.stringify([{ payment_method: 'cash', amount: 60, currency: 'CUP', exchange_rate: 1 }]), managerB.id, `m009-conc-ib-2-${RUN_ID}`]),
      ]);
      const ok = [r1, r2].filter((r) => r.status === 'fulfilled').length;
      expect(ok).toBe(1);   // uno confirma; el otro ve el saldo actualizado → overpay
      const rows = await paymentsOf(created.id);
      const total = rows.reduce((s, r) => s + Number(r.amount), 0);
      expect(total).toBeLessThanOrEqual(100 + 1e-6);
      const entries = await finEntriesOf(created.id);
      expect(entries.filter((e) => (e as any).entry_type === 'pago').length).toBe(1);
    } finally {
      await pg1.end().catch(() => {});
      await pg2.end().catch(() => {});
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // P1 §7 — IDEMPOTENCIA REAL DE BORRADORES
  // ══════════════════════════════════════════════════════════════════════════
  test('T7 · Doble creación CON la misma creation_key (concurrencia) → UN solo borrador', async () => {
    test.setTimeout(180_000);
    const pg1 = await openPgSession(managerA.id);
    const pg2 = await openPgSession(managerA.id);
    const key = `m009-idem-key-${RUN_ID}`;
    const args = {
      p_store_id: storeA, p_supplier: null, p_total_amount: 77, p_service_type_id: null,
      p_service_type_name: 'Otro', p_service_date: HAVANA_TODAY(), p_currency: 'CUP',
      p_exchange_rate: 1, p_payment_terms_days: 30, p_distribution_method: 'amount',
      p_reference_doc: null, p_observations: null, p_receipt_ids: [], p_production_order_ids: [],
      p_created_by: managerA.id, p_supplier_id: null, p_supplier_master_party_id: null,
      p_supplier_meta: null, p_creation_key: key,
    };
    try {
      const [r1, r2] = await Promise.allSettled([
        pg1.query('SELECT public.create_received_service_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)',
          Object.values(args)),
        pg2.query('SELECT public.create_received_service_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)',
          Object.values(args)),
      ]);
      const results = [r1, r2]
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map((r) => r.value.rows[0].out);
      expect(results).toHaveLength(2);          // ambas solicitudes resuelven
      const ids = new Set(results.map((r) => r.service_id));
      expect(ids.size).toBe(1);                 // EL MISMO borrador
      expect(results.filter((r) => r.duplicate === true).length).toBeGreaterThanOrEqual(1);
      // y en la BD existe exactamente UN borrador para esa clave
      const audits = await sb.select<Record<string, any>>(
        'audit_logs', `action=eq.SERVICE_DRAFT_CREATED&store_id=eq.${storeA}&metadata->>creation_key=eq.${key}&select=record_id`,
      );
      expect(audits).toHaveLength(1);
    } finally {
      await pg1.end().catch(() => {});
      await pg2.end().catch(() => {});
    }
  });

  test('T8 · Reintento secuencial con la misma clave → mismo borrador (duplicate, sin fila nueva)', async () => {
    const key = `m009-idem-seq-${RUN_ID}`;
    const params = {
      p_store_id: storeA, p_supplier: null, p_total_amount: 55, p_service_type_id: null,
      p_service_type_name: 'Otro', p_service_date: HAVANA_TODAY(), p_currency: 'CUP',
      p_exchange_rate: 1, p_payment_terms_days: 30, p_distribution_method: 'amount',
      p_reference_doc: null, p_observations: 'obs-idem', p_receipt_ids: [], p_production_order_ids: [],
      p_created_by: managerA.id, p_supplier_id: null, p_supplier_master_party_id: null,
      p_supplier_meta: null, p_creation_key: key,
    };
    const first = await rpcAsUser('create_received_service_draft', managerA.token, params);
    expect(first.ok).toBe(true);
    const second = await rpcAsUser('create_received_service_draft', managerA.token, params);
    expect(second.ok).toBe(true);
    expect(second.data.service_id).toBe(first.data.service_id);
    expect(second.data.duplicate).toBe(true);
    const audits = await sb.select<Record<string, any>>(
      'audit_logs', `action=eq.SERVICE_DRAFT_CREATED&store_id=eq.${storeA}&metadata->>creation_key=eq.${key}&select=record_id`,
    );
    expect(audits).toHaveLength(1);
    serviceIds.push(first.data.service_id);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // P0 §5 — CONTROL DE ACCESO A LAS RPC (llamadas DIRECTAS por PostgREST)
  // ══════════════════════════════════════════════════════════════════════════
  test('T9 · RPC directa sin identidad (anon) → rechazada', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_received_service_draft`, {
      method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_store_id: storeA, p_total_amount: 10 }),
    });
    expect(res.ok).toBe(false);
    // y nada se creó para ese intento anónimo
    const drafts = await sb.select<Record<string, any>>(
      'received_services', `store_id=eq.${storeA}&status=eq.draft&select=id`,
    );
    expect(drafts.every((d) => !d.supplier && Number(d.total_amount) !== 10)).toBe(true);
  });

  test('T10 · Cajero (clerk) SIN permiso de gestión → rechazado por el gate DENTRO del RPC', async () => {
    const res = await rpcAsUser('create_received_service_draft', clerkA.token, {
      p_store_id: storeA, p_supplier: null, p_total_amount: 10, p_service_date: HAVANA_TODAY(),
      p_created_by: clerkA.id, p_creation_key: null,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('ERR_UNAUTHORIZED');
  });

  test('T11 · Usuario de OTRA tienda → rechazado (la gestión se exige en la tienda objetivo)', async () => {
    const res = await rpcAsUser('create_received_service_draft', managerB.token, {
      p_store_id: storeA, p_supplier: null, p_total_amount: 10, p_service_date: HAVANA_TODAY(),
      p_created_by: managerB.id, p_creation_key: null,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('ERR_UNAUTHORIZED');
  });

  test('T12 · Actor SUPPLANTADO vía p_created_by → IMPOSIBLE: el actor real es auth.uid()', async () => {
    const res = await rpcAsUser('create_received_service_draft', managerA.token, {
      p_store_id: storeA, p_supplier: null, p_total_amount: 66, p_service_date: HAVANA_TODAY(),
      p_created_by: clerkA.id,  // el llamante intenta suplantar al cajero
      p_creation_key: null,
    });
    expect(res.ok).toBe(true);   // el gestor SÍ puede crear…
    const row = await serviceRow(res.data.service_id);
    expect(row.created_by).toBe(managerA.id);   // …pero la identidad es SUYA, no la suplantada
    serviceIds.push(res.data.service_id);
  });

  test('T13 · RPC de pagos por lote → service_role EXCLUSIVO: authenticated directo, RECHAZADO', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/register_supplier_payment_batch`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${managerA.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_store_id: storeA, p_ref_type: 'service', p_ref_id: crypto.randomUUID(),
        p_payments: [{ payment_method: 'cash', amount: 1, currency: 'CUP' }], p_paid_by: managerA.id,
      }),
    });
    expect(res.ok).toBe(false);   // 404 (no visible) o permiso denegado — jamás ejecuta
  });

  // ══════════════════════════════════════════════════════════════════════════
  // P0 §6 — IDENTIDAD DEL PROVEEDOR: fuente autorizada
  // ══════════════════════════════════════════════════════════════════════════
  test('T14 · Proveedor de OTRA tienda → rechazado (ruta y RPC)', async () => {
    // proveedor local en la tienda B
    const supB = await sb.insert('suppliers', [{ store_id: storeB, name: 'Proveedor Tienda B' }]);
    const supBId = supB[0].id;
    // vía RPC directa (gate de ownership del RPC)
    const direct = await rpcAsUser('create_received_service_draft', managerA.token, {
      p_store_id: storeA, p_supplier: 'Inyección', p_total_amount: 10, p_service_date: HAVANA_TODAY(),
      p_supplier_id: supBId, p_created_by: managerA.id, p_creation_key: null,
    });
    expect(direct.ok).toBe(false);
    expect(direct.error).toContain('ERR_SUPPLIER_INVALID');
    // vía RUTA (resolver server-side antes del UPDATE privilegiado)
    const viaApi = await fetch('http://localhost:3000/api/received-services', {
      method: 'POST', headers: apiHeaders(managerA.token),
      body: JSON.stringify({
        store_id: storeA, supplier: 'Inyección', total_amount: 10,
        supplier_id: supBId, service_date: HAVANA_TODAY(),
      }),
    });
    expect(viaApi.status()).toBe(400);
    const body = await viaApi.json();
    expect(body.code === 'ERR_SUPPLIER_INVALID' || body.error?.code === 'ERR_SUPPLIER_INVALID').toBe(true);
  });

  test('T15 · Tercero maestro de OTRO tenant (o inexistente en el tenant) → rechazado', async () => {
    // master_parties con tenant ajeno al de la tienda A (row efímera, se limpia)
    const foreignTenant = crypto.randomUUID();
    const mp = await sb.insert('master_parties', [{
      tenant_id: foreignTenant, code: `M009-${RUN_ID}`, name: 'Maestro Ajeno',
      party_type: 'supplier', is_supplier: true, status: 'active',
    }]);
    const mpId = mp[0].id;
    try {
      const direct = await rpcAsUser('create_received_service_draft', managerA.token, {
        p_store_id: storeA, p_supplier: null, p_total_amount: 10, p_service_date: HAVANA_TODAY(),
        p_supplier_master_party_id: mpId, p_created_by: managerA.id, p_creation_key: null,
      });
      expect(direct.ok).toBe(false);
      expect(direct.error).toContain('ERR_SUPPLIER_MASTER_INVALID');
    } finally {
      await sb.delete('master_parties', `id=eq.${mpId}`).catch(() => {});
    }
  });

  test('T16 · Identidad VÁLIDA: snapshot congelado desde la fuente autorizada (coherente)', async () => {
    const mp = await sb.insert('master_parties', [{
      tenant_id: (await sb.select<Record<string, any>>('stores', `id=eq.${storeA}&select=tenant_id`))[0].tenant_id,
      code: `M009OK-${RUN_ID}`, name: 'Maestro Válido ADN009', party_type: 'supplier',
      is_supplier: true, status: 'active', tax_id: 'NIT-OK', phone: '53-OK',
    }]);
    const mpId = mp[0].id;
    try {
      const res = await fetch('http://localhost:3000/api/received-services', {
        method: 'POST', headers: apiHeaders(managerA.token),
        body: JSON.stringify({
          store_id: storeA, supplier: 'Nombre del cliente', total_amount: 100,
          supplier_master_party_id: mpId,
          supplier_meta: { code: 'FALSO', tax_id: 'FALSO', phone: null, address: null },
          service_date: HAVANA_TODAY(),
        }),
      });
      expect(res.status()).toBe(201);
      const { data: created } = await res.json();
      serviceIds.push(created.id);
      const row = await serviceRow(created.id);
      expect(row.supplier_master_party_id).toBe(mpId);
      // el snapshot sale de la BD (metadatos 'FALSO' del cliente descartados)
      expect(row.supplier_tax_id).toBe('NIT-OK');
      expect(row.supplier_phone).toBe('53-OK');
      expect(row.supplier_code).toBe(`M009OK-${RUN_ID}`);
    } finally {
      await sb.delete('master_parties', `id=eq.${mpId}`).catch(() => {});
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // P1 §9 — PATCH tri-state: limpieza, restablecimiento y campos omitidos
  // ══════════════════════════════════════════════════════════════════════════
  test('T17 · Limpiar observaciones y referencia (NULL explícito) → NULL persistido', async () => {
    const draft = await rpcAsUser('create_received_service_draft', managerA.token, {
      p_store_id: storeA, p_supplier: null, p_total_amount: 120, p_service_date: HAVANA_TODAY(),
      p_reference_doc: 'REF-ORIGINAL', p_observations: 'OBS-ORIGINAL',
      p_created_by: managerA.id, p_creation_key: null,
    });
    expect(draft.ok).toBe(true);
    serviceIds.push(draft.data.service_id);

    const res = await fetch('http://localhost:3000/api/received-services', {
      method: 'PATCH', headers: apiHeaders(managerA.token),
      body: JSON.stringify({
        service_id: draft.data.service_id, action: 'update-draft',
        observations: null, reference_doc: null,
      }),
    });
    expect(res.status()).toBe(200);
    const row = await serviceRow(draft.data.service_id);
    expect(row.observations).toBeNull();
    expect(row.reference_doc).toBeNull();
  });

  test('T18 · Restablecer la fecha (NULL) → día operativo ACTUAL (America/Havana)', async () => {
    const draft = await rpcAsUser('create_received_service_draft', managerA.token, {
      p_store_id: storeA, p_supplier: null, p_total_amount: 130, p_service_date: HAVANA_TODAY(),
      p_created_by: managerA.id, p_creation_key: null,
    });
    expect(draft.ok).toBe(true);
    serviceIds.push(draft.data.service_id);
    // fecha histórica válida (piso 6 meses) para mover el documento…
    const old = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const move = await fetch('http://localhost:3000/api/received-services', {
      method: 'PATCH', headers: apiHeaders(managerA.token),
      body: JSON.stringify({ service_id: draft.data.service_id, action: 'update-draft', service_date: old }),
    });
    expect(move.status()).toBe(200);
    expect((await serviceRow(draft.data.service_id)).service_date).toBe(old);
    // …y NULL la RESTABLECE al día operativo actual (semántica del formulario)
    const reset = await fetch('http://localhost:3000/api/received-services', {
      method: 'PATCH', headers: apiHeaders(managerA.token),
      body: JSON.stringify({ service_id: draft.data.service_id, action: 'update-draft', service_date: null }),
    });
    expect(reset.status()).toBe(200);
    expect((await serviceRow(draft.data.service_id)).service_date).toBe(HAVANA_TODAY());
  });

  test('T19 · Campos OMITIDOS → valores anteriores conservados (clave ausente no decide)', async () => {
    const draft = await rpcAsUser('create_received_service_draft', managerA.token, {
      p_store_id: storeA, p_supplier: null, p_total_amount: 140, p_service_date: HAVANA_TODAY(),
      p_reference_doc: 'REF-KEEP', p_observations: 'OBS-KEEP',
      p_created_by: managerA.id, p_creation_key: null,
    });
    expect(draft.ok).toBe(true);
    serviceIds.push(draft.data.service_id);
    const res = await fetch('http://localhost:3000/api/received-services', {
      method: 'PATCH', headers: apiHeaders(managerA.token),
      body: JSON.stringify({ service_id: draft.data.service_id, action: 'update-draft', total_amount: 222 }),
    });
    expect(res.status()).toBe(200);
    const row = await serviceRow(draft.data.service_id);
    expect(row.observations).toBe('OBS-KEEP');     // conservado
    expect(row.reference_doc).toBe('REF-KEEP');    // conservado
    expect(Number(row.total_amount)).toBe(222);    // aplicado
  });

  // ══════════════════════════════════════════════════════════════════════════
  // P1 §8 — REINTENTO TRAS RESPUESTA PERDIDA (idempotencia del pago)
  // ══════════════════════════════════════════════════════════════════════════
  test('T20 · Reintento del mismo lote tras respuesta perdida → UN solo lote financiero', async () => {
    test.setTimeout(120_000);
    const res = await withRlBackoff(() => fetch('http://localhost:3000/api/received-services', {
      method: 'POST', headers: apiHeaders(managerA.token),
      body: JSON.stringify({
        store_id: storeA, supplier: 'Replay Perdido', total_amount: 800,
        currency: 'CUP', exchange_rate: 1, service_date: HAVANA_TODAY(),
      }),
    }));
    const { data: created } = await res.json();
    serviceIds.push(created.id);
    await confirmService(created.id);

    const body = {
      p_store_id: storeA, p_ref_type: 'service', p_ref_id: created.id,
      p_payments: [{ payment_method: 'cash', amount: 300, currency: 'CUP', exchange_rate: 1 }],
      p_paid_by: managerA.id, p_idempotency_key: `m009-lost-${RUN_ID}`,
    };
    const first = await rpcAsService('register_supplier_payment_batch', body);
    expect(first.ok).toBe(true);
    // …el cliente pierde la respuesta y reintenta con la MISMA operación:
    const second = await rpcAsService('register_supplier_payment_batch', body);
    expect(second.ok).toBe(true);
    expect(second.data.replayed).toBe(true);
    expect(second.data.payments.map((p: any) => p.id)).toEqual(first.data.payments.map((p: any) => p.id));
    const rows = await paymentsOf(created.id);
    expect(rows).toHaveLength(1);                 // NUNCA componentes adicionales
    const entries = await finEntriesOf(created.id);
    expect(entries.filter((e) => (e as any).entry_type === 'pago').length).toBe(1);  // un solo asiento
  });

  // ══════════════════════════════════════════════════════════════════════════
  // REGRESIÓN — efectivo CUP + flujo de borradores 008 intacto
  // ══════════════════════════════════════════════════════════════════════════
  test('T21 · REGRESIÓN: efectivo CUP — registro completo y cuenta de caja correcta', async () => {
    test.setTimeout(120_000);
    const res = await withRlBackoff(() => fetch('http://localhost:3000/api/received-services', {
      method: 'POST', headers: apiHeaders(managerA.token),
      body: JSON.stringify({
        store_id: storeA, supplier: 'Regresión Efectivo', total_amount: 500,
        currency: 'CUP', exchange_rate: 1, service_date: HAVANA_TODAY(),
      }),
    }));
    const { data: created } = await res.json();
    serviceIds.push(created.id);
    await confirmService(created.id);
    const pay = await withRlBackoff(() => fetch('http://localhost:3000/api/payments', {
      method: 'POST', headers: apiHeaders(managerA.token),
      body: JSON.stringify({
        ref_type: 'service', ref_id: created.id,
        payments: [{ payment_method: 'cash', amount: 500, currency: 'CUP', exchange_rate: 1 }],
        idempotency_key: `m009-reg-cash-${RUN_ID}`,
      }),
    }));
    expect(pay.status()).toBe(201);
    const entries = await finEntriesOf(created.id);
    const movs = await movementsOf(entries.map((e) => e.id));
    const cuentas = new Set(movs.map((m) => m.category_code));
    expect(cuentas.has('ACT_CAJA')).toBe(true);    // caja CUP (mismo motor)
    const pasNet = movs.filter((m) => m.category_code === 'PAS_SERV_PEND')
      .reduce((s, m) => s + (m.sense === 'credito' ? Number(m.amount_cup) : -Number(m.amount_cup)), 0);
    expect(Math.abs(pasNet)).toBeLessThan(0.01);
  });

  test('T22 · REGRESIÓN: flujo de borradores 008 (crear→editar→confirmar única) intacto', async () => {
    test.setTimeout(180_000);
    // 1) borrador SIN proveedor (validación relajada, cero efectos financieros)
    const draft = await fetch('http://localhost:3000/api/received-services', {
      method: 'POST', headers: apiHeaders(managerA.token),
      body: JSON.stringify({
        store_id: storeA, save_as_draft: true, supplier: null, total_amount: 900,
        creation_key: `m009-reg-draft-${RUN_ID}`, observations: 'reg008',
        service_date: HAVANA_TODAY(),
      }),
    });
    expect(draft.status()).toBe(201);
    const { data: d } = await draft.json();
    serviceIds.push(d.id);
    let row = await serviceRow(d.id);
    expect(row.status).toBe('draft');
    expect(row.supplier).toBeNull();
    // sin obligación contable mientras es borrador
    expect((await finEntriesOf(d.id)).length).toBe(0);

    // 2) editar el borrador (completar proveedor + importe) — sin efectos
    const upd = await fetch('http://localhost:3000/api/received-services', {
      method: 'PATCH', headers: apiHeaders(managerA.token),
      body: JSON.stringify({
        service_id: d.id, action: 'update-draft',
        supplier: 'Proveedor Regresión 008', total_amount: 950, observations: 'reg008-editada',
      }),
    });
    expect(upd.status()).toBe(200);
    row = await serviceRow(d.id);
    expect(row.supplier).toBe('Proveedor Regresión 008');
    expect(Number(row.total_amount)).toBe(950);
    expect((await finEntriesOf(d.id)).length).toBe(0);

    // 3) confirmar (gate proveedor+importe) → reconocimiento UNA vez
    await confirmService(d.id);
    row = await serviceRow(d.id);
    expect(row.status).toBe('active');
    const entries = await finEntriesOf(d.id);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const reconocimiento = entries.filter((e) => (e as any).entry_type === 'reconocimiento');
    expect(reconocimiento.length).toBe(1);

    // 4) confirmación DUPLICADA → no_change; sin segundo asiento
    const dup = await fetch('http://localhost:3000/api/received-services', {
      method: 'PATCH', headers: apiHeaders(managerA.token),
      body: JSON.stringify({ service_id: d.id, status: 'active', reason: 'duplicada' }),
    });
    expect(dup.status()).toBe(200);
    const json = await dup.json();
    expect(json.data.status === 'no_change' || json.data.service_status === 'active').toBeTruthy();
    const entriesAfter = await finEntriesOf(d.id);
    expect(entriesAfter.filter((e) => (e as any).entry_type === 'reconocimiento').length).toBe(1);
  });
});
