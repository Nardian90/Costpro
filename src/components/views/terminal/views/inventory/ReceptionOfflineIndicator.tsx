"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSyncContext } from "@/components/providers/SyncProvider";

/**
 * EM-R7: Indicador de estado offline/sync para recepción.
 *
 * Igual patrón que POS OfflineStatusIndicator pero para el módulo de recepción.
 * Muestra:
 * - Online/Offline
 * - Cola de recepciones pendientes de sync
 * - Botón forzar sync
 *
 * La infraestructura ya existe: useRegisterReception encola vía addToQueue
 * cuando !navigator.onLine, syncEngine procesa cada 30s contra /api/inventory/receptions.
 */
export function ReceptionOfflineIndicator({ className }: { className?: string }) {
  const { status, queueSize, lastSync, processQueue } = useSyncContext();

  const isOnline = status === "online";
  const isSyncing = status === "syncing";
  const hasPending = queueSize > 0;
  const hasError = status === "error";

  if (isOnline && !hasPending && !hasError) return null;

  const variant = hasError
    ? "destructive"
    : !isOnline
      ? "warning"
      : hasPending
        ? "info"
        : "success";

  const variantClasses = {
    destructive: "border-destructive/40 bg-destructive/10 text-destructive",
    warning: "border-warning/40 bg-warning/10 text-warning",
    info: "border-primary/40 bg-primary/10 text-primary",
    success: "border-success/40 bg-success/10 text-success",
  };

  const Icon = hasError
    ? AlertCircle
    : !isOnline
      ? WifiOff
      : hasPending
        ? RefreshCw
        : CheckCircle2;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className={cn(
          "inline-flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-xs font-black uppercase tracking-widest shadow-sm",
          variantClasses[variant as keyof typeof variantClasses],
          className,
        )}
        role="status"
        aria-live="polite"
        aria-label={
          hasError
            ? `Error de sincronización. ${queueSize} recepciones pendientes.`
            : !isOnline
              ? `Sin conexión. ${queueSize} recepciones en cola.`
              : hasPending
                ? `${queueSize} recepciones pendientes de sync.`
                : `Sincronizado.`
        }
      >
        <Icon
          className={cn(
            "w-4 h-4",
            (isSyncing || (hasPending && isOnline)) && "animate-spin",
          )}
          aria-hidden="true"
        />
        <span>
          {hasError
            ? "Error sync"
            : !isOnline
              ? `Offline · ${queueSize} en cola`
              : hasPending
                ? `${queueSize} por sync`
                : "Sincronizado"}
        </span>
        {hasPending && isOnline && (
          <button
            type="button"
            onClick={() => processQueue()}
            disabled={isSyncing}
            className="ml-1 px-2 py-0.5 rounded-md bg-primary/20 hover:bg-primary/30 transition-colors text-[10px] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="Forzar sincronización"
            title="Forzar sync ahora"
          >
            Sync
          </button>
        )}
        {lastSync && !hasPending && (
          <span className="text-[9px] opacity-70 ml-1">
            {formatTimeAgo(lastSync)}
          </span>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `hace ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `hace ${hours}h`;
}
