/**
 * measure-nav-returning.js — Igual que measure-nav.js pero simula usuario recurrente
 * (localStorage 'costpro-visited' pre-sembrado) y añade métrica directa de splash:
 * splashGoneMs = tiempo hasta que [data-testid="splash-loader"] se desmonta.
 *
 * Uso: node scripts/perf/measure-nav-returning.js <url> [etiqueta] [iteraciones]
 */
const { chromium } = require('playwright');

const URL = process.argv[2];
const LABEL = process.argv[3] || 'unlabeled-returning';
const ITER = parseInt(process.argv[4] || '3', 10);

if (!URL) { console.error('Uso: node measure-nav-returning.js <url> [etiqueta] [iteraciones]'); process.exit(1); }

const median = (arr) => { const s = [...arr].sort((a,b)=>a-b); return s.length%2 ? s[(s.length-1)/2] : (s[s.length/2-1]+s[s.length/2])/2; };

(async () => {
  const browser = await chromium.launch();
  const results = [];

  for (let i = 0; i < ITER; i++) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await context.addInitScript(() => {
      try { localStorage.setItem('costpro-visited', 'true'); } catch {}
      // Observar el splash desde documentStart; tiempos relativos a navigationStart
      (window.__splashTimes = { appearAt: -1, goneAt: -1 });
      const iv = setInterval(() => {
        const el = document.querySelector('[data-testid="splash-loader"]');
        if (el && window.__splashTimes.appearAt < 0) window.__splashTimes.appearAt = performance.now();
        if (window.__splashTimes.appearAt >= 0 && !el && window.__splashTimes.goneAt < 0) {
          window.__splashTimes.goneAt = performance.now();
          clearInterval(iv);
        }
      }, 30);
      setTimeout(() => clearInterval(iv), 45000);
    });
    const page = await context.newPage();

    let transferBytes = 0, requestCount = 0;
    page.on('response', async (res) => { requestCount++; try { transferBytes += (await res.body()).length; } catch {} });

    const t0 = Date.now();
    await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
    const loadMs = Date.now() - t0;

    const metrics = await page.evaluate(() => new Promise((resolve) => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      let lcp = 0, cls = 0;
      try {
        new PerformanceObserver((l) => { const e = l.getEntries(); if (e.length) lcp = e[e.length - 1].startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      } catch {}
      setTimeout(() => {
        const paint = performance.getEntriesByType('paint');
        const fcp = paint.find((p) => p.name === 'first-contentful-paint');
        resolve({ ttfb: nav.responseStart || 0, fcp: fcp ? fcp.startTime : 0, lcp, cls, domSize: document.getElementsByTagName('*').length });
      }, 4000);
    }));

    // Leer tiempos del splash registrados desde documentStart
    const splashTimes = await page.evaluate(() => window.__splashTimes || { appearAt: -1, goneAt: -1 });

    results.push({ iteration: i + 1, loadMs, splashAppearAtMs: splashTimes.appearAt, splashGoneMs: splashTimes.goneAt, transferBytes, requestCount, ...metrics });
    await context.close();
  }

  await browser.close();
  const agg = {};
  for (const k of ['loadMs', 'splashAppearAtMs', 'splashGoneMs', 'ttfb', 'fcp', 'lcp', 'cls', 'transferBytes', 'requestCount']) {
    agg[k] = { median: median(results.map((r) => r[k] || 0)) };
  }
  console.log(JSON.stringify({ label: LABEL, url: URL, iterations: ITER, aggregate: agg, raw: results }, null, 2));
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
