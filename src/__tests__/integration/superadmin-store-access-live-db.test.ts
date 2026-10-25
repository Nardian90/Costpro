/**
 * CP-ORG-001 ciclo 5 (2026-10-25) — INCIDENTE P0 admin@demo.com:
 * VERIFICACIÓN EXTREMO A EXTREMO de la recuperación del acceso integral de
 * SuperAdmin, contra el proyecto E2E AISLADO.
 *
 * Entorno: CostproE2E (sentinel e2e_is_isolated_db()=true verificado ANTES de
 * provisionar). PRODUCCIÓN JAMÁS se toca: este fichero solo corre cuando el
 * proceso se lanza deliberadamente con credenciales del proyecto aislado
 * (E2E_LIVE_DB=1). En CI se omite (SKIP) porque no recibe credenciales E2E.
 *
 * Cadena probada SIN MOCKS de infraestructura:
 *   JWT real (password grant E2E) → RLS real (stores_tenant_select /
 *   profiles_tenant_update) → triggers reales (validate_active_store c5,
 *   prevent_self_privilege_escalation) → handler REAL GET /api/stores →
 *   userService.setActiveStore REAL (el código que producía el incidente).
 *
 * Pruebas de aceptación del incidente (§6 del expediente):
 *   SuperAdmin:
 *     · Lista TODAS las tiendas activas (alcance global)          [S1]
 *     · Selecciona tienda SIN membresía individual                [S2]
 *     · Persiste y recupera la tienda activa entre sesiones       [S3]
 *     · Cambia de tienda sin perder privilegios                   [S4]
 *     · NO puede fijar una tienda desactivada                     [S5]
 *   Aislamiento y roles ordinarios:
 *     · tenant_admin NO adquiere privilegios de SuperAdmin        [S6]
 *     · Empleado solo ve SU tienda                                 [S7]
 *     · Empleado NO puede fijar tienda ajena (membresía intacta)  [S8]
 *     · No se puede falsificar el rol desde el cliente            [S9]
 *     · Empleado NO puede escribir el perfil de otro usuario      [S10]
 *   Cuenta de plataforma:
 *     · La cuenta SuperAdmin SIN membresías funciona de extremo a
 *       extremo sin crear membresías ficticias.                  [S2-S4]
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';

const LIVE =
  process.env.E2E_LIVE_DB === '1' &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const TS = Date.now();
const SA_EMAIL = `cp5-sa-${TS}@e2e-test.local`;
const TA_EMAIL = `cp5-ta-${TS}@e2e-test.local`;
const EMP_EMAIL = `cp5-emp-${TS}@e2e-test.local`;
const PASS = 'CpOrg001-Live!2026';

// Recursos creados por la suite (limpieza en afterAll)
let t1Id = '';
let t2Id = '';
let storeAId = '';
let storeBId = '';
let storeCId = '';
let storeDId = '';
let saId = '';
let taId = '';
let empId = '';
let saToken = '';
let saRefresh = '';
let taToken = '';
let empToken = '';
let activeStoreCount = 0;

async function rest(
  path: string,
  init: RequestInit & { key?: string } = {},
): Promise<{ status: number; body: any }> {
  const userJwt = init.key || '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: userJwt ? ANON : SERVICE,
    Authorization: `Bearer ${userJwt || SERVICE}`,
    ...((init.headers || {}) as Record<string, string>),
  };
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

async function login(email: string): Promise<{ access: string; refresh: string }> {
  const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ email, password: PASS }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`login ${email}: ${res.status} ${JSON.stringify(body)}`);
  return { access: body.access_token, refresh: body.refresh_token };
}

/** GET /api/stores — el handler REAL de la app con sesión real. */
async function apiStoresGet(token: string): Promise<{ status: number; body: any }> {
  const url = 'http://localhost:3000/api/stores';
  const req = new NextRequest(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Origin: 'http://localhost:3000' },
  });
  // Import diferido: los módulos leen env en import time (E2E ya presente).
  const mod = await import('@/app/api/stores/route');
  const res = await mod.GET(req as never);
  const text = await res.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function setUserSession(access: string, refresh: string) {
  const { supabase } = await import('@/lib/supabaseClient');
  const { error } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
  if (error) throw new Error(`setSession: ${error.message}`);
  return supabase;
}

describe.skipIf(!LIVE)('CP-ORG-001 c5 LIVE — recuperación SuperAdmin: listar y seleccionar tiendas (E2E aislado)', () => {
  beforeAll(async () => {
    // ── 0. SENTINEL: abortar si el proyecto NO es el aislado ──
    const sentinel = await rest('/rest/v1/rpc/e2e_is_isolated_db', { method: 'POST', body: JSON.stringify({}) });
    if (sentinel.body !== true) {
      throw new Error('SENTINEL: el proyecto apuntado NO es la BD E2E aislada — ABORT');
    }

    // ── 1. Tenants y tiendas (2 tenants para probar alcance transversal) ──
    const mkTenant = async (name: string) => {
      const r = await rest('/rest/v1/tenants?select=id', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ name, subscription_status: 'trial' }),
      });
      if (r.status >= 300) throw new Error(`tenant ${name}: ${r.status} ${JSON.stringify(r.body)}`);
      return r.body[0].id as string;
    };
    t1Id = await mkTenant(`CP5 T1 ${TS}`);
    t2Id = await mkTenant(`CP5 T2 ${TS}`);

    const mkStore = async (name: string, tenantId: string, isActive: boolean, slug: string) => {
      const r = await rest('/rest/v1/stores?select=id', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ name, tenant_id: tenantId, is_active: isActive, slug }),
      });
      if (r.status >= 300) throw new Error(`store ${name}: ${r.status} ${JSON.stringify(r.body)}`);
      return r.body[0].id as string;
    };
    storeAId = await mkStore(`CP5 Tienda A ${TS}`, t1Id, true, `cp5-a-${TS}`);
    storeBId = await mkStore(`CP5 Tienda B ${TS}`, t1Id, true, `cp5-b-${TS}`);
    storeCId = await mkStore(`CP5 Tienda C ${TS}`, t1Id, false, `cp5-c-${TS}`); // INACTIVA
    storeDId = await mkStore(`CP5 Tienda D ${TS}`, t2Id, true, `cp5-d-${TS}`); // OTRO tenant

    // ── 2. Usuarios: SA superadmin SIN membresías (réplica de admin@demo.com),
    //       TA tenant_admin, EMP clerk con membresía en A ──
    const mkUser = async (email: string, meta?: Record<string, unknown>) => {
      const res = await fetch(`${BASE}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
        body: JSON.stringify({ email, password: PASS, email_confirm: true, ...(meta ? { user_metadata: meta } : {}) }),
      });
      if (!res.ok) throw new Error(`provision ${email}: ${res.status} ${await res.text()}`);
      return (await res.json()).id as string;
    };
    saId = await mkUser(SA_EMAIL);
    taId = await mkUser(TA_EMAIL);
    empId = await mkUser(EMP_EMAIL, { role: 'clerk' });

    // Promoción administrativa a superadmin (service_role, única vía legítima).
    // tenant_id fijado como la cuenta real admin@demo.com (con tenant, SIN membresías).
    const promo = await rest(`/rest/v1/profiles?id=eq.${saId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ role: 'superadmin', tenant_id: t1Id }),
    });
    if (promo.status >= 300) throw new Error(`promoción superadmin: ${promo.status} ${JSON.stringify(promo.body)}`);
    // TA: rol tenant_admin de T1 (sin membresías).
    const promoTA = await rest(`/rest/v1/profiles?id=eq.${taId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ role: 'tenant_admin', tenant_id: t1Id }),
    });
    if (promoTA.status >= 300) throw new Error(`rol tenant_admin: ${promoTA.status}`);
    // EMP: tenant T1 + rol clerk. La membresía se crea ANTES de fijar
    // active_store_id: el trigger validate_active_store exige membresía para
    // roles operativos (orden que reproduce el flujo real de la app).
    const empTenant = await rest(`/rest/v1/profiles?id=eq.${empId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ role: 'clerk', tenant_id: t1Id }),
    });
    if (empTenant.status >= 300) throw new Error(`perfil clerk: ${empTenant.status} ${JSON.stringify(empTenant.body)}`);
    const memb = await rest('/rest/v1/user_store_memberships', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: empId, store_id: storeAId, role: 'clerk', status: 'active' }),
    });
    if (memb.status >= 300) throw new Error(`membresía clerk: ${memb.status} ${JSON.stringify(memb.body)}`);
    const empStore = await rest(`/rest/v1/profiles?id=eq.${empId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ active_store_id: storeAId }),
    });
    if (empStore.status >= 300) throw new Error(`tienda activa clerk: ${empStore.status} ${JSON.stringify(empStore.body)}`);

    // ── 3. Logins reales (password grant) ──
    const sa = await login(SA_EMAIL);
    saToken = sa.access; saRefresh = sa.refresh;
    taToken = (await login(TA_EMAIL)).access;
    empToken = (await login(EMP_EMAIL)).access;

    // ── 4. Baseline: total de tiendas activas (para S1; mismo filtro que la ruta:
    // is_active=true AND is_archived=false) ──
    const active = await rest('/rest/v1/stores?select=id&is_active=eq.true&is_archived=eq.false&limit=1000');
    activeStoreCount = Array.isArray(active.body) ? active.body.length : 0;
    expect(activeStoreCount).toBeGreaterThanOrEqual(4);
  }, 180_000);

  // ═══════════════════ SUPERADMIN ═══════════════════

  it('S1. SuperAdmin lista TODAS las tiendas activas de TODOS los tenants (ruta real)', async () => {
    const res = await apiStoresGet(saToken);
    expect(res.status).toBe(200);
    const data = res.body?.data;
    expect(Array.isArray(data)).toBe(true);
    const ids = data.map((s: any) => s.id);
    // Ve A, B (su tenant) y D (tenant ajeno) — alcance transversal.
    expect(ids).toContain(storeAId);
    expect(ids).toContain(storeBId);
    expect(ids).toContain(storeDId);
    // NO ve la inactiva C (filtro is_active por defecto).
    expect(ids).not.toContain(storeCId);
    // Ve TODAS: el total activo del proyecto coincide con lo listado.
    expect(data.length).toBe(activeStoreCount);
  });

  it('S1b. SuperAdmin ve todas las tiendas por PostgREST directo con su JWT (RLS is_superadmin bypass)', async () => {
    const res = await rest('/rest/v1/stores?select=id&is_active=eq.true&is_archived=eq.false&limit=1000', { key: saToken });
    expect(res.status).toBe(200);
    const ids = res.body.map((s: any) => s.id);
    expect(ids).toContain(storeAId);
    expect(ids).toContain(storeBId);
    expect(ids).toContain(storeDId);
    expect(res.body.length).toBe(activeStoreCount);
  });

  it('S2. SuperAdmin SELECCIONA tienda SIN membresía (ruta exacta del incidente admin@demo.com)', async () => {
    // userService.setActiveStore REAL con sesión E2E real y CERO membresías.
    await setUserSession(saToken, saRefresh);
    const { userService } = await import('@/services/user-service');
    // Este await ES el incidente: antes fallaba con ERR_INVALID_ACTIVE_STORE /
    // «Membresía no encontrada» en alguna de las tres capas.
    await expect(userService.setActiveStore(saId, storeAId)).resolves.not.toThrow();
    // Persistido en el perfil (lectura con su propio JWT).
    const prof = await rest(`/rest/v1/profiles?id=eq.${saId}&select=active_store_id`, { key: saToken });
    expect(prof.body[0]?.active_store_id).toBe(storeAId);
    // La cuenta SIGUE sin membresías: acceso por ROL, no por membresías ficticias.
    const memb = await rest(`/rest/v1/user_store_memberships?user_id=eq.${saId}&select=id`);
    expect(memb.body).toHaveLength(0);
  });

  it('S3. Persistencia entre sesiones: re-login recupera la tienda activa', async () => {
    const fresh = await login(SA_EMAIL); // nueva sesión, nuevo JWT
    const prof = await rest(`/rest/v1/profiles?id=eq.${saId}&select=active_store_id`, { key: fresh.access });
    expect(prof.body[0]?.active_store_id).toBe(storeAId);
  });

  it('S4. Cambio de tienda SIN pérdida de privilegios (A→B y sigue viendo todo)', async () => {
    await setUserSession(saToken, saRefresh);
    const { userService } = await import('@/services/user-service');
    await expect(userService.setActiveStore(saId, storeBId)).resolves.not.toThrow();
    const prof = await rest(`/rest/v1/profiles?id=eq.${saId}&select=active_store_id`, { key: saToken });
    expect(prof.body[0]?.active_store_id).toBe(storeBId);
    // Privilegios intactos: sigue viendo TODAS las tiendas tras el cambio.
    const res = await apiStoresGet(saToken);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(activeStoreCount);
    const fresh = await login(SA_EMAIL);
    const prof2 = await rest(`/rest/v1/profiles?id=eq.${saId}&select=active_store_id`, { key: fresh.access });
    expect(prof2.body[0]?.active_store_id).toBe(storeBId);
  });

  it('S5. SuperAdmin NO puede fijar una tienda DESACTIVADA', async () => {
    await setUserSession(saToken, saRefresh);
    const { userService } = await import('@/services/user-service');
    await expect(userService.setActiveStore(saId, storeCId)).rejects.toThrow(/desactivada/i);
    // El perfil no quedó mutado a la tienda inactiva.
    const prof = await rest(`/rest/v1/profiles?id=eq.${saId}&select=active_store_id`, { key: saToken });
    expect(prof.body[0]?.active_store_id).toBe(storeBId);
  });

  it('S5b. SuperAdmin NO puede fijar una tienda INEXISTENTE', async () => {
    await setUserSession(saToken, saRefresh);
    const { userService } = await import('@/services/user-service');
    await expect(userService.setActiveStore(saId, '00000000-0000-4000-8000-000000000000')).rejects.toThrow(/Tienda no encontrada/i);
  });

  // ═══════════════════ AISLAMIENTO Y ROLES ORDINARIOS ═══════════════════

  it('S6. tenant_admin NO adquiere privilegios de SuperAdmin (ruta: sin tiendas)', async () => {
    const res = await apiStoresGet(taToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0); // sin membresías → sin tiendas
    // RLS directa: tenant_admin tampoco ve tiendas por PostgREST.
    const direct = await rest('/rest/v1/stores?select=id&limit=1000', { key: taToken });
    expect(direct.status).toBe(200);
    expect(direct.body).toHaveLength(0);
  });

  it('S7. Empleado solo ve SU tienda (ruta y RLS directa)', async () => {
    const res = await apiStoresGet(empToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(storeAId);
    const direct = await rest('/rest/v1/stores?select=id&limit=1000', { key: empToken });
    expect(direct.body).toHaveLength(1);
    // Punto crítico: petición con identificador de tienda AJENA → 0 filas.
    const foreign = await rest(`/rest/v1/stores?id=eq.${storeDId}&select=id`, { key: empToken });
    expect(foreign.status).toBe(200);
    expect(foreign.body).toHaveLength(0);
  });

  it('S8. Empleado NO puede fijar tienda ajena (membresía sigue siendo obligatoria)', async () => {
    const emp = await login(EMP_EMAIL);
    await setUserSession(emp.access, emp.refresh);
    const { userService } = await import('@/services/user-service');
    await expect(userService.setActiveStore(empId, storeDId)).rejects.toThrow(/No tienes acceso/);
    // Y tampoco la del propio tenant sin membresía (B).
    await expect(userService.setActiveStore(empId, storeBId)).rejects.toThrow(/No tienes acceso/);
  });

  it('S9. Anti-spoofing: NO se puede falsificar el rol desde el cliente (trigger de BD)', async () => {
    // El empleado intenta PATCHear su propio rol a superadmin por PostgREST.
    const res = await rest(`/rest/v1/profiles?id=eq.${empId}&select=role`, {
      method: 'PATCH',
      key: empToken,
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ role: 'superadmin' }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400); // trigger lo impide
    // El rol NO cambió.
    const prof = await rest(`/rest/v1/profiles?id=eq.${empId}&select=role`, { key: empToken });
    expect(prof.body[0]?.role).toBe('clerk');
  });

  it('S10. Empleado NO puede escribir el perfil de OTRO usuario (RLS)', async () => {
    const res = await rest(`/rest/v1/profiles?id=eq.${saId}&select=active_store_id`, {
      method: 'PATCH',
      key: empToken,
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ active_store_id: storeAId }),
    });
    // RLS permite UPDATE solo de la fila propia: 0 filas afectadas.
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body) ? res.body.length : 1).toBe(0);
    // El perfil del SuperAdmin no fue tocado.
    const prof = await rest(`/rest/v1/profiles?id=eq.${saId}&select=active_store_id`, { key: saToken });
    expect(prof.body[0]?.active_store_id).toBe(storeBId);
  });

  // ═══════════════════ LIMPIEZA ═══════════════════

  afterAll(async () => {
    if (!LIVE) return;
    const guard = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* best-effort */ } };
    // Desactivar cuentas de prueba (el borrado físico de perfiles está
    // prohibido por el modelo — convención de las suites live).
    // NOTA: se baja el rol a 'usuario' (NO clerk) porque el trigger
    // validate_active_store exige tienda activa para encargado/clerk/warehouse,
    // y la limpieza fija active_store_id=null. SuperAdmin/baja de rol no es
    // necesaria para desactivar (is_active=false) y el trigger de escalada
    // no aplica: la escritura es service_role (auth.uid() IS NULL).
    await guard(() => rest(`/rest/v1/profiles?id=eq.${saId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ is_active: false, active_store_id: null, role: 'usuario' }),
    }));
    await guard(() => rest(`/rest/v1/profiles?id=eq.${taId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: false, role: 'usuario' }),
    }));
    await guard(() => rest(`/rest/v1/profiles?id=eq.${empId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: false, active_store_id: null, role: 'usuario' }),
    }));
    // Membresías, tiendas (soft-archive) y tenants de la suite.
    await guard(() => rest(`/rest/v1/user_store_memberships?user_id=eq.${empId}`, { method: 'DELETE' }));
    // El diseño de la BD impide el hard-delete de tiendas: el trigger de
    // auditoría inserta una fila audit_logs.store_id en el propio DELETE y la
    // FK RESTRICT revienta la transacción (verificado en vivo: 409/23503).
    // Limpieza correcta = soft-archive (misma semántica que la app) y
    // desasignación de tenant para poder borrar las organizations de prueba.
    const archiveIds = [storeAId, storeBId, storeCId, storeDId].filter(Boolean).join(',');
    if (archiveIds) {
      await guard(() => rest(`/rest/v1/stores?id=in.(${archiveIds})`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: false, is_archived: true, tenant_id: null }),
      }));
    }
    // Desasignar tenant de los perfiles de prueba (profiles.tenant_id es FK
    // hacia tenants) y eliminar los tenants de la suite.
    for (const pid of [saId, taId, empId]) {
      if (pid) await guard(() => rest(`/rest/v1/profiles?id=eq.${pid}`, {
        method: 'PATCH',
        body: JSON.stringify({ tenant_id: null }),
      }));
    }
    for (const tid of [t1Id, t2Id]) {
      if (tid) await guard(() => rest(`/rest/v1/tenants?id=eq.${tid}`, { method: 'DELETE' }));
    }
  }, 60_000);
});
