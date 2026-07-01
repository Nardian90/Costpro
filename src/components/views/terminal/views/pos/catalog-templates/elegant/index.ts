"use client";

/**
 * Elegant Catalog — Premium PDF Template (Home Depot / Lowe's style).
 *
 * Modular architecture:
 *   constants.ts    → Layout dimensions
 *   types.ts        → Shared RGB type
 *   image-helpers.ts → Image loading, QR, contain-fit
 *   drawing.ts      → Primitive shapes & decorations
 *   tags.ts         → Product tags & category icons
 *   components.ts   → Footer, header, category band, product card
 *   cover.ts        → Cover page
 *   body.ts         → Body pages (product grid + dense list)
 *   index.ts        → This file — orchestrator
 */

import { jsPDF } from "jspdf";
import { toast } from "sonner";
import type { CatalogProduct, BrandConfig, TemplateRenderer } from "../types";
import { organizeProducts } from "../shared";

import { loadImageWithData, loadLogoAsBase64, generateQRDataURL } from "./image-helpers";
import type { ImageData } from "./image-helpers";
import { CONTENT_W, MARGIN_L } from "./constants";
import { drawCover } from "./cover";
import { drawBodyPages } from "./body";
import { drawRichFooter } from "./components";

export const renderElegantCatalogTemplate: TemplateRenderer = async (
  products,
  brand,
) => {
  if (products.length === 0) {
    toast.error("No hay productos para generar el catálogo.");
    return;
  }

  try {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pc = brand.primaryColor;

    const now = new Date();
    const fullDateStr = now.toLocaleDateString("es-CU", {
      day: "2-digit", month: "long", year: "numeric",
    });

    const { withImages, grouped } = organizeProducts(products);
    const categories = Array.from(grouped.keys());

    // ── Pre-load resources ──
    const imageDataCache = new Map<string, ImageData>();
    await Promise.all(
      products.map(async (p) => {
        const url = p.public_image_url || p.image_url;
        if (url && !imageDataCache.has(url)) {
          imageDataCache.set(url, await loadImageWithData(url));
        }
      }),
    );

    const logoBase64 = await loadLogoAsBase64(brand.logo || "");

    const storeUrl = brand.website || (typeof window !== "undefined" ? window.location.origin : "https://costpro.app");
    const qrDataURL = await generateQRDataURL(storeUrl);

    // ── Cover ──
    const heroProduct = withImages.length > 0
      ? [...withImages].sort((a, b) => (b.stock_current ?? 0) - (a.stock_current ?? 0))[0]
      : null;

    await drawCover(doc, brand, pc, fullDateStr, logoBase64, imageDataCache, heroProduct, products);

    // ── Body ──
    const gridProducts: { product: CatalogProduct; category: string }[] = [];
    categories.forEach((cat) => {
      const prods = grouped.get(cat) || [];
      prods.forEach((p) => gridProducts.push({ product: p, category: cat }));
    });

    const gridWithImages = gridProducts.filter(
      (g) => g.product.public_image_url || g.product.image_url,
    );
    const gridWithoutImages = gridProducts.filter(
      (g) => !g.product.public_image_url && !g.product.image_url,
    );

    const state = drawBodyPages(doc, brand, pc, gridWithImages, gridWithoutImages, imageDataCache, qrDataURL);

    // ── Update all footers with total page count ──
    const totalPages = doc.getNumberOfPages();
    for (let p = 2; p <= totalPages; p++) {
      doc.setPage(p);
      drawRichFooter(doc, p, totalPages, pc, brand, state.qrDataURL);
    }

    // ── Save ──
    const safeName = brand.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const filename = `${safeName}-catalogo-elegante-${Date.now()}.pdf`;
    doc.save(filename);
    toast.success("Catálogo elegante generado correctamente");
  } catch (err: unknown) {
    console.error("[ElegantCatalogTemplate] Error:", err);
    const message = err instanceof Error ? err.message : "Error al generar el catálogo elegante";
    toast.error(message);
  }
};
