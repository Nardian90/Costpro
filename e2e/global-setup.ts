/**
 * GLOBAL SETUP E2E — CostPro
 * ============================================================================
 * Propósito (FASE E2E-80):
 *   Muchos tests existentes hacían `test.skip()` silenciosamente porque las
 *   variables E2E_TEST_ADMIN_TOKEN / E2E_TEST_USER_TOKEN / *_ID / *_STORE_ID
 *   nunca se configuraban (ver auditoría: ~150 tests saltados = cobertura real
 *   ~20%). Este global-setup autentica usuarios REALES contra Supabase y
 *   exporta las variables ANTES de que Playwright lance los workers, de modo
 *   que `getAuthHeaders()` / los guards de skip encuentren tokens válidos.
 *
 *   Los workers de Playwright heredan el environment del proceso padre tras
 *   completar el globalSetup, por lo que los process.env definidos aquí
 *   llegan a todos los specs.
 *
 * Requisitos:
 *   - Servidor corriendo en localhost:3000 (pm2)
 *   - .env con NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY
 *   - Usuarios reales:
 *       admin:  E2E_ADMIN_EMAIL (default admin@costpro.com / costpro123)
 *       usuario: E2E_USER_EMAIL  (default cajero@demo.com  / demo123)
 *   - ENTORNO PILOTO MULTI-TIENDA provisionado (SEC-TS-08):
 *       'E2E PILOT A CostPro' + 'E2E PILOT B CostPro' — ver
 *       e2e/scripts/provision-pilot-env.cjs. Si no está provisionado,
 *       el setup ABORTA (fail-closed): nunca cae a una tienda real.
 *
 * Tokens Supabase duran 1h — la suite completa debe ejecutarse dentro de esa
 * ventana, o relanzar por módulos (los specs nuevos firman sesión propia).
 * ============================================================================
 */
import { config as loadEnv } from 'dotenv';
import { getPilotEnv } from './fixtures/pilot-env';

loadEnv({ path: './.env' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@costpro.com';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || process.env.ADMIN_PASS || 'costpro123';
const USER_EMAIL = process.env.E2E_USER_EMAIL || 'cajero@demo.com';
const USER_PASS = process.env.E2E_USER_PASS || 'demo123';

// SEC-TS-08: NO hay fallback a tiendas reales. El entorno piloto se resuelve
// por nombre exacto ('E2E PILOT A/B CostPro') y es FAIL-CLOSED (pilot-env.ts).
// Puerto Padre / Tienda Central / Enervida quedan FUERA del banco de pruebas.

export interface SupabaseSession {
  token: string;
  userId: string;
  email: string;
}

async function supabaseSignIn(email: string, password: string): Promise<SupabaseSession> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`[global-setup] Login falló para ${email}: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return { token: data.access_token, userId: data.user.id, email };
}

export default async function globalSetup(): Promise<void> {
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    throw new Error('[global-setup] Faltan NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY en .env');
  }

  // 1. Sesiones reales (admin + usuario regular)
  const admin = await supabaseSignIn(ADMIN_EMAIL, ADMIN_PASS);
  const user = await supabaseSignIn(USER_EMAIL, USER_PASS);

  process.env.E2E_TEST_ADMIN_TOKEN = admin.token;
  process.env.E2E_TEST_ADMIN_ID = admin.userId;
  process.env.E2E_TEST_USER_TOKEN = user.token;
  process.env.E2E_TEST_USER_ID = user.userId;

  // 2. ENTORNO PILOTO MULTI-TIENDA (SEC-TS-08) — fail-closed:
  //    E2E_TEST_STORE_ID apunta a PILOT STORE A (dedicada), NUNCA al
  //    active_store real del admin (Puerto Padre) ni a Tienda Central.
  const pilot = await getPilotEnv();
  process.env.E2E_TEST_STORE_ID = pilot.storeA.id;
  process.env.E2E_PILOT_STORE_A = pilot.storeA.id;
  process.env.E2E_PILOT_STORE_B = pilot.storeB.id;

  // 3. Producto de referencia DEDICADO dentro de la tienda piloto A (seed
  //    determinista, nunca un producto real de una tienda operativa)
  process.env.E2E_TEST_PRODUCT_ID = pilot.productA;
  // Producto de la tienda piloto B (cross-store: POS-007 y specs de aislamiento)
  process.env.E2E_TEST_FOREIGN_PRODUCT_ID = pilot.productB;

  console.log(
    `[global-setup] Sesiones listas — admin=${ADMIN_EMAIL} (${admin.userId.slice(0, 8)}…) ` +
    `user=${USER_EMAIL} (${user.userId.slice(0, 8)}…) store=PILOT A (${pilot.storeA.id.slice(0, 8)}…) ` +
    `pilotB=(${pilot.storeB.id.slice(0, 8)}…) product=${pilot.productA.slice(0, 8)}…`,
  );
}
