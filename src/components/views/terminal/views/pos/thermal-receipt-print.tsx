"use client";

/**
 * MISIÓN IMPRESIÓN TÉRMICA (2026-10-20) — Flujo de impresión del comprobante POS.
 *
 * ARQUITECTURA ELEGIDA (fase 5 de la misión): impresión web estándar de Windows
 * a través del diálogo nativo del navegador (window.print) — la opción más
 * simple y robusta, SIN servicios/agentes locales. Requisitos en el equipo:
 * la miniimpresora del terminal AXISOFT debe estar instalada como impresora de
 * Windows y visible para el navegador (una sola vez: driver + papel correcto).
 *
 * El comprobante se monta en un contenedor FUERA del árbol de React (append a
 * document.body) con id #thermal-receipt-root; un <style> inyectado define
 * `@page { size: <ancho>mm auto }` y oculta toda la interfaz salvo el recibo.
 * Al cerrarse el diálogo (afterprint, con fallback de seguridad) se desmonta.
 *
 * HONESTIDAD DE ESTADOS (requisito de la misión): se distingue
 *  - 'no-print-api' → el navegador bloquea/no soporta imprimir;
 *  - 'dialog-opened' → el diálogo se abrió (NO implica impresión física
 *    completada; el navegador no informa el resultado físico);
 *  - nunca se marca la venta ni el comprobante como "impreso físicamente".
 * La venta y la impresión son estados INDEPENDIENTES: este módulo es 100%
 * lectura — no llama a ninguna API de mutación, no re-cobra, no genera otro
 * documento comercial; reutilizarlo N veces es gratis y sin efectos.
 */

import { createRoot, type Root } from "react-dom/client";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import { POSThermalReceipt } from "./POSThermalReceipt";
import {
  buildThermalPrintCss,
  getThermalWidthMm,
  type ThermalReceiptData,
} from "@/lib/pos/thermal-receipt";

export type ThermalPrintOutcome = "dialog-opened" | "no-print-api";

// ── Caché del nombre de la tienda (misma fuente que CashReportView) ─────────

let storeNameCache: { storeId: string; name: string | null } | null = null;

/**
 * Busca el nombre comercial de la tienda activa vía /api/stores (lectura).
 * Mismo patrón que CashReportView.tsx:189-191. Cachea por storeId para no
 * repetir la llamada en cada impresión/reimpresión. Ante error → null y el
 * comprobante se imprime sin encabezado comercial (degradación suave).
 */
export async function fetchActiveStoreName(activeStoreId?: string | null): Promise<string | null> {
  if (!activeStoreId) return null;
  if (storeNameCache && storeNameCache.storeId === activeStoreId) {
    return storeNameCache.name;
  }
  try {
    const data = await apiFetch(`/api/stores?status=all`);
    const stores = (data?.data || data || []) as Array<{ id: string; name?: string }>;
    const store = Array.isArray(stores)
      ? stores.find((s) => s.id === activeStoreId)
      : null;
    storeNameCache = { storeId: activeStoreId, name: store?.name ?? null };
    return store?.name ?? null;
  } catch {
    // Lectura fallida (offline, permiso): el recibo sale sin nombre de tienda.
    // No se bloquea la impresión del comprobante por un dato cosmético.
    return null;
  }
}

// ── Flujo de impresión ──────────────────────────────────────────────────────

const RECEIPT_CONTAINER_ATTR = "data-thermal-print-overlay";
const PRINT_STYLE_ID = "thermal-print-style";

/** Limpieza activa (module-level): si se dispara otra impresión, la anterior se recoge. */
let activeCleanup: (() => void) | null = null;

/**
 * Imprime el comprobante térmico con el ancho de rollo configurado.
 *
 * Pasos: monta el recibo fuera del árbol de React → inyecta el CSS @page →
 * espera 2 frames (render + layout) → window.print() → limpieza en afterprint
 * (fallback de tiempo por si el evento no dispara en el navegador).
 *
 * Los toasts informan con precisión: apertura del diálogo, NUNCA éxito físico.
 */
export async function printThermalReceipt(
  data: ThermalReceiptData,
  opts?: { sellerName?: string | null },
): Promise<ThermalPrintOutcome> {
  if (typeof window === "undefined") return "no-print-api";
  if (typeof window.print !== "function") {
    toast.error(
      "Este navegador no permite abrir el diálogo de impresión. Usa «Recibo PDF» como alternativa.",
      { duration: 6000 },
    );
    return "no-print-api";
  }

  // Recoger una impresión previa aún viva (dialogo olvidado abierto, etc.)
  activeCleanup?.();

  const widthMm = getThermalWidthMm();

  // 1. Contenedor fuera del árbol de React, fuera de pantalla en pantalla.
  const container = document.createElement("div");
  container.setAttribute(RECEIPT_CONTAINER_ATTR, "true");
  container.setAttribute("aria-hidden", "true");
  Object.assign(container.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${widthMm}mm`,
    background: "#ffffff",
    zIndex: "-1",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(container);

  // 2. CSS de impresión dedicado (@page al ancho del rollo + ocultar la app).
  const styleEl = document.createElement("style");
  styleEl.id = PRINT_STYLE_ID;
  styleEl.textContent = buildThermalPrintCss(widthMm);
  document.head.appendChild(styleEl);

  // 3. Montar el comprobante (React 19 createRoot).
  let root: Root | null = createRoot(container);
  root.render(<POSThermalReceipt data={data} widthMm={widthMm} />);

  // 4. Limpieza: afterprint + fallback (algunos navegadores no disparan el
  //    evento si el diálogo se cancela rápido; 120s cubre diálogos abiertos).
  let cleaned = false;
  const fallbackTimer = window.setTimeout(() => cleanup(), 120_000);
  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    window.clearTimeout(fallbackTimer);
    window.removeEventListener("afterprint", onAfterPrint);
    try {
      root?.unmount();
    } catch {
      // unmount tras remoción del DOM: ignorar
    }
    root = null;
    container.remove();
    styleEl.remove();
    if (activeCleanup === cleanup) activeCleanup = null;
  }
  function onAfterPrint() {
    cleanup();
  }
  window.addEventListener("afterprint", onAfterPrint, { once: true });
  activeCleanup = cleanup;

  // 5. Esperar render + layout (2 rAF) antes de abrir el diálogo.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  // 6. Abrir el diálogo nativo. En Chrome/Edge de Windows, window.print()
  //    BLOQUEA el JS hasta que el usuario imprime o cancela; al retornar solo
  //    sabemos que el diálogo se cerró — NO el resultado físico. El toast es
  //    deliberadamente honesto con ello (requisito de la misión).
  toast.info("Comprobante enviado al diálogo de impresión.", {
    description:
      "Confirma la impresión en el diálogo del navegador. La venta ya está registrada — imprimir no la altera.",
    duration: 7000,
  });

  try {
    window.print();
  } catch {
    // Algunos navegadores lanzan si el documento aún no está listo — una sola
    // reintentada síncrona tras otro frame, y si sigue fallando se reporta.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      window.print();
    } catch {
      cleanup();
      toast.error("El navegador bloqueó la impresión. Revisa permisos o usa «Recibo PDF».");
      return "no-print-api";
    }
  }

  // window.print() retornó = diálogo cerrado (impreso o cancelado — desconocido).
  // Limpiar de inmediato en navegadores no bloqueantes; afterprint cubre el resto.
  cleanup();
  return "dialog-opened";
}

/** Limpieza manual exportada (útil en tests y desmontaje de vistas). */
export function disposeThermalPrint(): void {
  activeCleanup?.();
}
