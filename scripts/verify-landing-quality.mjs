#!/usr/bin/env node
/**
 * verify-landing-quality.mjs — Verificación visual de la calidad de imágenes
 * del landing tras el FIX CALIDAD (PR feat/landing-product-demo).
 *
 * Reproduce el viewport del usuario (1366x768, DPR 1) donde reportó
 * despixelado, + desktop 1920 y móvil 390. Mide el derivado real que sirve
 * next/image (URL + ancho natural del archivo servido) para confirmar que el
 * navegador ya no estira una fuente pequeña.
 */
import { chromium } from 'playwright';
import fs from 'fs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OUT = 'test-results/landing-quality-verify';
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'user-1366', width: 1366, height: 768, dpr: 1 },
  { name: 'desktop-1920', width: 1920, height: 1080, dpr: 1 },
  { name: 'mobile-390', width: 390, height: 844, dpr: 2, isMobile: true, hasTouch: true },
];

async function main() {
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.dpr,
      isMobile: vp.isMobile, hasTouch: vp.hasTouch,
      locale: 'es-ES',
    });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 90000 });
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});

    // Esperar que carguen las capturas lazy (scroll hasta el fondo y volver)
    await page.evaluate(async () => {
      for (let y = 0; y <= document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(2500);

    // Métricas de las imágenes servidas
    const imgs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img')).map(i => {
        const raw = i.currentSrc || i.src;
        let path = raw;
        try {
          const u = new URL(raw, window.location.origin);
          const urlParam = u.searchParams.get('url');
          path = urlParam ? decodeURIComponent(urlParam) : u.pathname;
        } catch { /* noop */ }
        return {
          src: path,
          rendered: Math.round(i.getBoundingClientRect().width),
          natural: i.naturalWidth,
          complete: i.complete,
        };
      }).filter(i => i.src.includes('landing/capturas'));
    });
    console.log(`\n=== ${vp.name} (${vp.width}x${vp.height} @${vp.dpr}x) ===`);
    for (const i of imgs) {
      const ratio = i.natural ? (i.rendered * vp.dpr / i.natural).toFixed(2) : '—';
      const flag = i.natural && (vp.dpr * i.rendered) > i.natural ? '  ⚠ UPSCALE!' : '  ✓';
      console.log(`  ${flag} render=${i.rendered}px ×${vp.dpr} → natural=${i.natural}px (ratio ${ratio})`);
    }

    // Screenshots de las secciones clave (las que reportó el usuario)
    if (vp.name !== 'mobile-390') {
      for (const sel of ['#plataforma']) {
        const el = await page.$(sel);
        if (el) await el.screenshot({ path: `${OUT}/${vp.name}-multistore.png` });
      }
      // Sección inventario (ServicesStory)
      const inv = await page.$('#inventory');
      if (inv) await inv.screenshot({ path: `${OUT}/${vp.name}-inventory.png` });
    } else {
      await page.screenshot({ path: `${OUT}/${vp.name}-hero.png` });
      await page.evaluate(() => document.getElementById('plataforma')?.scrollIntoView());
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/${vp.name}-multistore.png` });
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`\nScreenshots → ${OUT}/`);
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
