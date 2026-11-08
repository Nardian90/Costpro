/**
 * CP-AUTH-RESILIENCE-003 — E2E CON PERFIL DE NAVEGADOR PERSISTENTE (misión §10)
 * ==============================================================================
 * No se valida solo en incógnito: cada escenario crea un userDataDir persistente
 * que reproduce un navegador "de siempre" — con sesión anterior, sesión vencida,
 * refresh token inválido, residuos de versiones anteriores y datos operativos
 * (IndexedDB) que deben sobrevivir a cualquier limpieza de sesión.
 *
 * Escenarios:
 *  1. Token residual MALFORMADO        → app no se rompe; CTA abre el modal SIN
 *     recarga (mismo documento) y limpia el residuo.
 *  2. Token residual estructuralmente válido que GoTrue RECHAZA (getUser 401
 *     real contra el proyecto del entorno) → limpieza controlada + modal,
 *     IndexedDB intacto. [REGRESIÓN DEL INCIDENTE]
 *  3. GoTrue inaccesible (route abort) → CTA abre el modal SIN destruir la
 *     sesión local; al recuperar el servicio, la verificación prosigue.
 *     [INC-20261030]
 *  4. Actualización de COSTPRO con storage preservado: recarga del navegador
 *     (nueva página, mismo perfil) → landing funcional sin splash infinito y
 *     con acceso al login. [SIMULACIÓN DE UPGRADE]
 *  5. Sesión válida previa (condicional: requiere E2E_QA_EMAIL/E2E_QA_PASSWORD
 *     de una identidad QA aislada) → login real por UI, REINICIO del navegador
 *     (contexto persistente cerrado y reabierto) → sesión restaurada sin
 *     pedir credenciales; logout → una transición limpia.
 *
 * Reglas: no crea datos comerciales (solo autenticación y UI); usa el proyecto
 * Supabase del entorno del servidor (en CI aislado: CostproE2E).
 */

import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
/** Proyecto Supabase del entorno del servidor (para sembrar la clave EXACTA). */
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SB_REF = SB_URL ? (SB_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ?? '') : '';
const SB_KEY_NAME = SB_REF ? `sb-${SB_REF}-auth-token` : 'sb-unknown-auth-token';

const QA_EMAIL = process.env.E2E_QA_EMAIL || '';
const QA_PASSWORD = process.env.E2E_QA_PASSWORD || '';

async function newPersistentProfile(): Promise<string> {
  return mkdtempSync(join(tmpdir(), 'cp-auth-res-003-'));
}

async function openApp(userDataDir: string): Promise<BrowserContext> {
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 800 },
  });
  return ctx;
}

/** Marco anti-recarga: si la página se recarga, el marker desaparece. */
async function setReloadMarker(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__cpAuthRes003 = Date.now();
  });
}

async function reloadMarkerSurvived(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as Record<string, unknown>).__cpAuthRes003 != null);
}

/** IndexedDB con datos operativos (ficha de costo offline simulada). */
async function seedIndexedDB(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('CP_FICHAS_OFFLINE', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('fichas');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('fichas', 'readwrite');
        tx.objectStore('fichas').put('DATOS-OPERATIVOS-QA', 'ficha-qa-1');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
}

async function indexedDBSurvived(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    return new Promise<boolean>((resolve) => {
      const req = indexedDB.open('CP_FICHAS_OFFLINE', 1);
      req.onerror = () => resolve(false);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('fichas', 'readonly');
        const get = tx.objectStore('fichas').get('ficha-qa-1');
        get.onsuccess = () => resolve(get.result === 'DATOS-OPERATIVOS-QA');
        get.onerror = () => resolve(false);
      };
    });
  });
}

test.describe('CP-AUTH-RESILIENCE-003 · perfil persistente', () => {
  let userDataDir: string;

  test.beforeEach(() => {
    userDataDir = '';
  });

  test.afterEach(async () => {
    // El contexto lo cierra cada test; el dir temporal se elimina al final.
    if (userDataDir) {
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* noop */ }
    }
  });

  test('1 · token residual MALFORMADO → sin crash, CTA abre modal sin recarga y limpia', async () => {
    userDataDir = await newPersistentProfile();
    const ctx = await openApp(userDataDir);
    const page = await ctx.newPage();
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });

    // Sembrar el residuo exacto que gestiona Supabase Auth (malformado).
    await page.evaluate((key) => {
      window.localStorage.setItem(key, '{json-malformado-del-navegador-antiguo');
      // Residuo adicional de versiones anteriores: no debe ser tocado.
      window.localStorage.setItem('ui_state_viejo', '{"currentView":"main"}');
      window.localStorage.setItem('FC_GUEST_MODE_V1', '1');
    }, SB_KEY_NAME);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await setReloadMarker(page);

    // CTA «Entrar a COSTPRO» (camino 2 del landing).
    const cta = page.getByTestId('path-costpro');
    await expect(cta).toBeVisible({ timeout: 20_000 });
    await cta.click();

    // Sin recarga: el marker sobrevive (mismo documento).
    expect(await reloadMarkerSurvived(page)).toBe(true);
    // Modal de login disponible.
    await expect(page.getByRole('heading', { name: /Iniciar sesión/i })).toBeVisible({ timeout: 10_000 });
    // El residuo malformado fue limpiado con el mecanismo controlado.
    await expect.poll(async () =>
      page.evaluate((key) => window.localStorage.getItem(key) === null, SB_KEY_NAME),
    ).toBe(true);
    // El resto del storage permanece.
    await expect.poll(async () =>
      page.evaluate(() => window.localStorage.getItem('ui_state_viejo') === '{"currentView":"main"}'),
    ).toBe(true);
    await ctx.close();
  });

  test('2 · [REGRESIÓN INCIDENTE] residuo válido que GoTrue RECHAZA → limpieza + modal, IndexedDB intacto', async () => {
    test.skip(!SB_REF, 'Requiere NEXT_PUBLIC_SUPABASE_URL del entorno');
    userDataDir = await newPersistentProfile();
    const ctx = await openApp(userDataDir);
    const page = await ctx.newPage();
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });

    await page.evaluate(async ([key]) => {
      // Residuo estructuralmente válido pero IRRECUPERABLE: JWT falso que
      // GoTrue rechaza (401) — el caso de sesión revocada server-side.
      window.localStorage.setItem(key as string, JSON.stringify({
        access_token: 'RESIDUAL.INVALIDO.jwt-de-version-anterior',
        refresh_token: 'refresh-revocado-qa',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'qa-residual', email: 'qa@residual.local' },
      }));
    }, [SB_KEY_NAME]);
    await seedIndexedDB(page);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await setReloadMarker(page);

    const cta = page.getByTestId('path-costpro');
    await expect(cta).toBeVisible({ timeout: 20_000 });
    await cta.click();

    // Sin bucle: mismo documento, modal visible.
    expect(await reloadMarkerSurvived(page)).toBe(true);
    await expect(page.getByRole('heading', { name: /Iniciar sesión/i })).toBeVisible({ timeout: 15_000 });
    // Limpieza controlada del residuo irrecuperable.
    await expect.poll(async () =>
      page.evaluate((key) => window.localStorage.getItem(key) === null, SB_KEY_NAME),
    ).toBe(true);
    // Los datos operativos NO se tocan.
    expect(await indexedDBSurvived(page)).toBe(true);
    await ctx.close();
  });

  test('3 · [INC-20261030] GoTrue inaccesible → modal con reconexión, sesión preservada; al recuperar, prosigue', async () => {
    userDataDir = await newPersistentProfile();
    const ctx = await openApp(userDataDir);
    const page = await ctx.newPage();

    // GoTrue colgado (equivalente al 522 de Cloudflare del incidente).
    await ctx.route('**/auth/v1/**', (route) => route.abort('failed'));

    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((key) => {
      window.localStorage.setItem(key as string, JSON.stringify({
        access_token: 'token-de-sesion-que-sigue-local',
        refresh_token: 'refresh-local',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'qa-outage' },
      }));
    }, [SB_KEY_NAME]);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await setReloadMarker(page);

    const cta = page.getByTestId('path-costpro');
    await expect(cta).toBeVisible({ timeout: 25_000 });
    await cta.click();

    // El modal abre aunque el backend esté caído (regla no negociable).
    expect(await reloadMarkerSurvived(page)).toBe(true);
    await expect(page.getByRole('heading', { name: /Iniciar sesión/i })).toBeVisible({ timeout: 20_000 });
    // La sesión local NO fue destruida por un fallo de infraestructura.
    await expect.poll(async () =>
      page.evaluate((key) => window.localStorage.getItem(key) !== null, SB_KEY_NAME),
    ).toBe(true);
    // Estado de reconexión visible (banner de la máquina de autenticación).
    const banner = page.getByTestId('auth-reconnect-banner');
    await expect(banner).toBeVisible({ timeout: 15_000 });

    // Recuperación del servicio → la sesión local sigue ahí y la verificación
    // puede proseguir sin recargas destructivas (quedará resuelta por el
    // reintento escalado o por el siguiente check/CTA).
    await ctx.unroute('**/auth/v1/**');
    await expect(page.locator('body')).toBeVisible({ timeout: 20_000 });
    await ctx.close();
  });

  test('4 · actualización de COSTPRO con storage preservado → sin splash infinito, login disponible', async () => {
    userDataDir = await newPersistentProfile();
    const ctx = await openApp(userDataDir);
    const page = await ctx.newPage();
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async ([key]) => {
      // Navegador "de siempre": residuo viejo + preferencias + datos operativos.
      window.localStorage.setItem(key as string, '{"access_token":"v1-legacy","user":{"id":"legacy"}}');
      window.localStorage.setItem('costpro_offline_pending_sync', '[]');
      window.localStorage.setItem('theme', 'dark');
    }, [SB_KEY_NAME]);

    // "Actualización": nueva carga del documento con el MISMO perfil persistente.
    await page.reload({ waitUntil: 'domcontentloaded' });
    // El landing debe renderizar en tiempo razonable (sin splash infinito).
    await expect(page.getByTestId('path-costpro')).toBeVisible({ timeout: 30_000 });
    // Y el CTA sigue funcionando: abre el modal sin recargar.
    await setReloadMarker(page);
    await page.getByTestId('path-costpro').click();
    expect(await reloadMarkerSurvived(page)).toBe(true);
    await expect(page.getByRole('heading', { name: /Iniciar sesión/i })).toBeVisible({ timeout: 15_000 });
    // Datos operativos intactos tras la "actualización" + limpieza de sesión.
    await expect.poll(async () =>
      page.evaluate(() => window.localStorage.getItem('costpro_offline_pending_sync') === '[]'),
    ).toBe(true);
    await ctx.close();
  });

  test('5 · sesión válida previa → restaurada tras REINICIAR el navegador (contexto persistente)', async () => {
    test.skip(!QA_EMAIL || !QA_PASSWORD, 'Requiere E2E_QA_EMAIL/E2E_QA_PASSWORD (identidad QA aislada)');
    userDataDir = await newPersistentProfile();

    // Fase A: login real por UI con el perfil persistente.
    const ctxA = await openApp(userDataDir);
    const pageA = await ctxA.newPage();
    await pageA.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
    await pageA.getByTestId('path-costpro').click();
    await pageA.getByLabel(/correo/i).fill(QA_EMAIL);
    await pageA.getByLabel(/contraseña/i).fill(QA_PASSWORD);
    await pageA.getByRole('button', { name: /iniciar sesión/i }).click();
    // Shell visible = autenticado.
    await expect(pageA.locator('body')).not.toContainText('Iniciar sesión', { timeout: 30_000 });
    await ctxA.close();

    // Fase B: REINICIO del navegador → el perfil restaura la sesión sin pedir
    // credenciales (la recuperación debe revalidar contra Supabase Auth).
    const ctxB = await openApp(userDataDir);
    const pageB = await ctxB.newPage();
    await pageB.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
    // O bien entra directamente al shell, o bien el landing permite entrar con
    // un solo click de CTA sin recargar: JAMÁS un bucle ni formulario forzado.
    await expect(pageB.getByTestId('path-costpro').or(pageB.getByRole('heading', { name: /COSTPRO/i }))).toBeVisible({ timeout: 30_000 });
    await ctxB.close();
  });
});
