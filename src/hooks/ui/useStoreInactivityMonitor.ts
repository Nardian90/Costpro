'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

/**
 * F3-T06: Hook para detectar tiendas inactivas operativamente.
 *
 * Complementa useStoreDeletedMonitor (que detecta eliminación/desactivación de tienda
 * activa) detectando tiendas que llevan mucho tiempo sin actividad operativa
 * (sin ventas, recepciones, ni movimientos de stock).
 *
 * Caso de uso: el admin ve que una tienda lleva 30+ días sin actividad.
 * El hook emite una notificación proactiva sugerando pausarla (toggle is_active=false)
 * para mantener limpio el listado de tiendas activas.
 *
 * Estrategia:
 * - Se ejecuta 1 vez al montar el shell autenticado (no polling — la inactividad
 *   cambia lentamente, no necesita actualización en tiempo real).
 * - Solo lo ejecuta el admin (rol admin) — los encargados no necesitan ver esto.
 * - Threshold configurable (default 30 días).
 * - Para no spamear, usa localStorage para recordar qué tiendas ya notificó
 *   y no volver a notificar la misma tienda en la misma sesión.
 *
 * Query: trae tiendas activas del admin y para cada una cuenta operaciones recientes
 * en sales, receptions, stock_movements. Si todas están en 0, marca como inactiva.
 */

const DEFAULT_THRESHOLD_DAYS = 30;
const STORAGE_KEY = 'costpro:inactivity-notified';

export type InactiveStore = {
  id: string;
  name: string;
  daysInactive: number; // días desde la última operación (aproximado)
};

export function useStoreInactivityMonitor(options?: {
  thresholdDays?: number;
  enabled?: boolean;
}) {
  const { user } = useAuthStore();
  const thresholdDays = options?.thresholdDays ?? DEFAULT_THRESHOLD_DAYS;
  // Solo admin necesita ver alertas de inactividad global
  const enabled = options?.enabled ?? (user?.role === 'admin');
  const hasRunRef = useRef(false);
  const [inactiveStores, setInactiveStores] = useState<InactiveStore[]>([]);

  useEffect(() => {
    if (!enabled || hasRunRef.current || !user?.id) return;
    hasRunRef.current = true;

    let cancelled = false;

    const checkInactiveStores = async () => {
      try {
        // 1. Traer todas las tiendas activas del tenant
        const { data: stores, error: storesError } = await supabase
          .from('stores')
          .select('id, name, created_at')
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (storesError || !stores || stores.length === 0) return;

        // 2. Calcular fecha de corte (hace N días)
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - thresholdDays);
        const cutoffIso = cutoffDate.toISOString();

        // 3. Para cada tienda, contar operaciones recientes (paralelo)
        //    Usamos Promise.all para no serializar.
        const checks = stores.map(async (store: { id: string; name: string; created_at: string }) => {
          // Si la tienda se creó hace menos de thresholdDays días, no la marcamos como inactiva
          // (no ha tenido tiempo de tener actividad legítima)
          const createdAt = new Date(store.created_at);
          if (createdAt > cutoffDate) {
            return null;
          }

          // Contar ventas, recepciones y movimientos de stock en los últimos N días
          // FIX-BUG-1: migrado de tablas inexistentes ('sales', 'receptions') a las
          // tablas reales que usa la app: 'transactions' (con status='completed' para
          // contar solo ventas reales) y 'receipts' (singular). Ver useTransactions.ts
          // y useReceptions.ts para referencia. Migración 20260614000004 confirma
          // explícitamente: "Uses `receipts` table (not `receptions`)".
          const [salesRes, receptionsRes, movementsRes] = await Promise.all([
            supabase
              .from('transactions')
              .select({ count: 'exact', head: true })
              .eq('store_id', store.id)
              .eq('status', 'completed')
              .gte('created_at', cutoffIso),
            supabase
              .from('receipts')
              .select({ count: 'exact', head: true })
              .eq('store_id', store.id)
              .gte('created_at', cutoffIso),
            supabase
              .from('stock_movements')
              .select({ count: 'exact', head: true })
              .eq('store_id', store.id)
              .gte('created_at', cutoffIso),
          ]);

          // FIX-BUG-1: loggear errores individuales por query (antes se silenciaban)
          if (salesRes.error) {
            logger.warn('UI', 'INACTIVITY_SALES_QUERY_FAILED', {
              storeId: store.id, error: salesRes.error.message,
            });
          }
          if (receptionsRes.error) {
            logger.warn('UI', 'INACTIVITY_RECEPTIONS_QUERY_FAILED', {
              storeId: store.id, error: receptionsRes.error.message,
            });
          }
          if (movementsRes.error) {
            logger.warn('UI', 'INACTIVITY_MOVEMENTS_QUERY_FAILED', {
              storeId: store.id, error: movementsRes.error.message,
            });
          }

          const salesCount = salesRes.count ?? 0;
          const receptionsCount = receptionsRes.count ?? 0;
          const movementsCount = movementsRes.count ?? 0;
          const totalOps = salesCount + receptionsCount + movementsCount;

          // Si no hay operaciones en el período, la tienda está inactiva
          if (totalOps === 0) {
            return {
              id: store.id,
              name: store.name,
              daysInactive: thresholdDays,
            } as InactiveStore;
          }
          return null;
        });

        const results = await Promise.all(checks);
        if (cancelled) return;

        const inactive = results.filter((r): r is InactiveStore => r !== null);

        // 4. Filtrar tiendas ya notificadas en esta sesión (usando localStorage)
        let alreadyNotified: string[] = [];
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) alreadyNotified = JSON.parse(raw);
        } catch {
          // ignore parse errors
        }

        const newInactive = inactive.filter(s => !alreadyNotified.includes(s.id));

        if (newInactive.length === 0) {
          return;
        }

        // 5. Actualizar estado y mostrar notificación
        setInactiveStores(prev => [...prev, ...newInactive]);

        // Registrar en localStorage para no repetir
        try {
          const updated = [...alreadyNotified, ...newInactive.map(s => s.id)];
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch {
          // ignore storage errors
        }

        // 6. Mostrar toast proactivo (1 toast con resumen, no 1 por tienda)
        if (newInactive.length === 1) {
          toast.warning(
            `La tienda "${newInactive[0].name}" lleva ${thresholdDays}+ días sin actividad`,
            {
              description: 'Considera pausarla para mantener limpio el listado de tiendas activas.',
              duration: 10000,
            }
          );
        } else {
          toast.warning(
            `${newInactive.length} tiendas llevan ${thresholdDays}+ días sin actividad`,
            {
              description: newInactive.slice(0, 3).map(s => `• ${s.name}`).join('\n') +
                (newInactive.length > 3 ? `\n• y ${newInactive.length - 3} más` : ''),
              duration: 10000,
            }
          );
        }

        logger.info('UI', 'INACTIVE_STORES_DETECTED', {
          count: newInactive.length,
          thresholdDays,
          storeIds: newInactive.map(s => s.id),
        });
      } catch (error) {
        logger.warn('UI', 'INACTIVITY_MONITOR_FAILED', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    // Delay de 5s para no competir con queries críticas del shell al montar
    const timer = setTimeout(checkInactiveStores, 5000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, user?.id, thresholdDays]);

  return { inactiveStores };
}
