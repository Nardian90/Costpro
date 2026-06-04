"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import type { CatalogProduct, BrandConfig, TemplateRenderer } from "./types";
import {
  organizeProducts,
  formatPrice,
  truncateText,
  rgbToHex,
  withAlpha,
  lightenColor,
} from "./shared";

// ── Image Loader ────────────────────────────────────────────

async function loadImageAsBase64(
  url: string,
): Promise<string | null> {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function guessImageFormat(url: string): "JPEG" | "PNG" {
  const lower = url.toLowerCase();
  if (lower.endsWith(".png") || lower.includes(".png?")) return "PNG";
  return "JPEG";
}

// ── Constants ───────────────────────────────────────────────

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_L = 15;
const MARGIN_R = 15;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
const HEADER_BAND_H = 35;
const THUMB_W = 12;
const THUMB_H = 12;

// ── Main Renderer ───────────────────────────────────────────

export const renderPriceListTemplate: TemplateRenderer = async (
  products,
  brand,
) => {
  if (products.length === 0) {
    toast.error("No hay productos para generar la lista de precios.");
    return;
  }

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pc = brand.primaryColor;
  const lightBg = withAlpha(pc, 0.05);

  const now = new Date();
  const dateStr = now.toLocaleDateString("es-CU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const fullDateStr = now.toLocaleDateString("es-CU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Contact info parts
  const contactParts: string[] = [];
  if (brand.phone) contactParts.push(brand.phone);
  if (brand.email) contactParts.push(brand.email);
  if (brand.address) contactParts.push(brand.address);
  const contactLine = contactParts.join("  |  ");

  const { grouped } = organizeProducts(products);
  const categories = Array.from(grouped.keys());

  // Pre-load all images upfront
  const imageCache = new Map<string, string | null>();
  const allWithImages = products.filter(
    (p) => p.public_image_url || p.image_url,
  );
  await Promise.all(
    allWithImages.map(async (p) => {
      const url = p.public_image_url || p.image_url!;
      if (!imageCache.has(url)) {
        imageCache.set(url, await loadImageAsBase64(url));
      }
    }),
  );

  // Determine if any product in this category has images
  const categoryHasImages = (cat: string) =>
    grouped.get(cat)?.some((p) => p.public_image_url || p.image_url) ?? false;

  // ── Page 1 ───────────────────────────────────────────────

  let firstPage = true;
  let currentY = HEADER_BAND_H;

  for (let ci = 0; ci < categories.length; ci++) {
    const cat = categories[ci];
    const catProducts = grouped.get(cat) || [];
    const hasImages = categoryHasImages(cat);

    // ── Category Separator ──────────────────────────────────
    const catSepH = 10;

    // Check if we need a new page for the category header + at least a few rows
    const minTableSpace = 35; // need at least 35mm for a small table
    if (!firstPage && currentY + catSepH + minTableSpace > PAGE_H - 25) {
      // Footer on current page
      _addPageFooter(doc, doc.getNumberOfPages(), 0, pc, dateStr);
      doc.addPage();
      _addPageFooter(doc, doc.getNumberOfPages(), 0, pc, dateStr);
      currentY = HEADER_BAND_H + 5;
    }

    if (firstPage) {
      firstPage = false;
      currentY = HEADER_BAND_H + 5;
    }

    // Draw category separator band
    doc.setFillColor(
      lightenColor(pc, 0.85)[0],
      lightenColor(pc, 0.85)[1],
      lightenColor(pc, 0.85)[2],
    );
    doc.rect(MARGIN_L, currentY, CONTENT_W, catSepH, "F");

    // Left accent border
    doc.setFillColor(pc[0], pc[1], pc[2]);
    doc.rect(MARGIN_L, currentY, 3, catSepH, "F");

    // Category name
    doc.setTextColor(pc[0], pc[1], pc[2]);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(cat, MARGIN_L + 7, currentY + catSepH / 2 + 1.2);

    currentY += catSepH + 2;

    // ── autoTable ───────────────────────────────────────────
    const columnDefs = [
      {
        header: "#",
        dataKey: "num",
        cellWidth: 8,
        halign: "center" as const,
        styles: { halign: "center", fontSize: 8 },
      },
      {
        header: "Foto",
        dataKey: "foto",
        cellWidth: hasImages ? THUMB_W + 4 : 0,
        halign: "center" as const,
      },
      {
        header: "Producto",
        dataKey: "producto",
        cellWidth: hasImages ? 60 : 72,
        styles: { fontSize: 9 },
      },
      {
        header: "SKU",
        dataKey: "sku",
        cellWidth: 22,
        halign: "center" as const,
        styles: { fontSize: 8, halign: "center" },
      },
      {
        header: "Stock",
        dataKey: "stock",
        cellWidth: 18,
        halign: "center" as const,
        styles: { fontSize: 8, halign: "center" },
      },
      {
        header: "P.Unitario",
        dataKey: "precio",
        cellWidth: 25,
        halign: "right" as const,
        styles: { fontSize: 9, halign: "right", fontStyle: "bold" },
      },
    ];

    // Filter out zero-width column if no images
    const visibleColumns = hasImages
      ? columnDefs
      : columnDefs.filter((c) => c.header !== "Foto");

    const startY = currentY;

    autoTable(doc, {
      startY,
      head: [
        visibleColumns.map((c) => ({
          content: c.header,
          styles: { fillColor: pc, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9, halign: c.halign || "left" as const },
        })),
      ],
      body: catProducts.map((product, idx) => {
        const isZeroPrice = product.price === 0 || product.price == null;
        const rowObj: Record<string, string> = {
          num: String(idx + 1),
          foto: hasImages ? "" : undefined as unknown as string,
          producto: truncateText(product.name, 45),
          sku: product.sku || "\u2014",
          stock: product.stock_current != null ? String(product.stock_current) : "\u2014",
          precio: isZeroPrice ? "A confirmar" : formatPrice(product.price),
        };
        return visibleColumns.map((c) => ({
          content: rowObj[c.dataKey] || "",
        }));
      }),
      columns: visibleColumns.map((c) => ({
        ...c,
        header: c.header,
      })),
      theme: "grid",
      margin: { left: MARGIN_L, right: MARGIN_R, bottom: 20 },
      styles: {
        fontSize: 9,
        cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
        lineColor: [220, 220, 220],
        lineWidth: 0.1,
      },
      alternateRowStyles: {
        fillColor: lightBg,
      },
      headStyles: {
        fillColor: [pc[0], pc[1], pc[2]],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
        halign: "center",
        cellPadding: 3,
      },
      didDrawPage: (data) => {
        // Draw header band on every new page
        if (data.pageNumber > 1 || !firstPage) {
          // Header is drawn by _drawHeader in the page init below
        }
      },

    });

    // ── Draw images into table cells ────────────────────────
    if (hasImages) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const at = (doc as any).__autoTable__;
      if (at?.pages) {
        Object.values(at.pages).forEach((pageData: any) => {
          const bodyCells: any[] = pageData?.body ?? [];
          bodyCells.forEach((cell: any, idx: number) => {
            if (idx >= catProducts.length) return;
            const product = catProducts[idx];
            const imgUrl = product.public_image_url || product.image_url;
            if (!imgUrl) return;

            const base64 = imageCache.get(imgUrl);
            if (base64) {
              try {
                doc.addImage(
                  base64,
                  guessImageFormat(imgUrl),
                  cell.x + 2,
                  cell.y + 2,
                  THUMB_W,
                  THUMB_H,
                  undefined,
                  "MEDIUM",
                );
              } catch {
                // Silently skip failed images
              }
            }
          });
        });
      }
    }

    // Get the final Y after the table
    const lastTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    currentY = (lastTable?.finalY ?? startY + 30) + 6;
  }

  // ── Final footers ─────────────────────────────────────────

  const totalPages = doc.getNumberOfPages();

  // Draw last-page footer (prices validity)
  const lastPage = totalPages;
  doc.setPage(lastPage);
  const lastFinalY = currentY > PAGE_H - 50 ? PAGE_H - 50 : currentY;

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_L, lastFinalY, PAGE_W - MARGIN_R, lastFinalY);

  doc.setTextColor(120, 120, 120);
  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  doc.text(
    `Precios vigentes al ${fullDateStr}`,
    PAGE_W / 2,
    lastFinalY + 6,
    { align: "center" },
  );

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  if (contactLine) {
    doc.text(contactLine, PAGE_W / 2, lastFinalY + 12, { align: "center" });
  }
  if (brand.whatsapp) {
    doc.text(
      `WhatsApp: ${brand.whatsapp}`,
      PAGE_W / 2,
      lastFinalY + 18,
      { align: "center" },
    );
  }

  // ── Draw all page headers and footers ──────────────────────

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    _drawPageHeader(doc, brand, dateStr, pc, contactLine);
    _addPageFooter(doc, p, totalPages, pc, dateStr);
  }

  // ── Save ──────────────────────────────────────────────────

  const safeName = brand.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const timestamp = Date.now();
  const filename = `${safeName}-lista-precios-${timestamp}.pdf`;

  doc.save(filename);
  toast.success("Lista de precios generada correctamente");
};

// ── Header (per page) ──────────────────────────────────────

function _drawPageHeader(
  doc: jsPDF,
  brand: BrandConfig,
  dateStr: string,
  pc: [number, number, number],
  contactLine: string,
) {
  const pageW = doc.internal.pageSize.getWidth();

  // Brand color band
  doc.setFillColor(pc[0], pc[1], pc[2]);
  doc.rect(0, 0, pageW, HEADER_BAND_H, "F");

  // Store name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(brand.name, MARGIN_L, 15);

  // Subtitle
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("LISTA DE PRECIOS", MARGIN_L, 23);

  // Date on the right
  doc.setFontSize(10);
  doc.text(dateStr, pageW - MARGIN_R, 15, { align: "right" });

  // Contact info line below the band
  doc.setTextColor(130, 130, 130);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  if (contactLine) {
    doc.text(contactLine, MARGIN_L, HEADER_BAND_H + 4);
  }
}

// ── Footer (per page) ────────────────────────────────────────

function _addPageFooter(
  doc: jsPDF,
  page: number,
  totalPages: number,
  pc: [number, number, number],
  dateStr: string,
) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const footerY = pageH - 12;

  // Thin brand color line
  doc.setDrawColor(pc[0], pc[1], pc[2]);
  doc.setLineWidth(0.5);
  doc.line(MARGIN_L, footerY - 3, pageW - MARGIN_R, footerY - 3);

  // Page number
  doc.setTextColor(130, 130, 130);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  if (totalPages > 0) {
    doc.text(
      `Pagina ${page} de ${totalPages}`,
      pageW / 2,
      footerY,
      { align: "center" },
    );
  }

  // "Generado con CostPro"
  doc.setFontSize(6);
  doc.text(
    "Generado con CostPro",
    pageW / 2,
    footerY + 4,
    { align: "center" },
  );
}
