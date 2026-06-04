/**
 * Image loading and QR code helpers for the Elegant Catalog.
 */

import type { jsPDF } from "jspdf";

export interface ImageData {
  base64: string | null;
  format: "JPEG" | "PNG";
  naturalWidth: number;
  naturalHeight: number;
}

// ── Image fetching ──────────────────────────────────────────

async function fetchAsBase64(url: string): Promise<string | null> {
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

export function guessImageFormat(url: string): "JPEG" | "PNG" {
  const lower = url.toLowerCase();
  if (lower.endsWith(".png") || lower.includes(".png?")) return "PNG";
  return "JPEG";
}

export async function loadImageWithData(url: string): Promise<ImageData> {
  const base64 = await fetchAsBase64(url);
  return new Promise((resolve) => {
    if (!base64) {
      resolve({ base64: null, format: guessImageFormat(url), naturalWidth: 0, naturalHeight: 0 });
      return;
    }
    const img = new window.Image();
    img.onload = () => {
      resolve({
        base64,
        format: guessImageFormat(url),
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      });
    };
    img.onerror = () => {
      resolve({ base64, format: guessImageFormat(url), naturalWidth: 1, naturalHeight: 1 });
    };
    img.src = base64;
  });
}

/** Contain-fit: image fills box preserving aspect ratio, centered */
export function fitImage(
  natW: number,
  natH: number,
  maxW: number,
  maxH: number,
): { w: number; h: number; offsetX: number; offsetY: number } {
  if (natW === 0 || natH === 0) return { w: maxW, h: maxH, offsetX: 0, offsetY: 0 };
  const ratio = natW / natH;
  const boxRatio = maxW / maxH;
  let w: number, h: number;
  if (ratio > boxRatio) {
    w = maxW;
    h = maxW / ratio;
  } else {
    h = maxH;
    w = maxH * ratio;
  }
  return { w, h, offsetX: (maxW - w) / 2, offsetY: (maxH - h) / 2 };
}

/** Add a product image to the doc, with contain-fit and fallback placeholder */
export function addProductImage(
  doc: jsPDF,
  base64: string | null,
  format: "JPEG" | "PNG",
  natW: number,
  natH: number,
  x: number, y: number,
  w: number, h: number,
  placeholderDrawer: (doc: jsPDF, x: number, y: number, w: number, h: number) => void,
): void {
  if (base64 && natW > 0) {
    const fitted = fitImage(natW, natH, w, h);
    try {
      doc.addImage(
        base64, format,
        x + fitted.offsetX, y + fitted.offsetY,
        fitted.w, fitted.h,
        undefined, "MEDIUM",
      );
      return;
    } catch { /* fallback to placeholder */ }
  }
  placeholderDrawer(doc, x, y, w, h);
}

// ── QR Code ─────────────────────────────────────────────────

export async function generateQRDataURL(url: string): Promise<string | null> {
  try {
    const QRCode = (await import("qrcode")).default;
    return await QRCode.toDataURL(url, {
      width: 150,
      margin: 2,
      color: { dark: "#1a1a1a", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });
  } catch {
    return null;
  }
}

// ── Logo ────────────────────────────────────────────────────

export async function loadLogoAsBase64(url: string): Promise<string | null> {
  if (!url) return null;
  return fetchAsBase64(url);
}
