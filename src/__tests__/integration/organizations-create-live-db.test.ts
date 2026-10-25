/**
 * CP-ORG-001 (continuación, 2026-10-25) — creación de organizaciones:
 * VERIFICACIÓN EXTREMO A EXTREMO CONTRA EL PROYECTO E2E AISLADO.
 *
 * Entorno: CostproE2E (sentinel e2e_is_isolated_db()=true verificado antes
 * de ejecutar). PRODUCCIÓN JAMÁS se toca: este fichero solo corre cuando el
 * proceso se lanza deliberadamente con credenciales del proyecto aislado
 * (E2E_LIVE_DB=1). En CI se omite (SKIP) porque el job de unit no recibe
 * credenciales E2E — se registra expresamente, no se oculta.
 *
 * Cadena probada SIN MOCKS de infraestructura (auth real, RLS real,
 * Postgres real):
 *   JWT real (password grant E2E) → getServerSession (validación Supabase
 *   auth) → withRole('superadmin') (perfil real de la BD) → validateOrigin →
 *   rateLimit real → Zod → chequeo de duplicados → INSERT en tenants →
 *   re-consulta del listado (GET) y verificación de persistencia por REST.
 *
 * Pruebas de aceptación cubiertas (§4):
 *   1 · SuperAdmin ve el botón/abre el formulario → pruebas de componente
 *       (organizations-view-create.test.tsx); aquí se prueba el flujo del
 *       endpoint completo con sesión real.
 *   2 · No autorizados (tenant_admin/clerk) NO pueden crear — 403 real y
 *       además INSERT directo por PostgREST rechazado por la RLS nueva
 *       (20261026140000).
 *   3 · Datos obligatorios validados (400 real de Zod).
 *   4 · Organización válida persiste y aparece en el listado tras nueva
 *       consulta (GET + SELECT directo por REST).
 *   5 · Duplicados → 409 real (recuento de filas sin cambios).
 *   6 · Envíos repetidos → el segundo idéntico recibe 409, sin duplicar.
 *   7 · Sin efectos colaterales: owner_id NULL, conteos de stores/
 *       memberships/profiles-asignados intactos.
 *   8 · Consulta/edición/eliminación existentes siguen funcionando (PATCH
 *       + DELETE reales sobre la organización creada).
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

const SA_EMAIL = `cp-org001-sa-${Date.now()}@e2e-test.local`;
const TA_EMAIL = `cp-org001-ta-${Date.now()}@e2e-test.local`;
const CL_EMAIL = `cp-org001-cl-${Date.now()}@e2e-test.local`;
const PASS = 'CpOrg001-Live!2026';
const ORG_NAME = `Corp Prueba E2E ${Date.now()}`;

type Counts = { tenants: number; stores: number; memberships: number; assignedProfiles: number };

let saToken = '';
let taToken = '';
let clToken = '';
let createdOrgId = '';
let baseline: Counts = { tenants: 0, stores: 0, memberships: 0, assignedProfiles: 0 };
let rlsTenantId = ''; // tenant creada en la prueba positiva de RLS (limpieza)

async function rest(
  path: string,
  init: RequestInit & { key?: string } = {},
): Promise<{ status: number; body: any }> {
  // Semántica Supabase REST: apikey = ANON (o service) y Authorization = JWT
  // del usuario (o service key). Con JWT de usuario, apikey DEBE ser anon.
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

async function api(
  method: string,
  token: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  // La RUTA REAL de la app con un NextRequest real: toda la cadena
  // withRole → getServerSession → validateOrigin → postHandler es auténtica.
  const url = `http://localhost:3000${path}`;
  const req = new NextRequest(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: 'http://localhost:3000',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  // Import diferido: los módulos leen env en import time y deben cargar con
  // las variables E2E ya presentes.
  const mod = await import('@/app/api/organizations/route');
  const idMod = await import('@/app/api/organizations/[id]/route');
  const handler =
    method === 'POST' ? mod.POST : method === 'GET' ? mod.GET : method === 'PATCH' ? idMod.PATCH : idMod.DELETE;
  const res = await handler(req as never);
  const text = await res.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function login(email: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ email, password: PASS }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`login ${email}: ${res.status} ${JSON.stringify(body)}`);
  return body.access_token;
}

async function countRows(table: string, extraQuery = ''): Promise<number> {
  const { body } = await rest(`/rest/v1/${table}?select=id&limit=1000${extraQuery}`);
  return Array.isArray(body) ? body.length : 0;
}
async function getBaseline(): Promise<Counts> {
  return {
    tenants: await countRows('tenants'),
    stores: await countRows('stores'),
    memberships: await countRows('user_store_memberships'),
    assignedProfiles: await countRows('profiles', '&tenant_id=not.is.null'),
  };
}

describe.skipIf(!LIVE)('CP-ORG-001 LIVE — creación E2E de organizaciones (proyecto E2E aislado)', () => {
  beforeAll(async () => {
    // ── Provisionamiento SOLO en el proyecto E2E aislado ──
    // sin company_name → el trigger NO crea tenants; roles por metadata.
    const mk = async (email: string, role?: string) => {
      const res = await fetch(`${BASE}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
        body: JSON.stringify({
          email,
          password: PASS,
          email_confirm: true,
          ...(role ? { user_metadata: { role } } : {}),
        }),
      });
      if (!res.ok) throw new Error(`provision ${email}: ${res.status} ${await res.text()}`);
      return (await res.json()).id as string;
    };
    const saId = await mk(SA_EMAIL); // tenant_admin por defecto → promover abajo
    await mk(TA_EMAIL);              // tenant_admin (negocio)
    await mk(CL_EMAIL, 'clerk');     // clerk explícito

    // Promoción administrativa de la cuenta de prueba a superadmin (la única
    // vía de promoción legítima es administrativa: service_role en aislado).
    const { status } = await rest(`/rest/v1/profiles?id=eq.${saId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'superadmin' }),
    });
    if (status >= 300) throw new Error(`promoción superadmin: ${status}`);

    // Login real (password grant) — JWT auténtico del proyecto aislado.
    saToken = await login(SA_EMAIL);
    taToken = await login(TA_EMAIL);
    clToken = await login(CL_EMAIL);

    // Baseline de efectos colaterales.
    baseline = await getBaseline();
  }, 120_000);

  afterAll(async () => {
    // Limpieza del aislado: organizaciones de prueba fuera; cuentas de
    // prueba desactivadas (el borrado físico de perfiles está prohibido por
    // trigger prevent_hard_delete_profile — comportamiento del modelo).
    try {
      if (rlsTenantId) {
        await rest(`/rest/v1/tenants?id=eq.${rlsTenantId}`, { method: 'DELETE' });
      }
      if (createdOrgId) {
        // por si un test anterior al de limpieza no llegó a borrarla
        await rest(`/rest/v1/tenants?id=eq.${createdOrgId}`, { method: 'DELETE' });
      }
      for (const email of [SA_EMAIL, TA_EMAIL, CL_EMAIL]) {
        const { body } = await rest(`/rest/v1/profiles?select=id&email=eq.${email}`);
        if (Array.isArray(body) && body[0]) {
          await rest(`/rest/v1/profiles?id=eq.${body[0].id}`, {
            method: 'PATCH',
            body: JSON.stringify({ is_active: false }),
          });
        }
      }
    } catch {
      // La limpieza es best-effort en el entorno aislado de pruebas.
    }
  }, 120_000);

  it('§4.4 SuperAdmin crea una organización válida (201) que PERSISTE en la BD aislada', async () => {
    const res = await api('POST', saToken, '/api/organizations', { name: ORG_NAME, is_active: true });
    expect(res.status).toBe(201);
    expect(res.body.organization?.id).toBeTruthy();
    createdOrgId = res.body.organization.id;

    // Persistencia real verificada por SELECT directo (service role REST).
    const check = await rest(`/rest/v1/tenants?id=eq.${createdOrgId}&select=id,name,owner_id,is_active`);
    expect(check.status).toBe(200);
    expect(check.body).toHaveLength(1);
    expect(check.body[0].name).toBe(ORG_NAME);
    expect(check.body[0].owner_id).toBeNull(); // §4.7: el creador NO se autoasigna
    expect(check.body[0].is_active).toBe(true);
  });

  it('§4.4 La organización creada APARECE en el listado tras una nueva consulta (GET)', async () => {
    const res = await api('GET', saToken, '/api/organizations?page=1&limit=50');
    expect(res.status).toBe(200);
    const names = (res.body.data || []).map((o: { name: string }) => o.name);
    expect(names).toContain(ORG_NAME);
    const mine = (res.body.data || []).find((o: { name: string }) => o.name === ORG_NAME);
    expect(mine.users).toBe(0);    // sin usuarios asignados
    expect(mine.stores_total).toBe(0); // sin tiendas creadas
  });

  it('§4.5/§4.6 Nombre duplicado → 409 real y NO se crea una segunda fila', async () => {
    const before = await countRows('tenants');
    const res = await api('POST', saToken, '/api/organizations', { name: ORG_NAME.toUpperCase() });
    expect(res.status).toBe(409);
    expect(await countRows('tenants')).toBe(before); // recuento sin cambios
  });

  it('§4.3 Validación real: nombre vacío → 400 de Zod', async () => {
    const res = await api('POST', saToken, '/api/organizations', { name: '   ' });
    expect(res.status).toBe(400);
  });

  it('§4.2 tenant_admin NO puede crear por la ruta (403 real de withRole + handler)', async () => {
    const res = await api('POST', taToken, '/api/organizations', { name: 'Corp Tenant Admin' });
    expect(res.status).toBe(403);
  });

  it('§4.2 clerk NO puede crear por la ruta (403 real)', async () => {
    const res = await api('POST', clToken, '/api/organizations', { name: 'Corp Clerk' });
    expect(res.status).toBe(403);
  });

  it('§4.2 tenant_admin NO puede crear por PostgREST DIRECTO (RLS 20261026140000)', async () => {
    const res = await rest('/rest/v1/tenants', {
      method: 'POST',
      key: taToken, // JWT autenticado + anon key: la vía directa de cliente
      body: JSON.stringify({ name: 'Intrusión Directa', subscription_status: 'trial' }),
    });
    expect(res.status).toBe(403); // new row violates row-level security policy
  });

  it('RLS positiva: SuperAdmin SÍ puede insertar por PostgREST directo (política is_superadmin)', async () => {
    const res = await rest('/rest/v1/tenants?select=id', {
      method: 'POST',
      key: saToken,
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ name: `Corp Directa ${Date.now()}`, subscription_status: 'trial' }),
    });
    expect(res.status).toBe(201);
    rlsTenantId = Array.isArray(res.body) ? res.body[0]?.id : res.body?.id;
    expect(rlsTenantId).toBeTruthy();
  });

  it('§4.7 La creación NO genera efectos colaterales (owner NULL, conteos intactos)', async () => {
    const now = await getBaseline();
    expect(now.stores).toBe(baseline.stores);              // 0 tiendas nuevas
    expect(now.memberships).toBe(baseline.memberships);   // 0 membresías nuevas
    expect(now.assignedProfiles).toBe(baseline.assignedProfiles); // sin asignaciones
    // tenants: +1 (la creada por la ruta) +1 (la RLS positiva) — exactamente
    // las dos escrituras deliberadas de esta suite, ninguna más.
    expect(now.tenants).toBe(baseline.tenants + 2);
  });

  it('§4.8 La edición existente sigue funcionando: PATCH renombra y persiste', async () => {
    const newName = `${ORG_NAME} Renombrada`;
    const res = await api('PATCH', saToken, `/api/organizations/${createdOrgId}`, { name: newName });
    expect(res.status).toBe(200);
    const check = await rest(`/rest/v1/tenants?id=eq.${createdOrgId}&select=name`);
    expect(check.body[0].name).toBe(newName);
  });

  it('§4.8 tenant_admin NO puede editar la organización ajena por la ruta (403)', async () => {
    const res = await api('PATCH', taToken, `/api/organizations/${createdOrgId}`, { name: 'Hack' });
    expect(res.status).toBe(403);
  });

  it('§4.9 Aislamiento: tenant_admin NO accede al listado de organizaciones (403, alcance admin+superadmin)', async () => {
    // La ruta GET de organizaciones es una vista administrativa: solo
    // admin y superadmin. tenant_admin (rol de negocio) recibe 403 y por
    // tanto no ve NINGUNA organización, incluida la de esta suite.
    const res = await api('GET', taToken, '/api/organizations?page=1&limit=50');
    expect(res.status).toBe(403);
  });

  it('§4.8 La eliminación existente sigue funcionando: DELETE quita la organización vacía', async () => {
    const res = await api('DELETE', saToken, `/api/organizations/${createdOrgId}`);
    expect(res.status).toBe(200);
    const check = await rest(`/rest/v1/tenants?id=eq.${createdOrgId}&select=id`);
    expect(check.body).toHaveLength(0);
    createdOrgId = '';
  });

  it('Estado final del aislado: sin residuos de esta suite fuera de lo previsto', async () => {
    const now = await getBaseline();
    // Tras la limpieza: queda SOLO la tenant de la prueba RLS (se borra en
    // afterAll) — las cuentas de prueba siguen (desactivadas) porque el
    // borrado físico de perfiles está prohibido por el modelo.
    expect(now.tenants).toBe(baseline.tenants + 1);
  });
});
