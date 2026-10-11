/**
 * measure-nav.js — Métricas de navegación (LCP/CLS/transfer) para la auditoría de rendimiento.
 *
 * Uso: node scripts/perf/measure-nav.js <url> [etiqueta] [iteraciones]
 * Requiere Playwright + Chromium ya instalados en el entorno.
 *
 * Mide por iteración: navigation timing, LCP, CLS, número de requests,
 * bytes transferidos (por recurso y total), JS parse/eval aproximado.
 * Salida: JSON a stdout (agregado con mediana y p95).
 */
const { chromium } = require('playwright');

const URL = process.argv[2];
const LABEL = process.argv[3] || 'unlabeled';
const ITER = parseInt(process.argv[4] || '3', 10);

if (!URL) {
  console.error('Uso: node measure-nav.js <url> [etiqueta] [iteraciones]');
  process.exit(1);
}

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const p95 = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)];
};

(async () => {
  const browser = await chromium.launch();
  const results = [];

  for (let i = 0; i < ITER; i++) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await context.newPage();

    let transferBytes = 0, requestCount = 0, jsTransferBytes = 0;
    page.on('response', async (res) => {
      requestCount++;
      try {
        const body = await res.body();
        transferBytes += body.length;
        const ct = res.headers()['content-type'] || '';
        if (ct.includes('javascript')) jsTransferBytes += body.length;
      } catch { /* response body no disponible (cache/stream) */ }
    });

    const t0 = Date.now();
    await page.goto(URL, { waitUntil: 'load', timeout: 180000 });

    const metrics = await page.evaluate(() => new Promise((resolve) => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      let lcp = 0, cls = 0;
      try {
        new PerformanceObserver((l) => {
          const entries = l.getEntries();
          if (entries.length) lcp = entries[entries.length - 1].startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) if (!e.hadRecentInput) cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
      } catch { /* navegadores sin buffered support */ }
      setTimeout(() => {
        const paint = performance.getEntriesByType('paint');
        const fcp = paint.find((p) => p.name === 'first-contentful-paint');
        resolve({
          ttfb: nav.responseStart || 0,
          fcp: fcp ? fcp.startTime : 0,
          lcp,
          cls,
          domContentLoaded: nav.domContentLoadedEventEnd || 0,
          loadEvent: nav.loadEventEnd || 0,
          domSize: document.getElementsByTagName('*').length,
        });
      }, 3000);
    }));

    results.push({ iteration: i + 1, wallClockMs: Date.now() - t0, transferBytes, jsTransferBytes, requestCount, ...metrics });
    await context.close();
  }

  await browser.close();

  const agg = {};
  for (const key of ['wallClockMs', 'ttfb', 'fcp', 'lcp', 'cls', 'transferBytes', 'jsTransferBytes', 'requestCount', 'domContentLoaded', 'loadEvent', 'domSize']) {
    const vals = results.map((r) => r[key] || 0);
    agg[key] = { median: median(vals), p95: p95(vals) };
  }

  console.log(JSON.stringify({ label: LABEL, url: URL, iterations: ITER, aggregate: agg, raw: results }, null, 2));
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
