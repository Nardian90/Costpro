/**
 * PROBE FASE 5 — Diagnóstico "Touch targets ≥ 44px en vista de Tiendas".
 * Reproduce la medición del test multi-tienda-docs.spec.ts:189 y DUMPEA
 * los botones que violan (texto, clase, tamaño) para clasificar:
 *   PRODUCT BUG (UI realmente pequeña) vs STALE TEST (heurística obsoleta).
 *
 * Uso: bun scripts/probe-touch-targets.ts
 */
import { chromium } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

import { signIn, injectSession } from '../e2e/fixtures/session.fixture';

(async () => {
  const session = await signIn('admin@costpro.com', 'costpro123');
  const browser = await chromium.launch({ args: ['--disable-dev-shm-usage', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await injectSession(page, session);
  await page.goto('http://localhost:3000/?view=stores', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const buttons = page.locator('button:visible');
  const count = await buttons.count();
  console.log(`botones visibles: ${count} (test examina los primeros 20)`);

  // Contexto del sidebar
  const aside = page.locator('aside[data-sidebar]');
  const asideBox = await aside.boundingBox().catch(() => null);
  console.log(`aside[data-sidebar] box: ${JSON.stringify(asideBox)}`);
  const firstNav = page.locator('aside[data-sidebar] button').first();
  const navBox = await firstNav.boundingBox().catch(() => null);
  const navChain = await firstNav.evaluate((el) => {
    const out: string[] = [];
    let cur: HTMLElement | null = el as HTMLElement;
    for (let d = 0; d < 5 && cur; d++) {
      const cs = getComputedStyle(cur);
      out.push(`${cur.tagName}.${(cur.className || '').toString().slice(0, 40)} w=${cs.width} maxW=${cs.maxWidth} display=${cs.display} overflow=${cs.overflowX}`);
      cur = cur.parentElement;
    }
    return out;
  }).catch(() => []);
  console.log('cadena del 1er botón del sidebar:');
  for (const c of navChain) console.log('   ', c);
  const navText = await firstNav.textContent().catch(() => '');
  console.log('texto 1er botón:', (navText || '').trim().slice(0, 30));

  let violations = 0;
  for (let i = 0; i < Math.min(count, 20); i++) {
    const btn = buttons.nth(i);
    const box = await btn.boundingBox();
    if (!box) continue;
    const violates = box.height > 0 && box.height < 44 && box.width > 0 && box.width < 44;
    const text = (await btn.textContent() || '').trim().slice(0, 40);
    const cls = (await btn.getAttribute('class') || '').slice(0, 80);
    const aria = await btn.getAttribute('aria-label');
    if (violates) {
      violations++;
      console.log(`VIOLA #${violations}: ${box.width.toFixed(0)}x${box.height.toFixed(0)} | text="${text}" | aria="${aria}" | class="${cls}"`);
    } else {
      console.log(`  ok  ${box.width.toFixed(0)}x${box.height.toFixed(0)} | "${text.slice(0, 25)}"`);
    }
  }
  console.log(`\nTOTAL VIOLACIONES: ${violations} (test permite <= 2)`);

  await browser.close();
})();
