"use client";

/**
 * MISIÓN-TASAS (2026-10-17) — RatesConfirmationModal
 *
 * Diálogo de confirmación diaria de tasas de cambio al abrir el carrito POS:
 *   "¿Confirma que las tasas de cambio siguen vigentes?"
 *
 * Muestra los valores REALES configurados (store_exchange_rates hidratados
 * en el carrito) con la fecha de última actualización, y dos acciones
 * claramente diferenciadas:
 *   A. "Confirmar tasas vigentes" — persiste la confirmación (servidor,
 *      auditable) y permite continuar.
 *   B. "Revisar o actualizar tasas" — abre el modal real de tasas
 *      (StoreRatesModal) si el usuario tiene permisos (canManageStore);
 *      al regresar, el hook re-evalúa y vuelve a pedir confirmación
 *      explícita con los valores frescos.
 *
 * Sin tasas configuradas NO se ofrece una confirmación falsa: se informa el
 * problema y se permite continuar (venta CUP) o revisar. Nunca atrapa al
 * usuario: "Continuar sin confirmar" cierra por la sesión (la confirmación
 * no se registra y reaparece al reabrir el carrito).
 */

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { useAuthStore } from "@/store";
import StoreRatesModal from "./StoreRatesModal";

interface RatesConfirmationModalProps {
  open: boolean;
  /** Motivo del recordatorio: primera vez del día o tasas cambiadas. */
  reason: "not_confirmed" | "rates_changed" | null;
  businessDay: string;
  /** Valores reales vigentes (globalRates hidratado de store_exchange_rates). */
  rates: Record<string, number>;
  confirming: boolean;
  onConfirm: () => Promise<boolean>;
  /** Cerrar sin confirmar (solo sesión; no persiste confirmación). */
  onContinueWithoutConfirm: () => void;
  canManageRates: boolean;
}

const RATE_LABELS: Record<string, string> = {
  USD: "Dólar (USD)",
  EUR: "Euro (EUR)",
  MLC: "MLC",
};

export default function RatesConfirmationModal({
  open,
  reason,
  businessDay,
  rates,
  confirming,
  onConfirm,
  onContinueWithoutConfirm,
  canManageRates,
}: RatesConfirmationModalProps) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Record<string, string>>({});
  const storeId = useAuthStore((s) => s.user?.activeStoreId);

  // Fecha de última actualización real de las tasas (para el texto del diálogo)
  useEffect(() => {
    if (!open || !storeId) return;
    let cancelled = false;
    (async () => {
      try {
        const { useAuthStore: auth } = await import("@/store");
        const token = auth.getState().token;
        const res = await fetch(`/api/store-rates?storeId=${storeId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setUpdatedAt(data.updated_at || {});
      } catch {
        /* sin fecha: el diálogo muestra solo los valores */
      }
    })();
    return () => { cancelled = true; };
  }, [open, storeId]);

  if (!open || reviewOpen) return null;

  const entries = Object.entries(rates).filter(([, v]) => typeof v === "number" && v > 0);
  const hasRates = entries.length > 0;

  const fmtUpdated = (iso?: string) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleString("es-CU", { dateStyle: "short", timeStyle: "short" });
    } catch { return null; }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/90 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rates-confirm-title"
      >
        <div className="w-full max-w-md bg-card border border-border/50 rounded-3xl shadow-2xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 id="rates-confirm-title" className="text-sm font-black uppercase leading-snug">
                ¿Confirma que las tasas de cambio siguen vigentes?
              </h2>
              <p className="text-[10px] text-muted-foreground mt-1">
                Antes de comenzar a vender, compruebe que los valores configurados continúan siendo correctos.
              </p>
            </div>
          </div>

          {reason === "rates_changed" && (
            <div className="flex items-start gap-2 mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                Las tasas cambiaron después de tu última confirmación de hoy — revísalas antes de continuar.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5 mb-4">
            <p className="text-[9px] font-black uppercase text-muted-foreground mb-1.5">
              Tasas vigentes de la tienda · día de negocio {businessDay}
            </p>
            {hasRates ? (
              <div className="space-y-1">
                {entries.map(([cur, rate]) => {
                  const upd = fmtUpdated(updatedAt[cur]);
                  return (
                    <div key={cur} className="flex items-center justify-between text-xs">
                      <span className="font-bold">{RATE_LABELS[cur] || cur}</span>
                      <span className="font-mono font-black">
                        {rate.toLocaleString("es-CU", { maximumFractionDigits: 4 })} CUP
                        {upd && (
                          <span className="ml-2 text-[9px] font-normal text-muted-foreground">
                            act. {upd}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground">
                  No hay tasas configuradas en la tienda. Si vas a vender solo en CUP puedes continuar;
                  para cobrar en USD/EUR configura las tasas antes (el servidor rechazará la venta sin tasa).
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <button
              onClick={() => void onConfirm()}
              disabled={confirming || !hasRates}
              className="w-full min-h-[44px] px-4 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:bg-primary/90 disabled:opacity-50"
              title={hasRates ? "Confirma que los valores mostrados siguen correctos" : "No hay tasas que confirmar"}
            >
              {confirming ? "Confirmando..." : "Confirmar tasas vigentes"}
            </button>

            {canManageRates ? (
              <button
                onClick={() => setReviewOpen(true)}
                className="w-full min-h-[44px] px-4 rounded-xl border border-border text-xs font-black uppercase hover:bg-muted flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Revisar o actualizar tasas
              </button>
            ) : (
              <p className="text-[10px] text-muted-foreground text-center px-2">
                Para actualizar las tasas contacta a un administrador de la tienda (requiere permisos de gestión).
              </p>
            )}

            <button
              onClick={onContinueWithoutConfirm}
              className="w-full min-h-[36px] text-[10px] font-bold uppercase text-muted-foreground hover:text-foreground"
            >
              Continuar sin confirmar
            </button>
          </div>
        </div>
      </div>

      {/* Acción B: pantalla REAL de configuración de tasas (mismo flujo del
          botón "Tasas" del carrito). Al guardar, el hook re-evalúa las tasas
          y vuelve a mostrar este diálogo con los valores frescos para que el
          usuario confirme explícitamente. */}
      <StoreRatesModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
      />
    </>
  );
}
