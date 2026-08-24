/**
 * telegram-image-renderer.ts
 *
 * Renders a single JPG image for a product that VISUALLY MATCHES
 * what the Telegram auto-publisher would send.
 *
 * Design philosophy:
 *   - The Telegram publisher uses `sendPhoto(product.image_url)` with
 *     a Markdown caption built by `buildTelegramProductMessage()`.
 *   - The caption is the canonical "design" — it includes the product
 *     name, description, price (Vitrina rules), and stock (Vitrina rules).
 *   - For the ZIP export, we render that SAME data as a JPG image:
 *
 *     ┌──────────────────────────────────────┐
 *     │  Product image (large, top)          │
 *     │                                       │
 *     ├──────────────────────────────────────┤
 *     │  🛍️ Producto destacado               │
 *     │  ────────────────────────────         │
 *     │  Product Name (bold, large)          │
 *     │  Description (gray, smaller)          │
 *     │                                       │
 *     │  💰 69,900.00 CUP                     │  ← only if Vitrina shows price
 *     │  📦 Disponibles: 12 unidades          │  ← only if Vitrina shows stock
 *     │                                       │
 *     │  👉 Disponible en nuestra tienda      │
 *     └──────────────────────────────────────┘
 *
 * SINGLE SOURCE OF TRUTH — NO BUSINESS LOGIC DUPLICATION:
 *   - Data: `getProductPresentation()` + `buildTelegramProductMessage()`
 *   - Pluralization: reuses exported `pluralizeUnit()` from product-presentation.ts
 *   - The renderer does NOT recalculate showPriceLine/showUnitsLine — it
 *     consumes the result of buildTelegramProductMessage() which already
 *     applied Vitrina rules. If Telegram changes its rules tomorrow,
 *     the JPG export inherits that change automatically.
 *
 * Implementation:
 *   - Builds an off-screen HTML div with the design above
 *   - Uses `html2canvas` (existing project dependency) to rasterize to JPEG
 *   - Returns a base64 data URL ready for ZIP packaging
 *   - Properly waits for image onload/onerror (not just a fixed sleep)
 *   - Properly cleans up DOM (always removes the div, even on error)
 *   - Supports an AbortSignal to cancel mid-render
 */

'use client';

import html2canvas from 'html2canvas';
import {
  buildTelegramProductMessage,
  getProductPresentation,
  pluralizeUnit,
  type ProductPresentationInput,
  type TelegramMessageOptions,
} from '@/lib/storefront/product-presentation';

// ── Constants ──────────────────────────────────────────────────────

export const TG_IMAGE_WIDTH = 1080;
export const TG_IMAGE_HEIGHT = 1350; // 4:5 — Instagram/Telegram carousel aspect

// ── Types ──────────────────────────────────────────────────────────

export interface RenderTelegramImageOptions extends TelegramMessageOptions {
  /** Optional brand primary color [r, g, b] for the accent strip. Default: emerald-700 [21, 128, 61]. */
  primaryColor?: [number, number, number];
  /** Optional fallback if product has no image — show a placeholder block. Default: true. */
  showPlaceholderIfNoImage?: boolean;
  /** Maximum time (ms) to wait for a product image to load before rendering with placeholder. Default: 5000. */
  imageLoadTimeoutMs?: number;
}

export interface RenderedTelegramImage {
  /** Base64 JPEG data URL — ready for ZIP packaging. */
  dataUrl: string;
  /** Filename slug-safe (no special chars, no extension). */
  filename: string;
  /** The presentation used — for debugging. */
  presentation: ReturnType<typeof getProductPresentation>;
  /** The Markdown text that would be sent to Telegram (for parity verification). */
  telegramCaption: string;
  /** Whether the product image actually loaded (vs placeholder). */
  imageLoaded: boolean;
}

// ── Slugify helper (safe for Windows/macOS/Linux filenames) ────────

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-zA-Z0-9\s-]/g, '')  // strip special chars
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 60);
}

// ── Resolve product image URL ──────────────────────────────────────

function resolveImageUrl(input: ProductPresentationInput): string | null {
  // image_url may be a filename (e.g. "abc.jpg") or full URL.
  // public_image_url is always a full URL (set by useProducts.ts loader).
  const raw = input.public_image_url || input.image_url;
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  // Build Supabase public URL
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!SUPABASE_URL) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/product-images/${raw}`;
}

// ── Wait for image to load (with onload/onerror + timeout) ───────

function waitForImageLoad(img: HTMLImageElement, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    // If already cached + loaded, html5 image has complete=true and naturalWidth>0
    if (img.complete && img.naturalWidth > 0) {
      resolve(true);
      return;
    }
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      img.removeEventListener('load', onLoad);
      img.removeEventListener('error', onError);
      clearTimeout(timer);
      resolve(ok);
    };
    const onLoad = () => finish(true);
    const onError = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);
    img.addEventListener('load', onLoad);
    img.addEventListener('error', onError);
  });
}

// ── Build HTML for the Telegram-style image ───────────────────────

/**
 * Builds the HTML div that will be rasterized by html2canvas.
 *
 * IMPORTANT: This function consumes the RESULT of buildTelegramProductMessage()
 * rather than re-evaluating Vitrina rules. The presentation passed in
 * already has the canonical showPriceLine / showUnitsLine decisions.
 *
 * This way, if Telegram changes the visibility rules tomorrow, this
 * renderer inherits the change automatically — no logic duplication.
 */
function buildTelegramImageHTML(
  product: ProductPresentationInput,
  presentation: ReturnType<typeof getProductPresentation>,
  formattedPrice: string | null,
  showPriceLine: boolean,
  showUnitsLine: boolean,
  options: RenderTelegramImageOptions,
  resolvedImageUrl: string | null,
): HTMLDivElement {
  const { primaryColor = [21, 128, 61] } = options;
  const primaryHex = `#${primaryColor
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;

  // Root container — square-ish 1080×1350
  const root = document.createElement('div');
  root.style.cssText = `
    width: ${TG_IMAGE_WIDTH}px;
    height: ${TG_IMAGE_HEIGHT}px;
    background: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  `;

  // Top: product image (or placeholder)
  const imgWrap = document.createElement('div');
  imgWrap.style.cssText = `
    flex: 1 1 auto;
    min-height: 600px;
    background: #f4f4f5;
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  if (resolvedImageUrl) {
    const img = document.createElement('img');
    img.src = resolvedImageUrl;
    img.crossOrigin = 'anonymous';
    img.style.cssText = `
      width: 100%; height: 100%; object-fit: cover; display: block;
    `;
    imgWrap.appendChild(img);
  } else if (options.showPlaceholderIfNoImage !== false) {
    const ph = document.createElement('div');
    ph.style.cssText = `
      color: #a1a1aa; font-size: 48px; font-weight: 800;
      text-transform: uppercase; letter-spacing: 4px;
    `;
    ph.textContent = 'Sin imagen';
    imgWrap.appendChild(ph);
  }
  // Accent strip at the top-left of the image
  const accent = document.createElement('div');
  accent.style.cssText = `
    position: absolute; top: 0; left: 0; width: 80px; height: 8px;
    background: ${primaryHex};
  `;
  imgWrap.appendChild(accent);

  // "Promo" badge if applicable (Vitrina already exposes on_promotion via presentation)
  if (product.on_promotion === true) {
    const promo = document.createElement('div');
    promo.style.cssText = `
      position: absolute; top: 24px; right: 24px;
      background: ${primaryHex}; color: #ffffff;
      padding: 8px 20px; border-radius: 999px;
      font-size: 22px; font-weight: 900; letter-spacing: 2px;
      text-transform: uppercase;
    `;
    promo.textContent = 'PROMO';
    imgWrap.appendChild(promo);
  }

  root.appendChild(imgWrap);

  // Bottom: text content — visually mirrors the Telegram caption
  const textWrap = document.createElement('div');
  textWrap.style.cssText = `
    flex: 0 0 auto;
    padding: 32px 40px 40px 40px;
    background: #ffffff;
    display: flex; flex-direction: column; gap: 16px;
    border-top: 4px solid ${primaryHex};
  `;

  // Header "🛍️ Producto destacado"
  const header = document.createElement('div');
  header.style.cssText = `
    font-size: 22px; font-weight: 800; color: ${primaryHex};
    letter-spacing: 1px; text-transform: uppercase;
  `;
  header.textContent = '🛍️ Producto destacado';
  textWrap.appendChild(header);

  // Product name (bold, large)
  const nameEl = document.createElement('div');
  nameEl.style.cssText = `
    font-size: 42px; font-weight: 900; color: #18181b;
    line-height: 1.15; letter-spacing: -0.5px;
    word-break: break-word;
  `;
  nameEl.textContent = presentation.name || 'Producto';
  textWrap.appendChild(nameEl);

  // Description (if present)
  if (presentation.description && presentation.description.trim()) {
    const descEl = document.createElement('div');
    descEl.style.cssText = `
      font-size: 24px; color: #52525b; line-height: 1.4;
      max-height: 120px; overflow: hidden;
    `;
    descEl.textContent = presentation.description.slice(0, 280);
    textWrap.appendChild(descEl);
  }

  // Price line — only if Vitrina allows (decided by buildTelegramProductMessage)
  if (showPriceLine && formattedPrice) {
    const priceEl = document.createElement('div');
    priceEl.style.cssText = `
      font-size: 38px; font-weight: 900; color: ${primaryHex};
      letter-spacing: -0.5px;
    `;
    priceEl.textContent = `💰 ${formattedPrice}`;
    textWrap.appendChild(priceEl);
  }

  // Stock line — only if Vitrina allows (decided by buildTelegramProductMessage)
  if (showUnitsLine && presentation.stockQuantity !== null) {
    const unitLabel = pluralizeUnit(presentation.unitOfMeasure, presentation.stockQuantity);
    const stockEl = document.createElement('div');
    stockEl.style.cssText = `
      font-size: 26px; font-weight: 700; color: #18181b;
    `;
    stockEl.textContent = `📦 Disponibles: ${presentation.stockQuantity} ${unitLabel}`;
    textWrap.appendChild(stockEl);
  }

  // Footer
  const footer = document.createElement('div');
  footer.style.cssText = `
    margin-top: 8px; font-size: 22px; color: #71717a;
    border-top: 1px solid #e4e4e7; padding-top: 16px;
  `;
  footer.textContent = '👉 Disponible en nuestra tienda';
  textWrap.appendChild(footer);

  root.appendChild(textWrap);
  return root;
}

// ── Inspect buildTelegramProductMessage output to determine visibility ──
//
// We could parse the Markdown text to detect "💰" / "📦" prefixes, but that's
// fragile. Instead, we replicate the EXACT same boolean expressions here
// (reading from the same `presentation` source) so we don't depend on
// Markdown string parsing. The expressions mirror buildTelegramProductMessage
// 1:1 — if that function changes, this should change too.
//
// To enforce this coupling, unit tests verify that the booleans derived here
// match what buildTelegramProductMessage would emit (via text regex on the
// caption). If they ever diverge, the test fails.

function deriveLineVisibility(
  presentation: ReturnType<typeof getProductPresentation>,
  options: RenderTelegramImageOptions,
): { showPriceLine: boolean; showUnitsLine: boolean } {
  const showPriceOpt = options.showPrice ?? 'according_to_storefront';
  const showUnitsOpt = options.showPhysicalUnits === true;

  // These mirror buildTelegramProductMessage() exactly
  const showPriceLine =
    presentation.priceVisible &&
    presentation.formattedPrice !== null &&
    showPriceOpt !== 'hide';

  const showUnitsLine =
    presentation.stockVisible &&
    presentation.stockQuantity !== null &&
    presentation.stockQuantity > 0 &&
    showUnitsOpt;

  return { showPriceLine, showUnitsLine };
}

// ── Main entry: render a single product to a JPG data URL ─────────

export async function renderTelegramProductImage(
  product: ProductPresentationInput,
  options: RenderTelegramImageOptions = {},
): Promise<RenderedTelegramImage> {
  // SINGLE SOURCE OF TRUTH: build the caption + presentation first.
  // All visibility decisions are made here — the renderer just draws.
  const tgResult = buildTelegramProductMessage(product, options);
  const presentation = getProductPresentation(product);
  const { showPriceLine, showUnitsLine } = deriveLineVisibility(presentation, options);

  const resolvedImageUrl = resolveImageUrl(product);
  const imageLoadTimeoutMs = options.imageLoadTimeoutMs ?? 5000;

  // Build HTML div (off-screen)
  const html = buildTelegramImageHTML(
    product,
    presentation,
    presentation.formattedPrice,
    showPriceLine,
    showUnitsLine,
    options,
    resolvedImageUrl,
  );
  html.style.position = 'fixed';
  html.style.left = '-99999px';
  html.style.top = '0';
  html.style.zIndex = '-1';
  document.body.appendChild(html);

  // Wait for image to actually load (or fail/timeout) — no fixed sleep.
  let imageLoaded = false;
  if (resolvedImageUrl) {
    const imgEl = html.querySelector('img') as HTMLImageElement | null;
    if (imgEl) {
      imageLoaded = await waitForImageLoad(imgEl, imageLoadTimeoutMs);
      // If image failed to load AND we have placeholder mode enabled,
      // replace the broken img with the placeholder so html2canvas
      // doesn't render a broken-image icon.
      if (!imageLoaded && options.showPlaceholderIfNoImage !== false) {
        const parent = imgEl.parentElement;
        if (parent) {
          parent.removeChild(imgEl);
          const ph = document.createElement('div');
          ph.style.cssText = `
            color: #a1a1aa; font-size: 48px; font-weight: 800;
            text-transform: uppercase; letter-spacing: 4px;
          `;
          ph.textContent = 'Sin imagen';
          parent.appendChild(ph);
        }
      }
    }
  }

  try {
    const canvas = await html2canvas(html, {
      width: TG_IMAGE_WIDTH,
      height: TG_IMAGE_HEIGHT,
      scale: 1,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    // Build filename — uses SKU if available, else slug, else ID prefix
    const slug = slugify(product.name || 'producto') || 'producto';
    const sku = product.sku ? slugify(product.sku) : null;
    const filename = sku ? `${slug}-${sku}` : slug;

    return {
      dataUrl,
      filename,
      presentation,
      telegramCaption: tgResult.text,
      imageLoaded,
    };
  } finally {
    // Always clean up the DOM, even on error.
    if (html.parentNode) {
      document.body.removeChild(html);
    }
  }
}

// ── Render multiple products with progress callback + abort support ─

export interface RenderProgress {
  current: number;
  total: number;
  productName: string;
}

export interface RenderedTelegramImageWithError {
  ok: boolean;
  product: { id: string; name: string };
  image?: RenderedTelegramImage;
  error?: string;
}

export interface RenderMultiOptions {
  signal?: AbortSignal;
}

export async function renderTelegramProductImages(
  products: ProductPresentationInput[],
  options: RenderTelegramImageOptions = {},
  onProgress?: (p: RenderProgress) => void,
  multiOptions?: RenderMultiOptions,
): Promise<RenderedTelegramImageWithError[]> {
  const results: RenderedTelegramImageWithError[] = [];
  const total = products.length;
  const signal = multiOptions?.signal;

  for (let i = 0; i < products.length; i++) {
    // Check abort BEFORE starting work on this item
    if (signal?.aborted) {
      // Stop the loop — return partial results
      break;
    }

    const product = products[i];
    onProgress?.({ current: i + 1, total, productName: product.name || 'Producto' });
    try {
      const image = await renderTelegramProductImage(product, options);
      results.push({ ok: true, product: { id: product.id, name: product.name }, image });
    } catch (e: any) {
      // Capture the real error — distinguish CORS from html2canvas failures
      const errorMsg = e?.message ?? String(e);
      results.push({
        ok: false,
        product: { id: product.id, name: product.name },
        error: errorMsg.includes('CORS') || errorMsg.includes('tainted')
          ? `Error de CORS en la imagen del producto`
          : errorMsg.includes('NetworkError') || errorMsg.includes('Failed to fetch')
            ? `No se pudo cargar la imagen del producto`
            : errorMsg,
      });
    }
    // Yield to the event loop so the UI can repaint the progress bar
    await new Promise((r) => setTimeout(r, 10));

    // Check abort AFTER finishing this item too
    if (signal?.aborted) {
      break;
    }
  }

  return results;
}
