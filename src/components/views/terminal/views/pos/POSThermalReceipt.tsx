"use client";

/**
 * MISIÓN IMPRESIÓN TÉRMICA (2026-10-20) — Renderizador del comprobante POS.
 *
 * Componente PURAMENTE presentacional: recibe ThermalReceiptData ya calculado
 * (venta confirmada o registro del historial) y lo pinta al ancho del rollo
 * configurado (55 mm por defecto — rollo de la misión 2026-10-23 —, configurable).
 *
 * Decisiones de diseño para papel térmico monocromático (requisitos de la misión):
 *  - Estilos INLINE (no Tailwind): determinismo total en @media print — el
 *    comprobante no hereda dark mode, temas ni reglas globales de la app.
 *  - Blanco/negro puro, sin fondos, degradados, sombras ni bordes decorativos.
 *  - Separadores = líneas punteadas de 1px (económicas en tinta térmica).
 *  - Cantidades/precios/importes alineados a la derecha con números tabulares;
 *    descripciones largas con ajuste de línea (word-break suave).
 *  - Tipografía legible (10–13px): se prioriza leer bien en 48–72 mm imprimibles
 *    por encima de compactar; NUNCA se reduce la fuente para que quepan columnas.
 *  - Tildes/caracteres españoles y símbolos monetarios vía las utilidades
 *    existentes de la app (formatLabeledCurrency, es-CU) — UTF-8 nativo.
 *  - El comprobante NO confirma impresión física: es solo la vista imprimible.
 */

import React from "react";
import { formatLabeledCurrency } from "@/lib/utils";
import {
  formatReceiptDateTime,
  paymentMethodLabel,
  type ThermalReceiptData,
} from "@/lib/pos/thermal-receipt";

// ── Tipografía y métricas base (px CSS ≈ 96dpi; 58mm ≈ 219px, 80mm ≈ 302px) ──
const FONT_STACK =
  '"Segoe UI", "Noto Sans", Arial, "Helvetica Neue", sans-serif';

export interface POSThermalReceiptProps {
  data: ThermalReceiptData;
  /** Ancho nominal del rollo en mm (default 55 — ver thermal-receipt.ts). */
  widthMm?: number;
}

/** Espacio final anti-guillotina: la última línea del comprobante nunca queda
 *  pegada al borde de corte del rollo (misión 2026-10-23 §4: «espacio final
 *  suficiente para que el contenido no quede cortado»). 30px ≈ 7,9 mm. */
const RECEIPT_TRAILING_PADDING_PX = 30;

/** Línea separadora punteada (económica en tinta térmica). */
const Separator: React.FC<{ mt?: number; mb?: number }> = ({ mt = 4, mb = 4 }) => (
  <div
    style={{
      marginTop: mt,
      marginBottom: mb,
      borderTop: "1px dashed #000000",
      width: "100%",
    }}
  />
);

/** Fila etiqueta/valor alineada (tabular-nums para columnas derechas). */
const Row: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  bold?: boolean;
  fontSize?: number;
  strong?: boolean;
}> = ({ label, value, bold, fontSize = 10, strong }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      gap: 6,
      fontSize,
      fontWeight: bold || strong ? 700 : 400,
      lineHeight: 1.35,
      color: "#000000",
    }}
  >
    <span style={{ flexShrink: 1, textAlign: "left" }}>{label}</span>
    <span
      style={{
        textAlign: "right",
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        fontWeight: strong ? 700 : undefined,
      }}
    >
      {value}
    </span>
  </div>
);

export const POSThermalReceipt: React.FC<POSThermalReceiptProps> = ({
  data,
  widthMm = 55,
}) => {
  const items = data.items;
  const hasDiscount = data.discountAmount > 0.005;
  const hasTax = data.taxAmount > 0.005;
  const hasChange = typeof data.change === "number" && data.change > 0.005;
  const hasCashReceived = typeof data.cashReceived === "number" && data.cashReceived > 0;
  const isVoided = data.status === "voided";

  return (
    <div
      id="thermal-receipt-root"
      data-testid="thermal-receipt"
      style={{
        width: "100%",
        maxWidth: `${widthMm}mm`,
        margin: "0 auto",
        background: "#ffffff",
        color: "#000000",
        fontFamily: FONT_STACK,
        fontSize: 10,
        lineHeight: 1.35,
        padding: `0 0 ${RECEIPT_TRAILING_PADDING_PX}px 0`,
        boxSizing: "border-box",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      {/* ── Encabezado comercial ── */}
      {data.storeName ? (
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            textAlign: "center",
            lineHeight: 1.2,
            overflowWrap: "break-word",
          }}
        >
          {data.storeName}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 2,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.4,
          textAlign: "center",
          textTransform: "uppercase",
        }}
      >
        Comprobante de venta
      </div>

      {data.isReprint ? (
        <div
          data-testid="thermal-reprint-mark"
          style={{
            marginTop: 2,
            fontSize: 9,
            fontWeight: 700,
            textAlign: "center",
            letterSpacing: 0.4,
          }}
        >
          *** REIMPRESIÓN ***
        </div>
      ) : null}

      {isVoided ? (
        <div
          data-testid="thermal-voided-mark"
          style={{
            marginTop: 2,
            fontSize: 9,
            fontWeight: 700,
            textAlign: "center",
            letterSpacing: 0.4,
          }}
        >
          *** VENTA ANULADA ***
        </div>
      ) : null}

      <Separator />

      {/* ── Identificación del documento ── */}
      <Row label="No." value={data.invoiceNumber || data.saleId.split("-")[0]} bold />
      <Row label="Fecha" value={formatReceiptDateTime(data.dateIso)} />
      {data.sellerName ? <Row label="Vendedor" value={data.sellerName} /> : null}
      {data.customerName ? <Row label="Cliente" value={data.customerName} /> : null}

      <Separator />

      {/* ── Artículos ── */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 700 }}>
        <span>ARTÍCULO</span>
        <span>IMPORTE</span>
      </div>
      <div style={{ marginTop: 2 }}>
        {items.length === 0 ? (
          <div style={{ fontSize: 10, textAlign: "center", padding: "6px 0" }}>
            (Sin artículos)
          </div>
        ) : (
          items.map((item, idx) => (
            <div
              key={`${item.code ?? "sin-codigo"}-${idx}`}
              data-testid="thermal-receipt-item"
              style={{ marginBottom: 4 }}
            >
              {/* Descripción (con código si existe) — ajuste de línea garantizado */}
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: 1.25,
                  overflowWrap: "break-word",
                  wordBreak: "break-word",
                }}
              >
                {item.code ? <span style={{ fontWeight: 400 }}>#{item.code} · </span> : null}
                {item.name}
              </div>
              {/* Cantidad × precio unitario (izquierda) / importe de línea (derecha) */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 6,
                  fontSize: 10,
                  lineHeight: 1.3,
                }}
              >
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {item.quantity} × {formatLabeledCurrency(item.unitPrice, item.currency)}
                </span>
                <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                  {formatLabeledCurrency(item.lineTotal, item.currency)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <Separator mt={2} />

      {/* ── Totales (CUP canónico — misma fuente que la app) ── */}
      <Row label="Subtotal (CUP)" value={formatLabeledCurrency(data.subtotal, "CUP")} />
      {hasDiscount ? (
        <Row
          label={data.discountLabel ? `Descuento (${data.discountLabel})` : "Descuento"}
          value={`-${formatLabeledCurrency(data.discountAmount, "CUP")}`}
        />
      ) : null}
      {hasTax ? (
        <Row label="Impuesto" value={`+${formatLabeledCurrency(data.taxAmount, "CUP")}`} />
      ) : null}

      <div style={{ margin: "4px 0" }}>
        <div
          data-testid="thermal-receipt-total"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 6,
            padding: "3px 2px",
            border: "1.5px solid #000000",
            fontSize: 12.5,
            fontWeight: 700,
          }}
        >
          <span style={{ textTransform: "uppercase", letterSpacing: 0.3 }}>Total</span>
          <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            {formatLabeledCurrency(data.total, "CUP")}
          </span>
        </div>
      </div>

      {/* ── Medios de pago (importes reales por moneda) ── */}
      {data.payments.length > 0 ? (
        <>
          <Separator mt={2} />
          {data.payments.map((p) => (
            <Row
              key={`${p.method}-${p.currency}`}
              label={
                p.method === 'zelle' && p.currency !== 'USD'
                  ? 'ZELLE (equiv. CUP)'
                  : paymentMethodLabel(p.method)
              }
              value={formatLabeledCurrency(p.amount, p.currency)}
            />
          ))}
          {hasCashReceived ? (
            <Row
              label="Efectivo recibido"
              value={formatLabeledCurrency(data.cashReceived as number, "CUP")}
            />
          ) : null}
          {hasChange ? (
            <Row
              label="Cambio"
              value={formatLabeledCurrency(data.change as number, "CUP")}
              bold
            />
          ) : null}
        </>
      ) : null}

      {/* ── Método declarado (cuando no hay desglose por filas) ── */}
      {data.payments.length === 0 && data.paymentMethod ? (
        <Row label="Método de pago" value={paymentMethodLabel(data.paymentMethod)} />
      ) : null}

      <Separator mt={5} />

      {/* ── Pie: mensaje + verificación + trazabilidad ── */}
      <div style={{ textAlign: "center", fontSize: 10, fontWeight: 700 }}>
        ¡Gracias por su preferencia!
      </div>
      <div style={{ textAlign: "center", fontSize: 8.5, marginTop: 2 }}>
        Comprobante electrónico generado por CostPro
      </div>
      <div style={{ textAlign: "center", fontSize: 8.5, marginTop: 3 }}>
        Verifica esta venta:
        <br />
        {typeof window !== "undefined"
          ? `${window.location.origin}/verify-sale/${data.saleId}`
          : `/verify-sale/${data.saleId}`}
      </div>
      {/* ID completo en cuerpo pequeño: trazabilidad sin ocupar el rollo */}
      <div
        data-testid="thermal-receipt-sale-id"
        style={{
          textAlign: "center",
          fontSize: 7.5,
          marginTop: 3,
          overflowWrap: "break-word",
          wordBreak: "break-all",
          lineHeight: 1.25,
        }}
      >
        ID: {data.saleId}
      </div>
    </div>
  );
};

export default POSThermalReceipt;
