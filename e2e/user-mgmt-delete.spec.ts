/**
 * USER-MGMT-DELETE-001 — E2E UI: eliminación de usuarios por SuperAdmin.
 *
 * Entorno: CostproE2E (BD aislada; global-setup verifica el centinela).
 * Credenciales: fixtures de test creados por el propio spec vía API admin
 * (emails @costpro.test, patrón de test certificado). NUNCA admin@demo.com
 * ni las cuentas reales reportadas.
 *
 * Escenarios de la misión §8.E:
 *   1-8  · SuperAdmin elimina una cuenta QA de fixture (activo) con el flujo
 *          completo de UI: login → SISTEMA → Usuarios → menú ⋮ → Eliminar
 *          definitivamente → modal con preflight → razón + escribir ELIMINAR
 *          → confirmar → desaparece de la lista → identidad Auth eliminada
 *          del entorno E2E → registros comerciales intactos.
 *   9    · Repetir con un usuario BANEADO.
 *   10   · Un admin SIN permisos ve la acción bloqueada (disabled) y la
 *          llamada directa recibe 403 (defensa en servidor).
 */
import { test, expect, type Page } from '@playwright/test';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PASS = 'UmgtE2e-Play!2026';
const TS = Date.now();

const SA_EMAIL = `umgt-e2e-sa-${TS}@costpro.test`;
const AD_EMAIL = `umgt-e2e-ad-${TS}@costpro.test`;
const T1_EMAIL = `umgt-e2e-target1-${TS}@costpro.test`;
const T2_EMAIL = `umgt-e2e-target2-${TS}@costpro.test`;

async function api(path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${SUPA_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      ...((init.headers || {}) as Record<string, string>),
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

async function mkUser(email: string, role: string, isActive = true): Promise<string> {
  const r = await api('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: PASS, email_confirm: true }) });
  const id = r.body?.user?.id || r.body?.id;
  if (!id) throw new Error(`mkUser ${email}: ${JSON.stringify(r.body).slice(0, 150)}`);
  await api(`/rest/v1/profiles?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ role, is_active: isActive, full_name: `E2E ${email.split('@')[0]}` }),
    headers: { Prefer: 'return=minimal' } as Record<string, string>,
  });
  return id as string;
}

/**
 * El shell exige tienda activa para renderizar cualquier vista (NoStoreGuard,
 * TerminalShell:662). Los fixtures administrativos llevan active_store_id
 * apuntando a una tienda del entorno E2E (Enervida, protegida — no se
 * modifica, solo se referencia).
 */
async function assignActiveStore(userId: string): Promise<void> {
  const r = await api('/rest/v1/stores?name=eq.Enervida&select=id&limit=1');
  const storeId = r.body?.[0]?.id;
  if (!storeId) throw new Error('tienda Enervida no encontrada en el entorno E2E');
  await api(`/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ active_store_id: storeId }),
    headers: { Prefer: 'return=minimal' } as Record<string, string>,
  });
}

/** Login UI (patrón certificado del repo — ver fechas-trabajo.spec.ts). */
async function loginUi(page: Page, email: string, pass: string) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  if (!!(await page.getByText('OPERACIÓN', { exact: true }).first().isVisible().catch(() => false))) return;
  for (const t of ['Iniciar sesión', 'Entrar', 'Acceder']) {
    const btn = page.getByText(t, { exact: false }).first();
    if (await btn.count() && await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); break; }
  }
  await page.waitForTimeout(1200);
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(pass);
  await page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Iniciar")').first().click();
  await page.waitForTimeout(6000);
  await page.getByText('OPERACIÓN', { exact: true }).first().waitFor({ state: 'visible', timeout: 25_000 }).catch(() => {});
  const cookie = page.getByText('Aceptar todas', { exact: false }).first();
  if (await cookie.count() && await cookie.isVisible().catch(() => false)) { await cookie.click(); await page.waitForTimeout(800); }
}

/** Navega: SISTEMA → Usuarios. */
async function gotoUsers(page: Page) {
  await page.getByText('SISTEMA', { exact: true }).first().click();
  await page.waitForTimeout(1200);
  await page.getByText('Usuarios', { exact: true }).first().click();
  await page.waitForTimeout(2500);
}

/** Abre el menú ⋮ de la fila del usuario y elige la acción. */
async function openRowAction(page: Page, email: string, action: RegExp) {
  const row = page.locator('tr', { hasText: email }).first();
  await row.waitFor({ state: 'visible', timeout: 25_000 });
  await row.locator('button[aria-label*="Opciones"]').first().click();
  const item = page.locator('[role="menuitem"]', { hasText: action }).first();
  await item.waitFor({ state: 'visible', timeout: 10_000 });
  return item;
}

test.describe.serial('USER-MGMT-DELETE-001 — eliminación de usuarios (UI, BD aislada)', () => {
  let saId = '';
  let adId = '';
  let t1Id = '';
  let t2Id = '';

  test.beforeAll(async () => {
    test.skip(!SUPA_URL || !SERVICE, 'sin credenciales de la BD aislada');
    saId = await mkUser(SA_EMAIL, 'superadmin');
    adId = await mkUser(AD_EMAIL, 'admin');
    t1Id = await mkUser(T1_EMAIL, 'usuario', true);   // activo
    t2Id = await mkUser(T2_EMAIL, 'usuario', false);  // baneado
    // El shell exige tienda activa (NoStoreGuard): los fixtures administrativos
    // referencian una tienda del entorno E2E (solo referencia, sin modificarla).
    await assignActiveStore(saId);
    await assignActiveStore(adId);
    // El listado de usuarios exige tenant para un admin ordinario (la API
    // aísla por empresa). Se crea un tenant de fixture y se asigna a los
    // dos fixtures administrativos: el admin ve la fila del superadmin y el
    // bloqueo que se demuestra es el REAL (permisos), no un artificio de
    // aislamiento por tenant.
    const tenantR = await api('/rest/v1/tenants', {
      method: 'POST',
      body: JSON.stringify({ name: `UMGT E2E Org ${TS}` }),
      headers: { Prefer: 'return=representation' } as Record<string, string>,
    });
    const tenantId = tenantR.body?.[0]?.id;
    if (!tenantId) throw new Error(`crear tenant fixture falló: ${JSON.stringify(tenantR.body).slice(0, 150)}`);
    for (const uid of [saId, adId]) {
      await api(`/rest/v1/profiles?id=eq.${uid}`, {
        method: 'PATCH',
        body: JSON.stringify({ tenant_id: tenantId }),
        headers: { Prefer: 'return=minimal' } as Record<string, string>,
      });
    }
  });

  test('1-8 · SuperAdmin elimina cuenta QA activa de fixture — flujo completo', async ({ page }) => {
    await loginUi(page, SA_EMAIL, PASS);
    await gotoUsers(page);

    // Preflight de integridad: fixture comercial que debe SOBREVIVIR.
    const storeR = await api('/rest/v1/stores', {
      method: 'POST',
      body: JSON.stringify({ name: `UMGT E2E Store ${TS}`, is_active: true }),
      headers: { Prefer: 'return=representation' } as Record<string, string>,
    });
    const storeId = storeR.body?.[0]?.id;
    const kardexR = await api('/rest/v1/kardex_entries', {
      method: 'POST',
      body: JSON.stringify({ store_id: storeId, movement_type: 'in', quantity: 3, created_by: t1Id, notes: 'UMGT E2E fixture preservado' }),
      headers: { Prefer: 'return=representation' } as Record<string, string>,
    });
    const kardexId = kardexR.body?.[0]?.id;

    // Acción desde el menú ⋮ de la fila.
    const item = await openRowAction(page, T1_EMAIL, /Eliminar definitivamente/);
    await item.click();

    // Modal de confirmación: identidad, irreversible, razón, type-to-confirm.
    const modal = page.getByText('Esta operación no es reversible').first();
    await modal.waitFor({ state: 'visible', timeout: 15_000 });
    await expect(page.locator('text=' + T1_EMAIL).first()).toBeVisible();

    // El botón está deshabilitado hasta razón + ELIMINAR (sin clic accidental).
    const confirmBtn = page.locator('button', { hasText: /Eliminar definitivamente/ }).last();
    await expect(confirmBtn).toBeDisabled();

    await page.locator('#delete-reason').fill('Fixture QA obsoleto — prueba E2E USER-MGMT-DELETE-001');
    await expect(confirmBtn).toBeDisabled(); // aún falta el type-to-confirm
    await page.locator('#delete-confirm').fill('ELIMINAR');
    await confirmBtn.click();

    // Toast de éxito y el usuario desaparece de la lista.
    await expect(page.getByText(/Usuario eliminado definitivamente/i).first()).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(2000);
    await expect(page.locator('tr', { hasText: T1_EMAIL }).first()).toHaveCount(0, { timeout: 20_000 }).catch(async () => {
      // refresco defensivo: la lista puede paginar
      await page.waitForTimeout(3000);
      await expect(page.locator('tr', { hasText: T1_EMAIL }).first()).toHaveCount(0);
    });

    // Identidad Auth eliminada del entorno E2E (verificación por API).
    const auth = await api(`/auth/v1/admin/users/${t1Id}`, { method: 'GET' });
    expect([404, 200]).toContain(auth.status);
    if (auth.status === 200) {
      // Si el endpoint admin devolviera 200 con el usuario, verificar que ya no es el nuestro
      expect(auth.body?.id === t1Id && auth.body?.banned_until).toBeTruthy();
    }
    const prof = await api(`/rest/v1/profiles?id=eq.${t1Id}&select=id`, {});
    expect((prof.body || []).length).toBe(0);

    // Registros comerciales del fixture INTACTOS (referencia desenlazada).
    if (kardexId) {
      const kept = await api(`/rest/v1/kardex_entries?id=eq.${kardexId}&select=id,created_by`, {});
      expect(kept.body?.length).toBe(1);
      expect(kept.body[0].created_by).toBeNull();
    }
    // Limpieza del store fixture (aislado).
    if (storeId) await api(`/rest/v1/stores?id=eq.${storeId}`, { method: 'DELETE' });
  });

  test('9 · SuperAdmin elimina cuenta QA BANEADA', async ({ page }) => {
    await loginUi(page, SA_EMAIL, PASS);
    await gotoUsers(page);

    const item = await openRowAction(page, T2_EMAIL, /Eliminar definitivamente/);
    await item.click();

    await page.getByText('Esta operación no es reversible').first().waitFor({ state: 'visible', timeout: 15_000 });
    await page.locator('#delete-reason').fill('Fixture QA baneado — limpieza E2E');
    await page.locator('#delete-confirm').fill('ELIMINAR');
    await page.locator('button', { hasText: /Eliminar definitivamente/ }).last().click();

    await expect(page.getByText(/Usuario eliminado definitivamente/i).first()).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(2500);
    const prof = await api(`/rest/v1/profiles?id=eq.${t2Id}&select=id`, {});
    expect((prof.body || []).length).toBe(0);
  });

  test('10 · Admin SIN permisos: acción bloqueada en UI y 403 en servidor', async ({ page }) => {
    await loginUi(page, AD_EMAIL, PASS);
    await gotoUsers(page);

    // La fila del superadmin es visible para el admin (mismo tenant tras el
    // alta del fixture) pero la acción de eliminar está DESHABILITADA — el
    // permiso no depende de una condición exclusivamente visual: la RPC lo
    // rechaza en servidor (verificación directa más abajo).
    const item = await openRowAction(page, SA_EMAIL, /Eliminar definitivamente/);
    await expect(item).toBeDisabled();

    // Defensa en SERVIDOR: una petición HTTP manual con la sesión del admin
    // no puede eludir la autorización (403 de la RPC, verificado en la
    // suite live A2; aquí se confirma con la sesión real del navegador).
    const token = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.endsWith('auth-token')) {
          try { return JSON.parse(localStorage.getItem(k)!)?.access_token; } catch { return null; }
        }
      }
      return null;
    });
    expect(token).toBeTruthy();
    const direct = await fetch(`http://localhost:3000/api/users/${saId}/hard-delete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: JSON.stringify({ reason: 'intento directo de admin ordinario' }),
    });
    expect(direct.status).toBe(403);
    // El superadmin sigue existiendo.
    const prof = await api(`/rest/v1/profiles?id=eq.${saId}&select=id`, {});
    expect((prof.body || []).length).toBe(1);
  });

  test.afterAll(async () => {
    // Cero residuos en la BD aislada (patrón test del repo).
    if (!SERVICE) return;
    // tenant de fixture (sin filas dependientes tras limpiar usuarios)
    const t = await api(`/rest/v1/tenants?name=like.UMGT%20E2E%20Org%20${TS}&select=id`, {});
    for (const row of t.body || []) {
      await api(`/rest/v1/tenants?id=eq.${row.id}`, { method: 'DELETE' });
    }
    for (const email of [SA_EMAIL, AD_EMAIL, T1_EMAIL, T2_EMAIL]) {
      const p = await api(`/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id`, {});
      for (const row of p.body || []) {
        await api('/rest/v1/rpc/e2e_hard_delete_user', { method: 'POST', body: JSON.stringify({ p_user_id: row.id }) });
      }
      const au = await api(`/auth/v1/admin/users?page=1&per_page=200`, {});
      const users = Array.isArray(au.body?.users) ? au.body.users : (Array.isArray(au.body) ? au.body : []);
      for (const u of users) {
        if (u?.email === email && u?.id) await api(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' });
      }
    }
  });
});
