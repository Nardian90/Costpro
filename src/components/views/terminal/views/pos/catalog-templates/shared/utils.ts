/**
 * Shared utilities for catalog export templates.
 */

import type { CatalogProduct, BrandConfig } from "../types";

// ── Product Organization ────────────────────────────────────

export interface OrganizedProducts {
  withImages: CatalogProduct[];
  withoutImages: CatalogProduct[];
  grouped: Map<string, CatalogProduct[]>;
  total: number;
}

/**
 * Organizes products following catalog industry standard:
 * 1. Products WITH image first
 * 2. Products WITHOUT image after
 * 3. Grouped by category (with images first within each group)
 */
export function organizeProducts(products: CatalogProduct[]): OrganizedProducts {
  const withImages = products.filter(
    (p) => p.public_image_url || p.image_url,
  );
  const withoutImages = products.filter(
    (p) => !p.public_image_url && !p.image_url,
  );

  // Group by category, images first within each group
  const grouped = new Map<string, CatalogProduct[]>();
  [...withImages, ...withoutImages].forEach((p) => {
    const cat = p.category || "Sin Categoria";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(p);
  });

  return { withImages, withoutImages, grouped, total: products.length };
}

// ── Brand Config Builder ───────────────────────────────────

/**
 * Resolves brand configuration from the current UI state (CSS vars, auth store).
 */
export function buildBrandConfig(storeName: string): BrandConfig {
  let primaryColor: [number, number, number] = [21, 128, 61]; // green-700 fallback

  if (typeof window !== "undefined") {
    try {
      const root = document.documentElement;
      const raw = getComputedStyle(root)
        .getPropertyValue("--primary")
        .trim();
      if (raw.startsWith("#") && raw.length === 7) {
        primaryColor = [
          parseInt(raw.slice(1, 3), 16),
          parseInt(raw.slice(3, 5), 16),
          parseInt(raw.slice(5, 7), 16),
        ];
      } else {
        const ctx = document.createElement("canvas").getContext("2d");
        if (ctx) {
          ctx.fillStyle = raw;
          const computed = ctx.fillStyle;
          if (computed.startsWith("#") && computed.length === 7) {
            primaryColor = [
              parseInt(computed.slice(1, 3), 16),
              parseInt(computed.slice(3, 5), 16),
              parseInt(computed.slice(5, 7), 16),
            ];
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    name: storeName || "Mi Tienda",
    primaryColor,
  };
}

// ── Formatting ──────────────────────────────────────────────

export function formatPrice(price: number): string {
  if (price === 0 || price == null) {
    return "Precio a confirmar";
  }
  return new Intl.NumberFormat("es-CU", {
    style: "currency",
    currency: "CUP",
    minimumFractionDigits: 2,
  }).format(price);
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "\u2026";
}

// ── Color Helpers ──────────────────────────────────────────

export function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

export function withAlpha(
  color: [number, number, number],
  alpha: number,
): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

export function lightenColor(
  color: [number, number, number],
  amount: number,
): [number, number, number] {
  return color.map((c) => Math.min(255, c + Math.round((255 - c) * amount))) as [
    number,
    number,
    number,
  ];
}

export function darkenColor(
  color: [number, number, number],
  amount: number,
): [number, number, number] {
  return color.map((c) => Math.max(0, Math.round(c * (1 - amount)))) as [
    number,
    number,
    number,
  ];
}
