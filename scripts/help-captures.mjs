#!/usr/bin/env node
/**
 * help-captures.mjs — Capturas de pantalla oficiales del Centro de Ayuda
 * ============================================================================
 * Genera las capturas de pantalla que ilustran la documentación de
 * knowledge/help/*.md, siguiendo el estándar definido en
 * docs/audits/HELP-SCREENSHOT-STANDARD.md (ISO/IEC 26514 + Diátaxis).
 *
 * Convenciones de captura:
 *   - Viewport 1440x900, deviceScaleFactor=2 (nitidez retina).
 *   - Sesión real vía /?login=1 (flujo auténtico UI → Supabase → shell).
 *   - Banner de cookies pre-sembrado (formato src/lib/consent.ts) para que
 *     no contamine las capturas.
 *   - Espera networkidle + settle, sin recortes ni anotaciones externas.
 *   - Salida: PNG temporal fuera del repo → conversión WebP (1440px, q82)
 *     con scripts/convert-captures.py → public/help/capturas/.
 *
 * Uso:
 *   node scripts/help-captures.mjs            # todas las capturas
 *   node scripts/help-captures.mjs pos cash   # sólo las indicadas
 *   node scripts/help-captures.mjs --list     # lista de capturas
 * ============================================================================
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// ── Cargar .env del repo (sin dependencia dotenv) ──
(function loadEnv() {
  try {
    const raw = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* .env opcional */ }
})();

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OUT_DIR = process.env.CAPTURES_OUT || '/home/z/my-project/scripts/captures-png';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@costpro.com';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || 'costpro123';

const CAPTURES = [
  // ── Núcleo / empezar ──
  { name: 'dashboard-command-center', view: 'dashboard' },
  { name: 'asistente-darian', view: 'chat' },
  { name: 'paleta-comandos', view: 'dashboard', action: 'palette' },
  { name: 'selector-tienda', view: 'dashboard', action: 'store-switcher' },
  { name: 'centro-ayuda', view: 'help' },
  // ── Costos ──
  { name: 'fichas-costo-gestion', view: 'cost-sheets' },
  { name: 'ficha-costo-editor', view: 'estructura-costo' },
  { name: 'costeo-dinamico', view: 'costeo-dinamico' },
  // ── Ventas / POS ──
  { name: 'pos-terminal', view: 'pos' },
  { name: 'catalogo-ventas-tabla', view: 'sales_catalog' },
  { name: 'historial-ventas', view: 'sales' },
  { name: 'devoluciones', view: 'devolutions' },
  { name: 'clientes-crm', view: 'customers' },
  { name: 'caja-arqueo', view: 'cash' },
  // ── Inventario ──
  { name: 'catalogo-productos', view: 'catalog' },
  { name: 'inventario-stock', view: 'inventory' },
  { name: 'recepcion-mercancia', view: 'recepcion' },
  { name: 'transferencias', view: 'transferencias' },
  { name: 'ajustes-inventario', view: 'inventory_adjustments' },
  { name: 'venta-por-conteo', view: 'inventory_count' },
  // ── Análisis / admin ──
  { name: 'reportes-generador', view: 'reports' },
  { name: 'ipv-conciliacion', view: 'ipv' },
  { name: 'gestion-tiendas', view: 'stores' },
  { name: 'roles-permisos', view: 'roles' },
  // ── Público (contexto anónimo) ──
  { name: 'pagina-inicio', action: 'landing' },
  { name: 'tienda-publica', action: 'storefront' },
];

/** Cookie consent pre-seed (mismo formato que src/lib/consent.ts) */
function consentInitScript() {
  return (v) => window.localStorage.setItem('costpro_cookie_consent', v);
}
const CONSENT_JSON = JSON.stringify({
  essential: true, analytics: false, functional: true, marketing: false,
  timestamp: new Date().toISOString(), version: '1.0',
});

async function login(page) {
  await page.goto(`${BASE_URL}/?login=1`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.locator('#email').fill(ADMIN_EMAIL);
  await page.locator('#password').fill(ADMIN_PASS);
  await page.getByRole('button', { name: 'Entrar al sistema' }).click();
  // El shell autenticado renderiza el sidebar con "Cerrar sesión"
  await page.locator('[aria-label="Cerrar sesión"]').first().waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(2000);
}

async function capture(page, cap, storefrontSlug) {
  if (cap.action === 'storefront') {
    await page.goto(`${BASE_URL}/tienda/${storefrontSlug}`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(2500);
  } else if (cap.action === 'landing') {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(3000);
  } else {
    await page.goto(`${BASE_URL}/?view=${cap.view}`, { waitUntil: 'networkidle', timeout: 90000 });
    // Ocultar el indicador de dev de Next.js (portal overlay) — artefacto de
    // entorno dev que no debe aparecer en documentación de usuario.
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
    await page.waitForTimeout(4500); // settle: skeletons, gráficos, fuentes y fade de toasts

    if (cap.action === 'palette') {
      await page.keyboard.press('ControlOrMeta+k');
      await page.waitForTimeout(800);
      // Escribir una consulta real: ilustra el uso descrito en el how-to
      await page.keyboard.type('reporte', { delay: 60 });
      await page.waitForTimeout(1200);
    } else if (cap.action === 'store-switcher') {
      // El botón aria-etiquetado es la variante oculta (w-0); el pill visible
      // del header no tiene aria-label → clic real de ratón en su centro.
      const name = (await page
        .locator('button[aria-label^="Tienda actual:"]')
        .first()
        .textContent())?.trim();
      const point = await page.evaluate((storeName) => {
        const btns = Array.from(document.querySelectorAll('button'));
        const t = btns.find(
          b => (b.offsetWidth || b.offsetHeight) && (b.textContent || '').includes(storeName)
        );
        if (!t) return null;
        const r = t.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, name);
      if (!point) throw new Error('Pill de tienda visible no encontrado');
      await page.mouse.click(point.x, point.y);
      await page.waitForTimeout(1500);
      // Filtrar sucursales reales (evita primeras filas de pilotos E2E)
      const search = page.getByPlaceholder(/Buscar sucursal/i).first();
      if (await search.isVisible({ timeout: 1500 }).catch(() => false)) {
        await search.fill('vitallcons');
        await page.waitForTimeout(1500);
      }
    } else if (cap.name === 'historial-ventas') {
      // El filtro por defecto es "hoy" (tabla vacía): aplicar botón rápido
      // "Este mes" para que la tabla muestre ventas reales, como describe el doc.
      for (const label of ['Este mes', 'ESTE MES', 'Mes', 'MES']) {
        const btn = page.locator('button', { hasText: label }).first();
        if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
          await btn.click().catch(() => {});
          await page.waitForTimeout(2500);
          break;
        }
      }
    } else if (cap.name === 'gestion-tiendas') {
      // Filtrar tiendas reales del negocio en el buscador de la vista
      const filter = page.getByPlaceholder(/Filtrar por nombre/i).first();
      if (await filter.isVisible({ timeout: 1500 }).catch(() => false)) {
        await filter.fill('vitallcons');
        await page.waitForTimeout(2500);
      }
    }
  }
  await page.screenshot({ path: path.join(OUT_DIR, `${cap.name}.png`) });
  console.log(`  ✓ ${cap.name}.png`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    CAPTURES.forEach(c => console.log(c.name.padEnd(28), c.action || c.view));
    return;
  }
  const only = args.filter(a => !a.startsWith('--'));
  const targets = only.length ? CAPTURES.filter(c => only.includes(c.name)) : CAPTURES;
  if (!targets.length) throw new Error(`Ninguna captura coincide: ${only.join(', ')}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const PUBLIC_ACTIONS = ['landing', 'storefront'];
  const publicTargets = targets.filter(c => PUBLIC_ACTIONS.includes(c.action));
  const storefrontSlug = (process.env.STOREFRONT_SLUG ||
    (publicTargets.some(c => c.action === 'storefront') ? await resolveStorefrontSlug() : ''));
  const browser = await chromium.launch();

  // Contexto anónimo para la tienda pública y el landing (sin sesión, con
  // consent pre-seed para que el banner GDPR no contamine la captura)
  if (publicTargets.length) {
    const anonCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      locale: 'es-ES',
      timezoneId: 'America/Havana',
    });
    await anonCtx.addInitScript(consentInitScript(), CONSENT_JSON);
    const anonPage = await anonCtx.newPage();
    for (const cap of publicTargets) {
      console.log(`▸ ${cap.name} (anónimo)`);
      try {
        await capture(anonPage, cap, storefrontSlug);
      } catch (err) {
        console.error(`  ✗ ${cap.name}: ${err.message}`);
      }
    }
    await anonCtx.close();
  }

  // Contexto autenticado para las vistas del terminal
  const authTargets = targets.filter(c => !PUBLIC_ACTIONS.includes(c.action));
  if (authTargets.length) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      locale: 'es-ES',
      timezoneId: 'America/Havana',
    });
    await context.addInitScript(consentInitScript(), CONSENT_JSON);
    const page = await context.newPage();

    console.log('▸ login /?login=1');
    await login(page);

    for (const cap of authTargets) {
      try {
        console.log(`▸ ${cap.name}`);
        await capture(page, cap, storefrontSlug);
      } catch (err) {
        console.error(`  ✗ ${cap.name}: ${err.message}`);
      }
    }
    await context.close();
  }

  await browser.close();
  console.log(`\nPNGs en ${OUT_DIR} — convertir a WebP con scripts/convert-captures.py`);
}

async function resolveStorefrontSlug() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase env no disponible para slug');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/stores?select=name,slug,is_active&order=created_at.asc&limit=50`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`REST stores ${res.status}`);
  const stores = await res.json();
  // Preferir una tienda real con catálogo público activo (orden de preferencia)
  const preferred = ['enervida-vitallcons', 'puerto-padre-vitallcons', 'tienda-central-costpro'];
  const bySlug = Object.fromEntries(stores.filter(s => s.slug && s.is_active).map(s => [s.slug, s]));
  for (const slug of preferred) {
    if (bySlug[slug]) {
      console.log(`  storefront slug → ${slug} (${bySlug[slug].name})`);
      return slug;
    }
  }
  const withSlug = stores.filter(s => s.slug && s.is_active);
  if (!withSlug.length) throw new Error('Ninguna tienda activa con slug');
  console.log(`  storefront slug → ${withSlug[0].slug} (${withSlug[0].name})`);
  return withSlug[0].slug;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
