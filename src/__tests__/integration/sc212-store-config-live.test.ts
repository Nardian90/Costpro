/**
 * CP-SALES-024 — SC-2-12 con configuración de tienda:
 * VERIFICACIÓN EXTREMO A EXTREMO CONTRA EL PROYECTO E2E AISLADO.
 *
 * Entorno: CostproE2E (sentinel e2e_is_isolated_db()=true). PRODUCCIÓN
 * JAMÁS se toca: este fichero solo corre con E2E_LIVE_DB=1 y las
 * credenciales del proyecto aislado. En CI se omite (SKIP registrado).
 *
 * Cadena probada SIN MOCKS (PostgREST + Postgres reales):
 *   stores (config. persistida por tienda) → fetchSc212SourceData (RLS
 *   con el cliente del usuario autenticado) → buildSc212ModelData →
 *   presentación resuelta de los 7 campos de identificación.
 *
 * Batería de la misión §7.1–7.2 (identificación + aislamiento multi-tienda):
 *   A · Una venta de la tienda A obtiene los 7 datos de SU configuración.
 *   B · Una venta de la tienda B (datos distintos) obtiene SOLO los de B.
 *   C · Cambiar la tienda «activa» del contexto NO altera el documento de
 *      una venta histórica (la fuente es transactions.store_id).
 *   D · Los datos persistidos no se mezclan entre tiendas (teléfono,
 *      correo, REEUP, NIT, cuenta bancaria).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const LIVE =
  process.env.E2E_LIVE_DB === '1' &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const TS = Date.now();
const SA_EMAIL = `sc212-sa-${TS}@costpro.test`;
const PASS = 'Sc212Live!2026';

// Dos tiendas fixture con datos de identificación DISTINTOS (misión §7.2).
const STORE_A = {
  name: `E2E SC212 Alfa ${TS}`,
  address: 'Calle Menocal SN, Esquina a Francisco',
  phone: '56561619',
  email: 'sc212-alfa@costpro.test',
  reeup: '50004179942',
  nit: '50004179942',
  bank_account: '0664 4340 0002 6710',
};
const STORE_B = {
  name: `E2E SC212 Beta ${TS}`,
  address: 'Calle Marta Abreu 12, Puerto Padre',
  phone: '24412345',
  email: 'sc212-beta@costpro.test',
  reeup: '41004179942',
  nit: '41004179943',
  bank_account: '0110 0000 1111 2222',
};

let admin: SupabaseClient;
let saId = '';
let saToken = '';
let tenantId = '';
let storeAId = '';
let storeBId = '';
const saleIds: string[] = [];

async function rest(path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    ...((init.headers || {}) as Record<string, string>),
  };
  const res = await fetch(`${URL}${path}`, { ...init, headers });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

const d = describe.skipIf(!LIVE)('CP-SALES-024 — SC-2-12 live E2E (CostproE2E)', () => {
  beforeAll(async () => {
    // 1) Sentinel de aislamiento — fail-closed contra producción.
    const sentinel = await rest('/rest/v1/rpc/e2e_is_isolated_db', { method: 'POST', body: '{}' });
    if (sentinel.body !== true) {
      throw new Error(`BD NO AISLADA (sentinel=${JSON.stringify(sentinel.body)}) — ABORT.`);
    }

    // 2) Superadmin de prueba (identity + profile) para leer con RLS real.
    const r = await rest('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email: SA_EMAIL, password: PASS, email_confirm: true }),
    });
    saId = r.body?.user?.id || r.body?.id;
    if (!saId) throw new Error(`signUp falló: ${JSON.stringify(r.body).slice(0, 200)}`);
    const prof = await rest(`/rest/v1/profiles?id=eq.${saId}`, {
      method: 'PATCH',
      body: JSON.stringify({ full_name: 'SC212 SA', role: 'superadmin', is_active: true, plan: 'enterprise' }),
      headers: { Prefer: 'return=minimal' } as Record<string, string>,
    });
    if (prof.status >= 300) throw new Error(`profile PATCH falló: ${prof.status}`);
    // La creación de tienda vía API exige tenant del usuario (ERR_NO_TENANT):
    // tenant de fixture propio de la corrida (patrón user-mgmt-delete-001).
    const tenantR = await rest('/rest/v1/tenants', {
      method: 'POST',
      body: JSON.stringify({ name: `SC212 Live Org ${TS}` }),
      headers: { Prefer: 'return=representation' } as Record<string, string>,
    });
    tenantId = tenantR.body?.[0]?.id || tenantR.body?.id;
    if (!tenantId) throw new Error(`crear tenant falló: ${JSON.stringify(tenantR.body).slice(0, 200)}`);
    await rest(`/rest/v1/profiles?id=eq.${saId}`, {
      method: 'PATCH',
      body: JSON.stringify({ tenant_id: tenantId }),
      headers: { Prefer: 'return=minimal' } as Record<string, string>,
    });

    // 3) Cliente autenticado (RLS activa — mismo cliente que usa el modal).
    const loginRes = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON },
      body: JSON.stringify({ email: SA_EMAIL, password: PASS }),
    });
    const { access_token } = (await loginRes.json()) as { access_token: string };
    if (!access_token) throw new Error('login falló');
    admin = createClient(URL, ANON, {
      global: { headers: { Authorization: `Bearer ${access_token}` } },
    });
    saToken = access_token;

    // 4) Dos tiendas con configuración DISTINTA (la de la misión §7.2),
    //    creadas con el flujo REAL de la app (POST /api/stores →
    //    create_store_with_membership: tenant + membresía admin automáticos
    //    — un INSERT directo de stores viola la RLS del tenant).
    const mkStore = async (s: typeof STORE_A): Promise<string> => {
      const res = await fetch('http://localhost:3000/api/stores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${saToken}`,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          name: s.name,
          address: s.address,
          phone: s.phone,
          email: s.email,
          reeup: s.reeup,
          nit: s.nit,
          bank_account: s.bank_account,
        }),
      });
      const body = await res.json().catch(() => null);
      const id = body?.data?.store_id || body?.data?.id || body?.store_id;
      if (!res.ok || !id) {
        throw new Error(`mkStore ${s.name}: ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
      }
      return id as string;
    };
    storeAId = await mkStore(STORE_A);
    storeBId = await mkStore(STORE_B);

    // 5) Una venta por tienda (mínimo: fila transactions legible bajo RLS).
    //    La política tenant INSERT exige tenant_id explícito en la fila
    //    (igual que create_sale_v2 — mismo contrato del servidor).
    const mkSale = async (storeId: string): Promise<string> => {
      const { data, error } = await admin
        .from('transactions')
        .insert({
          store_id: storeId,
          seller_id: saId,
          tenant_id: tenantId,
          status: 'completed',
          total_amount: 120.5,
          subtotal: 120.5,
          discount_value: 0,
          tax_amount: 0,
          payment_method: 'cash',
          sale_currency: 'CUP',
          customer_name: 'Cliente SC212',
          created_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (error) throw new Error(`mkSale: ${error.message}`);
      saleIds.push(data.id);
      return data.id;
    };
    await mkSale(storeAId);
    await mkSale(storeBId);
  }, 120_000);

  afterAll(async () => {
    // Limpieza net-zero con los MECANISMOS OFICIALES del repo:
    //  - e2e_hard_delete_store: tienda de test + hijos (triggers migrados).
    //  - e2e_hard_delete_user: identidad de test (@costpro.test).
    //  - transactions/memberships del fixture se van con la tienda; el
    //    tenant se borra al quedar sin tiendas.
    if (!LIVE) return;
    try {
      for (const sid of [storeAId, storeBId].filter(Boolean)) {
        await rest('/rest/v1/rpc/e2e_hard_delete_store', {
          method: 'POST',
          body: JSON.stringify({ p_store_id: sid }),
        });
      }
      if (saId) {
        await rest('/rest/v1/rpc/e2e_hard_delete_user', {
          method: 'POST',
          body: JSON.stringify({ p_user_id: saId }),
        });
      }
      if (tenantId) await rest(`/rest/v1/tenants?id=eq.${tenantId}`, { method: 'DELETE' });
    } catch {
      // La limpieza de best-effort no debe enmascarar resultados de tests.
    }
  }, 120_000);

  // El módulo bajo prueba usa el singleton Supabase del proceso; en el
  // browser la sesión vive en el cliente (localStorage), aquí se inyecta un
  // cliente con la sesión REAL del SA (test seam — mismo contrato RLS).
  async function loadSc212() {
    const mod = await import('@/lib/legal/sc212');
    mod.setSc212Client(admin);
    return mod;
  }

  it('A · una venta de la tienda A obtiene los 7 datos de SU configuración', async () => {
    const { fetchSc212SourceData, buildSc212ModelData, sc212PresentationOf } = await loadSc212();
    const source = await fetchSc212SourceData({
      id: saleIds[0],
      status: 'completed',
      total_amount: 120.5,
      sale_currency: 'CUP',
      created_at: new Date().toISOString(),
      store_id: storeAId,
      seller_id: saId,
    });
    const model = buildSc212ModelData(source);
    const pres = sc212PresentationOf(model);
    expect(model.proveedorNombre).toBe(STORE_A.name);
    expect(model.proveedorDireccion).toBe(STORE_A.address);
    expect(model.proveedorCodigo).toBe(STORE_A.reeup);
    expect(model.proveedorNIT).toBe(STORE_A.nit);
    expect(model.proveedorCuentaBancaria).toBe(STORE_A.bank_account);
    expect(pres.proveedorTelefono.value).toBe(STORE_A.phone);
    expect(pres.proveedorEmail.value).toBe(STORE_A.email);
  });

  it('B · una venta de la tienda B obtiene SOLO los datos de B (sin mezcla)', async () => {
    const { fetchSc212SourceData, buildSc212ModelData, sc212PresentationOf } = await loadSc212();
    const source = await fetchSc212SourceData({
      id: saleIds[1],
      status: 'completed',
      total_amount: 120.5,
      sale_currency: 'CUP',
      created_at: new Date().toISOString(),
      store_id: storeBId,
      seller_id: saId,
    });
    const model = buildSc212ModelData(source);
    const pres = sc212PresentationOf(model);
    expect(model.proveedorNombre).toBe(STORE_B.name);
    expect(model.proveedorDireccion).toBe(STORE_B.address);
    expect(model.proveedorCodigo).toBe(STORE_B.reeup);
    expect(model.proveedorNIT).toBe(STORE_B.nit);
    expect(model.proveedorCuentaBancaria).toBe(STORE_B.bank_account);
    expect(pres.proveedorTelefono.value).toBe(STORE_B.phone);
    expect(pres.proveedorEmail.value).toBe(STORE_B.email);
    // NINGÚN dato de A aparece en el documento de B (§7.2):
    expect(model.proveedorCuentaBancaria).not.toBe(STORE_A.bank_account);
    expect(model.proveedorNIT).not.toBe(STORE_A.nit);
    expect(model.proveedorDireccion).not.toBe(STORE_A.address);
    expect(pres.proveedorTelefono.value).not.toBe(STORE_A.phone);
    expect(pres.proveedorEmail.value).not.toBe(STORE_A.email);
  });

  it('C · la tienda «activa» del contexto NO altera el documento (store_id de la venta manda)', async () => {
    const { fetchSc212SourceData, buildSc212ModelData } = await loadSc212();
    // Venta de B consultada con «tienda activa» = A (el escenario prohibido):
    const source = await fetchSc212SourceData(
      {
        id: saleIds[1],
        status: 'completed',
        total_amount: 120.5,
        sale_currency: 'CUP',
        created_at: new Date().toISOString(),
        store_id: storeBId,
        seller_id: saId,
      },
      storeAId, // ← activeStoreId distinto: DEBE ignorarse
    );
    const model = buildSc212ModelData(source);
    expect(model.proveedorNombre).toBe(STORE_B.name);
    expect(model.proveedorNIT).toBe(STORE_B.nit);
    expect(model.proveedorCuentaBancaria).toBe(STORE_B.bank_account);
  });

  it('D · la cuenta bancaria conserva TODOS sus dígitos y espacios en ambas tiendas', async () => {
    const { fetchSc212SourceData, buildSc212ModelData } = await loadSc212();
    for (const [saleId, storeId, store] of [
      [saleIds[0], storeAId, STORE_A],
      [saleIds[1], storeBId, STORE_B],
    ] as const) {
      const source = await fetchSc212SourceData({
        id: saleId,
        status: 'completed',
        total_amount: 120.5,
        sale_currency: 'CUP',
        created_at: new Date().toISOString(),
        store_id: storeId,
        seller_id: saId,
      });
      const model = buildSc212ModelData(source);
      expect(model.proveedorCuentaBancaria).toBe(store.bank_account);
      expect(model.proveedorCuentaBancaria).toMatch(/^\d{4} \d{4} \d{4} \d{4}$/);
    }
  });

  it('E · personalización: ocultar un campo NO altera los datos de la tienda (solo presentación)', async () => {
    const { fetchSc212SourceData, buildSc212ModelData, sc212PresentationOf } = await loadSc212();
    const source = await fetchSc212SourceData({
      id: saleIds[0],
      status: 'completed',
      total_amount: 120.5,
      sale_currency: 'CUP',
      created_at: new Date().toISOString(),
      store_id: storeAId,
      seller_id: saId,
    });
    const prefs = { proveedorCuentaBancaria: { visible: false } };
    const model = buildSc212ModelData(source, prefs);
    const pres = sc212PresentationOf(model);
    expect(pres.proveedorCuentaBancaria.visible).toBe(false);
    // El dato persistido en stores NO cambia (verificación directa):
    const check = await rest(
      `/rest/v1/stores?id=eq.${storeAId}&select=bank_account,nit,reeup,phone,email,address`,
    );
    expect(check.body[0].bank_account).toBe(STORE_A.bank_account);
    expect(check.body[0].nit).toBe(STORE_A.nit);
    expect(check.body[0].reeup).toBe(STORE_A.reeup);
    expect(check.body[0].phone).toBe(STORE_A.phone);
    expect(check.body[0].email).toBe(STORE_A.email);
    expect(check.body[0].address).toBe(STORE_A.address);
  });
});

// En CI sin credenciales E2E: registrar el SKIP expresamente.
describe.skipIf(LIVE)('CP-SALES-024 — live E2E (SKIP: sin E2E_LIVE_DB=1)', () => {
  it('registro de omisión deliberada (suite live solo con BD aislada)', () => {
    expect(true).toBe(true);
  });
});
