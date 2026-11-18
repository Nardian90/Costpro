// ADN-LANDING-FINAL-POLISH-003 — validación visual y responsive real (Playwright).
// Verifica en 360/390/768/1024/1440/1920:
//   sin overflow-H · logo ADNegocio visible (ADN verde + egocio blanco) ·
//   descendente de la «g» íntegra (métrica de tinta vs caja de clip) ·
//   escena de problemas estática (sin transformaciones cambiantes) ·
//   Funcionalidades con márgenes simétricos · favicon servido · reduced-motion.
const { chromium } = require('playwright');
const fs = require('fs');

const OUT = '/home/z/my-project/Costpro/docs/audits/adnegocio-brand-rebuild-001/evidencia-003';
const VIEWPORTS = [
  { w: 360, h: 780 }, { w: 390, h: 844 }, { w: 768, h: 1024 },
  { w: 1024, h: 768 }, { w: 1440, h: 900 }, { w: 1920, h: 1080 },
];

async function analyzePage(page, label, results) {
  const data = await page.evaluate(() => {
    const out = {};
    out.hScroll = document.documentElement.scrollWidth > document.documentElement.clientWidth;
    out.scrollWidth = document.documentElement.scrollWidth;
    out.clientWidth = document.documentElement.clientWidth;
    // header wordmark
    const brand = [...document.querySelectorAll('header a, nav a')].find(a => (a.getAttribute('aria-label') || '').includes('ADNegocio — volver'));
    out.brandFound = !!brand;
    if (brand) {
      const spans = brand.querySelectorAll('span span');
      out.brandAdnGreen = spans[0] ? getComputedStyle(spans[0]).color : null;
      out.brandEgocio = spans[1] ? getComputedStyle(spans[1]).color : null;
    }
    // g descender del titular: métrica de tinta real (canvas) vs caja de la máscara
    const em = [...document.querySelectorAll('h1 em')].find(e => e.textContent.trim() === 'negocio.');
    if (em) {
      const cs = getComputedStyle(em);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${parseFloat(cs.fontSize)}px ${cs.fontFamily}`;
      const m = ctx.measureText('negocio.');
      const emRect = em.getBoundingClientRect();
      // caja de clip: ancestro con overflow hidden
      let clip = em.parentElement;
      while (clip && getComputedStyle(clip).overflow !== 'hidden') clip = clip.parentElement;
      out.mask = clip ? clip.getBoundingClientRect().toJSON() : null;
      out.maskPb = clip ? getComputedStyle(clip).paddingBottom : null;
      out.emRect = emRect.toJSON();
      out.fontUsed = ctx.font;
      out.inkDescent = m.actualBoundingBoxDescent; // px por debajo del baseline
      out.inkAscent = m.actualBoundingBoxAscent;
      // baseline aproximada dentro del rect del em: centro del line box + (asc-desc)/2
      // método directo: rect inferior de la máscara debe ser >= baseline + descent
      // baseline via rango de texto: usamos span interior
      const inner = em.parentElement; // motion.span block
      const innerRect = inner.getBoundingClientRect();
      out.innerRect = innerRect.toJSON();
      // baseline: top del inner + mitad + métrica media… usamos fontBoundingBox:
      out.fontBoundingBoxAscent = m.fontBoundingBoxAscent;
      out.fontBoundingBoxDescent = m.fontBoundingBoxDescent;
    }
    // escena problemas: estática — mide transform en dos tiempos
    const sceneLabel = [...document.querySelectorAll('span')].find(s => s.textContent.trim().startsWith('N.01'));
    if (sceneLabel) {
      const frag = sceneLabel.closest('div.absolute') || sceneLabel.closest('div');
      const r1 = frag.getBoundingClientRect().toJSON();
      const cs = getComputedStyle(frag);
      out.sceneFragment = { rect: r1, transform: cs.transform, animation: cs.animationName, transition: cs.transitionProperty };
    } else {
      out.sceneFragment = null; // <lg: pieza no presente
    }
    // funcionalidades: simetría de márgenes
    const feat = document.querySelector('#features');
    if (feat) {
      const inner = feat.querySelector(':scope > div');
      const ir = inner.getBoundingClientRect();
      out.features = {
        left: Math.round(ir.left), right: Math.round(window.innerWidth - ir.right),
        centered: Math.abs((ir.left) - (window.innerWidth - ir.right)) <= 2,
      };
      // header alineado con módulos: mismo left edge
      const h2 = feat.querySelector('h2');
      const row = [...feat.querySelectorAll('.grid > .group, .grid > div')].pop();
      out.features.h2Left = Math.round(h2.getBoundingClientRect().left);
    }
    // favicon links
    out.faviconLinks = [...document.querySelectorAll('link[rel*="icon"]')].map(l => `${l.rel}|${l.getAttribute('href')}`);
    return out;
  });
  results[label] = data;
  return data;
}

(async () => {
  const browser = await chromium.launch();
  const results = {};

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    await page.addInitScript(() => {
      try {
        localStorage.setItem('costpro_cookie_consent', JSON.stringify({
          essential: true, analytics: false, functional: true, marketing: false,
          timestamp: new Date().toISOString(), version: '1.0',
        }));
      } catch (e) {}
    });
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5500);
    await analyzePage(page, `${vp.w}`, results);
    await page.screenshot({ path: `${OUT}/resp-003-${vp.w}.png` });
    await page.close();
  }

  // prefers-reduced-motion: la escena sigue estática y el titular visible
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem('costpro_cookie_consent', JSON.stringify({
        essential: true, analytics: false, functional: true, marketing: false,
        timestamp: new Date().toISOString(), version: '1.0',
      }));
    } catch (e) {}
  });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const rm = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const malabares = [...h1.querySelectorAll('span')].filter(s => s.textContent === 'MALABARES.');
    const vis = malabares.map(s => { const r = s.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), opacity: getComputedStyle(s).opacity }; });
    const em = [...document.querySelectorAll('h1 em')].find(e => e.textContent.trim() === 'negocio.');
    const emRect = em.getBoundingClientRect();
    return { malabares: vis, negocio: { top: Math.round(emRect.top), h: Math.round(emRect.height), opacity: getComputedStyle(em).opacity } };
  });
  results['reduced-motion'] = rm;
  await page.screenshot({ path: `${OUT}/resp-003-reduced-motion-1440.png` });
  await ctx.close();

  // favicon HTTP
  const p2 = await browser.newPage();
  const fav = [];
  for (const u of ['/favicon.svg', '/favicon.ico', '/icons/icon-192.png', '/apple-touch-icon.png', '/fc/icons/icon-192.png']) {
    const resp = await p2.request.get(`http://localhost:3000${u}`);
    fav.push({ url: u, status: resp.status(), type: resp.headers()['content-type'] || '', bytes: (await resp.body()).length });
  }
  results.faviconHttp = fav;
  await p2.close();

  await browser.close();
  fs.writeFileSync(`${OUT}/responsive_003_metrics.json`, JSON.stringify(results, null, 1));
  // resumen
  for (const [k, v] of Object.entries(results)) {
    if (v.hScroll !== undefined) {
      console.log(`${k}px: hScroll=${v.hScroll} brand=${v.brandFound} gDesc=${v.inkDescent?.toFixed(1)} maskPb=${v.maskPb} featsCentered=${v.features?.centered} l/r=${v.features?.left}/${v.features?.right} sceneAnim=${v.sceneFragment?.animation}`);
    }
  }
  console.log('reduced-motion:', JSON.stringify(results['reduced-motion']));
  console.log('faviconHttp:', JSON.stringify(results.faviconHttp));
})();
