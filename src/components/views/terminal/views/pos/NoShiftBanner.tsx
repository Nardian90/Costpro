"use client";

import React, { useState } from "react";
import { AlertCircle, ArrowRight, X, Bell, BellOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useActiveShift } from "@/hooks/api/useActiveShift";
import { useAuthStore } from "@/store";
import { useUIStore } from "@/store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/**
 * POS-3a-5: Banner CTA para abrir turno.
 *
 * Cuando no hay `cash_closure` con status='pendiente', muestra un banner
 * visualmente prominent sobre el contenido del POS invitando al cajero
 * a abrir el turno antes de vender. El botón navega a la vista `cash`.
 *
 * NO bloquea la venta (un admin podría querer vender sin turno en
 * emergencias), pero hace muy claro que falta el turno.
 *
 * Mejora UX: el usuario puede cerrar el banner (X) y elegir silenciarlo
 * por 1h, 4h, 24h o indefinidamente. El dismiss se persiste en
 * useUIStore.noShiftBannerDismissUntil.
 */
export function NoShiftBanner() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const { data: activeShift, isLoading } = useActiveShift(storeId);
  const { setCurrentView, noShiftBannerDismissUntil, dismissNoShiftBanner } = useUIStore();
  const [locallyHidden, setLocallyHidden] = useState(false);

  // Mientras carga, no mostramos nada (evita parpadeo)
  if (isLoading) return null;
  // Si ya hay turno, no mostramos nada
  if (activeShift) return null;

  // Verificar si el banner está silenciado
  const isDismissed =
    !!noShiftBannerDismissUntil &&
    new Date(noShiftBannerDismissUntil).getTime() > Date.now();

  // Si el usuario cerró localmente en esta sesión, tampoco mostrar
  if (locallyHidden || isDismissed) return null;

  const handleDismiss = (hours: number | null) => {
    dismissNoShiftBanner(hours);
    setLocallyHidden(true);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="relative rounded-2xl border-2 border-destructive/30 bg-destructive/5 p-4 sm:p-5 shadow-md pr-12"
        role="alert"
        aria-live="assertive"
      >
        {/* Botón X para cerrar con menú de opciones de silencio */}
        <div className="absolute top-3 right-3 z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                aria-label="Cerrar notificación"
                title="Cerrar o silenciar"
              >
                <X className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl p-1">
              <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2 py-1.5 flex items-center gap-1.5">
                <BellOff className="w-3 h-3" />
                Silenciar aviso
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => handleDismiss(1)}
                className="cursor-pointer rounded-lg"
              >
                <span className="font-medium">Por 1 hora</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDismiss(4)}
                className="cursor-pointer rounded-lg"
              >
                <span className="font-medium">Por 4 horas</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDismiss(24)}
                className="cursor-pointer rounded-lg"
              >
                <span className="font-medium">Por 24 horas</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuItem
                onClick={() => handleDismiss(null)}
                className="cursor-pointer rounded-lg text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <span className="font-medium">No mostrar más</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

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
    </AnimatePresence>
  );
}
