// ADN-LANDING-FINAL-POLISH-003 — capturas BEFORE/AFTER de las 4 zonas.
// Uso: node scripts/shot_003.cjs before|after
const { chromium } = require('playwright');
const phase = process.argv[2] || 'before';
const OUT = `/home/z/my-project/Costpro/docs/audits/adnegocio-brand-rebuild-001/evidencia-003/${phase}`;

const SHOTS = [
  { w: 1440, h: 900, name: `01-header-hero-1440-${phase}`, setup: async (p) => { await p.waitForTimeout(6500); } },
  { w: 390, h: 844, name: `02-header-hero-390-${phase}`, setup: async (p) => { await p.waitForTimeout(6500); } },
  // Zona 2: titular monumental (g de «negocio.») — recorte superior de página
  { w: 1440, h: 900, name: `03-titular-g-1440-${phase}`, setup: async (p) => { await p.waitForTimeout(6500); } },
  { w: 390, h: 844, name: `04-titular-g-390-${phase}`, setup: async (p) => { await p.waitForTimeout(6500); } },
  // Zona 3: pieza «ventas en cuadernos…» (columna derecha del hero, ≥lg)
  { w: 1440, h: 900, name: `05-problemas-1440-${phase}`, setup: async (p) => { await p.waitForTimeout(6500); } },
  { w: 1440, h: 2200, name: `06-problemas-full-1440-${phase}`, fullPage: false, setup: async (p) => { await p.waitForTimeout(6500); } },
  // Zona 4: Funcionalidades
  { w: 1440, h: 900, name: `07-features-1440-${phase}`, setup: async (p) => { await p.locator('#features').scrollIntoViewIfNeeded({ timeout: 8000 }); await p.waitForTimeout(1600); } },
  { w: 1440, h: 2600, name: `08-features-tall-1440-${phase}`, setup: async (p) => { await p.locator('#features').scrollIntoViewIfNeeded({ timeout: 8000 }); await p.waitForTimeout(1600); } },
  { w: 390, h: 844, name: `09-features-390-${phase}`, setup: async (p) => { await p.locator('#features').scrollIntoViewIfNeeded({ timeout: 8000 }); await p.waitForTimeout(1600); } },
  { w: 768, h: 1024, name: `10-features-768-${phase}`, setup: async (p) => { await p.locator('#features').scrollIntoViewIfNeeded({ timeout: 8000 }); await p.waitForTimeout(1600); } },
];

(async () => {
  const browser = await chromium.launch();
  for (const s of SHOTS) {
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
    // Consentimiento pre-aprobado → sin banner superpuesto en las capturas
    await page.addInitScript(() => {
      try {
        localStorage.setItem('costpro_cookie_consent', JSON.stringify({
          essential: true, analytics: false, functional: true, marketing: false,
          timestamp: new Date().toISOString(), version: '1.0',
        }));
      } catch (e) {}
    });
    try {
      await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      const btn = page.getByRole('button', { name: /solo esenciales|aceptar/i }).first();
      if (await btn.isVisible().catch(() => false)) { await btn.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(400); }
      await s.setup(page);
      await page.screenshot({ path: `${OUT}/${s.name}.png` });
      console.log('OK', s.name);
    } catch (e) {
      console.log('FAIL', s.name, e.message.split('\n')[0]);
    }
    await page.close();
  }
  await browser.close();
})();
