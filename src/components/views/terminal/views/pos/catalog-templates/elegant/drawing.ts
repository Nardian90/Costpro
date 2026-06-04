/**
 * Primitive drawing helpers for jsPDF — shapes, decorations, placeholders.
 */

import type { jsPDF } from "jspdf";
import { lightenColor, darkenColor } from "../shared";
import type { RGB } from "./types";
import { PAGE_W } from "./constants";

// ── Basic shapes ────────────────────────────────────────────

/** Rounded rectangle (stroke) */
export function roundedRect(
  doc: jsPDF, x: number, y: number, w: number, h: number, r: number,
) {
  try { doc.roundedRect(x, y, w, h, r, r, "S"); }
  catch { doc.rect(x, y, w, h, "S"); }
}

/** Rounded rectangle (fill) */
export function filledRoundedRect(
  doc: jsPDF, x: number, y: number, w: number, h: number, r: number,
) {
  try { doc.roundedRect(x, y, w, h, r, r, "F"); }
  catch { doc.rect(x, y, w, h, "F"); }
}

// ── Card decorations ────────────────────────────────────────

/** Soft shadow behind a card */
export function drawCardShadow(doc: jsPDF, x: number, y: number, w: number, h: number, r: number) {
  doc.setFillColor(232, 232, 232);
  filledRoundedRect(doc, x + 0.5, y + 0.5, w, h, r);
}

// ── Image placeholder ─────────────────────────────────────────

/** Dashed-border placeholder with a simple package icon */
export function drawImagePlaceholder(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setFillColor(245, 245, 245);
  doc.rect(x, y, w, h, "F");

  doc.setDrawColor(218, 218, 218);
  doc.setLineWidth(0.15);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.rect(x, y, w, h, "S");
  doc.setLineDashPattern([], 0);

  const cx = x + w / 2;
  const cy = y + h / 2;
  doc.setFillColor(215, 215, 215);
  filledRoundedRect(doc, cx - 3, cy - 2, 6, 4, 0.5);
  doc.rect(cx - 1.5, cy - 3.5, 3, 2, "F");
}

// ── Decorative elements ──────────────────────────────────────

/** L-shaped corner bracket */
export function drawCornerBracket(
  doc: jsPDF, x: number, y: number, size: number,
  color: RGB, corner: "tl" | "tr" | "bl" | "br",
) {
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.3);
  const dx = corner === "tl" || corner === "bl" ? 1 : -1;
  const dy = corner === "tl" || corner === "tr" ? 1 : -1;
  const sx = corner === "tl" || corner === "bl" ? x : x + size;
  const sy = corner === "tl" || corner === "tr" ? y : y + size;
  doc.line(sx, sy, sx + dx * size * 0.5, sy);
  doc.line(sx, sy, sx, sy + dy * size * 0.5);
}

/** Diamond divider between sections */
export function drawDiamondDivider(
  doc: jsPDF, y: number, x1: number, x2: number, pc: RGB,
) {
  const midX = (x1 + x2) / 2;
  doc.setDrawColor(pc[0], pc[1], pc[2]);
  doc.setLineWidth(0.25);
  doc.line(x1, y, midX - 3, y);
  doc.line(midX + 3, y, x2, y);
  doc.setFillColor(pc[0], pc[1], pc[2]);
  doc.triangle(midX - 1.8, y, midX, y - 1.3, midX + 1.8, y, "F");
  doc.triangle(midX - 1.8, y, midX, y + 1.3, midX + 1.8, y, "F");
}

/** Thin accent stripe at the very top of body pages */
export function drawPageAccentStripe(doc: jsPDF, pc: RGB) {
  const dark = darkenColor(pc, 0.2);
  doc.setFillColor(dark[0], dark[1], dark[2]);
  doc.rect(0, 0, PAGE_W, 1.2, "F");
  const light = lightenColor(pc, 0.6);
  doc.setFillColor(light[0], light[1], light[2]);
  doc.rect(0, 1.2, PAGE_W, 0.4, "F");
}

/** Product tag badge (NUEVO, OFERTA, DESTACADO) — centered text */
export function drawProductTag(
  doc: jsPDF, x: number, y: number,
  text: string, bgColor: RGB, textColor: RGB,
) {
  doc.setFontSize(5);
  const tagW = doc.getTextWidth(text) + 5;
  const tagH = 3.8;
  doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
  filledRoundedRect(doc, x, y, tagW, tagH, 1);
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.setFont("helvetica", "bold");
  doc.text(text, x + tagW / 2, y + tagH - 1, { align: "center" });
}
