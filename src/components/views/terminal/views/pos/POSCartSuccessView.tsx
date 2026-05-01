"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Check,
  FileText,
  Send,
  RefreshCw,
  QrCode,
  Image as ImageIcon,
} from "lucide-react";
import { PrimaryButton } from "@/components/ui/atomic";
import type { SuccessViewProps } from "./POSCart.types";

export const SuccessView = ({
  onGeneratePDF,
  onShareWhatsApp,
  onExportAsImage,
  onClearLastSale,
}: SuccessViewProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex-1 flex flex-col items-center justify-start pt-12 sm:pt-20 p-6 text-center space-y-8 max-w-2xl mx-auto w-full overflow-y-auto no-scrollbar"
    id="sale-success-content"
  >
    <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center shadow-xl shadow-green-500/20 relative">
      <Check className="w-12 h-12 text-primary-foreground" strokeWidth={3} />
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1.5, opacity: 0 }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="absolute inset-0 bg-green-500 rounded-full"
      />
    </div>

    <div className="space-y-2">
      <h2 className="text-[clamp(2rem,8vw,2.5rem)] font-black text-foreground tracking-tighter uppercase">
        ¡Venta Completada!
      </h2>
      <p className="text-muted-foreground font-medium uppercase tracking-widest text-xs">
        La transacción ha sido registrada exitosamente
      </p>
    </div>

    <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
      <button
        onClick={onGeneratePDF}
        className="flex items-center justify-between p-6 rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-primary/20 hover:scale-[1.02] transition-transform group"
      >
        <div className="text-left">
          <div className="font-black uppercase tracking-widest text-xs opacity-70 mb-1">
            Exportar
          </div>
          <div className="text-xl font-black">Recibo PDF</div>
        </div>
        <FileText className="w-8 h-8 group-hover:rotate-12 transition-transform" />
      </button>

      <button
        onClick={onShareWhatsApp}
        className="flex items-center justify-between p-6 rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-primary/20 hover:scale-[1.02] transition-transform group"
      >
        <div className="text-left">
          <div className="font-black uppercase tracking-widest text-xs opacity-70 mb-1">
            Compartir
          </div>
          <div className="text-xl font-black">WhatsApp</div>
        </div>
        <Send className="w-8 h-8 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
      </button>

      <button
        onClick={onExportAsImage}
        className="flex items-center justify-between p-6 rounded-2xl bg-card text-primary-foreground shadow-xl shadow-border/20 hover:scale-[1.02] transition-transform group sm:col-span-2"
      >
        <div className="text-left flex items-center gap-4">
          <ImageIcon className="w-8 h-8 text-muted-foreground" />
          <div>
            <div className="font-black uppercase tracking-widest text-xs opacity-70 mb-1">
              Guardar como
            </div>
            <div className="text-xl font-black">Imagen JPG</div>
          </div>
        </div>
        <div className="px-3 py-1 bg-primary-foreground/10 rounded-full text-xs font-black uppercase">
          Alta Calidad
        </div>
      </button>
    </div>

    <div className="w-full p-6 rounded-3xl border-2 border-dashed border-border bg-muted/30 flex flex-col items-center gap-4">
      <QrCode className="w-16 h-16 opacity-20" />
      <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
        Código de seguimiento disponible
      </p>
    </div>

    <PrimaryButton
      label="Nueva Venta"
      icon={RefreshCw}
      onClick={onClearLastSale || (() => {})}
      className="w-full max-w-sm h-16 text-xl rounded-2xl shadow-2xl"
    />
  </motion.div>
);
