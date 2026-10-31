'use client';

/**
 * useCrearValeSalida — Emisión de un Vale de Salida desde el módulo
 * «Almacén → Vales de Salida» con flujo DEDICADO (no acoplado al carrito
 * de Vender, requisito 1/4 del brief de profesionalización).
 *
 * NO DUPLICA LÓGICA DE NEGOCIO (requisito 4):
 *   - Llama al MISMO endpoint  POST /api/vale-salida  que Vender.
 *   - El endpoint valida con el MISMO esquema Zod y despacha la MISMA RPC
 *     create_vale_salida (costo server-side, idempotencia, trust boundary,
 *     numeración VS-NNNNNN-YYYY, movimientos issue_slip_out + audit_logs).
 *   - La autorización sigue siendo la del servidor (JWT + RLS + has_store_access_as).
 *
 * MISIÓN RESOLUCIÓN 11 (2026-10-31) — estándar documental de Ajustes
 * Documentales: `guardarEnRevision` persiste el vale en estado 'pending'
 * (En Revisión) vía POST /api/vale-salida/pending → RPC
 * create_vale_salida_pending — MISMA validación Zod, MISMA numeración y
 * MISMO trust boundary; SIN descontar stock hasta la confirmación explícita
 * (confirm_vale_salida) desde el listado del módulo.
 *
 * La separación es SOLO de experiencia: el modal compone su propio payload
 * { items, production_order_id, notes, idempotency_key, operation_date }.
 *
 * Idempotencia: la clave se genera al abrir el flujo y SOLO se regenera tras
 * un éxito o cuando cambian las líneas/concepto (paridad con el patrón del
 * hook de Vender: reintentos seguros, sin vales duplicados). Las operaciones
 * 'vale_salida' y 'vale_salida_pending' usan la misma clave sin colisión
 * (registro por operación).
 */

import { useCallback, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';

export interface LineaValePayload {
  product_id: string;
  variant_id: string | null;
  quantity: number;
  production_order_item_id: string | null;
}

export interface CrearValePayload {
  items: LineaValePayload[];
  production_order_id: string | null;
  notes: string;
  idempotency_key: string;
  operation_date?: string;
}

export interface CrearValeResult {
  slip_id?: string;
  slip_number?: string;
  total_cost?: number;
  status?: string;
  /** 'pending' cuando el vale quedó guardado en revisión (RPC
   * create_vale_salida_pending) — el stock NO se descuenta hasta confirmar. */
  vale_status?: string;
  items_count?: number;
  [k: string]: unknown;
}

export interface UseCrearValeSalidaReturn {
  isSubmitting: boolean;
  submitError: string | null;
  emitirVale: (payload: Omit<CrearValePayload, 'idempotency_key'>) => Promise<CrearValeResult | null>;
  guardarEnRevision: (payload: Omit<CrearValePayload, 'idempotency_key'>) => Promise<CrearValeResult | null>;
  regenerarClave: () => void;
  limpiarError: () => void;
}

function generarClaveIdempotencia(): string {
  // Mín 8 chars (validación Zod server-side). Prefijo claro para auditoría.
  return `vale_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function useCrearValeSalida(): UseCrearValeSalidaReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const claveRef = useRef<string>(generarClaveIdempotencia());

  const regenerarClave = useCallback(() => {
    claveRef.current = generarClaveIdempotencia();
  }, []);

  const limpiarError = useCallback(() => setSubmitError(null), []);

  const emitirVale = useCallback(
    async (payload: Omit<CrearValePayload, 'idempotency_key'>): Promise<CrearValeResult | null> => {
      setIsSubmitting(true);
      setSubmitError(null);
      try {
        const result = await apiFetch<CrearValeResult>('/api/vale-salida', {
          method: 'POST',
          body: JSON.stringify({ ...payload, idempotency_key: claveRef.current }),
        });
        // Éxito: la clave se consume — la próxima emisión necesita una nueva.
        claveRef.current = generarClaveIdempotencia();
        return result ?? null;
      } catch (e: unknown) {
        const msg =
          e instanceof Error
            ? e.message
            : 'No se pudo emitir el vale. Intenta de nuevo.';
        setSubmitError(msg);
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    []
  );

  const guardarEnRevision = useCallback(
    async (payload: Omit<CrearValePayload, 'idempotency_key'>): Promise<CrearValeResult | null> => {
      setIsSubmitting(true);
      setSubmitError(null);
      try {
        const result = await apiFetch<CrearValeResult>('/api/vale-salida/pending', {
          method: 'POST',
          body: JSON.stringify({ ...payload, idempotency_key: claveRef.current }),
        });
        claveRef.current = generarClaveIdempotencia();
        return result ?? null;
      } catch (e: unknown) {
        const msg =
          e instanceof Error
            ? e.message
            : 'No se pudo guardar el vale en revisión. Intenta de nuevo.';
        setSubmitError(msg);
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    []
  );

  return { isSubmitting, submitError, emitirVale, guardarEnRevision, regenerarClave, limpiarError };
}
