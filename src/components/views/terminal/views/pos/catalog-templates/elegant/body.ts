/**
 * Body pages renderer — product grid with smart pagination.
 *
 * Renders products with images in a 4-per-row card grid,
 * followed by a dense list for products without images.
 */

import type { jsPDF } from "jspdf";
import type { CatalogProduct, BrandConfig } from "../types";
import type { RGB } from "./types";
import {
  PAGE_H, MARGIN_L,
  CONTENT_W, CAT_BAND_H, FOOTER_H, MAX_Y, BODY_START,
  COLS, COL_GAP, CARD_W, CARD_H, ROW_GAP,
  LIST_COLS, LIST_LINE_H, LIST_COL_GAP, LIST_COL_W,
} from "./constants";
import { lightenColor, darkenColor, truncateText, formatPrice } from "../shared";
import { drawPageAccentStripe, filledRoundedRect } from "./drawing";
import { drawRichFooter, drawMiniPageHeader, drawCategoryHeader, drawProductCard } from "./components";
import { addProductImage } from "./image-helpers";
import type { ImageData } from "./image-helpers";

export interface PageState {
  y: number;
  page: number;
  isFirstBodyPage: boolean;
  currentCategory: string | null;
  colIndex: number;
  qrDataURL: string | null;
}

export function drawBodyPages(
  doc: jsPDF,
  brand: BrandConfig,
  pc: RGB,
  gridWithImages: { product: CatalogProduct; category: string }[],
  gridWithoutImages: { product: CatalogProduct; category: string }[],
  imageDataCache: Map<string, ImageData>,
  qrDataURL: string | null,
): PageState {
  // ── Initialize first body page ──
  doc.addPage();
  drawPageAccentStripe(doc, pc);
  drawMiniPageHeader(doc, brand, pc);

  const rowsPerPage = Math.max(1, Math.floor((MAX_Y - BODY_START - CAT_BAND_H - 5) / (CARD_H + ROW_GAP)));

  const state: PageState = {
    y: BODY_START,
    page: 2,
    isFirstBodyPage: true,
    currentCategory: null,
    colIndex: 0,
    qrDataURL,
  };

  function newBodyPage(): void {
    drawRichFooter(doc, state.page, 0, pc, brand, state.qrDataURL);
    doc.addPage();
    state.page = doc.getNumberOfPages();
    state.y = BODY_START;
    state.colIndex = 0;
    state.isFirstBodyPage = true;
    drawPageAccentStripe(doc, pc);
    drawMiniPageHeader(doc, brand, pc);
    if (state.currentCategory) {
      drawCategoryHeader(doc, state.y, state.currentCategory, pc);
      state.y += CAT_BAND_H + 2;
    }
  }

  let currentRowStart = state.y;

  // ── Products with images (card grid) ──
  for (let i = 0; i < gridWithImages.length; i++) {
    const { product, category } = gridWithImages[i];

    if (category !== state.currentCategory) {
      if (state.colIndex > 0) {
        state.y += CARD_H + ROW_GAP;
        state.colIndex = 0;
      }
      state.currentCategory = category;
      if (state.y + CAT_BAND_H + CARD_H + ROW_GAP > MAX_Y) {
        newBodyPage();
      }
      drawCategoryHeader(doc, state.y, category, pc);
      state.y += CAT_BAND_H + 2;
      currentRowStart = state.y;
      state.colIndex = 0;
    }

    if (state.colIndex === 0 && state.y + CARD_H > MAX_Y) {
      newBodyPage();
      currentRowStart = state.y;
    }

    state.isFirstBodyPage = false;

    const col = state.colIndex % COLS;
    const cardX = MARGIN_L + col * (CARD_W + COL_GAP);
    const cardY = currentRowStart;

    const imgUrl = product.public_image_url || product.image_url;
    const imgData = imgUrl ? imageDataCache.get(imgUrl) : undefined;
    drawProductCard(doc, cardX, cardY, product, imgData, pc);

    state.colIndex++;
    if (state.colIndex >= COLS) {
      state.y = currentRowStart + CARD_H + ROW_GAP;
      state.colIndex = 0;
    }
  }

  if (state.colIndex > 0) {
    state.y = currentRowStart + CARD_H + ROW_GAP;
    state.colIndex = 0;
  }

  // ── Products without images (dense list) ──
  if (gridWithoutImages.length > 0) {
    if (state.y + CAT_BAND_H + 8 > MAX_Y) {
      newBodyPage();
    }

    // Section header
    const darkPc = darkenColor(pc, 0.1);
    doc.setFillColor(darkPc[0], darkPc[1], darkPc[2]);
    filledRoundedRect(doc, MARGIN_L, state.y, CONTENT_W, CAT_BAND_H, 1.5);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(
      `OTROS PRODUCTOS (${gridWithoutImages.length})`,
      MARGIN_L + CAT_BAND_H + 2,
      state.y + CAT_BAND_H / 2 + 1.3,
    );
    state.y += CAT_BAND_H + 4;

    for (let i = 0; i < gridWithoutImages.length; i++) {
      if (state.y + LIST_LINE_H > MAX_Y) {
        newBodyPage();
      }

      const item = gridWithoutImages[i];
      const col = i % LIST_COLS;
      const lineX = MARGIN_L + col * (LIST_COL_W + LIST_COL_GAP);

      // Alternating row bg
      const rowIdx = Math.floor(i / LIST_COLS);
      if (rowIdx % 2 === 0) {
        doc.setFillColor(...lightenColor(pc, 0.96));
        doc.rect(lineX, state.y - 0.8, LIST_COL_W, LIST_LINE_H + 0.8, "F");
      }

      // Left accent bar
      doc.setFillColor(pc[0], pc[1], pc[2]);
      doc.rect(lineX, state.y, 0.8, LIST_LINE_H - 1, "F");

      // Bullet
      doc.setFontSize(6);
      doc.setTextColor(pc[0], pc[1], pc[2]);
      doc.setFont("helvetica", "normal");
      doc.text("\u2022", lineX + 3, state.y + 2.8);

      // Name
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(6.5);
      doc.text(truncateText(item.product.name, 35), lineX + 5, state.y + 2.8);

      // Price
      const isZero = item.product.price === 0 || item.product.price == null;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(isZero ? 5.5 : 6.5);
      const listPriceColor = isZero ? [155, 155, 155] : pc;
      doc.setTextColor(listPriceColor[0], listPriceColor[1], listPriceColor[2]);
      doc.text(formatPrice(item.product.price), lineX + LIST_COL_W - 2, state.y + 2.8, { align: "right" });

      if (col === LIST_COLS - 1) {
        state.y += LIST_LINE_H + 0.5;
      }
    }

    if (gridWithoutImages.length % LIST_COLS !== 0) {
      state.y += LIST_LINE_H + 0.5;
    }
  }

  return state;
}
