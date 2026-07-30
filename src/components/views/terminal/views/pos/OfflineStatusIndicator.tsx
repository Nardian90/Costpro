"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSyncContext } from "@/components/providers/SyncProvider";

/**
 * POS-3b EM-5: Indicador visual de estado offline + cola de sync.
 *
 * Muestra al cajero:
 * - Si está online u offline (icon + texto)
 * - Cuántas ventas tiene en cola esperando sync
 * - Botón para forzar el procesamiento de la cola
 *
 * La infraestructura ya existe: useCreateSale encola ventas vía SyncProvider
 * cuando navigator.onLine === false, y syncEngine las procesa cada 30s.
 *
 * Este componente solo hace VISIBLE ese estado al cajero, para que sepa
 * que su venta se registró aunque esté sin conexión.
 */
export function OfflineStatusIndicator({ className }: { className?: string }) {
  const { status, queueSize, lastSync, processQueue } = useSyncContext();

  const isOnline = status === "online";
  const isSyncing = status === "syncing";
  const hasPending = queueSize > 0;
  const hasError = status === "error";

  // Si está online sin cola pendiente, no mostrar nada (estado normal = invisible)
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
            ? `Error de sincronización. ${queueSize} ventas pendientes.`
            : !isOnline
              ? `Sin conexión. ${queueSize} ventas en cola esperando sync.`
              : hasPending
                ? `${queueSize} ventas pendientes de sincronizar.`
                : `Todas las ventas sincronizadas.`
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
            className="ml-1 px-2 py-0.5 rounded-md bg-primary/20 hover:bg-primary/30 transition-colors text-[10px] disabled:opacity-50"
            aria-label="Forzar sincronización ahora"
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

/**
 * Hook que devuelve true si el navegador está offline.
 * Reactive a los eventos online/offline del navegador.
 */
export function useIsOnline() {
  const [isOnline, setIsOnline] = React.useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
