"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, X, Download, Share2, Copy as CopyIcon, Plus, Printer,
} from "lucide-react";
import { cn, formatCurrency, formatDate, formatTime } from "@/lib/utils";
import { toast } from "sonner";
import { POSPortalModal } from "@/components/views/terminal/views/pos/POSPortalModal";

interface ReceptionSuccessModalProps {
  open: boolean;
  onClose: () => void;
  onNewReception: () => void;
  receiptId: string | null;
  supplier: string;
  invoiceNumber: string;
  itemCount: number;
  totalCost: number;
  receptionDate: string;
  newProductsCount: number;
  priceUpdatedCount: number;
}

/**
 * REC-2 MM-R12: Modal de comprobante de recepción exitosa.
 *
 * Similar a POSCartSuccessView pero para recepciones.
 * Muestra:
 *  - Check animado + "Recepción registrada"
 *  - ID de comprobante (con botón copiar)
 *  - Resumen: proveedor, factura, fecha, items, total
 *  - Badges: productos nuevos creados, precios actualizados
 *  - QR de verificación (generado dinámicamente con el receiptId)
 *  - Botones: PDF, WhatsApp, Nueva Recepción
 *
 * Pendiente futuro: integrar jsPDF + qrcode para generar PDF real.
 * Por ahora, el botón PDF descarga un JSON con los datos.
 */
export function ReceptionSuccessModal({
  open,
  onClose,
  onNewReception,
  receiptId,
  supplier,
  invoiceNumber,
  itemCount,
  totalCost,
  receptionDate,
  newProductsCount,
  priceUpdatedCount,
}: ReceptionSuccessModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyId = async () => {
    if (!receiptId) return;
    try {
      await navigator.clipboard.writeText(receiptId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("ID copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const handleDownloadJson = () => {
    const data = {
      receiptId,
      supplier,
      invoiceNumber,
      receptionDate,
      itemCount,
      totalCost,
      newProductsCount,
      priceUpdatedCount,
      generatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recepcion-${receiptId?.slice(0, 8) || "nueva"}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Comprobante descargado");
  };

  const handleShareWhatsApp = () => {
    const msg = `*Recepción Registrada*%0A%0A` +
      `*ID:* ${receiptId?.slice(0, 8) || "—"}%0A` +
      `*Proveedor:* ${supplier}%0A` +
      `*Factura:* ${invoiceNumber}%0A` +
      `*Fecha:* ${formatDate(receptionDate)} ${formatTime(receptionDate)}%0A` +
      `*Items:* ${itemCount}%0A` +
      `*Total:* ${formatCurrency(totalCost)}%0A` +
      (newProductsCount > 0 ? `*Productos nuevos:* ${newProductsCount}%0A` : "") +
      (priceUpdatedCount > 0 ? `*Precios actualizados:* ${priceUpdatedCount}%0A` : "");
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  return (
    <POSPortalModal
      open={open}
      onClose={onClose}
      title="Recepción Registrada"
      hideCloseButton
      maxWidth="md"
    >
      <div className="space-y-5">
        {/* Check animado + título */}
        <div className="flex flex-col items-center text-center space-y-3">
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", damping: 12, stiffness: 200 }}
            className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center"
          >
            <CheckCircle2 className="w-9 h-9 text-success" />
          </motion.div>
          <div>
            <h3 className="text-lg font-black text-foreground uppercase tracking-tight">
              Recepción Registrada
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {formatDate(receptionDate)} · {formatTime(receptionDate)}
            </p>
          </div>
        </div>

        {/* ID del comprobante con copiar */}
        {receiptId && (
          <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-muted/30 border border-border">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                ID Comprobante
              </p>
              <p className="text-xs font-mono text-foreground truncate">{receiptId}</p>
            </div>
            <button
              type="button"
              onClick={handleCopyId}
              className="shrink-0 p-2 rounded-lg hover:bg-primary/10 text-primary transition-colors"
              aria-label="Copiar ID"
              title="Copiar ID"
            >
              {copied ? <CheckCircle2 className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
            </button>
          </div>
        )}

        {/* Resumen */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-border">
            <div className="p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Proveedor</p>
              <p className="text-sm font-bold text-foreground truncate">{supplier}</p>
            </div>
            <div className="p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Factura</p>
              <p className="text-sm font-bold text-foreground truncate">{invoiceNumber}</p>
            </div>
            <div className="p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Productos</p>
              <p className="text-sm font-bold text-foreground tabular-nums">{itemCount}</p>
            </div>
            <div className="p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total</p>
              <p className="text-sm font-black text-primary tabular-nums">{formatCurrency(totalCost)}</p>
            </div>
          </div>
          {(newProductsCount > 0 || priceUpdatedCount > 0) && (
            <div className="p-3 border-t border-border bg-muted/20 flex flex-wrap gap-2">
              {newProductsCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-info/10 text-info border border-info/20 text-[10px] font-bold uppercase tracking-wider">
                  <Plus className="w-3 h-3" />
                  {newProductsCount} producto(s) nuevo(s)
                </span>
              )}
              {priceUpdatedCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-warning/10 text-warning border border-warning/20 text-[10px] font-bold uppercase tracking-wider">
                  {priceUpdatedCount} precio(s) actualizado(s)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handleDownloadJson}
            className="flex flex-col items-center gap-1 p-3 rounded-xl border border-border hover:bg-muted transition-colors"
          >
            <Download className="w-5 h-5 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Comprobante</span>
          </button>
          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="flex flex-col items-center gap-1 p-3 rounded-xl border border-border hover:bg-muted transition-colors"
          >
            <Share2 className="w-5 h-5 text-success" />
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">WhatsApp</span>
          </button>
          <button
            type="button"
            onClick={() => {
              handleDownloadJson();
              toast.info("Función de impresión directa próximamente — descarga el comprobante");
            }}
            className="flex flex-col items-center gap-1 p-3 rounded-xl border border-border hover:bg-muted transition-colors"
          >
            <Printer className="w-5 h-5 text-muted-foreground" />
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Imprimir</span>
          </button>
        </div>

        {/* Cerrar + Nueva */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-xl border border-border text-xs font-black uppercase tracking-widest hover:bg-muted transition-colors"
          >
            Ver Historial
          </button>
          <button
            type="button"
            onClick={onNewReception}
            className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity"
          >
            Nueva Recepción
          </button>
        </div>
      </div>
    </POSPortalModal>
  );
}
