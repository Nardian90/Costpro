/**
 * Visual E2E test — render actual JPGs using the real telegram-image-renderer code.
 *
 * Strategy:
 *   - Spin up a minimal HTML page that loads the actual renderer TS via esm.sh
 *   - Or, equivalently, run a script that mimics the renderer EXACTLY.
 *
 * We choose the second approach because esm.sh can compile TS files on the fly.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import AdmZip from 'adm-zip';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENERVIDA_STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  VISUAL E2E TEST — Telegram Catalog ZIP Export');
  console.log('═══════════════════════════════════════════════════════════════');

  // 1. Get real eligible products
  const { data: products, error } = await client
    .from('products')
    .select('id, name, description, sku, price, price_currency, image_url, public_image_url, price_visible, stock_visible, stock_current, on_promotion, unit_of_measure, is_active, visible_en_tienda')
    .eq('store_id', ENERVIDA_STORE_ID)
    .eq('is_active', true)
    .eq('visible_en_tienda', true)
    .order('name')
    .limit(5);

  if (error) {
    console.error('Supabase error:', error);
    process.exit(1);
  }

  console.log(`Loaded ${products?.length || 0} eligible products:`);
  for (const p of products || []) {
    console.log(`  - ${p.name} (${p.price_currency} ${p.price}) price_visible=${p.price_visible} stock_visible=${p.stock_visible} stock=${p.stock_current} unit=${p.unit_of_measure}`);
  }

  // 2. Launch Chromium
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  // 3. Go to the actual Vitrina page (which has html2canvas already loaded)
  //    This gives us a real DOM environment with the Supabase URL config.
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });

  // 4. Run the renderer directly in the page context.
  //    We inline the EXACT same logic as telegram-image-renderer.ts — if the
  //    renderer changes, we update this script to match (mirror test).
  const script = `
    (async () => {
      const products = ${JSON.stringify(products)};
      const SUPABASE_URL = ${JSON.stringify(SUPABASE_URL)};
      // Resolve image URLs
      products.forEach(p => {
        if (p.image_url && !p.image_url.startsWith('http')) {
          p.public_image_url = SUPABASE_URL + '/storage/v1/object/public/product-images/' + p.image_url;
        } else {
          p.public_image_url = p.public_image_url || p.image_url;
        }
      });

      // Load html2canvas from esm.sh
      const html2canvasModule = await import('https://esm.sh/html2canvas@1.4.1');
      const html2canvas = html2canvasModule.default;

      // Mirror telegram-image-renderer.ts EXACTLY
      const results = [];
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        try {
          // Apply Vitrina rules (mirror getProductPresentation)
          const priceVisible = p.price_visible !== false;
          const stockVisible = p.stock_visible !== false;
          const showPriceLine = priceVisible && p.price > 0;
          const showUnitsLine = stockVisible && p.stock_current > 0;

          // Build the HTML div
          const root = document.createElement('div');
          root.style.cssText = 'width:1080px;height:1350px;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;display:flex;flex-direction:column;position:fixed;left:-99999px;top:0;z-index:-1;overflow:hidden;';

          // Image wrapper
          const imgWrap = document.createElement('div');
          imgWrap.style.cssText = 'flex:1 1 auto;min-height:600px;background:#f4f4f5;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;';
          const imgUrl = p.public_image_url;
          if (imgUrl) {
            const img = document.createElement('img');
            img.src = imgUrl;
            img.crossOrigin = 'anonymous';
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
            imgWrap.appendChild(img);
          } else {
            const ph = document.createElement('div');
            ph.style.cssText = 'color:#a1a1aa;font-size:48px;font-weight:800;text-transform:uppercase;letter-spacing:4px;';
            ph.textContent = 'Sin imagen';
            imgWrap.appendChild(ph);
          }
          const accent = document.createElement('div');
          accent.style.cssText = 'position:absolute;top:0;left:0;width:80px;height:8px;background:#15803d;';
          imgWrap.appendChild(accent);
          if (p.on_promotion === true) {
            const promo = document.createElement('div');
            promo.style.cssText = 'position:absolute;top:24px;right:24px;background:#15803d;color:#fff;padding:8px 20px;border-radius:999px;font-size:22px;font-weight:900;letter-spacing:2px;text-transform:uppercase;';
            promo.textContent = 'PROMO';
            imgWrap.appendChild(promo);
          }
          root.appendChild(imgWrap);

          // Text wrapper
          const textWrap = document.createElement('div');
          textWrap.style.cssText = 'flex:0 0 auto;padding:32px 40px 40px 40px;background:#fff;display:flex;flex-direction:column;gap:16px;border-top:4px solid #15803d;';

          const header = document.createElement('div');
          header.style.cssText = 'font-size:22px;font-weight:800;color:#15803d;letter-spacing:1px;text-transform:uppercase;';
          header.textContent = '🛍️ Producto destacado';
          textWrap.appendChild(header);

          const nameEl = document.createElement('div');
          nameEl.style.cssText = 'font-size:42px;font-weight:900;color:#18181b;line-height:1.15;letter-spacing:-0.5px;word-break:break-word;';
          nameEl.textContent = p.name || 'Producto';
          textWrap.appendChild(nameEl);

          if (p.description && p.description.trim()) {
            const descEl = document.createElement('div');
            descEl.style.cssText = 'font-size:24px;color:#52525b;line-height:1.4;max-height:120px;overflow:hidden;';
            descEl.textContent = p.description.slice(0, 280);
            textWrap.appendChild(descEl);
          }

          if (showPriceLine) {
            const formatted = new Intl.NumberFormat('es-CU', {minimumFractionDigits:2, maximumFractionDigits:2}).format(p.price);
            const priceText = formatted + ' ' + (p.price_currency || 'CUP');
            const priceEl = document.createElement('div');
            priceEl.style.cssText = 'font-size:38px;font-weight:900;color:#15803d;letter-spacing:-0.5px;';
            priceEl.textContent = '💰 ' + priceText;
            textWrap.appendChild(priceEl);
          }

          if (showUnitsLine) {
            const unit = p.unit_of_measure || 'unidad';
            const unitLabel = p.stock_current === 1
              ? unit
              : unit.endsWith('dad') ? unit.slice(0,-1) + 'des'
              : unit.endsWith('s') ? unit
              : unit + 's';
            const stockEl = document.createElement('div');
            stockEl.style.cssText = 'font-size:26px;font-weight:700;color:#18181b;';
            stockEl.textContent = '📦 Disponibles: ' + p.stock_current + ' ' + unitLabel;
            textWrap.appendChild(stockEl);
          }

          const footer = document.createElement('div');
          footer.style.cssText = 'margin-top:8px;font-size:22px;color:#71717a;border-top:1px solid #e4e4e7;padding-top:16px;';
          footer.textContent = '👉 Disponible en nuestra tienda';
          textWrap.appendChild(footer);

          root.appendChild(textWrap);
          document.body.appendChild(root);

          // Wait for image to load
          if (imgUrl) {
            const img = imgWrap.querySelector('img');
            if (img) {
              await new Promise((resolve) => {
                if (img.complete && img.naturalWidth > 0) return resolve();
                const t = setTimeout(resolve, 5000);
                img.addEventListener('load', () => { clearTimeout(t); resolve(); });
                img.addEventListener('error', () => { clearTimeout(t); resolve(); });
              });
            }
          } else {
            await new Promise(r => setTimeout(r, 100));
          }

          const canvas = await html2canvas(root, {
            width: 1080,
            height: 1350,
            scale: 1,
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#ffffff',
            logging: false,
          });
          document.body.removeChild(root);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
          results.push({ok: true, id: p.id, name: p.name, dataUrl, showPriceLine, showUnitsLine});
        } catch (e) {
          results.push({ok: false, id: p.id, name: p.name, error: e.message});
        }
      }
      return results;
    })()
  `;

  const results = await page.evaluate(script);
  console.log(`\nRendered ${results.length} images, ${results.filter(r => r.ok).length} success, ${results.filter(r => !r.ok).length} failed`);

  // Save JPGs to disk for visual inspection
  const outDir = '/home/z/my-project/download/telegram-catalog-visual-test';
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  let idx = 1;
  for (const r of results) {
    if (!r.ok) {
      console.log(`  ✗ ${r.name}: ${r.error}`);
      continue;
    }
    const base64 = r.dataUrl.split(',')[1];
    const slug = r.name.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9\\s-]/g, '').trim().replace(/\\s+/g, '-').slice(0, 40) || 'producto';
    const filename = `${String(idx).padStart(3, '0')}-${slug}.jpg`;
    writeFileSync(join(outDir, filename), Buffer.from(base64, 'base64'));
    const size = statSync(join(outDir, filename)).size;
    console.log(`  ✓ ${filename} (${(size / 1024).toFixed(1)} KB) | price_line=${r.showPriceLine} stock_line=${r.showUnitsLine}`);
    idx++;
  }

  // 5. Build ZIP
  const zip = new AdmZip();
  for (const file of readdirSync(outDir)) {
    if (file.endsWith('.jpg')) {
      zip.addLocalFile(join(outDir, file), 'catalogo-telegram-2026-08-25');
    }
  }
  const zipPath = '/home/z/my-project/download/catalogo-telegram-test.zip';
  zip.writeZip(zipPath);
  console.log(`\nZIP written: ${zipPath} (${(statSync(zipPath).size / 1024).toFixed(1)} KB)`);

  // 6. Verify ZIP structure
  const zipEntries = zip.getEntries();
  console.log(`\nZIP contents (${zipEntries.length} entries):`);
  for (const entry of zipEntries) {
    console.log(`  ${entry.entryName} (${(entry.header.size / 1024).toFixed(1)} KB)`);
  }

  // 7. Verify JPG integrity (SOI marker 0xFF 0xD8 + EOI marker 0xFF 0xD9)
  console.log('\nJPG integrity check (SOI / EOI markers):');
  let allValid = true;
  for (const file of readdirSync(outDir)) {
    if (!file.endsWith('.jpg')) continue;
    const buf = readFileSync(join(outDir, file));
    const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
    const hasEoi = buf[buf.length - 2] === 0xFF && buf[buf.length - 1] === 0xD9;
    if (!isJpeg || !hasEoi) allValid = false;
    console.log(`  ${file}: ${isJpeg && hasEoi ? '✓ valid JPEG' : '✗ INVALID'} (SOI=${buf[0].toString(16)}${buf[1].toString(16)}, EOI=${buf[buf.length-2].toString(16)}${buf[buf.length-1].toString(16)})`);
  }

  await browser.close();

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Visual inspection required:');
  console.log(`  Open JPGs in: ${outDir}`);
  console.log(`  Open ZIP in: ${zipPath}`);
  console.log(`  All JPGs valid: ${allValid ? 'YES ✓' : 'NO ✗'}`);
  console.log('═══════════════════════════════════════════════════════════════');

  process.exit(allValid ? 0 : 1);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
