/**
 * E2E — CP-OFFERS-PUERTOPADRE-001 — Módulo Ofertas (Inicio → OPERACIÓN →
 * Ventas → Opciones → Ofertas).
 *
 * Cobertura (matriz mínima de la misión, adaptada al modelo REAL — ver
 * docs/audits/CP_OFFERS_PUERTOPADRE_001.md §matriz):
 *
 *   API (strict):
 *     1. POST sin sesión → 401
 *     2. POST con campos realmente inválidos (precio 0 / numero vacío /
 *        sin productos) → 400 + details por campo (mensajes específicos)
 *     3. POST válido → 201 + registro persistido en PostgreSQL verificado
 *        por id (store_id, created_by, productos, subtotal/total)
 *     4. POST a tienda ajena → 403
 *     5. POST con rol sin permiso de escritura (clerk) → 403 (alineado
 *        con la política RLS INSERT de ofertas)
 *     6. PATCH válido → 200 + cambios persistidos + recálculo financiero
 *     7. PATCH con rol clerk → 403
 *     8. DELETE → 200 + soft-delete (status=expired) verificado en BD
 *
 *   UI (browser, flujo real):
 *     9.  Formulario completo (incl. precio) → crea SIN falso rechazo y
 *         aparece en la lista
 *     10. Formulario con campos APARENTEMENTE completos pero precio vacío
 *         (escenario del defecto) → toast ESPECÍFICO + resumen role=alert
 *         + foco en el campo + NO se envía POST
 *     11. Recarga tras crear → la oferta sigue en la lista (persistencia)
 *     12. Doble clic rápido en Crear → UNA sola oferta (sin duplicados)
 *     13. Error de red al crear → toast de error y datos CONSERVADOS
 *
 * No aplican al modelo vigente (documentado, no se inventan):
 *   - «Fecha final anterior a inicial»: el modelo NO tiene fecha de
 *     vencimiento (solo `fecha` + `validez` texto libre).
 *   - «Descuento fuera de rango»: Zod exige descuento >= 0 (sin tope);
 *     el impuesto sí está acotado 0-100.
 *   - «Producto inexistente»: los ítems de oferta son texto libre (sin FK
 *     al catálogo) — no existe rechazo por producto inexistente.
 *   - «Oferta vencida no se aplica en ventas»: las ofertas NO afectan el
 *     POS (módulo documental independiente — sin integración de precios).
 *
 * Requiere: servidor en localhost:3000 + entorno aislado (global-setup,
 * E2E_ISOLATION=1) — CostproE2E (CP-INFRA-011). Fail-closed: skip sin env.
 */

import { test, expect, type Page } from '@playwright/test';
import {
  signIn,
  injectSession,
  apiHeaders,
  sb,
  BASE_URL,
  type Session,
} from './fixtures/session.fixture';

const TEST_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@costpro.com';
const TEST_PASS = process.env.E2E_ADMIN_PASS || 'costpro123';
const CLERK_EMAIL = process.env.E2E_USER_EMAIL || 'cajero@demo.com';
const CLERK_PASS = process.env.E2E_USER_PASS || 'demo123';
const PILOT_A = process.env.E2E_PILOT_STORE_A || '';
const PILOT_B = process.env.E2E_PILOT_STORE_B || '';

let session: Session;
let clerkSession: Session;
let originalActiveStore: string | null | null;

/** Ofertas creadas por el spec — cleanup en afterAll (por id exacto). */
const createdOfertaIds: string[] = [];
const runTag = `E2E-OF-${Date.now().toString(36)}`;

/** Payload de oferta válida (el mismo contrato que envía el formulario). */
function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    store_id: PILOT_A,
    numero: `${runTag}-001`,
    fecha: new Date().toLocaleDateString('en-CA'),
    objeto: 'Suministro de materiales de construcción (E2E)',
    suministrador: {
      empresa: 'E2E Suministradora',
      codigo_reup: '', codigo_nit: '', direccion: '', telefono: '',
      cuenta_bancaria: '', email: '',
    },
    cliente: {
      empresa: 'E2E Cliente Constructora',
      codigo_reup: '', codigo_nit: '', direccion: '', telefono: '',
      email: '', contacto: '',
    },
    productos: [
      { codigo: 'CEM-50', descripcion: 'Cemento gris 50kg', um: 'U', cantidad: 10, precio_unitario: 2500 },
    ],
    descuento: 0,
    itbis: 0,
    moneda: 'CUP',
    ...overrides,
  };
}

test.beforeAll(async () => {
  test.skip(!PILOT_A || !PILOT_B, 'Entorno aislado E2E no disponible (E2E_PILOT_STORE_A/B)');

  session = await signIn(TEST_EMAIL, TEST_PASS);
  clerkSession = await signIn(CLERK_EMAIL, CLERK_PASS);

  // Active store del admin → PILOT A (restaurar al terminar)
  const rows = await sb.select<{ active_store_id: string | null }>(
    'profiles', `id=eq.${session.userId}&select=active_store_id&limit=1`,
  );
  originalActiveStore = rows[0]?.active_store_id ?? null;
  if (originalActiveStore !== PILOT_A) {
    await sb.update('profiles', `id=eq.${session.userId}`, { active_store_id: PILOT_A });
  }
});

test.afterAll(async () => {
  // Cleanup EXACTO por id — nunca barridos globales (CP-INFRA-011)
  for (const id of createdOfertaIds) {
    await sb.delete('ofertas', `id=eq.${id}`).catch(() => {});
  }
  if (originalActiveStore !== null && originalActiveStore !== undefined) {
    await sb.update('profiles', `id=eq.${session.userId}`, { active_store_id: originalActiveStore }).catch(() => {});
  }
});

// ── Helpers de UI ─────────────────────────────────────────────────────────────

async function openOfertasView(page: Page) {
  await injectSession(page, session);
  await page.goto(`${BASE_URL}/?view=ofertas`);
  await page.waitForLoadState('domcontentloaded');
  // El header de la vista (h2 global) — el panel izquierdo también dice "Ofertas"
  await expect(page.getByRole('heading', { name: 'Ofertas' }).first()).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(1500);
}

async function startNewOferta(page: Page) {
  await page.getByRole('button', { name: /^Nueva$/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Nueva Oferta Comercial' })).toBeVisible({ timeout: 15_000 });
}

async function fillCompleteForm(page: Page, numero: string) {
  await page.locator('input[data-field="numero"]').fill(numero);
  await page.locator('input[data-field="objeto"]').fill('Suministro E2E de materiales');
  await page.locator('input[data-field="cliente.empresa"]').fill('E2E Cliente S.A.');
  await page.locator('input[placeholder="Descripción del producto"]').fill('Cemento gris 50kg');
  await page.locator('.grid.grid-cols-12 input[type="number"]').nth(1).fill('2500');
}

// ── API: validación y persistencia ───────────────────────────────────────────

test.describe('Ofertas API — validación estricta', () => {

  test('POST sin sesión → 401', async ({ request }) => {
    const res = await request.post('/api/ofertas', { data: validPayload() });
    expect(res.status()).toBe(401);
  });

  test('POST con precio_unitario 0 → 400 con detail específico del campo', async ({ request }) => {
    const res = await request.post('/api/ofertas', {
      headers: apiHeaders(session.token),
      data: validPayload({
        numero: `${runTag}-INVALID-1`,
        productos: [{ codigo: 'X', descripcion: 'Sin precio', um: 'U', cantidad: 1, precio_unitario: 0 }],
      }),
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
    // El detail debe identificar EL campo (path productos.0.precio_unitario)
    const detail = (body.details || []).find((d: { path: string }) => d.path === 'productos.0.precio_unitario');
    expect(detail).toBeDefined();
    expect(detail.message).toMatch(/precio/i);
  });

  test('POST con numero vacío y sin productos → 400 con todos los details', async ({ request }) => {
    const res = await request.post('/api/ofertas', {
      headers: apiHeaders(session.token),
      data: validPayload({ numero: '', productos: [] }),
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    const paths = (body.details || []).map((d: { path: string }) => d.path);
    expect(paths).toContain('numero');
    expect(paths).toContain('productos');
  });

  test('POST válido → 201 + registro persistido en PostgreSQL con relaciones correctas', async ({ request }) => {
    const numero = `${runTag}-API-CREATE`;
    const res = await request.post('/api/ofertas', {
      headers: apiHeaders(session.token),
      data: validPayload({ numero }),
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBeDefined();
    createdOfertaIds.push(body.data.id);

    // Verificación DIRECTA en PostgreSQL (service-role, solo lectura)
    const rows = await sb.select<{
      id: string; store_id: string; created_by: string; numero: string;
      productos: Array<{ descripcion: string; cantidad: number; precio_unitario: number }>;
      subtotal: number; total: number; status: string;
    }>('ofertas', `id=eq.${body.data.id}&select=id,store_id,created_by,numero,productos,subtotal,total,status&limit=1`);

    expect(rows).toHaveLength(1);
    expect(rows[0].store_id).toBe(PILOT_A);
    expect(rows[0].created_by).toBe(session.userId);
    expect(rows[0].numero).toBe(numero);
    expect(rows[0].status).toBe('draft');
    expect(rows[0].productos[0].precio_unitario).toBe(2500);
    // Recálculo server-side: 10 × 2500 = 25000
    expect(rows[0].subtotal).toBe(25000);
    expect(rows[0].total).toBe(25000);
  });

  test('POST a tienda ajena (sin membresía) → 403', async ({ request }) => {
    const res = await request.post('/api/ofertas', {
      headers: apiHeaders(clerkSession.token),
      data: validPayload({ store_id: PILOT_B, numero: `${runTag}-FOREIGN` }),
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.message).toMatch(/no tienes acceso/i);
  });

  test('POST con rol clerk (membresía activa pero sin permiso de escritura) → 403 alineado con RLS', async ({ request }) => {
    // La política RLS INSERT de ofertas exige admin/manager/encargado.
    // El clerk ES miembro de PILOT_A pero NO puede crear (divergencia
    // corregida por CP-OFFERS-PUERTOPADRE-001: antes pasaba el check).
    const res = await request.post('/api/ofertas', {
      headers: apiHeaders(clerkSession.token),
      data: validPayload({ store_id: PILOT_A, numero: `${runTag}-CLERK` }),
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.message).toMatch(/rol no permite crear/i);
  });
});

test.describe('Ofertas API — edición y soft-delete', () => {
  let ofertaId: string;

  test.beforeAll(async () => {
    // Crear oferta base para editar/eliminar (API real)
    const res = await fetch(`${BASE_URL}/api/ofertas`, {
      method: 'POST',
      headers: apiHeaders(session.token),
      body: JSON.stringify(validPayload({ numero: `${runTag}-EDIT` })),
    });
    const body = await res.json();
    expect(res.status).toBe(201);
    ofertaId = body.data.id;
    createdOfertaIds.push(ofertaId);
  });

  test('PATCH válido → 200 + cambios y recálculo persistidos en BD', async ({ request }) => {
    const res = await request.patch(`/api/ofertas/${ofertaId}`, {
      headers: apiHeaders(session.token),
      data: {
        productos: [
          { codigo: 'CEM-50', descripcion: 'Cemento gris 50kg (editado)', um: 'U', cantidad: 5, precio_unitario: 3000 },
        ],
        descuento: 1000,
      },
    });
    expect(res.status()).toBe(200);

    // Verificación directa en PostgreSQL: subtotal 15000, total 14000
    const rows = await sb.select<{ productos: unknown[]; subtotal: number; total: number; descuento: number }>(
      'ofertas', `id=eq.${ofertaId}&select=productos,subtotal,total,descuento&limit=1`,
    );
    expect(rows[0].subtotal).toBe(15000);
    expect(rows[0].descuento).toBe(1000);
    expect(rows[0].total).toBe(14000);
  });

  test('PATCH con rol clerk → 403 (escritura restringida por RLS)', async ({ request }) => {
    const res = await request.patch(`/api/ofertas/${ofertaId}`, {
      headers: apiHeaders(clerkSession.token),
      data: { objeto: 'HACKED' },
    });
    expect(res.status()).toBe(403);
  });

  test('GET detalle con sesión de otra tienda/clerk sin membresía → 403/404', async ({ request }) => {
    // clerk NO es miembro de PILOT_A… espera: en modo aislado el cajero SÍ es
    // miembro de PILOT_A (rol clerk) → puede LEER (RLS SELECT permite
    // cualquier miembro activo). Usamos la tienda B ajena para el caso 403:
    // crear oferta en PILOT_B como admin y pedir el detalle como clerk.
    const createRes = await fetch(`${BASE_URL}/api/ofertas`, {
      method: 'POST',
      headers: apiHeaders(session.token),
      body: JSON.stringify(validPayload({
        store_id: PILOT_B,
        numero: `${runTag}-ISOLATION`,
      })),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    createdOfertaIds.push(created.data.id);

    const res = await request.get(`/api/ofertas/${created.data.id}`, {
      headers: apiHeaders(clerkSession.token),
    });
    // clerk no tiene membresía en PILOT_B → 403 (o 404 vía RLS del GET inicial)
    expect([403, 404]).toContain(res.status());
  });

  test('DELETE → 200 + soft-delete (status=expired) verificado en BD', async ({ request }) => {
    const res = await request.delete(`/api/ofertas/${ofertaId}`, {
      headers: apiHeaders(session.token),
    });
    expect(res.status()).toBe(200);

    const rows = await sb.select<{ status: string }>('ofertas', `id=eq.${ofertaId}&select=status&limit=1`);
    expect(rows[0].status).toBe('expired');
    // La lista NO la muestra (GET filtra status neq expired)
    const listRes = await request.get(`/api/ofertas?storeId=${PILOT_A}&search=${runTag}-EDIT`, {
      headers: apiHeaders(session.token),
    });
    const listBody = await listRes.json();
    expect(listBody.data).toHaveLength(0);
  });
});

// ── UI: flujo real del formulario ────────────────────────────────────────────

test.describe('Ofertas UI — validación específica y persistencia', () => {
  test.setTimeout(120_000);

  test('formulario APARENTEMENTE completo (precio vacío) → error específico, sin POST, foco y datos conservados', async ({ page }) => {
    await openOfertasView(page);
    await startNewOferta(page);

    let postCount = 0;
    page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/api/ofertas')) postCount++; });

    // Completa TODO excepto el precio (escenario reportado por el dueño)
    await page.locator('input[data-field="numero"]').fill(`${runTag}-UI-NOPRECIO`);
    await page.locator('input[data-field="objeto"]').fill('Suministro E2E');
    await page.locator('input[data-field="cliente.empresa"]').fill('Cliente E2E');
    await page.locator('input[placeholder="Descripción del producto"]').fill('Cemento');

    await page.getByRole('button', { name: /Crear Oferta/i }).first().click();
    await page.waitForTimeout(1500);

    // 1. Toast ESPECÍFICO (no el genérico «corrija los errores»)
    const toast = await page.locator('[data-sonner-toast]').first().textContent();
    expect(toast).toMatch(/Revisa 1 campo/i);
    expect(toast).toMatch(/precio unitario del producto 1/i);

    // 2. Resumen accesible role=alert con el mismo mensaje
    const summary = page.locator('[role="alert"][aria-label="Resumen de errores del formulario"]');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(/precio unitario del producto 1/i);

    // 3. Foco en el campo inválido
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-field'));
    expect(focused).toBe('productos.0.precio_unitario');

    // 4. NO se envió ningún POST
    expect(postCount).toBe(0);

    // 5. Los datos introducidos se conservan
    await expect(page.locator('input[data-field="numero"]')).toHaveValue(`${runTag}-UI-NOPRECIO`);
    await expect(page.locator('input[placeholder="Descripción del producto"]')).toHaveValue('Cemento');
  });

  test('formulario COMPLETO crea sin falso rechazo y persiste tras recarga', async ({ page }) => {
    await openOfertasView(page);
    await startNewOferta(page);

    const numero = `${runTag}-UI-CREATE`;
    await fillCompleteForm(page, numero);
    await page.getByRole('button', { name: /Crear Oferta/i }).first().click();

    await expect(page.locator('[data-sonner-toast]').first()).toContainText('Oferta creada exitosamente', { timeout: 30_000 });

    // Aparece en la lista (refrescada por la invalidación de React Query)
    await expect(page.locator(`button[aria-label="Oferta ${numero}"]`)).toBeVisible({ timeout: 15_000 });

    // Registro + id para cleanup: búsqueda por numero vía service-role
    const rows = await sb.select<{ id: string }>('ofertas', `numero=eq.${numero}&select=id&limit=1`);
    expect(rows).toHaveLength(1);
    createdOfertaIds.push(rows[0].id);

    // RECARGA completa → la oferta sigue (persistencia real)
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator(`button[aria-label="Oferta ${numero}"]`)).toBeVisible({ timeout: 45_000 });
  });

  test('doble clic rápido en Crear → UNA sola oferta (sin duplicados)', async ({ page }) => {
    await openOfertasView(page);
    await startNewOferta(page);

    const numero = `${runTag}-UI-DOUBLE`;
    await fillCompleteForm(page, numero);

    let postCount = 0;
    page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/api/ofertas')) postCount++; });

    const crear = page.getByRole('button', { name: /Crear Oferta/i }).first();
    await crear.click({ clickCount: 2, delay: 30 });
    await page.waitForTimeout(4000);

    // Solo UN POST salió del navegador y solo UN registro existe en BD
    expect(postCount).toBe(1);
    const rows = await sb.select<{ id: string }>('ofertas', `numero=eq.${numero}&select=id`);
    expect(rows).toHaveLength(1);
    createdOfertaIds.push(rows[0].id);
  });

  test('error de red al crear → toast de error y datos del formulario conservados', async ({ page }) => {
    await openOfertasView(page);
    await startNewOferta(page);

    // Abortar TODA escritura a /api/ofertas (simula caída de red)
    await page.route('**/api/ofertas', route => {
      if (route.request().method() === 'POST') return route.abort('failed');
      return route.continue();
    });

    await fillCompleteForm(page, `${runTag}-UI-NETFAIL`);
    await page.getByRole('button', { name: /Crear Oferta/i }).first().click();
    await page.waitForTimeout(3000);

    // Toast de error visible…
    await expect(page.locator('[data-sonner-toast]').first()).toContainText(/error al crear oferta/i, { timeout: 15_000 });
    // …y el formulario SIGUE visible con los datos intactos
    await expect(page.locator('input[data-field="numero"]')).toHaveValue(`${runTag}-UI-NETFAIL`);
    await expect(page.locator('input[placeholder="Descripción del producto"]')).toHaveValue('Cemento gris 50kg');
    await expect(page.locator('input[data-field="objeto"]')).toHaveValue('Suministro E2E de materiales');
  });
});
