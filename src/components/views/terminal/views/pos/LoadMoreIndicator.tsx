"use client";

import React from "react";
import { Loader2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadMoreIndicatorProps {
  remainingCount: number;
  onLoadMore: () => void;
  isLoading?: boolean;
  className?: string;
}

/**
 * POS-3b EM-2: Indicador "Cargar más" para el grid paginado.
 *
 * Aparece al final del grid virtualizado cuando hay más resultados
 * que no se están mostrando. Click o auto-load al hacer scroll.
 */
export function LoadMoreIndicator({
  remainingCount,
  onLoadMore,
  isLoading = false,
  className,
}: LoadMoreIndicatorProps) {
  if (remainingCount <= 0) return null;

  return (
    <div className={cn("flex flex-col items-center justify-center py-6 gap-3", className)}>
      <button
        type="button"
        onClick={onLoadMore}
        disabled={isLoading}
        className={cn(
          "inline-flex items-center gap-2 px-5 py-3 rounded-xl border-2 border-primary/30 bg-primary/5 text-primary",
          "font-black text-xs uppercase tracking-widest hover:bg-primary/10 hover:border-primary/50 transition-all",
          "active:scale-95 disabled:opacity-50",
        )}
        aria-label={`Cargar ${remainingCount} productos más`}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Cargando...
          </>
        ) : (
          <>
            <ChevronDown className="w-4 h-4" />
            Cargar {remainingCount} más
          </>
        )}
      </button>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
        Mostrando resultados parciales · {remainingCount} ocultos por paginación
      </p>
    </div>
  );
}
