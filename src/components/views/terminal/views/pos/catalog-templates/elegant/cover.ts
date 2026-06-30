/**
 * Cover page renderer for the Elegant Catalog — Professional Magazine Layout.
 *
 * Full-page design with zero dead space:
 *   1. Brand band (header)
 *   2. Hero section: large product image + marketing panel
 *   3. Value propositions strip (3 pillars)
 *   4. Product preview gallery (thumbnail grid)
 *   5. Marketing banner with slogan
 *   6. Bottom contact bar + footer
 */

import type { jsPDF } from "jspdf";
import type { CatalogProduct, BrandConfig } from "../types";
import type { RGB } from "./types";
import {
  PAGE_W, PAGE_H, MARGIN_L, MARGIN_R,
  COVER_ACCENT_H, COVER_BAND_H, COVER_BOTTOM_H,
  COVER_CONTENT_TOP, COVER_CONTENT_H, CONTENT_W,
  COLS, COL_GAP, CARD_W, CARD_IMG_H,
} from "./constants";
import {
  roundedRect, filledRoundedRect, drawCornerBracket, drawImagePlaceholder,
  drawDiamondDivider,
} from "./drawing";
import { lightenColor, darkenColor, truncateText, formatPrice } from "../shared";
import { addProductImage, guessImageFormat } from "./image-helpers";
import type { ImageData } from "./image-helpers";
import { drawRichFooter } from "./components";

// ── Marketing phrases pool ──
const MARKETING_PHRASES = [
  "Los mejores precios de la regi\u00f3n",
  "Calidad garantizada en cada producto",
  "Tu aliado estrat\u00e9gico para el \u00e9xito",
  "Amplia variedad, stock permanente",
  "Servicio personalizado y profesional",
  "Comprometidos con tu satisfacci\u00f3n",
  "Innovaci\u00f3n y tradici\u00f3n en cada entrega",
  "Precios competitivos, calidad superior",
];

const VALUE_PROPS: { icon: string; label: string; desc: string }[] = [
  { icon: "\u2605", label: "Precios Competitivos", desc: "Las mejores ofertas del mercado" },
  { icon: "\u2713", label: "Calidad Garantizada", desc: "Productos certificados y frescos" },
  { icon: "\u260E", label: "Atenci\u00f3n Premium", desc: "Servicio al cliente de excelencia" },
];

const MARKETING_BANNERS = [
  "Soluciones profesionales para tu negocio",
  "Tu proveedor de confianza, siempre disponible",
  "Comprometidos con la excelencia y tu satisfacci\u00f3n",
];

// ── Helper: branded hero placeholder (when image fails to load) ──
function drawHeroPlaceholder(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  productName: string, pc: RGB,
) {
  // Gradient-like background using brand color
  const lightBg = lightenColor(pc, 0.93);
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  filledRoundedRect(doc, x, y, w, h, 2);

  // Border
  doc.setDrawColor(pc[0], pc[1], pc[2]);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([2, 2], 0);
  roundedRect(doc, x, y, w, h, 2);
  doc.setLineDashPattern([], 0);

  const cx = x + w / 2;
  const cy = y + h / 2;

  // Image icon (camera-style)
  const iconR = 8;
  const fadedPc = lightenColor(pc, 0.88);
  doc.setFillColor(fadedPc[0], fadedPc[1], fadedPc[2]);
  doc.circle(cx, cy - 4, iconR, "F");

  doc.setDrawColor(pc[0], pc[1], pc[2]);
  doc.setLineWidth(0.5);
  roundedRect(doc, cx - 6, cy - 8, 12, 8, 1.5);
  doc.circle(cx, cy - 5, 2.5, "S");

  // Product name text
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  const mutedPc = lightenColor(pc, 0.15);
  doc.setTextColor(mutedPc[0], mutedPc[1], mutedPc[2]);
  doc.text(truncateText(productName, 35), cx, cy + 8, { align: "center" });

  // Subtle label
  doc.setFontSize(6);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(160, 160, 160);
  doc.text("Imagen no disponible", cx, cy + 13, { align: "center" });
}

// ── Helper: simple checkbox/radio icon ──
function drawCheckIcon(doc: jsPDF, cx: number, cy: number, r: number, color: RGB) {
  doc.setFillColor(color[0], color[1], color[2]);
  doc.circle(cx, cy, r, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(r * 4);
  doc.setFont("helvetica", "bold");
  doc.text("\u2713", cx, cy + r * 0.35, { align: "center" });
}

// ── Helper: star icon ──
function drawStarIcon(doc: jsPDF, cx: number, cy: number, r: number, color: RGB) {
  doc.setFillColor(color[0], color[1], color[2]);
  doc.circle(cx, cy, r, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(r * 3.5);
  doc.setFont("helvetica", "bold");
  doc.text("\u2605", cx, cy + r * 0.3, { align: "center" });
}

// ── Helper: phone icon ──
function drawPhoneIcon(doc: jsPDF, cx: number, cy: number, r: number, color: RGB) {
  doc.setFillColor(color[0], color[1], color[2]);
  doc.circle(cx, cy, r, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(r * 3.5);
  doc.setFont("helvetica", "bold");
  doc.text("\u260E", cx, cy + r * 0.3, { align: "center" });
}

export async function drawCover(
  doc: jsPDF,
  brand: BrandConfig,
  pc: RGB,
  fullDateStr: string,
  logoBase64: string | null,
  imageDataCache: Map<string, ImageData>,
  heroProduct: CatalogProduct | null,
  allProducts: CatalogProduct[], // NEW: for preview gallery
) {
  const lightPc = lightenColor(pc, 0.15);
  const darkPc = darkenColor(pc, 0.2);
  const veryLightPc = lightenColor(pc, 0.92);
  const medPc = lightenColor(pc, 0.5);

  // ═══════════════════════════════════════════════════════════════
  // SECTION 1: Top accent stripe
  // ═══════════════════════════════════════════════════════════════
  doc.setFillColor(darkPc[0], darkPc[1], darkPc[2]);
  doc.rect(0, 0, PAGE_W, COVER_ACCENT_H, "F");

  // ═══════════════════════════════════════════════════════════════
  // SECTION 2: Brand band
  // ═══════════════════════════════════════════════════════════════
  doc.setFillColor(pc[0], pc[1], pc[2]);
  doc.rect(0, COVER_ACCENT_H, PAGE_W, COVER_BAND_H, "F");

  // Decorative circles
  doc.setFillColor(...lightPc);
  doc.circle(PAGE_W + 10, 8, 35, "F");
  doc.setFillColor(...lightenColor(pc, 0.1));
  doc.circle(-15, COVER_BAND_H - 10, 20, "F");

  // Big circle (top-right) with store initial
  const bigCircleX = PAGE_W - 30;
  const bigCircleY = COVER_BAND_H;
  const bigCircleR = 25;
  doc.setFillColor(...lightenColor(pc, 0.2));
  doc.circle(bigCircleX, bigCircleY, bigCircleR, "F");
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.8);
  doc.circle(bigCircleX, bigCircleY, bigCircleR, "S");
  const storeInitial = (brand.name || "M").charAt(0).toUpperCase();
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.text(storeInitial, bigCircleX, bigCircleY + 4, { align: "center" });

  // Small avatar circle next to initial (if avatar available)
  if (brand.avatar) {
    const avX = bigCircleX - 18;
    const avY = bigCircleY + 18;
    const avR = 7;
    try {
      const avatarResp = await fetch(brand.avatar);
      const avatarBlob = await avatarResp.blob();
      const avatarBase64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Avatar load failed"));
        reader.readAsDataURL(avatarBlob);
      });
      // Draw circular clip via jsPDF (clip then image)
      doc.saveGraphicsState();
      doc.setFillColor(255, 255, 255);
      doc.circle(avX, avY, avR + 0.8, "F");
      doc.addImage(avatarBase64, "PNG", avX - avR, avY - avR, avR * 2, avR * 2, undefined, "MEDIUM");
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.6);
      doc.circle(avX, avY, avR + 0.8, "S");
      doc.restoreGraphicsState();
    } catch {
      // Fallback: small colored circle
      doc.setFillColor(...lightenColor(pc, 0.3));
      doc.circle(avX, avY, avR, "F");
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.4);
      doc.circle(avX, avY, avR, "S");
    }
  }

  // Logo
  const logoAreaX = PAGE_W / 2;
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, guessImageFormat(brand.logo || ""), logoAreaX - 12, 6, 24, 24, undefined, "MEDIUM");
    } catch { /* fallback to text-only */ }
  }

  // Store name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text(brand.name.toUpperCase(), PAGE_W / 2, logoBase64 ? 38 : 26, { align: "center" });

  // Subtitle
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("CAT\u00c1LOGO DE PRODUCTOS", PAGE_W / 2, logoBase64 ? 44 : 32, { align: "center" });

  // Date
  doc.setFontSize(7.5);
  doc.text(`Vigente desde: ${fullDateStr}`, PAGE_W / 2, logoBase64 ? 49 : 37, { align: "center" });

  // Corner brackets
  drawCornerBracket(doc, MARGIN_L + 3, 3, 10, [255, 255, 255], "tl");
  drawCornerBracket(doc, PAGE_W - MARGIN_R - 3, 3, 10, [255, 255, 255], "tr");

  // Thin separator below band
  doc.setFillColor(...medPc);
  doc.rect(0, COVER_ACCENT_H + COVER_BAND_H, PAGE_W, 0.8, "F");

  // ═══════════════════════════════════════════════════════════════
  // SECTION 3: Hero section (large image + marketing panel)
  // ═══════════════════════════════════════════════════════════════
  const heroY = COVER_CONTENT_TOP + 2;
  const heroImgW = 115;
  const heroImgH = 80;
  const heroImgX = MARGIN_L;
  const panelX = heroImgX + heroImgW + 5;
  const panelW = CONTENT_W - heroImgW - 5;

  // Subtle background for entire hero row
  doc.setFillColor(...veryLightPc);
  doc.rect(MARGIN_L - 2, heroY - 2, CONTENT_W + 4, heroImgH + 28, "F");

  // ── Hero product image (left, large) ──
  // Container shadow
  doc.setFillColor(228, 228, 228);
  filledRoundedRect(doc, heroImgX + 0.8, heroY + 0.8, heroImgW, heroImgH, 3);
  // Container bg
  doc.setFillColor(255, 255, 255);
  filledRoundedRect(doc, heroImgX, heroY, heroImgW, heroImgH, 3);
  // Border
  doc.setDrawColor(pc[0], pc[1], pc[2]);
  doc.setLineWidth(0.5);
  roundedRect(doc, heroImgX, heroY, heroImgW, heroImgH, 3);

  // Actual product image — with branded fallback when unavailable
  if (heroProduct) {
    const heroUrl = heroProduct.public_image_url || heroProduct.image_url;
    const heroImgData = heroUrl ? imageDataCache.get(heroUrl) : null;
    const hasValidImage = heroImgData?.base64 && heroImgData.naturalWidth > 0;
    if (hasValidImage) {
      addProductImage(
        doc,
        heroImgData!.base64,
        heroImgData!.format,
        heroImgData!.naturalWidth,
        heroImgData!.naturalHeight,
        heroImgX + 1.5, heroY + 1.5, heroImgW - 3, heroImgH - 3,
        drawImagePlaceholder,
      );
    } else {
      // Branded placeholder with product name
      drawHeroPlaceholder(
        doc,
        heroImgX + 1.5, heroY + 1.5, heroImgW - 3, heroImgH - 3,
        heroProduct.name, pc,
      );
    }
  } else {
    // No hero product at all — generic placeholder
    drawImagePlaceholder(doc, heroImgX + 1.5, heroY + 1.5, heroImgW - 3, heroImgH - 3);
  }

  // ── Marketing panel (right side) ──
  let panelY = heroY + 2;

  // "PRODUCTO DESTACADO" label
  doc.setFillColor(pc[0], pc[1], pc[2]);
  filledRoundedRect(doc, panelX, panelY, panelW, 5.5, 1.5);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("PRODUCTO DESTACADO", panelX + panelW / 2, panelY + 3.5, { align: "center" });
  panelY += 8;

  if (heroProduct) {
    // Product name
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(truncateText(heroProduct.name, 30), panelX, panelY + 3, { align: "left" });
    panelY += 8;

    // Category
    if (heroProduct.category) {
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...medPc);
      doc.text(heroProduct.category.toUpperCase(), panelX, panelY + 1.5);
      panelY += 5;
    }

    // Price (prominent)
    const isZeroHero = heroProduct.price === 0 || heroProduct.price == null;
    doc.setFontSize(isZeroHero ? 14 : 22);
    const priceColor = isZeroHero ? [140, 140, 140] : pc;
    doc.setTextColor(priceColor[0], priceColor[1], priceColor[2]);
    doc.setFont("helvetica", "bold");
    doc.text(formatPrice(heroProduct.price), panelX, panelY + 5, { align: "left" });
    panelY += isZeroHero ? 8 : 12;

    // Stock badge
    if (heroProduct.stock_current != null) {
      const stockText = `Stock disponible: ${heroProduct.stock_current} unidades`;
      const badgeW = doc.getTextWidth(stockText) + 8;
      doc.setFillColor(...lightenColor(pc, 0.9));
      filledRoundedRect(doc, panelX, panelY - 1, badgeW, 5, 1.5);
      doc.setDrawColor(...medPc);
      doc.setLineWidth(0.2);
      roundedRect(doc, panelX, panelY - 1, badgeW, 5, 1.5);
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(pc[0], pc[1], pc[2]);
      doc.text(stockText, panelX + 4, panelY + 2);
      panelY += 8;
    }

    // Description / feature line
    if (heroProduct.description) {
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 120);
      doc.text(truncateText(heroProduct.description, 55), panelX, panelY + 1.5, { align: "left" });
      panelY += 7;
    }
  }

  // Separator diamond
  drawDiamondDivider(doc, panelY + 2, panelX, panelX + panelW, pc);
  panelY += 7;

  // Marketing taglines in panel
  const selectedPhrases = MARKETING_PHRASES.slice(0, 4);
  for (const phrase of selectedPhrases) {
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(pc[0], pc[1], pc[2]);
    doc.text("\u25BA", panelX + 1, panelY + 1.5);
    doc.setTextColor(80, 80, 80);
    doc.text(phrase, panelX + 5, panelY + 1.5);
    panelY += 5;
  }

  // ── Product info below hero image ──
  if (heroProduct) {
    const infoY = heroY + heroImgH + 3;

    // Product name below image
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(truncateText(heroProduct.name, 55), heroImgX + heroImgW / 2, infoY + 2, { align: "center" });

    // Price below image
    const isZero = heroProduct.price === 0 || heroProduct.price == null;
    doc.setFontSize(isZero ? 9 : 14);
    const pColor = isZero ? [140, 140, 140] : pc;
    doc.setTextColor(pColor[0], pColor[1], pColor[2]);
    doc.text(formatPrice(heroProduct.price), heroImgX + heroImgW / 2, infoY + 9, { align: "center" });

    // Badge row
    const badgeParts: string[] = [];
    if (heroProduct.stock_current != null) badgeParts.push(`Stock: ${heroProduct.stock_current}`);
    if (heroProduct.category) badgeParts.push(heroProduct.category);
    if (heroProduct.sku) badgeParts.push(`SKU: ${heroProduct.sku}`);
    if (badgeParts.length > 0) {
      const badgeText = badgeParts.join("  \u00b7  ");
      const badgeW = doc.getTextWidth(badgeText) + 8;
      doc.setFillColor(...veryLightPc);
      filledRoundedRect(doc, heroImgX + heroImgW / 2 - badgeW / 2, infoY + 12, badgeW, 4.5, 1.2);
      doc.setDrawColor(...medPc);
      doc.setLineWidth(0.15);
      roundedRect(doc, heroImgX + heroImgW / 2 - badgeW / 2, infoY + 12, badgeW, 4.5, 1.2);
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(pc[0], pc[1], pc[2]);
      doc.text(badgeText, heroImgX + heroImgW / 2, infoY + 14.5, { align: "center" });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 4: Value propositions strip
  // ═══════════════════════════════════════════════════════════════
  const vpY = heroY + heroImgH + 24;
  const vpH = 22;
  const vpColW = (CONTENT_W - 6) / 3;

  for (let i = 0; i < VALUE_PROPS.length; i++) {
    const vp = VALUE_PROPS[i];
    const colX = MARGIN_L + i * (vpColW + 3);

    // Card bg
    doc.setFillColor(255, 255, 255);
    filledRoundedRect(doc, colX, vpY, vpColW, vpH, 2);
    doc.setDrawColor(...medPc);
    doc.setLineWidth(0.2);
    roundedRect(doc, colX, vpY, vpColW, vpH, 2);

    // Left accent bar
    doc.setFillColor(pc[0], pc[1], pc[2]);
    doc.rect(colX, vpY + 2, 0.8, vpH - 4, "F");

    // Icon circle
    const iconCx = colX + 7;
    const iconCy = vpY + vpH / 2;
    const iconR = 4;
    if (i === 0) drawStarIcon(doc, iconCx, iconCy, iconR, pc);
    else if (i === 1) drawCheckIcon(doc, iconCx, iconCy, iconR, darkenColor(pc, 0.1));
    else drawPhoneIcon(doc, iconCx, iconCy, iconR, pc);

    // Label
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text(vp.label, colX + 14, vpY + 8);

    // Description
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(vp.desc, colX + 14, vpY + 13);
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 5: Product preview gallery
  // ═══════════════════════════════════════════════════════════════
  const galY = vpY + vpH + 5;

  // Section header
  const imgProducts = allProducts.filter(p => p.public_image_url || p.image_url);
  let previewCount = 0;
  let galleryEndY = vpY + vpH + 3;
  if (imgProducts.length > 1) {
    doc.setFillColor(pc[0], pc[1], pc[2]);
    filledRoundedRect(doc, MARGIN_L, galY, CONTENT_W, 6, 1.5);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(
      `NUESTROS PRODUCTOS  \u2014  ${imgProducts.length} art\u00edculos disponibles`,
      MARGIN_L + 3,
      galY + 4,
    );
    // Total price hint on right
    const bannerStr = `Precios desde ${formatPrice(Math.min(...allProducts.filter(p => p.price > 0).map(p => p.price), 0))}`;
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...lightenColor(pc, 0.3));
    doc.text(bannerStr, PAGE_W - MARGIN_R - 3, galY + 4, { align: "right" });

    const galStartY = galY + 8;
    previewCount = Math.min(imgProducts.length, 8);
    const previewColW = (CONTENT_W - COL_GAP * (COLS - 1)) / COLS;
    const previewImgH = 15;
    const previewRowH = previewImgH + COL_GAP + 3;

    for (let i = 0; i < previewCount; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const px = MARGIN_L + col * (previewColW + COL_GAP);
      const py = galStartY + row * previewRowH;

      if (py + previewImgH + 3 > PAGE_H - COVER_BOTTOM_H - 20) break;

      // Card bg
      doc.setFillColor(255, 255, 255);
      filledRoundedRect(doc, px, py, previewColW, previewImgH + 3, 1.2);
      doc.setDrawColor(232, 232, 232);
      doc.setLineWidth(0.12);
      roundedRect(doc, px, py, previewColW, previewImgH + 3, 1.2);

      // Image bg
      doc.setFillColor(248, 248, 248);
      filledRoundedRect(doc, px + 0.6, py + 0.6, previewColW - 1.2, previewImgH - 0.3, 0.8);

      // Image
      const p = imgProducts[i];
      const url = p.public_image_url || p.image_url;
      const imgData = url ? imageDataCache.get(url) : null;
      if (imgData) {
        addProductImage(
          doc,
          imgData.base64,
          imgData.format,
          imgData.naturalWidth,
          imgData.naturalHeight,
          px + 0.6, py + 0.6, previewColW - 1.2, previewImgH - 0.3,
          drawImagePlaceholder,
        );
      } else {
        drawImagePlaceholder(doc, px + 0.6, py + 0.6, previewColW - 1.2, previewImgH - 0.3);
      }

      // Name
      doc.setFontSize(4.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(60, 60, 60);
      doc.text(truncateText(p.name, 22), px + previewColW / 2, py + previewImgH + 2, { align: "center" });
    }

    // "Ver m\u00e1s productos dentro" hint
    const actualRows = Math.min(Math.ceil(previewCount / COLS), Math.floor((PAGE_H - COVER_BOTTOM_H - 20 - galStartY) / previewRowH));
    galleryEndY = galStartY + actualRows * previewRowH + 2;
    if (galleryEndY < PAGE_H - COVER_BOTTOM_H - 22) {
      doc.setFontSize(6);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...medPc);
      doc.text(
        `+ ${Math.max(0, imgProducts.length - previewCount)} productos m\u00e1s dentro del cat\u00e1logo \u2192`,
        PAGE_W / 2, galleryEndY, { align: "center" },
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 6: Marketing banner
  // ═══════════════════════════════════════════════════════════════
  // Position banner dynamically after gallery (or after VP strip if no gallery)
  const lastContentY = (imgProducts.length > 1 && previewCount > 0) ? galleryEndY + 4 : vpY + vpH + 4;
  const bannerY = Math.min(lastContentY + 3, PAGE_H - COVER_BOTTOM_H - 14);
  doc.setFillColor(pc[0], pc[1], pc[2]);
  filledRoundedRect(doc, MARGIN_L, bannerY, CONTENT_W, 10, 2);

  // Decorative side accents
  doc.setFillColor(...darkPc);
  doc.rect(MARGIN_L, bannerY, 3, 10, "F");
  doc.rect(PAGE_W - MARGIN_R - 3, bannerY, 3, 10, "F");

  // Slogan text
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  const slogan = safePick(MARKETING_BANNERS);
  doc.text(slogan, PAGE_W / 2, bannerY + 4.5, { align: "center" });
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...lightenColor(pc, 0.3));
  doc.text(brand.name.toUpperCase(), PAGE_W / 2, bannerY + 8, { align: "center" });

  // ═══════════════════════════════════════════════════════════════
  // SECTION 7: Bottom contact bar
  // ═══════════════════════════════════════════════════════════════
  const bottomBarY = PAGE_H - COVER_BOTTOM_H;
  doc.setFillColor(pc[0], pc[1], pc[2]);
  doc.rect(0, bottomBarY, PAGE_W, COVER_BOTTOM_H, "F");

  // Separator line
  doc.setFillColor(...darkPc);
  doc.rect(0, bottomBarY - 0.5, PAGE_W, 0.5, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  const contactParts: string[] = [];
  if (brand.phone) contactParts.push(brand.phone);
  if (brand.whatsapp) contactParts.push(`WA: ${brand.whatsapp}`);
  if (brand.address) contactParts.push(brand.address);
  if (contactParts.length > 0) {
    doc.text(contactParts.join("  |  "), PAGE_W / 2, bottomBarY + 8, { align: "center" });
  }
  if (brand.website) {
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(220, 220, 220);
    doc.text(brand.website, PAGE_W / 2, bottomBarY + 14, { align: "center" });
  }

  // Cover footer (no page count on cover)
  drawRichFooter(doc, 1, 0, pc, brand, null);
}
