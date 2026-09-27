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
 *
 * Tokens Supabase duran 1h — la suite completa debe ejecutarse dentro de esa
 * ventana, o relanzar por módulos (los specs nuevos firman sesión propia).
 * ============================================================================
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: './.env' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@costpro.com';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || process.env.ADMIN_PASS || 'costpro123';
const USER_EMAIL = process.env.E2E_USER_EMAIL || 'cajero@demo.com';
const USER_PASS = process.env.E2E_USER_PASS || 'demo123';

// Puerto Padre VITALLCONS: membership admin ACTIVA (Tienda Central la tiene revocada →
// RLS bloquea las consultas de specs que usan E2E_TEST_STORE_ID)
const FALLBACK_STORE_ID = '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1';

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

function serviceHeaders(): Record<string, string> {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function getProfileActiveStore(userId: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=active_store_id`,
    { headers: serviceHeaders() },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0]?.active_store_id ?? null;
}

async function getFirstProductInStore(storeId: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/products?store_id=eq.${storeId}&is_active=eq.true&select=id&limit=1`,
    { headers: serviceHeaders() },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0]?.id ?? null;
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

  // 2. Tienda piloto (active_store del admin → Tienda Central Costpro)
  const storeId = (await getProfileActiveStore(admin.userId)) || FALLBACK_STORE_ID;
  process.env.E2E_TEST_STORE_ID = storeId;

  // 3. Producto de referencia dentro de la tienda piloto
  const productId = await getFirstProductInStore(storeId);
  if (productId) process.env.E2E_TEST_PRODUCT_ID = productId;

  console.log(
    `[global-setup] Sesiones listas — admin=${ADMIN_EMAIL} (${admin.userId.slice(0, 8)}…) ` +
    `user=${USER_EMAIL} (${user.userId.slice(0, 8)}…) store=${storeId.slice(0, 8)}… ` +
    `product=${productId ? productId.slice(0, 8) + '…' : 'N/A'}`,
  );
}
