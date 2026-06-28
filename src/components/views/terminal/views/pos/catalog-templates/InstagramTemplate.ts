"use client";

/**
 * InstagramTemplate — Carousel slides (1080 × 1350 px each)
 *
 * Generates multiple JPG slides sequentially:
 *   0. Cover slide (brand color, store name, product count)
 *   1…N. One slide per product with image
 *   N+1. Condensed slide for products WITHOUT images (2×3 grid)
 *   Last. CTA slide with WhatsApp QR code
 */

import html2canvas from "html2canvas";
import QRCode from "qrcode";
import { toast } from "sonner";
// FIX-AUDIT-NEW-1: Use shared slugify from /lib/slugify.ts instead of inline copy
import { slugify } from "@/lib/slugify";
import type { CatalogProduct, BrandConfig, TemplateRenderer } from "./types";
import {
  organizeProducts,
  formatPrice,
  truncateText,
  rgbToHex,
  withAlpha,
  lightenColor,
  darkenColor,
} from "./shared";

// ── Constants ────────────────────────────────────────────────

const SW = 1080; // slide width
const SH = 1350; // slide height (4:5)

// ── Helpers ──────────────────────────────────────────────────
// FIX-AUDIT-NEW-1: slugify is now imported from /lib/slugify.ts (single source of truth)

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function productImageUrl(p: CatalogProduct): string {
  return p.public_image_url || p.image_url || "";
}

/** Capture a hidden div via html2canvas and return a JPEG data-URL */
async function captureDiv(el: HTMLElement): Promise<string> {
  // Wait a tick so images can begin loading
  await new Promise((r) => setTimeout(r, 250));

  const canvas = await html2canvas(el, {
    width: SW,
    height: SH,
    scale: 1,
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
  });
  return canvas.toDataURL("image/jpeg", 0.92);
}

// ── Slide builders ───────────────────────────────────────────

/** Slide 0 — Cover */
function buildCoverSlide(
  brand: BrandConfig,
  productCount: number,
): HTMLDivElement {
  const [r, g, b] = brand.primaryColor;
  const primaryHex = rgbToHex(r, g, b);
  const lightHex = rgbToHex(...lightenColor(brand.primaryColor, 0.15));
  const darkHex = rgbToHex(...darkenColor(brand.primaryColor, 0.3));

  const slide = document.createElement("div");
  slide.style.cssText = `
    width:${SW}px; height:${SH}px; position:relative; overflow:hidden;
    background:${primaryHex}; font-family:system-ui,-apple-system,sans-serif;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
  `;

  // Decorative circles
  const circles = [
    { size: 400, top: -80, right: -100, alpha: 0.12 },
    { size: 250, bottom: -60, left: -60, alpha: 0.1 },
    { size: 150, top: 120, left: 80, alpha: 0.08 },
  ];
  circles.forEach((c) => {
    const el = document.createElement("div");
    el.style.cssText = `
      position:absolute;
      ${c.top !== undefined ? `top:${c.top}px;` : `bottom:${c.bottom}px;`}
      ${c.right !== undefined ? `right:${c.right}px;` : `left:${c.left}px;`}
      width:${c.size}px; height:${c.size}px; border-radius:50%;
      background:${withAlpha(brand.primaryColor, c.alpha)};
    `;
    slide.appendChild(el);
  });

  // Top accent line
  const accent = document.createElement("div");
  accent.style.cssText = `
    position:absolute; top:0; left:0; width:100%; height:6px;
    background:${lightHex};
  `;
  slide.appendChild(accent);

  // Logo placeholder or icon
  const logoWrap = document.createElement("div");
  logoWrap.style.cssText = `
    width:100px; height:100px; border-radius:50%;
    background:${withAlpha(brand.primaryColor, 0.25)};
    border:3px solid rgba(255,255,255,0.3);
    display:flex; align-items:center; justify-content:center;
    margin-bottom:32px; position:relative; z-index:1;
  `;
  const logoIcon = document.createElement("span");
  logoIcon.textContent = "🏪";
  logoIcon.style.cssText = "font-size:48px;";
  logoWrap.appendChild(logoIcon);
  slide.appendChild(logoWrap);

  // Store name
  const storeName = document.createElement("div");
  storeName.textContent = brand.name.toUpperCase();
  storeName.style.cssText = `
    color:#ffffff; font-size:48px; font-weight:900;
    letter-spacing:3px; text-align:center; position:relative; z-index:1;
    margin-bottom:16px; max-width:${SW - 120}px;
    line-height:1.1;
  `;
  slide.appendChild(storeName);

  // Divider
  const divider = document.createElement("div");
  divider.style.cssText = `
    width:80px; height:3px; background:rgba(255,255,255,0.5);
    border-radius:2px; margin-bottom:20px; position:relative; z-index:1;
  `;
  slide.appendChild(divider);

  // Product count
  const countEl = document.createElement("div");
  countEl.textContent = `${productCount} Producto${productCount !== 1 ? "s" : ""}`;
  countEl.style.cssText = `
    color:rgba(255,255,255,0.85); font-size:22px; font-weight:600;
    letter-spacing:1px; position:relative; z-index:1; margin-bottom:8px;
  `;
  slide.appendChild(countEl);

  // "Colección 2025"
  const yearEl = document.createElement("div");
  yearEl.textContent = "Colección 2025";
  yearEl.style.cssText = `
    color:rgba(255,255,255,0.55); font-size:16px; font-weight:400;
    letter-spacing:4px; text-transform:uppercase;
    position:relative; z-index:1;
  `;
  slide.appendChild(yearEl);

  return slide;
}

/** Product slide (one per product with image) */
function buildProductSlide(
  product: CatalogProduct,
  brand: BrandConfig,
): HTMLDivElement {
  const primaryHex = rgbToHex(...brand.primaryColor);
  const imgUrl = productImageUrl(product);

  const slide = document.createElement("div");
  slide.style.cssText = `
    width:${SW}px; height:${SH}px; position:relative; overflow:hidden;
    background:#ffffff; font-family:system-ui,-apple-system,sans-serif;
    display:flex; flex-direction:column;
  `;

  // ── Top 70% — Image area ───────────────────────────────
  const imgAreaH = Math.round(SH * 0.7);
  const imgArea = document.createElement("div");
  imgArea.style.cssText = `
    width:100%; height:${imgAreaH}px;
    background:#f5f5f5;
    display:flex; align-items:center; justify-content:center;
    overflow:hidden; position:relative;
  `;

  if (imgUrl) {
    const img = document.createElement("img");
    img.src = imgUrl;
    img.crossOrigin = "anonymous";
    img.style.cssText = `
      width:100%; height:100%; object-fit:cover;
    `;
    img.onerror = function () {
      imgArea.innerHTML = "";
      const placeholder = document.createElement("span");
      placeholder.textContent = "📦";
      placeholder.style.cssText = "font-size:80px; opacity:0.4;";
      imgArea.appendChild(placeholder);
    };
    imgArea.appendChild(img);
  } else {
    const placeholder = document.createElement("span");
    placeholder.textContent = "📦";
    placeholder.style.cssText = "font-size:80px; opacity:0.4;";
    imgArea.appendChild(placeholder);
  }
  slide.appendChild(imgArea);

  // ── Bottom 30% — Info area ─────────────────────────────
  const infoH = SH - imgAreaH;
  const info = document.createElement("div");
  info.style.cssText = `
    flex:1; padding:28px 48px; display:flex; flex-direction:column;
    justify-content:center; background:#ffffff; position:relative;
  `;

  // Top accent bar inside info
  const infoAccent = document.createElement("div");
  infoAccent.style.cssText = `
    position:absolute; top:0; left:0; width:100%; height:4px;
    background:${primaryHex};
  `;
  info.appendChild(infoAccent);

  // Category badge
  if (product.category) {
    const badge = document.createElement("div");
    badge.textContent = truncateText(product.category, 20);
    badge.style.cssText = `
      display:inline-block; padding:4px 14px;
      background:${rgbToHex(...lightenColor(brand.primaryColor, 0.85))};
      color:${primaryHex}; font-size:12px; font-weight:700;
      border-radius:20px; margin-bottom:12px; width:fit-content;
      letter-spacing:0.5px; text-transform:uppercase;
    `;
    info.appendChild(badge);
  }

  // Product name
  const nameEl = document.createElement("div");
  nameEl.textContent = truncateText(product.name, 50);
  nameEl.style.cssText = `
    font-size:24px; font-weight:800; color:#111827;
    line-height:1.2; margin-bottom:8px;
  `;
  info.appendChild(nameEl);

  // Price
  const isZeroSlide = product.price === 0 || product.price == null;
  const priceEl = document.createElement("div");
  priceEl.textContent = formatPrice(product.price);
  priceEl.style.cssText = `
    font-size:${isZeroSlide ? 20 : 32}px; font-weight:900;
    color:${isZeroSlide ? "#9ca3af" : primaryHex};
    letter-spacing:-0.5px;
    ${isZeroSlide ? "font-style:italic;" : ""}
  `;
  info.appendChild(priceEl);

  slide.appendChild(info);
  return slide;
}

/** Condensed slide for products WITHOUT images (2×3 grid) */
function buildNoImageSlide(
  products: CatalogProduct[],
  brand: BrandConfig,
  slideIndex: number,
  totalNoImgSlides: number,
): HTMLDivElement {
  const primaryHex = rgbToHex(...brand.primaryColor);

  const slide = document.createElement("div");
  slide.style.cssText = `
    width:${SW}px; height:${SH}px; position:relative; overflow:hidden;
    background:#ffffff; font-family:system-ui,-apple-system,sans-serif;
    display:flex; flex-direction:column; padding:48px;
    box-sizing:border-box;
  `;

  // Header accent
  const accent = document.createElement("div");
  accent.style.cssText = `
    width:60px; height:4px; background:${primaryHex};
    border-radius:2px; margin-bottom:16px;
  `;
  slide.appendChild(accent);

  // Title
  const title = document.createElement("div");
  title.textContent = "Más Productos";
  title.style.cssText = `
    font-size:28px; font-weight:800; color:#111827;
    margin-bottom:8px;
  `;
  slide.appendChild(title);

  // Subtitle with pagination
  const sub = document.createElement("div");
  sub.textContent = `Sin imagen — ${slideIndex + 1} / ${totalNoImgSlides}`;
  sub.style.cssText = `
    font-size:14px; color:#6b7280; font-weight:500;
    margin-bottom:32px;
  `;
  slide.appendChild(sub);

  // Grid
  const cols = 2;
  const rows = 3;
  const perSlide = cols * rows;
  const gap = 16;

  const grid = document.createElement("div");
  grid.style.cssText = `
    display:grid; grid-template-columns:repeat(${cols}, 1fr);
    gap:${gap}px; flex:1;
  `;

  products.forEach((p) => {
    const card = document.createElement("div");
    card.style.cssText = `
      border:1px solid #e5e7eb; border-radius:14px;
      padding:20px; display:flex; flex-direction:column;
      justify-content:center; background:#fafafa;
      border-left:4px solid ${primaryHex};
    `;

    const icon = document.createElement("div");
    icon.textContent = "📦";
    icon.style.cssText = "font-size:28px; margin-bottom:8px;";
    card.appendChild(icon);

    const nameEl = document.createElement("div");
    nameEl.textContent = truncateText(p.name, 30);
    nameEl.style.cssText = `
      font-size:14px; font-weight:700; color:#1f2937;
      margin-bottom:6px; line-height:1.3;
    `;
    card.appendChild(nameEl);

    if (p.category) {
      const cat = document.createElement("div");
      cat.textContent = truncateText(p.category, 18);
      cat.style.cssText = `
        font-size:11px; color:#9ca3af; font-weight:500;
        margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px;
      `;
      card.appendChild(cat);
    }

    const priceEl = document.createElement("div");
    priceEl.textContent = formatPrice(p.price);
    const isZeroGrid = p.price === 0 || p.price == null;
    priceEl.style.cssText = `
      font-size:${isZeroGrid ? 13 : 20}px; font-weight:800;
      color:${isZeroGrid ? "#9ca3af" : primaryHex};
      ${isZeroGrid ? "font-style:italic;" : ""}
    `;
    card.appendChild(priceEl);

    grid.appendChild(card);
  });

  slide.appendChild(grid);
  return slide;
}

/** Final CTA slide with QR code */
async function buildCTASlide(brand: BrandConfig): Promise<HTMLDivElement> {
  const [r, g, b] = brand.primaryColor;
  const primaryHex = rgbToHex(r, g, b);
  const lightHex = rgbToHex(...lightenColor(brand.primaryColor, 0.15));

  const slide = document.createElement("div");
  slide.style.cssText = `
    width:${SW}px; height:${SH}px; position:relative; overflow:hidden;
    background:${primaryHex}; font-family:system-ui,-apple-system,sans-serif;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
  `;

  // Decorative circles
  const deco1 = document.createElement("div");
  deco1.style.cssText = `
    position:absolute; top:-100px; left:-100px;
    width:350px; height:350px; border-radius:50%;
    background:${withAlpha(brand.primaryColor, 0.15)};
  `;
  slide.appendChild(deco1);
  const deco2 = document.createElement("div");
  deco2.style.cssText = `
    position:absolute; bottom:-80px; right:-80px;
    width:280px; height:280px; border-radius:50%;
    background:${withAlpha(brand.primaryColor, 0.12)};
  `;
  slide.appendChild(deco2);

  // Title
  const title = document.createElement("div");
  title.textContent = "Pedidos y Consultas";
  title.style.cssText = `
    color:#ffffff; font-size:36px; font-weight:900;
    letter-spacing:2px; margin-bottom:8px; position:relative; z-index:1;
  `;
  slide.appendChild(title);

  // Divider
  const divider = document.createElement("div");
  divider.style.cssText = `
    width:60px; height:3px; background:rgba(255,255,255,0.5);
    border-radius:2px; margin-bottom:24px; position:relative; z-index:1;
  `;
  slide.appendChild(divider);

  // WhatsApp number
  const waNumber = brand.whatsapp || brand.phone || "";
  if (waNumber) {
    const waEl = document.createElement("div");
    waEl.textContent = `💬 WhatsApp: ${waNumber}`;
    waEl.style.cssText = `
      color:rgba(255,255,255,0.9); font-size:20px; font-weight:600;
      margin-bottom:32px; position:relative; z-index:1;
    `;
    slide.appendChild(waEl);
  }

  // QR Code
  const qrUrl = `https://wa.me/${(brand.whatsapp || "").replace(/[^0-9]/g, "")}`;
  let qrDataUrl = "";
  try {
    qrDataUrl = await QRCode.toDataURL(
      brand.website || qrUrl,
      { width: 200, margin: 1 },
    );
  } catch {
    // Fallback: generate QR for the WhatsApp link
    try {
      qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 200, margin: 1 });
    } catch {
      // skip QR if both fail
    }
  }

  if (qrDataUrl) {
    // QR white background circle
    const qrWrap = document.createElement("div");
    qrWrap.style.cssText = `
      width:200px; height:200px; border-radius:20px;
      background:#ffffff; display:flex; align-items:center;
      justify-content:center; padding:12px; margin-bottom:24px;
      position:relative; z-index:1;
      box-shadow:0 8px 32px rgba(0,0,0,0.15);
    `;
    const qrImg = document.createElement("img");
    qrImg.src = qrDataUrl;
    qrImg.style.cssText = "width:176px; height:176px; border-radius:8px;";
    qrWrap.appendChild(qrImg);
    slide.appendChild(qrWrap);

    const scanText = document.createElement("div");
    scanText.textContent = "Escanea para contactarnos";
    scanText.style.cssText = `
      color:rgba(255,255,255,0.7); font-size:14px; font-weight:500;
      margin-bottom:20px; position:relative; z-index:1;
    `;
    slide.appendChild(scanText);
  }

  // "Síguenos!"
  const followEl = document.createElement("div");
  followEl.textContent = "¡Síguenos!";
  followEl.style.cssText = `
    color:rgba(255,255,255,0.5); font-size:14px; font-weight:400;
    letter-spacing:3px; text-transform:uppercase;
    position:relative; z-index:1;
  `;
  slide.appendChild(followEl);

  return slide;
}

// ── Exported renderer ───────────────────────────────────────

export const renderInstagramTemplate: TemplateRenderer = async (
  products,
  brand,
) => {
  const toastId = toast.loading("Generando carrusel Instagram…");

  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;top:0;left:0;z-index:-9999;pointer-events:none;";
  document.body.appendChild(container);

  const slug = slugify(brand.name);
  let slideCount = 0;

  try {
    const { withImages, withoutImages, total } = organizeProducts(products);
    const slides: HTMLElement[] = [];

    // ── Slide 0: Cover ───────────────────────────────────
    slides.push(buildCoverSlide(brand, total));

    // ── Product slides (one per image product) ────────────
    withImages.forEach((p) => slides.push(buildProductSlide(p, brand)));

    // ── No-image slides (6 per slide in 2×3 grid) ────────
    const NO_IMG_PER_SLIDE = 6;
    if (withoutImages.length > 0) {
      const chunks: CatalogProduct[][] = [];
      for (let i = 0; i < withoutImages.length; i += NO_IMG_PER_SLIDE) {
        chunks.push(withoutImages.slice(i, i + NO_IMG_PER_SLIDE));
      }
      chunks.forEach((chunk, idx) =>
        slides.push(buildNoImageSlide(chunk, brand, idx, chunks.length)),
      );
    }

    // ── CTA slide (async because QR code generation) ─────
    const ctaSlide = await buildCTASlide(brand);
    slides.push(ctaSlide);

    // ── Capture slides sequentially ───────────────────────
    for (let i = 0; i < slides.length; i++) {
      container.innerHTML = "";
      container.appendChild(slides[i]);

      const dataUrl = await captureDiv(slides[i]);
      const filename = `catalogo-instagram-${slug}-slide-${i + 1}.jpg`;
      downloadDataUrl(dataUrl, filename);
      slideCount++;

      // Small delay between downloads so browser doesn't block them
      if (i < slides.length - 1) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    toast.success(
      `${slideCount} slides de Instagram descargadas`,
      { id: toastId },
    );
  } catch (err) {
    console.error("[InstagramTemplate] Error rendering:", err);
    toast.error(
      `Error al generar carrusel (${slideCount}/${slideCount} slides)`,
      { id: toastId },
    );
  } finally {
    document.body.removeChild(container);
  }
};
