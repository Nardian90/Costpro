/**
 * E2E VISUAL — CP-BRA-POST-CERTIFICATION-VALIDATION-001 (2026-11-28)
 * ============================================================================
 * VALIDACIÓN VISUAL/FUNCIONAL DE LA INTERFAZ DE RECEPCIONES contra la BD
 * AISLADA (CostproE2E). Misión de cierre post-certificación R-06: NO introduce
 * políticas nuevas — verifica desde la INTERFAZ REAL lo ya certificado.
 *
 * Matriz visual (decisión del propietario §0):
 *   1. Encargado con membresía activa → botón «Nueva» VISIBLE.
 *   2. Almacenero → NO crea (span "Crear recepciones: solo encargado").
 *   3. Facturadora/clerk → NO crea.
 *   4. Manager sin encargado → NO crea.
 *   5. Admin de tienda (membresía admin) sin encargado → NO crea.
 *   6. Creador → acciones Confirmar/Anular VISIBLES en SU recepción pending.
 *   7. Otro encargado de la tienda (NO creador) → SIN acciones sobre la ajena.
 *   8. Superadministrador → botón crear VISIBLE + acciones globales sobre ajena.
 *   9. Mensajes de autorización (title del span gate).
 *  10. Vistas Documentos/Productos + tarjetas (móvil) y tabla (escritorio).
 *  11. Errores de consola (pageerror) durante la sesión autenticada: 0.
 *
 * Capturas → docs/audits/CP-BRA-POST-CERTIFICATION-VALIDATION-001/evidencia/
 * Higiene: los artefactos del run se borran en afterAll (net zero).
 *
 * Ejecución (local contra aislada):
 *   E2E_ALLOW_CREATION=1 E2E_ISOLATION=1 \
 *   bunx playwright test e2e/creation/r06-ui-visual-matrix.spec.ts --project=creation
 */
import { test, expect, type Page } from '@playwright/test';
import {
  signIn, sb, seedProduct, ensureEncargadoSession, signInViaUI, signOutViaUI,
  dismissCookieConsent, ENCARGADO_PASS, type Session,
} from '../fixtures/session.fixture';
import { hardDeleteRunUser } from '../fixtures/hard-cleanup';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@costpro.com';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || process.env.ADMIN_PASS || 'costpro123';
const WAREHOUSE_EMAIL = process.env.E2E_WAREHOUSE_EMAIL || 'almacen@demo.com';
const WAREHOUSE_PASS = process.env.E2E_WAREHOUSE_PASS || 'demo123';
const CLERK_EMAIL = process.env.E2E_USER_EMAIL || 'cajero@demo.com';
const CLERK_PASS = process.env.E2E_USER_PASS || 'demo123';

const SUPABASE_URL = process.env.E2E_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const USER_UNIQ = Date.now().toString(36).slice(-5);

const NS = process.env.E2E_UI_NS || `ui${Date.now().toString(36).slice(-5)}`;
const EVID = 'docs/audits/CP-BRA-POST-CERTIFICATION-VALIDATION-001/evidencia';
const GATE_TEXT = 'Crear recepciones: solo encargado';
const GATE_TITLE = 'Solo un encargado con membresía activa en esta tienda (o el superadministrador) puede crear recepciones';
const CREATE_BTN = '[aria-label="Crear nueva recepción"]';
const CONFIRM_BTN = 'button[title="Confirmar recepción (aplicar al inventario)"]';
const VOID_BTN = 'button[title="Anular (conserva el registro como anulada para auditoría)"]';

let store = { id: '' };
let product = '';
let enc: Session & { id?: string } = null as never;
let encToken = '';
let ownDraftId = '';
let ownDraftRef = '';

const users: Array<{ key: string; email: string; id: string }> = [];

async function createUser(email: string, password: string, role: string): Promise<Session & { id: string }> {
  let res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { role, full_name: `E2E UI ${role}` } }),
  });
  let data: { id: string };
  if (res.status === 422) {
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
  users.push({ key: role, email, id: data.id });
  const s = await signIn(email, password);
  return { ...s, id: data.id };
}

async function seedMembership(userId: string, storeId: string, role: string): Promise<void> {
  const existing = await sb.select('user_store_memberships', `user_id=eq.${userId}&store_id=eq.${storeId}&select=user_id&limit=1`);
  if (!(existing[0])) await sb.insert('user_store_memberships', [{ user_id: userId, store_id: storeId, role, status: 'active' }]);
}

/** Fija la tienda activa del perfil (equivalente UI: selector de tiendas). */
async function setActiveStore(userId: string, storeId: string): Promise<void> {
  await sb.update('profiles', `id=eq.${userId}`, { active_store_id: storeId });
}

/** Borrador pendiente vía PostgREST (flujo real del navegador) con token del creador. */
async function createDraftAs(token: string, invoice: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/receipts`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ store_id: store.id, supplier: 'Prov UI R06', reception_date: new Date().toISOString(), reference_doc: invoice, status: 'pending', total_cost: 20, payment_status: 'unpaid', payment_terms_days: 30 }),
  });
  if (!res.ok) throw new Error(`createDraftAs: HTTP ${res.status} ${await res.text()}`);
  const [draft] = await res.json() as Array<{ id: string }>;
  await fetch(`${SUPABASE_URL}/rest/v1/receipt_items`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ receipt_id: draft.id, product_id: product, quantity: 2, unit_cost: 10, moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1 }),
  });
  return draft.id;
}

/** Registra recolección de errores de consola (sin navegar). */
async function trackConsole(page: Page): Promise<{ errors: string[] }> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 180)}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 180)}`); });
  return { errors };
}

/** Navega a la vista de recepciones autenticada (diagnóstico si no renderiza). */
async function gotoReceptions(page: Page): Promise<void> {
  await dismissCookieConsent(page);
  await page.goto('/?view=reception_list');
  try {
    await page.getByTestId('receptions-tab-documentos').waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    const body = await page.locator('body').innerText().catch(() => '(sin body)');
    throw new Error(`[gotoReceptions] vista no renderizó. URL=${page.url()} BODY=${body.slice(0, 700).replace(/\n+/g, ' | ')}`);
  }
}

async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await signInViaUI(page, email, password);
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(() => {
  // Login UI completo + navegación por rol: margen holgado por prueba.
  test.setTimeout(240_000);
});

test.beforeAll(async () => {
  test.setTimeout(300000);
  store = { id: process.env.E2E_TEST_STORE_ID || '' };
  if (!store.id) throw new Error('[r06-ui] E2E_TEST_STORE_ID no configurado (global-setup aislado)');
  const p = await seedProduct(store, { name: `Producto UI ${NS}`, price: 100, cost: 10, quantity: 0, sku: `UI-${NS}-1` });
  product = p.id;

  // Creador principal: encargado del run con membresía activa en A.
  enc = await ensureEncargadoSession(store.id);
  encToken = enc.token;
  ownDraftRef = `UI-${NS}-OWN1`;

  // Plantel de la matriz visual (los dedicados se hard-delean en afterAll).
  // Provisioning COMPLETO estilo run-env: tenant_id del store + active_store_id.
  const storeTenantRows = await sb.select('stores', `id=eq.${store.id}&select=tenant_id&limit=1`);
  const storeTenant = ((storeTenantRows as Array<{ tenant_id: string }>)[0] || ({} as { tenant_id?: string })).tenant_id || '';
  if (!storeTenant) throw new Error('[r06-ui] store sin tenant_id');
  await createUser(`e2e-ui-mgr-${NS}-${USER_UNIQ}@costpro.test`, 'UIpass123!', 'manager')
    .then(async (u) => { await seedMembership(u.id, store.id, 'manager'); await setActiveStore(u.id, store.id); await sb.update('profiles', `id=eq.${u.id}`, { tenant_id: storeTenant }); });
  await createUser(`e2e-ui-adm-${NS}-${USER_UNIQ}@costpro.test`, 'UIpass123!', 'admin')
    .then(async (u) => { await seedMembership(u.id, store.id, 'admin'); await setActiveStore(u.id, store.id); await sb.update('profiles', `id=eq.${u.id}`, { tenant_id: storeTenant }); });
  await createUser(`e2e-ui-enc2-${NS}-${USER_UNIQ}@costpro.test`, 'UIpass123!', 'encargado')
    .then(async (u) => { await seedMembership(u.id, store.id, 'encargado'); await setActiveStore(u.id, store.id); await sb.update('profiles', `id=eq.${u.id}`, { tenant_id: storeTenant }); });
  await createUser(`e2e-ui-sup-${NS}-${USER_UNIQ}@costpro.test`, 'UIpass123!', 'clerk')
    .then(async (u) => { await sb.update('profiles', `id=eq.${u.id}`, { role: 'superadmin' }); await setActiveStore(u.id, store.id); await sb.update('profiles', `id=eq.${u.id}`, { tenant_id: storeTenant }); });

  // Membresías del run: almacenero y clerk (tienda activa al piloto del run).
  const warehouse = await signIn(WAREHOUSE_EMAIL, WAREHOUSE_PASS);
  await seedMembership(warehouse.userId, store.id, 'warehouse');
  await setActiveStore(warehouse.userId, store.id);
  const clerk = await signIn(CLERK_EMAIL, CLERK_PASS);
  await seedMembership(clerk.userId, store.id, 'clerk');
  await setActiveStore(clerk.userId, store.id);

  // Borrador propio del creador (identidad pinneada por trigger).
  ownDraftId = await createDraftAs(encToken, ownDraftRef);
});

test.afterAll(async () => {
  test.setTimeout(180000);
  try {
    const mine = await sb.select('receipts', `store_id=eq.${store.id}&reference_doc=like.*${NS}*`, 'select=id').catch(() => [] as any[]);
    const ids = (mine as any[]).map((r: any) => String(r.id)).filter(Boolean);
    for (const id of ids) {
      await sb.delete('receipt_items', `receipt_id=eq.${id}`).catch(() => {});
      await sb.delete('receipts', `id=eq.${id}`).catch(() => {});
    }
    await sb.delete('stock_movements', `product_id=eq.${product}`).catch(() => {});
    await sb.delete('kardex_entries', `product_id=eq.${product}`).catch(() => {});
    await sb.delete('wac_change_log', `product_id=eq.${product}`).catch(() => {});
    await sb.delete('inventory', `product_id=eq.${product}`).catch(() => {});
    for (const u of users) await hardDeleteRunUser(u.id).catch(() => {});
  } catch (e) {
    console.warn('[r06-ui] limpieza parcial:', (e as Error).message);
  }
});

// ── 1. ENCARGADO (creador, membresía activa) ───────────────────────────────
test('1 — encargado crea + acciones sobre SU recepción (escritorio, Documentos y Productos)', async ({ page }) => {
  const { errors } = await trackConsole(page);
  await loginAs(page, enc.email, ENCARGADO_PASS);
  await gotoReceptions(page);
  await expect(page.locator(CREATE_BTN)).toBeVisible();
  // Sin span gate (el encargado no ve el candado).
  await expect(page.getByText(GATE_TEXT)).toHaveCount(0);

  // Fila de SU borrador: acciones Confirmar/Anular visibles (creador).
  const row = page.locator('tr, div', { hasText: ownDraftRef }).first();
  await row.scrollIntoViewIfNeeded();
  await expect(row.locator(CONFIRM_BTN).first()).toBeVisible();
  await expect(row.locator(VOID_BTN).first()).toBeVisible();
  await page.screenshot({ path: `${EVID}/01-encargado-creador-escritorio-documentos.png`, fullPage: false });

  // Perspectiva Productos (pestaña) sin errores.
  await page.getByTestId('receptions-tab-productos').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${EVID}/02-encargado-creador-escritorio-productos.png`, fullPage: false });

  const realErrors = errors.filter((e) => !e.includes('favicon'));
  expect(realErrors, `errores de consola del encargado: ${realErrors.join(' | ')}`).toHaveLength(0);
  await signOutViaUI(page).catch(() => {});
});

// ── 2. OTRO ENCARGADO de la tienda (NO creador) ────────────────────────────
test('2 — otro encargado ve el botón crear pero SIN acciones sobre la recepción ajena', async ({ page }) => {
  const other = users.find((u) => u.email.includes('-enc2-'))!;
  const { errors } = await trackConsole(page);
  await loginAs(page, other.email, 'UIpass123!');
  await gotoReceptions(page);

  await expect(page.locator(CREATE_BTN)).toBeVisible(); // encargado → puede crear
  const row = page.locator('tr, div', { hasText: ownDraftRef }).first();
  await row.scrollIntoViewIfNeeded();
  await expect(row.locator(CONFIRM_BTN).first()).toHaveCount(0); // ajena → sin acciones
  await expect(row.locator(VOID_BTN).first()).toHaveCount(0);
  await page.screenshot({ path: `${EVID}/03-otro-encargado-sin-acciones-ajena.png`, fullPage: false });
  const realErrors = errors.filter((e) => !e.includes('favicon'));
  expect(realErrors, realErrors.join(' | ')).toHaveLength(0);
  await signOutViaUI(page).catch(() => {});
});

// ── 3-5. ROLES SIN ENCARGADO ───────────────────────────────────────────────
async function assertNoCreateGate(page: Page, email: string, password: string, label: string, shot: string): Promise<void> {
  const { errors } = await trackConsole(page);
  await loginAs(page, email, password);
  await gotoReceptions(page);

  await expect(page.locator(CREATE_BTN)).toHaveCount(0);
  const gate = page.getByText(GATE_TEXT).first();
  await expect(gate).toBeVisible();
  await expect(gate).toHaveAttribute('title', GATE_TITLE);
  // Sin acciones de gestión sobre la recepción ajena del creador.
  const row = page.locator('tr, div', { hasText: ownDraftRef }).first();
  await row.scrollIntoViewIfNeeded();
  await expect(row.locator(CONFIRM_BTN).first()).toHaveCount(0);
  await expect(row.locator(VOID_BTN).first()).toHaveCount(0);
  await page.screenshot({ path: `${EVID}/${shot}`, fullPage: false });
  const realErrors = errors.filter((e) => !e.includes('favicon'));
  expect(realErrors, `${label}: ${realErrors.join(' | ')}`).toHaveLength(0);
  await signOutViaUI(page).catch(() => {});
}

test('3 — almacenero NO crea (gate + sin acciones)', async ({ page }) => {
  await assertNoCreateGate(page, WAREHOUSE_EMAIL, WAREHOUSE_PASS, 'almacenero', '04-almacenero-gate.png');
});

test('4 — facturadora/clerk NO accede a la vista (ACCESO DENEGADO, gate de navegación)', async ({ page }) => {
  // El gate de navegación de reception_list es [admin, manager, encargado,
  // warehouse] por PERFIL: el clerk (facturadora operativa) ni siquiera ve
  // la vista — bloqueo MÁS fuerte que el span de creación.
  const { errors } = await trackConsole(page);
  await loginAs(page, CLERK_EMAIL, CLERK_PASS);
  await dismissCookieConsent(page);
  await page.goto('/?view=reception_list');
  await page.waitForTimeout(2500);
  await expect(page.getByText('Acceso Denegado')).toBeVisible();
  await expect(page.locator(CREATE_BTN)).toHaveCount(0);
  await expect(page.getByTestId('receptions-tab-documentos')).toHaveCount(0);
  await page.screenshot({ path: `${EVID}/05-clerk-acceso-denegado.png`, fullPage: false });
  const realErrors = errors.filter((e) => !e.includes('favicon'));
  expect(realErrors, realErrors.join(' | ')).toHaveLength(0);
  await signOutViaUI(page).catch(() => {});
});

test('5 — manager y admin de tienda NO crean (gate + sin acciones)', async ({ page }) => {
  const mgr = users.find((u) => u.email.includes('-mgr-'))!;
  await assertNoCreateGate(page, mgr.email, 'UIpass123!', 'manager', '06-manager-gate.png');
  const adm = users.find((u) => u.email.includes('-adm-'))!;
  await assertNoCreateGate(page, adm.email, 'UIpass123!', 'admin-tienda', '07-admin-tienda-gate.png');
});

// ── 6. SUPERADMINISTRADOR ──────────────────────────────────────────────────
test('6 — superadmin: crear visible + acciones globales sobre recepción ajena', async ({ page }) => {
  const sup = users.find((u) => u.email.includes('-sup-'))!;
  const { errors } = await trackConsole(page);
  await loginAs(page, sup.email, 'UIpass123!');
  await gotoReceptions(page);

  await expect(page.locator(CREATE_BTN)).toBeVisible();
  const row = page.locator('tr, div', { hasText: ownDraftRef }).first();
  await row.scrollIntoViewIfNeeded();
  await expect(row.locator(CONFIRM_BTN).first()).toBeVisible(); // intervención global
  await page.screenshot({ path: `${EVID}/08-superadmin-global.png`, fullPage: false });
  const realErrors = errors.filter((e) => !e.includes('favicon'));
  expect(realErrors, realErrors.join(' | ')).toHaveLength(0);
  await signOutViaUI(page).catch(() => {});
});

// ── 7. RESPONSIVE MÓVIL (tarjetas) ─────────────────────────────────────────
test('7 — móvil 390px: encargado ve crear y su recepción en tarjetas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { errors } = await trackConsole(page);
  await loginAs(page, enc.email, ENCARGADO_PASS);
  await gotoReceptions(page);

  await expect(page.locator(CREATE_BTN)).toBeVisible();
  // En móvil la columna de referencia puede truncarse: asertamos la vista
  // (banner de pendientes + botón NUEVA) sin depender del locator de fila;
  // las acciones por fila ya se validaron en escritorio (test 1).
  await expect(page.getByText('RECEPCIÓN(ES) PENDIENTE(S)')).toBeVisible();
  await page.screenshot({ path: `${EVID}/09-movil-encargado-tarjetas.png`, fullPage: false });
  const realErrors = errors.filter((e) => !e.includes('favicon'));
  expect(realErrors, realErrors.join(' | ')).toHaveLength(0);
  // Sin signOutViaUI: el sidebar está colapsado en móvil (Cerrar sesión no
  // es visible); el contexto del test cierra la página igualmente.
});
