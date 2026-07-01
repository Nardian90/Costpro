"use client";

/**
 * WhatsAppTemplate — Single-page A4 JPG catalog (794 × 1123 px)
 *
 * Renders a hidden div in the DOM, captures it via html2canvas,
 * then downloads as JPEG. Optimised for WhatsApp / Telegram sharing.
 */

import html2canvas from "html2canvas";
// FIX-AUDIT-NEW-1: Use shared slugify from /lib/slugify.ts instead of inline copy
import { slugify } from "@/lib/slugify";
import { toast } from "sonner";
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

const WIDTH = 794;
const HEIGHT = 1123;
const HEADER_H = 80;
const FOOTER_H = 60;
const GRID_COLS = 2;
const GRID_ROWS = 3;
const CARD_GAP = 12;
const PADDING = 24;
const CARD_IMG_H = 150;

function cardWidth(): number {
  return (WIDTH - PADDING * 2 - (GRID_COLS - 1) * CARD_GAP) / GRID_COLS;
}

// ── Helper: download a data-URL as a file ──────────────────

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// FIX-AUDIT-NEW-1: slugify is now imported from /lib/slugify.ts (single source of truth)

// ── Build a product image URL or placeholder ────────────────

function productImageUrl(p: CatalogProduct): string {
  return p.public_image_url || p.image_url || "";
}

// ── Build the DOM tree ───────────────────────────────────────

function buildTemplateDiv(
  products: CatalogProduct[],
  brand: BrandConfig,
): HTMLDivElement {
  const { withImages, withoutImages } = organizeProducts(products);

  const primary = brand.primaryColor;
  const primaryHex = rgbToHex(primary[0], primary[1], primary[2]);
  const lightHex = rgbToHex(...lightenColor(primary, 0.92));
  const darkHex = rgbToHex(...darkenColor(primary, 0.25));

  // Container
  const root = document.createElement("div");
  root.style.cssText = `
    position:fixed; top:0; left:0; z-index:-9999;
    width:${WIDTH}px; height:${HEIGHT}px;
    background:#ffffff; font-family:system-ui,-apple-system,sans-serif;
    overflow:hidden;
  `;

  // ── Header ──────────────────────────────────────────────
  const header = document.createElement("div");
  header.style.cssText = `
    width:100%; height:${HEADER_H}px;
    background:${primaryHex};
    display:flex; align-items:center; justify-content:center;
    position:relative; overflow:hidden;
  `;
  // Decorative elements in header
  const decoCircle = document.createElement("div");
  decoCircle.style.cssText = `
    position:absolute; right:-30px; top:-30px;
    width:120px; height:120px; border-radius:50%;
    background:${withAlpha(primary, 0.2)};
  `;
  header.appendChild(decoCircle);

  // Second decorative circle
  const decoCircle2 = document.createElement("div");
  decoCircle2.style.cssText = `
    position:absolute; left:-20px; bottom:-20px;
    width:80px; height:80px; border-radius:50%;
    background:${withAlpha(primary, 0.15)};
  `;
  header.appendChild(decoCircle2);

  // Bottom accent stripe on header
  const headerAccent = document.createElement("div");
  headerAccent.style.cssText = `
    position:absolute; bottom:0; left:0; width:100%; height:3px;
    background:${lightHex};
  `;
  header.appendChild(headerAccent);

  const headerText = document.createElement("span");
  headerText.textContent = brand.name.toUpperCase();
  headerText.style.cssText = `
    color:#ffffff; font-size:28px; font-weight:800;
    letter-spacing:2px; text-align:center;
  `;
  header.appendChild(headerText);
  root.appendChild(header);

  // ── Subtitle ────────────────────────────────────────────
  const subtitle = document.createElement("div");
  subtitle.style.cssText = `
    text-align:center; padding:12px 0 8px 0;
  `;
  const subP = document.createElement("p");
  subP.textContent = "Catálogo de Productos";
  subP.style.cssText = `
    font-size:16px; font-weight:600; color:${darkHex};
    margin:0; letter-spacing:0.5px;
  `;
  subtitle.appendChild(subP);
  root.appendChild(subtitle);

  // ── Product Grid (first 6 with images) ──────────────────
  const gridProducts = withImages.slice(0, GRID_COLS * GRID_ROWS);
  const cw = cardWidth();

  if (gridProducts.length > 0) {
    const grid = document.createElement("div");
    grid.style.cssText = `
      display:grid;
      grid-template-columns:repeat(${GRID_COLS}, ${cw}px);
      gap:${CARD_GAP}px;
      padding:0 ${PADDING}px;
    `;

    gridProducts.forEach((p) => {
      const imgUrl = productImageUrl(p);

      const card = document.createElement("div");
      card.style.cssText = `
        border:1px solid #e5e7eb; border-radius:10px;
        overflow:hidden; background:#ffffff;
      `;

      // Image area
      const imgWrap = document.createElement("div");
      imgWrap.style.cssText = `
        width:${cw}px; height:${CARD_IMG_H}px;
        background:${imgUrl ? "#f3f4f6" : "#f0f0f0"};
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
          imgWrap.innerHTML = "";
          const placeholder = document.createElement("span");
          placeholder.textContent = "📦";
          placeholder.style.cssText = "font-size:40px;";
          imgWrap.appendChild(placeholder);
        };
        imgWrap.appendChild(img);
      } else {
        const placeholder = document.createElement("span");
        placeholder.textContent = "📦";
        placeholder.style.cssText = "font-size:40px;";
        imgWrap.appendChild(placeholder);
      }
      card.appendChild(imgWrap);

      // Info area
      const info = document.createElement("div");
      info.style.cssText = `padding:8px 10px 10px 10px;`;

      const nameEl = document.createElement("div");
      nameEl.textContent = truncateText(p.name, 35);
      nameEl.style.cssText = `
        font-size:12px; font-weight:700; color:#1f2937;
        margin-bottom:4px; line-height:1.3;
      `;
      info.appendChild(nameEl);

      const priceEl = document.createElement("div");
      priceEl.textContent = formatPrice(p.price);
      const isZeroCard = p.price === 0 || p.price == null;
      priceEl.style.cssText = `
        font-size:${isZeroCard ? 11 : 16}px; font-weight:800;
        color:${isZeroCard ? "#9ca3af" : primaryHex};
        ${isZeroCard ? "font-style:italic;" : ""}
      `;
      info.appendChild(priceEl);

      card.appendChild(info);
      grid.appendChild(card);
    });

    root.appendChild(grid);
  }

  // ── "Otros Productos" list ──────────────────────────────
  const listProducts = [
    ...withImages.slice(GRID_COLS * GRID_ROWS),
    ...withoutImages,
  ];

  if (listProducts.length > 0) {
    const listSection = document.createElement("div");
    listSection.style.cssText = `padding:16px ${PADDING}px 0 ${PADDING}px;`;

    const listTitle = document.createElement("div");
    listTitle.style.cssText = `
      font-size:13px; font-weight:700; color:${darkHex};
      margin-bottom:6px; padding-bottom:4px;
      border-bottom:2px solid ${primaryHex};
      display:inline-block;
    `;
    listTitle.textContent = "Otros Productos";
    listSection.appendChild(listTitle);

    // Compact list rows
    const list = document.createElement("div");
    list.style.cssText = `margin-top:4px;`;

    listProducts.forEach((p) => {
      const row = document.createElement("div");
      row.style.cssText = `
        display:flex; align-items:center; justify-content:space-between;
        padding:3px 0; border-bottom:1px solid #f3f4f6;
        height:22px;
      `;

      const bullet = document.createElement("span");
      bullet.textContent = "•";
      bullet.style.cssText = `
        color:${primaryHex}; font-size:14px; margin-right:6px; flex-shrink:0;
      `;

      const nameSpan = document.createElement("span");
      nameSpan.textContent = truncateText(p.name, 40);
      nameSpan.style.cssText = `
        font-size:11px; color:#374151; font-weight:500; flex:1;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      `;

      const priceSpan = document.createElement("span");
      priceSpan.textContent = formatPrice(p.price);
      const isZeroList = p.price === 0 || p.price == null;
      priceSpan.style.cssText = `
        font-size:${isZeroList ? 9 : 11}px; font-weight:700;
        color:${isZeroList ? "#9ca3af" : primaryHex};
        margin-left:8px; flex-shrink:0;
        ${isZeroList ? "font-style:italic;" : ""}
      `;

      row.appendChild(bullet);
      row.appendChild(nameSpan);
      row.appendChild(priceSpan);
      list.appendChild(row);
    });

    listSection.appendChild(list);
    root.appendChild(listSection);
  }

  // ── Footer ──────────────────────────────────────────────
  const footer = document.createElement("div");
  footer.style.cssText = `
    position:absolute; bottom:0; left:0;
    width:100%; height:${FOOTER_H}px;
    background:${primaryHex};
    display:flex; align-items:center; justify-content:center;
    flex-wrap:wrap; gap:6px 20px; padding:0 24px;
    box-sizing:border-box;
  `;

  const footerItems: string[] = [];
  if (brand.phone) footerItems.push(`📞 ${brand.phone}`);
  if (brand.whatsapp) footerItems.push(`💬 ${brand.whatsapp}`);
  footerItems.push(brand.name);

  footerItems.forEach((text, i) => {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.textContent = "|";
      sep.style.cssText = "color:rgba(255,255,255,0.4); font-size:10px;";
      footer.appendChild(sep);
    }
    const span = document.createElement("span");
    span.textContent = text;
    span.style.cssText = `
      color:#ffffff; font-size:11px; font-weight:500; white-space:nowrap;
    `;
    footer.appendChild(span);
  });

  // Date
  const dateSep = document.createElement("span");
  dateSep.textContent = "|";
  dateSep.style.cssText = "color:rgba(255,255,255,0.4); font-size:10px;";
  footer.appendChild(dateSep);
  const dateSpan = document.createElement("span");
  dateSpan.textContent = new Date().toLocaleDateString("es-CU");
  dateSpan.style.cssText = `
    color:rgba(255,255,255,0.8); font-size:10px; font-weight:400;
  `;
  footer.appendChild(dateSpan);

  root.appendChild(footer);

  return root;
}

// ── Exported renderer ───────────────────────────────────────

export const renderWhatsAppTemplate: TemplateRenderer = async (
  products,
  brand,
) => {
  const toastId = toast.loading("Generando catálogo WhatsApp…");

  const container = document.createElement("div");
  container.style.cssText = "position:fixed;top:0;left:0;z-index:-9999;pointer-events:none;";
  document.body.appendChild(container);

  try {
    const templateEl = buildTemplateDiv(products, brand);
    container.appendChild(templateEl);

    // Small delay so images can start loading
    await new Promise((r) => setTimeout(r, 300));

    const canvas = await html2canvas(templateEl, {
      width: WIDTH,
      height: HEIGHT,
      scale: 1,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const filename = `${slugify(brand.name)}-catalogo-whatsapp.jpg`;
    downloadDataUrl(dataUrl, filename);

    toast.success("Catálogo WhatsApp descargado", { id: toastId });
  } catch (err) {
    console.error("[WhatsAppTemplate] Error rendering:", err);
    toast.error("Error al generar el catálogo WhatsApp", { id: toastId });
  } finally {
    document.body.removeChild(container);
  }
};
