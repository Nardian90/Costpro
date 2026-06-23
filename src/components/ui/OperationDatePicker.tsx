'use client';

import React, { useMemo, useState } from 'react';
import { CalendarClock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGlobalOperationDate, validateOperationDate } from '@/hooks/api/useGlobalOperationDate';
import { format } from 'date-fns';

interface OperationDatePickerProps {
  value: string;
  onChange: (isoDate: string) => void;
  label?: string;
  className?: string;
  /** Si true, muestra el bloque de error inline. Default: true */
  showErrorInline?: boolean;
  /** UUID de la tienda activa para validación per-store. Si se omite, usa global. */
  storeId?: string | null;
}

/**
 * Selector de fecha de operación con validación forward-only PER-STORE.
 *
 * - El `min` del input se establece automáticamente a la fecha MAX de la tienda.
 * - Si el usuario intenta saltarse la restricción (via teclado), muestra error inline.
 * - El padre puede usar `useOperationDateValidation` para validar antes de enviar.
 *
 * Reutilizado por: SalesCatalogCheckoutModal, CreateTransferModal,
 * TransferDetailsModal (confirm), ReceptionForm, InventoryAdjustmentModal.
 */
export function OperationDatePicker({
  value,
  onChange,
  label = 'Fecha de operación',
  className,
  showErrorInline = true,
  storeId,
}: OperationDatePickerProps) {
  const { data: globalDateInfo, isLoading } = useGlobalOperationDate(storeId);
  const [touched, setTouched] = useState(false);

  const minAllowedDate = globalDateInfo?.minAllowedDate
    ? format(new Date(globalDateInfo.minAllowedDate), 'yyyy-MM-dd')
    : undefined;

  const validation = useMemo(
    () => validateOperationDate(value, globalDateInfo?.minAllowedDate || null),
    [value, globalDateInfo?.minAllowedDate],
  );

  const showValidationError = touched && !validation.valid && showErrorInline;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label
        htmlFor="operation-date-input"
        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground"
      >
        <CalendarClock className="w-3.5 h-3.5" />
        {label}
      </label>
      <input
        id="operation-date-input"
        type="date"
        value={value}
        min={minAllowedDate}
        onChange={(e) => {
          setTouched(true);
          onChange(e.target.value);
        }}
        className={cn(
          'w-full px-3 py-2 rounded-xl border bg-background text-xs font-bold outline-none transition-all',
          showValidationError
            ? 'border-destructive/50 focus:ring-2 focus:ring-destructive/20'
            : 'border-border focus:ring-2 focus:ring-primary/20 focus:border-primary/30',
        )}
      />
      {isLoading && (
        <p className="text-[10px] text-muted-foreground">Cargando fecha mínima...</p>
      )}
      {!isLoading && minAllowedDate && (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Fecha mínima permitida: <strong className="text-foreground">{minAllowedDate}</strong>
          {' '}· Política de secuencia global (forward-only)
        </p>
      )}
      {showValidationError && validation.error && (
        <div className="flex items-start gap-1.5 text-[10px] text-destructive bg-destructive/5 border border-destructive/20 rounded-lg p-2">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span className="font-medium leading-relaxed">{validation.error}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Hook auxiliar para componentes que necesitan formatear la fecha
 * antes de enviarla al RPC.
 *
 * Recibe un string 'YYYY-MM-DD' (de un input type="date")
 * y retorna un ISO timestamp que el backend puede aceptar.
 */
export function formatOperationDateForRPC(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  // Usar mediodía para evitar TZ edge cases
  return new Date(dateStr + 'T12:00:00').toISOString();
}

/**
 * Hook que retorna el estado de validación de una fecha de operación.
 * Útil para deshabilitar botones de envío si la fecha es inválida.
 *
 * @param value Fecha a validar (YYYY-MM-DD)
 * @param storeId UUID de la tienda para validación per-store. Si se omite, usa global.
 */
export function useOperationDateValidation(value: string, storeId?: string | null) {
  const { data: globalDateInfo } = useGlobalOperationDate(storeId);
  return useMemo(
    () => validateOperationDate(value, globalDateInfo?.minAllowedDate || null),
    [value, globalDateInfo?.minAllowedDate],
  );
}
