/**
 * Reusable visual components for the Elegant Catalog:
 *   - Rich footer
 *   - Mini page header (brand bar)
 *   - Category header band with icon
 *   - Product card (image-dominant)
 */

import type { jsPDF } from "jspdf";
import type { CatalogProduct, BrandConfig } from "../types";
import type { RGB } from "./types";
import {
  PAGE_W, PAGE_H, MARGIN_L, MARGIN_R,
  CONTENT_W, FOOTER_H, CAT_BAND_H,
  CARD_W, CARD_IMG_H, CARD_BODY_H, CARD_H, CARD_PAD,
} from "./constants";
import {
  roundedRect, filledRoundedRect, drawCardShadow,
  drawImagePlaceholder, drawProductTag,
} from "./drawing";
import { lightenColor, darkenColor, truncateText } from "../shared";
import { formatPrice } from "../shared";
import { addProductImage } from "./image-helpers";
import type { ImageData } from "./image-helpers";
import { getProductTag, TAG_COLORS, drawCategoryIcon } from "./tags";

// ── Rich Footer ──────────────────────────────────────────────

export function drawRichFooter(
  doc: jsPDF,
  page: number,
  totalPages: number,
  pc: RGB,
  brand: BrandConfig,
  qrDataURL: string | null,
) {
  const footerY = PAGE_H - FOOTER_H;

  // Accent line
  doc.setFillColor(pc[0], pc[1], pc[2]);
  doc.rect(0, footerY - 0.5, PAGE_W, 0.6, "F");

  // Background
  doc.setFillColor(250, 250, 250);
  doc.rect(0, footerY + 0.1, PAGE_W, FOOTER_H, "F");

  // Contact info (left)
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");

  const contactParts: string[] = [];
  if (brand.whatsapp) contactParts.push(`WA: ${brand.whatsapp}`);
  if (brand.phone) contactParts.push(`Tel: ${brand.phone}`);
  if (brand.email) contactParts.push(brand.email);

  let lineY = footerY + 4;
  if (contactParts.length > 0) {
    doc.text(contactParts.join("  |  "), MARGIN_L + 2, lineY);
    lineY += 3.5;
  }

  if (brand.address) {
    doc.setFontSize(5.5);
    doc.setTextColor(130, 130, 130);
    doc.text(truncateText(brand.address, 85), MARGIN_L + 2, lineY);
  }

  // Page number (center-right)
  if (totalPages > 0) {
    doc.setTextColor(pc[0], pc[1], pc[2]);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(`${page}`, PAGE_W / 2 + 22, footerY + 5.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(140, 140, 140);
    doc.text(`/ ${totalPages}`, PAGE_W / 2 + 26, footerY + 5.5);
  }

  // QR code (bottom-right)
  if (qrDataURL) {
    const qrSize = 10;
    try {
      doc.setFillColor(255, 255, 255);
      filledRoundedRect(doc, PAGE_W - MARGIN_R - qrSize - 3, footerY + 1.5, qrSize + 2, qrSize + 2, 1);
      doc.addImage(qrDataURL, "PNG", PAGE_W - MARGIN_R - qrSize - 2, footerY + 2, qrSize, qrSize, undefined, "MEDIUM");
      doc.setFontSize(4.5);
      doc.setTextColor(160, 160, 160);
      doc.text("Catálogo online", PAGE_W - MARGIN_R - qrSize / 2 - 1, footerY + qrSize + 3.5, { align: "center" });
    } catch { /* skip */ }
  }

  // Watermark
  doc.setFontSize(4.5);
  doc.setTextColor(200, 200, 200);
  doc.text(
    `Generado con CostPro  |  ${new Date().toLocaleDateString("es-CU")}`,
    PAGE_W / 2, footerY + FOOTER_H - 1.5,
    { align: "center" },
  );
}

// ── Mini Page Header (brand bar) ─────────────────────────────

export function drawMiniPageHeader(doc: jsPDF, brand: BrandConfig, pc: RGB) {
  // Brand band
  doc.setFillColor(pc[0], pc[1], pc[2]);
  doc.rect(0, 1.6, PAGE_W, 5.5, "F");

  // Brand name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(brand.name.toUpperCase(), MARGIN_L + 3, 5);

  // Date
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.text(
    new Date().toLocaleDateString("es-CU", { day: "2-digit", month: "long", year: "numeric" }),
    PAGE_W - MARGIN_R - 2, 5,
    { align: "right" },
  );

  // Separator
  doc.setFillColor(...lightenColor(pc, 0.7));
  doc.rect(0, 7.1, PAGE_W, 0.3, "F");
}

// ── Category Header ──────────────────────────────────────────

export function drawCategoryHeader(doc: jsPDF, y: number, category: string, pc: RGB) {
  // Full-width band
  doc.setFillColor(pc[0], pc[1], pc[2]);
  filledRoundedRect(doc, MARGIN_L, y, CONTENT_W, CAT_BAND_H, 1.5);

  // Icon circle (darker shade)
  const iconSize = CAT_BAND_H - 3;
  const iconX = MARGIN_L + 3;
  const iconY = y + (CAT_BAND_H - iconSize) / 2;
  doc.setFillColor(...darkenColor(pc, 0.15));
  doc.circle(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, "F");

  drawCategoryIcon(doc, iconX, iconY, iconSize, category);

  // Category name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(category.toUpperCase(), MARGIN_L + CAT_BAND_H + 2, y + CAT_BAND_H / 2 + 1.3);

  // Thin accent below
  doc.setFillColor(...lightenColor(pc, 0.5));
  doc.rect(MARGIN_L, y + CAT_BAND_H, CONTENT_W, 0.4, "F");
}

// ── Product Card ─────────────────────────────────────────────

/** Simple text wrapper (max N lines) */
function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let remaining = truncateText(text, maxChars * maxLines);
  while (remaining.length > maxChars && lines.length < maxLines - 1) {
    let breakAt = remaining.lastIndexOf(" ", maxChars);
    if (breakAt <= 0) breakAt = maxChars;
    lines.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
  }
  lines.push(truncateText(remaining, maxChars));
  return lines;
}

export function drawProductCard(
  doc: jsPDF,
  x: number, y: number,
  product: CatalogProduct,
  imgData: ImageData | undefined,
  pc: RGB,
) {
  // Shadow
  drawCardShadow(doc, x, y, CARD_W, CARD_H, 1.5);

  // Card background
  doc.setFillColor(255, 255, 255);
  filledRoundedRect(doc, x, y, CARD_W, CARD_H, 1.5);

  // Border
  doc.setDrawColor(228, 228, 228);
  doc.setLineWidth(0.15);
  roundedRect(doc, x, y, CARD_W, CARD_H, 1.5);

  // ── Image area (~68%) ──
  const imgX = x + CARD_PAD;
  const imgY = y + CARD_PAD;
  const imgW = CARD_W - CARD_PAD * 2;
  const imgH = CARD_IMG_H - CARD_PAD;

  // Light bg
  doc.setFillColor(248, 248, 248);
  filledRoundedRect(doc, imgX, imgY, imgW, imgH, 1);

  // Image (drawn first, tag overlaps after)
  addProductImage(
    doc,
    imgData?.base64 ?? null,
    imgData?.format ?? "JPEG",
    imgData?.naturalWidth ?? 0,
    imgData?.naturalHeight ?? 0,
    imgX, imgY, imgW, imgH,
    drawImagePlaceholder,
  );

  // ── Tag over image (top-right corner, overlapping) ──
  const tag = getProductTag(product);
  if (tag && TAG_COLORS[tag]) {
    const tc = TAG_COLORS[tag];
    const tagX = x + CARD_W - CARD_PAD - 14;
    const tagY = y + CARD_PAD + 0.5;
    drawProductTag(doc, tagX, tagY, tag, tc.bg, tc.text);
  }

  // ── Text area (~32%) ──
  const textY = y + CARD_IMG_H + 0.5;

  // Product name (bold, 2 lines max)
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  const maxCharsPerLine = 20;
  const nameLines = wrapText(product.name, maxCharsPerLine, 2);
  doc.text(nameLines[0], x + CARD_PAD + 0.5, textY + 3);
  if (nameLines[1]) {
    doc.setFontSize(5.8);
    doc.setFont("helvetica", "normal");
    doc.text(nameLines[1], x + CARD_PAD + 0.5, textY + 5.5);
  }

  // Price (right-aligned, prominent)
  const isZero = product.price === 0 || product.price == null;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(isZero ? 5.8 : 8.5);
  const priceColor = isZero ? [155, 155, 155] : pc;
  doc.setTextColor(priceColor[0], priceColor[1], priceColor[2]);
  const priceText = formatPrice(product.price);
  doc.text(priceText, x + CARD_W - CARD_PAD - 0.5, y + CARD_H - 1.5, { align: "right" });

  // SKU (tiny, bottom-left)
  if (product.sku) {
    doc.setFontSize(4.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(185, 185, 185);
    doc.text(`SKU: ${product.sku}`, x + CARD_PAD + 0.5, y + CARD_H - 1.5);
  }
}
