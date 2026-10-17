"use client";

/**
 * POSOperationDateSection — MISIÓN FECHA OPERATIVA (2026-10-17).
 *
 * Sección reutilizable de la vista Vender que muestra y edita la FECHA ECONÓMICA
 * del carrito (venta o vale de salida). Vive junto a la información operativa
 * del carrito en los tres flujos de confirmación:
 *   - POSCartCheckoutPanel (tab Pago de la venta)
 *   - ValeSalidaPanel (emisión de vale desde el carrito)
 *   - POSExpressMode (modal de confirmación express)
 *
 * Comportamiento (documentado en docs/audits/FECHA_OPERATIVA_VENDER_TURNOS_Y_VALES_2026-10-17.md):
 *   - Valor mostrado: saleDate del cart store; null = HOY (Habana) implícito.
 *   - Al cambiar: si el usuario vuelve a elegir hoy, se guarda null (semántica
 *     "hoy implícito" → el servidor estampa NOW() como siempre).
 *   - Límites: min = fecha MAX operativa de la TIENDA (RPC
 *     get_global_max_operation_date, política forward-only per-store del
 *     proyecto — NO mezcla datos de otras tiendas); max = HOY (Habana,
 *     todayBusinessDay). El servidor revalida (ruta + validate_operation_date).
 *   - Turno de caja: solo informativo (el sistema NO exige turno para vender y
 *     no existe shift_id). Si la fecha elegida es ANTERIOR al día de apertura
 *     del turno activo, se muestra un AVISO no bloqueante: la operación se
 *     registrará con su fecha económica y quedará fuera de la ventana del
 *     arqueo del turno (conducta existente para todo documento retro-fechado).
 */

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/store/cart";
import { useAuthStore } from "@/store";
import { useActiveShift } from "@/hooks/api/useActiveShift";
import {
  OperationDatePicker,
  useOperationDateValidation,
} from "@/components/ui/OperationDatePicker";
import { businessDayOf, todayBusinessDay } from "@/lib/cash-report/period-attribution";

/** Estado + validación de la fecha de venta del carrito (para los padres). */
export function usePosSaleDate() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId ?? null;
  const todayBd = useMemo(() => todayBusinessDay(), []);
  const saleDate = useCartStore(useShallow((s) => s.saleDate));
  const setSaleDate = useCartStore((s) => s.setSaleDate);

  // Valor efectivo: null = hoy (Habana). Si el carrito persistido trae una
  // fecha que dejó de ser válida (p.ej. quedó en el pasado y otra operación
  // movió el mínimo de la tienda), useOperationDateValidation la marca y la
  // UI pide una nueva selección (misión §3 — cambios concurrentes).
  const value = saleDate ?? todayBd;
  const validation = useOperationDateValidation(value, storeId, todayBd);

  return { storeId, todayBd, saleDate, value, setSaleDate, validation };
}

interface POSOperationDateSectionProps {
  /** Id único del input date (evitar duplicados si hay dos pickers montados). */
  inputId: string;
  className?: string;
}

export function POSOperationDateSection({ inputId, className }: POSOperationDateSectionProps) {
  const { storeId, todayBd, value, setSaleDate, validation } = usePosSaleDate();
  const { data: activeShift } = useActiveShift(storeId);

  // Día de negocio (Habana) de la APERTURA del turno activo. "Fecha del turno"
  // en este esquema = created_at de la fila cash_closures pendiente (no existe
  // campo de fecha económica del turno ni jornada — ver informe de la misión).
  const shiftOpenBd = useMemo(
    () => (activeShift?.created_at ? businessDayOf(activeShift.created_at) : null),
    [activeShift?.created_at],
  );
  const backdatedBeforeShift = !!shiftOpenBd && value < shiftOpenBd;

  return (
    <div className={cn("space-y-2", className)}>
      <OperationDatePicker
        value={value}
        onChange={(d) => setSaleDate(d === todayBd ? null : d)}
        label="Fecha de venta"
        storeId={storeId}
        max={todayBd}
        inputId={inputId}
        showErrorInline={false}
      />

      {/* Estado del turno de caja (informativo — misión §2: sin dependencia obligatoria) */}
      <div className="flex items-center gap-1.5 text-[10px] font-bold">
        {activeShift ? (
          <>
            <ShieldCheck className="w-3.5 h-3.5 text-success shrink-0" />
            <span className="text-muted-foreground">
              Turno activo desde{" "}
              <strong className="text-foreground">
                {new Date(activeShift.created_at).toLocaleString("es-CU", {
                  timeZone: "America/Havana",
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </strong>
              {" "}· día de apertura {shiftOpenBd}
            </span>
          </>
        ) : (
          <>
            <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
            <span className="text-muted-foreground/70">
              Sin turno abierto · la venta no requiere turno (se registra con la fecha elegida)
            </span>
          </>
        )}
      </div>

      {/* Aviso no bloqueante: operación anterior a la apertura del turno activo.
          La venta/vale conserva su fecha económica (correcto), pero queda fuera
          de la ventana del arqueo del turno (created_at > apertura del turno). */}
      {backdatedBeforeShift && (
        <div className="flex items-start gap-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
          <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span className="font-medium leading-relaxed">
            La fecha elegida ({value}) es anterior a la apertura del turno activo
            ({shiftOpenBd}). La operación se registrará con la fecha económica
            elegida y NO entrará en el arqueo de este turno.
          </span>
        </div>
      )}

      {/* Fecha inválida SIEMPRE visible (sin requerir interacción): cubre fechas
          stale del carrito persistido y mínimos avanzados por operación
          concurrente (misión §3 — informa y solicita nueva selección).
          Los botones de confirmación del padre además se deshabilitan. */}
      {!validation.valid && validation.error && (
        <div className="flex items-start gap-1.5 text-[10px] text-destructive bg-destructive/5 border border-destructive/20 rounded-lg p-2">
          <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span className="font-medium leading-relaxed">{validation.error}</span>
        </div>
      )}
    </div>
  );
}
