'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

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
 */
export function validateOperationDate(
  newDate: Date | string | null,
  minAllowedDate: string | null,
): { valid: boolean; error?: string } {
  if (!newDate) return { valid: true };
  if (!minAllowedDate) return { valid: true };

  const newDateObj = typeof newDate === 'string' ? new Date(newDate) : newDate;
  const minDateObj = new Date(minAllowedDate);

  if (newDateObj < minDateObj) {
    const minFormatted = minDateObj.toLocaleString('es-CU', {
      timeZone: 'America/Havana',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return {
      valid: false,
      error: `No se puede retroceder en el tiempo operativo. La fecha mínima permitida es ${minFormatted}.`,
    };
  }
  return { valid: true };
}
