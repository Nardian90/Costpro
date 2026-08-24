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
 * Reuses:
 *   - `getProductPresentation()` for Vitrina-rule compliant data
 *   - `buildTelegramProductMessage()` for the exact same data fields
 *
 * Implementation:
 *   - Builds an off-screen HTML div with the design above
 *   - Uses `html2canvas` (already a project dependency) to rasterize to JPEG
 *   - Returns a base64 data URL ready for ZIP packaging
 */

'use client';

import html2canvas from 'html2canvas';
import {
  buildTelegramProductMessage,
  getProductPresentation,
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
  /** Optional fallback if product has no image — show a placeholder block. */
  showPlaceholderIfNoImage?: boolean;
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

// ── Build HTML for the Telegram-style image ───────────────────────

function buildTelegramImageHTML(
  product: ProductPresentationInput,
  options: RenderTelegramImageOptions,
  resolvedImageUrl: string | null,
): HTMLDivElement {
  const presentation = getProductPresentation(product);
  const { primaryColor = [21, 128, 61] } = options;
  const primaryHex = `#${primaryColor
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;

  // Use the SAME options as the Telegram publisher.
  // The data shown here MUST match what buildTelegramProductMessage() would
  // put in the Markdown caption — otherwise the JPG would diverge from what
  // Telegram actually sends.
  const showPriceOpt = options.showPrice ?? 'according_to_storefront';
  const showUnitsOpt = options.showPhysicalUnits === true;

  const showPriceLine =
    presentation.priceVisible &&
    presentation.formattedPrice !== null &&
    showPriceOpt !== 'hide';

  const showUnitsLine =
    presentation.stockVisible &&
    presentation.stockQuantity !== null &&
    presentation.stockQuantity > 0 &&
    showUnitsOpt;

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

  // "Promo" badge if applicable
  if (presentation.inStock === true && product.on_promotion === true) {
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

  // Price line — only if Vitrina allows
  if (showPriceLine && presentation.formattedPrice) {
    const priceEl = document.createElement('div');
    priceEl.style.cssText = `
      font-size: 38px; font-weight: 900; color: ${primaryHex};
      letter-spacing: -0.5px;
    `;
    priceEl.textContent = `💰 ${presentation.formattedPrice}`;
    textWrap.appendChild(priceEl);
  }

  // Stock line — only if Vitrina allows + stock > 0
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

// ── Pluralize helper (mirror of product-presentation.ts) ──────────

function pluralizeUnit(unit: string, qty: number): string {
  const u = unit.trim().toLowerCase();
  if (qty === 1) return unit;
  const NO_PLURAL = new Set(['kg', 'g', 'ml', 'l', 'm', 'cm', 'mm', 'km']);
  if (NO_PLURAL.has(u)) return unit;
  if (u.endsWith('s')) return unit;
  if (u.endsWith('dad')) return unit.slice(0, -1) + 'des';
  if (u.endsWith('z')) return unit.slice(0, -1) + 'ces';
  if (u.endsWith('ón')) return unit.slice(0, -2) + 'ones';
  if (u.endsWith('on')) return unit.slice(0, -2) + 'ones';
  if (u === 'litro') return 'litros';
  if (u === 'kilo') return 'kilos';
  return unit + 's';
}

// ── Main entry: render a single product to a JPG data URL ─────────

export async function renderTelegramProductImage(
  product: ProductPresentationInput,
  options: RenderTelegramImageOptions = {},
): Promise<RenderedTelegramImage> {
  // Build the Markdown caption (for parity verification + reference)
  const tgResult = buildTelegramProductMessage(product, options);

  const resolvedImageUrl = resolveImageUrl(product);

  // Build HTML div (off-screen)
  const html = buildTelegramImageHTML(product, options, resolvedImageUrl);
  html.style.position = 'fixed';
  html.style.left = '-99999px';
  html.style.top = '0';
  html.style.zIndex = '-1';
  document.body.appendChild(html);

  try {
    // Wait a tick so images can begin loading
    await new Promise((r) => setTimeout(r, 300));

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
      presentation: getProductPresentation(product),
      telegramCaption: tgResult.text,
    };
  } finally {
    document.body.removeChild(html);
  }
}

// ── Render multiple products with progress callback ───────────────

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

export async function renderTelegramProductImages(
  products: ProductPresentationInput[],
  options: RenderTelegramImageOptions = {},
  onProgress?: (p: RenderProgress) => void,
): Promise<RenderedTelegramImageWithError[]> {
  const results: RenderedTelegramImageWithError[] = [];
  const total = products.length;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    onProgress?.({ current: i + 1, total, productName: product.name || 'Producto' });
    try {
      const image = await renderTelegramProductImage(product, options);
      results.push({ ok: true, product: { id: product.id, name: product.name }, image });
    } catch (e: any) {
      results.push({
        ok: false,
        product: { id: product.id, name: product.name },
        error: e?.message ?? String(e),
      });
    }
    // Yield to the event loop so the UI can repaint the progress bar
    await new Promise((r) => setTimeout(r, 10));
  }

  return results;
}
