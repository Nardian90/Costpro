"use client";

import React from "react";
import { Wallet, AlertCircle, RefreshCw, ArrowRight } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useActiveShift } from "@/hooks/api/useActiveShift";
import { useSalesSinceLastClosure } from "@/hooks/api/useCashClosures";
import { useAuthStore } from "@/store";
import { useUIStore } from "@/store";
import { useQueryClient } from "@tanstack/react-query";

interface CashStatusWidgetProps {
  /** Compact mode for tight layouts */
  compact?: boolean;
  className?: string;
}

/**
 * POS-2 MM-6 + POS-3a-1: Widget de estado de caja.
 *
 * Mostrar al cajero, en todo momento mientras está en el POS:
 *  - Si tiene un turno activo (verde) o no (rojo/amber).
 *  - El total de ventas del turno actual.
 *  - Botón de refresh manual.
 *
 * POS-3a-1: Si NO hay turno, el widget es un CTA: el clic navega a la vista
 * `cash` (CashClosureView) donde el usuario puede abrir el turno.
 * Antes era solo informativo y dejaba al cajero sin saber qué hacer.
 */
export function CashStatusWidget({ compact = false, className }: CashStatusWidgetProps) {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const queryClient = useQueryClient();
  const { setCurrentView } = useUIStore();

  const { data: activeShift, isLoading: shiftLoading } = useActiveShift(storeId);
  const { data: shiftTotals, isFetching: totalsFetching } = useSalesSinceLastClosure(storeId);

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    queryClient.invalidateQueries({ queryKey: ["active-shift", storeId] });
    queryClient.invalidateQueries({ queryKey: ["sales-since-last-closure", storeId] });
  };

  const handleNavigateToCash = () => {
    setCurrentView("cash");
  };

  const hasShift = !!activeShift;
  const totalSales = shiftTotals?.total_sales ?? 0;
  const totalCash = shiftTotals?.total_cash ?? 0;
  const totalTransfer = shiftTotals?.total_transfer ?? 0;

  if (compact) {
    return (
      <button
        type="button"
        onClick={hasShift ? handleNavigateToCash : handleNavigateToCash}
        title={hasShift ? "Turno activo — clic para ir a Caja" : "Sin turno abierto — clic para abrir turno en Caja"}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest border-2 transition-all active:scale-95",
          hasShift
            ? "bg-primary/5 text-primary border-primary/30 hover:bg-primary/10 hover:border-primary/50"
            : "bg-destructive/10 text-destructive border-destructive/40 hover:bg-destructive/20 hover:border-destructive/60 animate-pulse",
          className,
        )}
        aria-label={hasShift ? `Turno activo. Ventas: ${formatCurrency(totalSales)}. Clic para ir a Caja.` : "Sin turno abierto. Clic para abrir turno."}
      >
        <span
          className={cn(
            "w-2 h-2 rounded-full",
            hasShift ? "bg-primary" : "bg-destructive",
          )}
          aria-hidden="true"
        />
        {hasShift ? formatCurrency(totalSales) : "Abrir turno"}
        <ArrowRight className="w-3 h-3 opacity-70" aria-hidden="true" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleNavigateToCash}
      className={cn(
        "block w-full text-left rounded-2xl border-2 p-3 sm:p-4 shadow-md bg-card transition-all hover:shadow-lg active:scale-[0.99]",
        hasShift
          ? "border-primary/20 bg-primary/5 hover:border-primary/40"
          : "border-destructive/30 bg-destructive/5 hover:border-destructive/50 animate-pulse",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={`Estado de caja: ${hasShift ? "turno activo" : "sin turno abierto"}. Clic para ir a la vista de Caja.`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "p-1.5 rounded-lg",
              hasShift ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
            )}
          >
            {hasShift ? <Wallet className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Caja
            </p>
            <p
              className={cn(
                "text-xs font-black uppercase tracking-wider",
                hasShift ? "text-primary" : "text-destructive",
              )}
            >
              {shiftLoading
                ? "Cargando..."
                : hasShift
                  ? "Turno activo"
                  : "Sin turno abierto"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span
            role="button"
            tabIndex={0}
            onClick={handleRefresh}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                handleRefresh(e as unknown as React.MouseEvent);
              }
            }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Refrescar estado de caja"
            title="Refrescar"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", totalsFetching && "animate-spin")} />
          </span>
          <ArrowRight className={cn("w-4 h-4", hasShift ? "text-primary/70" : "text-destructive/70")} aria-hidden="true" />
        </div>
      </div>

      {hasShift ? (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Ventas</p>
            <p className="text-sm font-black tabular-nums text-foreground">
              {formatCurrency(totalSales)}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Efectivo</p>
            <p className="text-sm font-black tabular-nums text-foreground">
              {formatCurrency(totalCash)}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Transf.</p>
            <p className="text-sm font-black tabular-nums text-foreground">
              {formatCurrency(totalTransfer)}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-foreground font-bold">
          Clic para <span className="text-destructive underline">abrir tu turno</span> y empezar a vender.
        </p>
      )}
    </button>
  );
}
