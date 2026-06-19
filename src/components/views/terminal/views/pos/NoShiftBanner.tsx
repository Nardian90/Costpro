"use client";

import React from "react";
import { AlertCircle, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useActiveShift } from "@/hooks/api/useActiveShift";
import { useAuthStore } from "@/store";
import { useUIStore } from "@/store";

/**
 * POS-3a-5: Banner CTA para abrir turno.
 *
 * Cuando no hay `cash_closure` con status='pendiente', muestra un banner
 * visualmente prominent sobre el contenido del POS invitando al cajero
 * a abrir el turno antes de vender. El botón navega a la vista `cash`.
 *
 * NO bloquea la venta (un admin podría querer vender sin turno en
 * emergencias), pero hace muy claro que falta el turno.
 */
export function NoShiftBanner() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const { data: activeShift, isLoading } = useActiveShift(storeId);
  const { setCurrentView } = useUIStore();

  // Mientras carga, no mostramos nada (evita parpadeo)
  if (isLoading) return null;
  // Si ya hay turno, no mostramos nada
  if (activeShift) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border-2 border-destructive/30 bg-destructive/5 p-4 sm:p-5 shadow-md"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="p-2.5 rounded-xl bg-destructive/10 text-destructive shrink-0">
          <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base sm:text-lg font-black text-foreground uppercase tracking-tight">
            No tienes turno abierto
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Abre tu turno de caja para registrar ventas, controlar efectivo
            y reconciliar al final del día.
          </p>
          <button
            type="button"
            onClick={() => setCurrentView("cash")}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-black text-xs sm:text-sm uppercase tracking-widest shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all"
            aria-label="Ir a la vista de Caja para abrir turno"
          >
            Abrir turno
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
