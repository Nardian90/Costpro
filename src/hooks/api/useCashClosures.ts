import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cashService } from '@/services/cash-service';
import { CashClosure } from '@/types';
import { toast } from 'sonner';
import { getCleanStoreId } from './base';
import { useAuthStore } from '@/store';
import { auditService } from '@/services/audit-service';
import { supabase } from '@/lib/supabaseClient';

export function useCashClosures(storeId?: string | null, isAdmin = false) {
  const cleanStoreId = getCleanStoreId(storeId);

  return useQuery({
    queryKey: ['cash-closures', cleanStoreId, isAdmin],
    queryFn: () => {
      if (!cleanStoreId) return [];
      return cashService.getClosures(cleanStoreId || '', isAdmin);
    },
    enabled: !!cleanStoreId,
  });
}

export function useSalesSinceLastClosure(storeId?: string | null) {
  const cleanStoreId = getCleanStoreId(storeId);

  return useQuery({
    queryKey: ['sales-since-last-closure', cleanStoreId],
    queryFn: () => {
      if (!cleanStoreId) return null;
      return cashService.getSalesSinceLastClosure(cleanStoreId);
    },
    enabled: !!cleanStoreId,
  });
}

/**
 * MISIÓN CP-CASH-OPENING-001: invalidación CONSOLIDADA del estado de caja.
 *
 * Apertura, cierre, actualización de declaración y documentos Ingresos/Egresos
 * comparten el mismo grafo de consultas. Antes la apertura/cierre solo
 * invalidaba cash-closures + sales-since-last-closure: el estado del turno
 * (active-shift, refresco 30s) y los KPIs de Inicio/Caja (cash-shift-expected,
 * 60s; cash-flow-summary; libro cash-ledger) quedaban RANCIOS hasta un minuto
 * tras abrir o cerrar el turno — la interfaz mostraba «Sin turno abierto» con
 * el turno ya creado (requisito Fase F: refresco correcto al cambiar de turno).
 */
function invalidateCajaState(queryClient: { invalidateQueries: (q: { queryKey: unknown[] }) => void }) {
  queryClient.invalidateQueries({ queryKey: ['cash-closures'] });
  queryClient.invalidateQueries({ queryKey: ['sales-since-last-closure'] });
  queryClient.invalidateQueries({ queryKey: ['active-shift'] });
  queryClient.invalidateQueries({ queryKey: ['cash-shift-expected'] });
  queryClient.invalidateQueries({ queryKey: ['cash-flow-summary'] });
  queryClient.invalidateQueries({ queryKey: ['cash-ledger'] });
  queryClient.invalidateQueries({ queryKey: ['cash-currency-summary'] });
}

export function useCreateCashClosure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (closure: Partial<CashClosure>) => cashService.createClosure(closure),
    onSuccess: () => {
      invalidateCajaState(queryClient);
      toast.success('Declaración de fondos registrada correctamente');
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Error al registrar declaración: ${message}`);
    },
  });
}

export function useUpdateCashClosure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, closure }: { id: string; closure: Partial<CashClosure> }) => {
      // Iteración 11.4: si status='cerrado', usar RPC close_cash_shift via API
      if (closure.status === 'cerrado') {
        const response = await fetch('/api/cash-closures/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            closure_id: id,
            declared_cash: closure.declared_cash || 0,
            declared_vouchers: closure.declared_vouchers || 0,
            // MISIÓN CAJA v2.24.0 (D8): efectivo USD contado al cerrar — el
            // RPC calcula difference_usd y la PERSISTE sin autoajuste.
            declared_cash_usd: closure.declared_cash_usd || 0,
            notes: closure.notes || null,
          }),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(err.error || `HTTP ${response.status}`);
        }
        return response.json();
      }
      // Para updates no-cierre (declarar fondos en turno pendiente), usar path viejo
      return cashService.updateClosure(id, closure);
    },
    onSuccess: () => {
      // Iteración 11.4: audit ahora atómico en RPC — no llamar logCashClosureFinalized
      invalidateCajaState(queryClient);
      toast.success('Cierre de caja finalizado correctamente');
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Error al finalizar cierre: ${message}`);
    },
  });
}

export interface OpenCashShiftPayload {
  store_id: string;
  /** Billetes CUP contados al abrir (fondo inicial físico CUP). */
  counted_cup: number;
  /** Billetes USD contados al abrir (fondo inicial físico USD). */
  counted_usd: number;
  /** Notas de apertura (libre). */
  opening_note?: string | null;
  /** Motivo de la diferencia contado − libro físico (exigido por el RPC). */
  difference_note?: string | null;
  /** Clave de idempotencia estable por apertura lógica (patrón v2.26). */
  idempotency_key?: string | null;
  /**
   * Fila del INSERT LEGADO (bajo RLS) que se usa SOLO si la ruta responde
   * 501 fallback:true — entorno sin el RPC open_cash_shift aplicado. La
   * construye la UI con los mismos valores confirmados en el formulario.
   */
  legacy_insert?: Partial<CashClosure>;
}

/**
 * MISIÓN CP-CASH-OPENING-001 — apertura de turno por la vía AUTORITATIVA.
 *
 * POST /api/cash-closures/open → RPC open_cash_shift (service_role): el saldo
 * esperado sale del LIBRO FÍSICO por moneda (nunca del esperado canónico), la
 * diferencia de apertura exige nota de causa, la apertura canónica CUP valora
 * los billetes USD a la tasa del servidor, y todo queda en auditoría con
 * idempotencia. Degradación explícita: si el RPC no existe en el esquema, la
 * ruta responde 501 {fallback:true} y se ejecuta el INSERT legado bajo RLS
 * (comportamiento previo a esta misión) con los valores ya corregidos por la
 * UI — abrir caja JAMÁS queda bloqueado por una migración pendiente.
 */
export function useOpenCashShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: OpenCashShiftPayload,
    ): Promise<{ via: 'rpc' | 'legacy'; data: unknown }> => {
      const { legacy_insert: legacyInsert, ...body } = payload;
      const response = await fetch('/api/cash-closures/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.status === 501) {
        const err = await response.json().catch(() => ({}) as { fallback?: boolean });
        if (err?.fallback) {
          // Degradación: RPC ausente → INSERT legado (RLS aplica como siempre).
          const row = await cashService.createClosure(
            legacyInsert ?? {
              store_id: body.store_id,
              declared_cash: body.counted_cup,
              opening_balance: body.counted_cup,
              status: 'pendiente',
            },
          );
          return { via: 'legacy', data: row };
        }
      }
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }
      return { via: 'rpc', data: await response.json() };
    },
    onSuccess: (result) => {
      invalidateCajaState(queryClient);
      toast.success(
        result.via === 'legacy'
          ? 'Turno abierto (vía legada — RPC de apertura no disponible en este entorno)'
          : 'Turno abierto: fondo inicial físico registrado',
      );
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Error al abrir el turno: ${message}`);
    },
  });
}

export interface CashShiftExpected {
  window_start: string;
  has_pending_shift: boolean;
  opening_balance: number;
  total_sales: number;
  cash_sales: number;
  cash_outflows: number;
  cash_production: number;
  cash_commissions: number;
  /** v2.21.0 (MISIÓN INGRESOS/EGRESOS): ingresos de caja documentados (fondo de cambio y otros). */
  cash_flow_in: number;
  /** v2.21.0: egresos de caja documentados (devolución del fondo y otros). */
  cash_flow_out: number;
  /** v2.22.0 (MISIÓN DE SEGUIMIENTO): reembolsos EN EFECTIVO de devoluciones comerciales. */
  cash_refunds: number;
  /** v2.23.0 (decisión del propietario 2026-10-21): reembolsos por VOUCHER (transfer/zelle) de devoluciones — base NETA del lado vouchers. */
  voucher_refunds: number;
  expected_cash: number;
  transfer_sales: number;
  zelle_sales: number;
  expected_total: number;
  /** v2.24.0 (MISIÓN CAJA 2026-10-23): lado USD FÍSICO — apertura USD del turno. */
  opening_balance_usd?: number;
  /** v2.24.0: efectivo USD esperado en el cajón (libro físico por moneda). */
  expected_cash_usd?: number;
  /**
   * MISIÓN EFECTIVO FÍSICO (P0 2026-10-26): saldo FÍSICO acumulado por moneda
   * (libro autoritativo — misma lectura que las autorizaciones). Disponibilidad
   * real de billetes; NUNCA se presenta expected_cash como disponible.
   */
  physical_cash?: { CUP: number; USD: number };
  /** Residuo de valoración (expected_cash − physical_cash.CUP) — informativo, no efectivo. */
  valuation_residual_cup?: number;
}

/**
 * v2.21.0: desglose del turno en curso para el arqueo (RPC get_cash_shift_expected).
 * Misma ventana y fórmula que close_cash_shift → la UI muestra siempre lo que
 * el cierre calculará server-side (fondo + entradas de efectivo − salidas, con
 * los documentos Ingresos/Egresos incluidos una sola vez).
 */
export function useCashShiftExpected(storeId?: string | null) {
  const cleanStoreId = getCleanStoreId(storeId);
  return useQuery({
    queryKey: ['cash-shift-expected', cleanStoreId],
    queryFn: async (): Promise<CashShiftExpected | null> => {
      if (!cleanStoreId) return null;
      const { data, error } = await supabase.rpc('get_cash_shift_expected', { p_store_id: cleanStoreId });
      if (error) throw error;
      return (data as CashShiftExpected) || null;
    },
    enabled: !!cleanStoreId,
    refetchInterval: 60_000,
  });
}
