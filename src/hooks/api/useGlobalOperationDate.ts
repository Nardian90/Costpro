'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { businessDayOf } from '@/lib/cash-report/period-attribution';

// ── Tipos ──────────────────────────────────────────────────────

export interface GlobalOperationDateInfo {
  /** Fecha MAX (ISO string). Null si no hay documentos. */
  maxDate: string | null;
  /** Fecha MAX formateada para display (DD/MM/YYYY HH:MM). */
  maxDateFormatted: string;
  /** Fecha mínima permitida para nuevos documentos (= maxDate). */
  minAllowedDate: string | null;
}

// ── Hook ────────────────────────────────────────────────────────

/**
 * Hook que retorna la "Fecha de Operación Actual" — PER-STORE.
 *
 * Política forward-only locking PER-TIENDA:
 * - Cada tienda tiene su propia fecha MAX.
 * - Documentos en tienda A se validan contra el MAX de tienda A.
 * - Documentos en tienda B se validan contra el MAX de tienda B.
 *
 * Si storeId es NULL, retorna el MAX global (fallback para docs sin tienda).
 *
 * @param storeId UUID de la tienda activa. Si es null/undefined, usa global.
 *
 * Refresca cada 30 segundos.
 */
export function useGlobalOperationDate(storeId?: string | null) {
  return useQuery<GlobalOperationDateInfo>({
    queryKey: ['global-max-operation-date', storeId ?? 'global'],
    queryFn: async () => {
      const params: Record<string, unknown> = {};
      if (storeId) params.p_store_id = storeId;
      const { data, error } = await supabase.rpc('get_global_max_operation_date', params);
      if (error) throw error;
      const maxDate = data as string | null;
      return {
        maxDate,
        maxDateFormatted: maxDate ? formatDateHavana(maxDate) : '—',
        minAllowedDate: maxDate,
      };
    },
    refetchInterval: 30 * 1000,
    staleTime: 30 * 1000,
    enabled: storeId !== undefined,
  });
}

// ── Helpers ────────────────────────────────────────────────────

function formatDateHavana(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    return d.toLocaleString('es-CU', {
      timeZone: 'America/Havana',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoDate;
  }
}

/**
 * Valida que una fecha dada sea válida (no anterior a la fecha MAX de la tienda).
 * Retorna { valid: boolean, error?: string }.
 *
 * MISIÓN POLÍTICA TEMPORAL (2026-10-18): AMBOS límites se comparan por DÍA DE
 * NEGOCIO (America/Havana), no por timestamp completo. Antes el mínimo era una
 * comparación de instantes: un mínimo tipo 2026-10-15T23:59:59 (recepción del
 * día, convención T23:59:59) bloqueaba una venta/ajuste del MISMO día estampado
 * al mediodía (12:00 < 23:59) — dos operaciones legítimas del mismo día quedaban
 * prohibidas por la HORA intradía, no por el día. La regla del negocio es
 * inclusiva por día: mismo día operativo = permitido (los RPCs ya comparaban
 * date-only en Habana; esta corrección alinea el cliente con el servidor).
 */
export function validateOperationDate(
  newDate: Date | string | null,
  minAllowedDate: string | null,
  // MISIÓN FECHA OPERATIVA (2026-10-17): tope superior opcional ('YYYY-MM-DD').
  // En Vender = hoy (Habana). Opcional → los consumidores anteriores no cambian.
  maxAllowedDate?: string | null,
): { valid: boolean; error?: string } {
  if (!newDate) return { valid: true };

  // Día de negocio de la fecha a validar (date-only entra tal cual; ISO/Date
  // se convierte con la zona de negocio). Fecha intraducible → inválida.
  let newDay: string;
  try {
    newDay = typeof newDate === 'string' ? businessDayOf(newDate) : businessDayOf(newDate.toISOString());
  } catch {
    return { valid: false, error: 'La fecha seleccionada no es válida.' };
  }

  // MISIÓN FECHA OPERATIVA: el tope superior se valida INDEPENDIENTE del mínimo
  // (una tienda sin documentos previos tiene minAllowedDate null y aún así no
  // puede registrar fechas futuras en el flujo de Vender).
  if (maxAllowedDate && newDay > maxAllowedDate) {
    return {
      valid: false,
      error: `La fecha seleccionada no puede ser futura. La fecha máxima permitida es ${maxAllowedDate}.`,
    };
  }

  if (!minAllowedDate) return { valid: true };

  let minDay: string;
  try {
    minDay = businessDayOf(minAllowedDate);
  } catch {
    return { valid: true }; // mínimo ilegible: no bloquear por un dato malformado
  }

  if (newDay < minDay) {
    // Formato DD/MM/YYYY del día mínimo (ya es YYYY-MM-DD de negocio)
    const [y, m, d] = minDay.split('-');
    const minFormatted = `${d}/${m}/${y}`;
    return {
      valid: false,
      error: `No se puede retroceder en el tiempo operativo. La fecha mínima permitida es ${minFormatted}.`,
    };
  }
  return { valid: true };
}
