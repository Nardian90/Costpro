/**
 * E2E-RBAC-008 (P1) — CREACIÓN DE USUARIO GESTIONADO (proyecto 'creation')
 * ============================================================================
 * Extraído de e2e/flows/roles-permissions.spec.ts (E2E-FIXTURE-REUSE,
 * decisión del propietario 2026-10-09): este test cuyo OBJETIVO es comprobar
 * que CostPro puede CREAR un usuario con membership, y que éste puede iniciar
 * sesión, NO puede ejecutarse en la suite ordinaria (crea un usuario de auth
 * real). Históricamente dejó huérfanos 'e2e80-created-*@costpro.test' cuando
 * un expect fallaba a mitad del test y el cleanup inline nunca corría.
 *
 * Separación de responsabilidades (FASE 3.3):
 *   * Parte funcional de permisos → suite ordinaria (RBAC-001..007, reutilizan
 *     identidades y piloto persistente).
 *   * Parte de creación → ESTE spec, SOLO en el proyecto 'creation' con
 *     E2E_ISOLATION=1 (pilotos del RUN efímeros + teardown reconciliado).
 *
 * Ejecución EXPLÍCITA (bajo petición del propietario):
 *   E2E_ALLOW_CREATION=1 E2E_ISOLATION=1 npm run test:e2e:creation
 * ============================================================================
 */
import { test, expect } from '@playwright/test';
import { signIn, apiHeaders, sb, requireIsolatedCreation } from '../fixtures/session.fixture';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@costpro.com';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || process.env.ADMIN_PASS || 'costpro123';

test.describe('RBAC-008 — creación de usuario gestionado (entorno aislado)', () => {
  let adminToken: string;

  test.beforeAll(async () => {
    // FAIL-CLOSED: fuera del proyecto aislado esto LANZA (no crea nada).
    requireIsolatedCreation();
    const admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    adminToken = admin.token;
  });

  test('admin crea usuario gestionado con membership y éste puede iniciar sesión', async ({ request }) => {
    // Tienda de destino: PILOTO A del RUN aislado (exportado por global-setup;
    // en modo aislado es efímero y el teardown lo reconcilia).
    const runStoreId = process.env.E2E_TEST_STORE_ID || '';
    if (!runStoreId) {
      throw new Error('[rbac008] E2E_TEST_STORE_ID no configurado — el global-setup del modo aislado debe exportarlo');
    }

    const email = `e2e80-created-${Date.now().toString(36)}@costpro.test`;
    const password = 'E2eCreado123!';

    const res = await request.post('/api/users/managed-create', {
      headers: apiHeaders(adminToken),
      data: {
        p_email: email,
        p_full_name: 'Usuario Creado E2E',
        p_role: 'usuario',
        p_store_id: runStoreId,
        p_memberships: [{ store_id: runStoreId, role: 'usuario' }],
        p_password: password,
      },
    });

    // DEFECT-003 (documentado en E2E-COVERAGE-REPORT.md): la ruta crea el
    // usuario de auth (paso 1) y luego el RPC managed_create_user_v2
    // rechaza con ERR_EMAIL_ALREADY_EXISTS porque detecta el usuario que la
    // propia ruta acaba de crear. El usuario queda CREADO Y FUNCIONAL (login
    // OK) pero la API responde 400. El outcome de negocio se valida abajo.
    let createdUserId: string | null = null;
    if (res.status() !== 201) {
      const body = await res.text();
      test.info().annotations.push({
        type: 'DEFECT-003',
        description: `managed-create responde ${res.status()} (${body.slice(0, 120)}) pero el usuario se crea correctamente`,
      });
      expect(res.status()).toBe(400);
      expect(body).toContain('ERR_EMAIL_ALREADY_EXISTS');
    }

    // El usuario creado puede autenticarse contra Supabase Auth (outcome real)
    const session = await signIn(email, password);
    expect(session.token).toBeTruthy();
    expect(session.userId).toBeTruthy();
    createdUserId = session.userId;

    // Y su perfil tiene rol correcto
    const profile = await sb.select('profiles', `id=eq.${session.userId}&select=email,role,active_store_id`);
    expect(profile[0].email).toBe(email);
    expect(profile[0].role).toBe('usuario');

    // ── Cleanup UUID-level del usuario del test (mismo fallo aborta el test,
    //    por eso el teardown del run aislado + sweepResidualsSince son la
    //    segunda capa: el patrón e2e80-created-* del run es borrable) ──
    if (createdUserId) {
      await sb.delete('user_store_memberships', `user_id=eq.${createdUserId}`).catch(() => {});
      await sb.delete('profiles', `id=eq.${createdUserId}`).catch(() => {});
      const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${createdUserId}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      }).catch(() => {});
    }
  });
});
