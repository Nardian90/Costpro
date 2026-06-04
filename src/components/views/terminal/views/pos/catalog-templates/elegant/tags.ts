/**
 * Product tag logic: determines which tag (NUEVO, OFERTA, DESTACADO) to show.
 */

import type { CatalogProduct } from "../types";
import type { RGB } from "./types";

export type ProductTag = "NUEVO" | "OFERTA" | "DESTACADO" | null;

export function getProductTag(product: CatalogProduct): ProductTag {
  if (product.stock_current != null && product.stock_current > 50) return "DESTACADO";
  if (product.stock_current != null && product.stock_current > 0 && product.stock_current <= 5) return "OFERTA";
  return null;
}

export const TAG_COLORS: Record<string, { bg: RGB; text: RGB }> = {
  NUEVO:     { bg: [37, 99, 235],  text: [255, 255, 255] },
  OFERTA:    { bg: [220, 38, 38],  text: [255, 255, 255] },
  DESTACADO: { bg: [245, 158, 11], text: [255, 255, 255] },
};

// ── Category icon mapping ────────────────────────────────────

import type { jsPDF } from "jspdf";
import { filledRoundedRect } from "./drawing";

/** Simple geometric icon per category keyword */
export function drawCategoryIcon(
  doc: jsPDF, x: number, y: number, size: number, category: string,
) {
  const lower = category.toLowerCase();
  doc.setFillColor(255, 255, 255);
  doc.setLineWidth(0.3);

  if (lower.includes("cemento") || lower.includes("hormigon") || lower.includes("concret")) {
    filledRoundedRect(doc, x + size * 0.2, y + size * 0.15, size * 0.6, size * 0.7, 1);
    doc.setDrawColor(255, 255, 255);
    doc.line(x + size * 0.35, y + size * 0.15, x + size * 0.65, y + size * 0.15);
  } else if (lower.includes("ferre") || lower.includes("tornillo") || lower.includes("clavo")) {
    doc.setDrawColor(255, 255, 255);
    doc.line(x + size * 0.3, y + size * 0.25, x + size * 0.7, y + size * 0.75);
    doc.circle(x + size * 0.3, y + size * 0.25, size * 0.12, "S");
  } else if (lower.includes("electr") || lower.includes("cable") || lower.includes("lampara")) {
    doc.setFillColor(255, 255, 255);
    doc.triangle(x + size * 0.5, y + size * 0.1, x + size * 0.35, y + size * 0.5, x + size * 0.55, y + size * 0.5, "F");
    doc.triangle(x + size * 0.5, y + size * 0.9, x + size * 0.45, y + size * 0.5, x + size * 0.65, y + size * 0.5, "F");
  } else if (lower.includes("pintura") || lower.includes("color")) {
    doc.setFillColor(255, 255, 255);
    filledRoundedRect(doc, x + size * 0.25, y + size * 0.1, size * 0.5, size * 0.25, 1);
    doc.rect(x + size * 0.45, y + size * 0.35, size * 0.1, size * 0.45, "F");
  } else if (lower.includes("griferia") || lower.includes("sanitario") || lower.includes("bano")) {
    doc.setFillColor(255, 255, 255);
    doc.triangle(x + size * 0.5, y + size * 0.15, x + size * 0.25, y + size * 0.55, x + size * 0.75, y + size * 0.55, "F");
    doc.circle(x + size * 0.5, y + size * 0.6, size * 0.2, "F");
  } else if (lower.includes("ceramic") || lower.includes("azulejo") || lower.includes("pisos")) {
    doc.setDrawColor(255, 255, 255);
    doc.rect(x + size * 0.15, y + size * 0.15, size * 0.35, size * 0.35, "S");
    doc.rect(x + size * 0.5, y + size * 0.15, size * 0.35, size * 0.35, "S");
    doc.rect(x + size * 0.15, y + size * 0.5, size * 0.35, size * 0.35, "S");
    doc.rect(x + size * 0.5, y + size * 0.5, size * 0.35, size * 0.35, "S");
  } else {
    filledRoundedRect(doc, x + size * 0.15, y + size * 0.2, size * 0.7, size * 0.6, 1);
    doc.setDrawColor(255, 255, 255);
    doc.line(x + size * 0.5, y + size * 0.2, x + size * 0.5, y + size * 0.8);
  }
}
