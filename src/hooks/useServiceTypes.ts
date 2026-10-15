'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * useServiceTypes — fuente oficial del catálogo de tipos de servicio.
 *
 * MISIÓN 2026-10-15: los tipos ya NO provienen de la lista estática
 * `quickTypes` del componente: se leen de la tabla oficial `service_types`
 * (catálogo GLOBAL compartido por todas las tiendas) vía /api/service-types.
 *
 * Estados cubiertos: carga inicial, error de red (reintentable con refetch),
 * respuesta vacía (catálogo sin tipos activos → el formulario muestra aviso).
 */
export interface ServiceType {
  id: string;
  store_id: string | null;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  usage_count?: number;
}

export function useServiceTypes(enabled = true) {
  const [types, setTypes] = useState<ServiceType[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/service-types');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al cargar tipos de servicio');
      }
      const json = await res.json();
      setTypes(json.data || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar tipos de servicio');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { refetch(); }, [refetch]);

  const activeTypes = types.filter(t => t.is_active);

  return { types, activeTypes, loading, error, refetch };
}
