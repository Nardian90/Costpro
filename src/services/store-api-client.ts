import { Store } from '@/types';
import { useAuthStore } from '@/store';

const API_BASE = '/api/stores';

/** FIX-RES-2: Default request timeout (15 seconds) */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Returns common fetch headers including the Authorization Bearer token.
 * Uses useAuthStore (Zustand) to get the current access token — same pattern
 * as useHealthIndex, useComponentHealth, and rpc-validator.
 */
export function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/** Creates an AbortController that auto-aborts after the timeout */
function timeoutController(ms: number = REQUEST_TIMEOUT_MS): AbortController {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  // Clean up the timeout when the request finishes normally
  const originalAbort = controller.abort.bind(controller);
  controller.abort = () => { clearTimeout(id); originalAbort(); };
  return controller;
}

export const storeApiClient = {
  /**
   * Obtiene tiendas. V2.12.11: la API ahora devuelve paginación por defecto
   * (limit=200). Si se necesitan TODAS las tiendas (caso admin con muchas),
   * usar fetchAllStores() que itera con cursor hasta hasMore=false.
   *
   * Para uso normal (UI típica), fetchStores() es suficiente.
   */
  async fetchStores(status?: 'active' | 'inactive' | 'all'): Promise<Store[]> {
    const controller = timeoutController();
    // FIX: new URL('/api/stores') falla en el browser (base relativa).
    // Construir la URL manualmente.
    const url = status ? `${API_BASE}?status=${status}` : API_BASE;
    const res = await fetch(url, {
      method: 'GET',
      headers: authHeaders(),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error de conexión' }));
      throw new Error(err.message || err.error || 'Error al cargar tiendas');
    }
    const result = await res.json();
    return result.data as Store[];
  },

  /**
   * V2.12.14: Itera la API con cursor pagination hasta traer TODAS las tiendas.
   * Útil para admins con >200 tiendas. En cada llamada usa ?cursor=<last name>&limit=200.
   * Tiene un safety cap de 10000 tiendas para evitar loops infinitos.
   *
   * @returns Promise<Store[]> con todas las tiendas (puede ser >200)
   */
  async fetchAllStores(status?: 'active' | 'inactive' | 'all'): Promise<Store[]> {
    const allStores: Store[] = [];
    let cursor: string | null = null;
    const limit = 200;
    const maxIterations = 50; // safety cap: 50 * 200 = 10000 tiendas máximo

    for (let i = 0; i < maxIterations; i++) {
      const controller = timeoutController();
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (cursor) params.set('cursor', cursor);
      params.set('limit', String(limit));

      const res = await fetch(`${API_BASE}?${params.toString()}`, {
        method: 'GET',
        headers: authHeaders(),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error de conexión' }));
        throw new Error(err.message || err.error || 'Error al cargar tiendas');
      }
      const result = await res.json();
      const data = result.data as Store[];
      allStores.push(...data);

      // Si la API devuelve pagination metadata, usar nextCursor; si no, usar
      // el último name como cursor fallback
      const pagination = result.pagination;
      if (pagination?.hasMore) {
        cursor = pagination.nextCursor || (data.length > 0 ? data[data.length - 1].name : null);
        if (!cursor) break; // no hay cursor y no hay más datos
      } else {
        break; // hasMore=false o no hay pagination metadata
      }
    }

    return allStores;
  },

  async createStore(data: Partial<Store> & { name: string; address: string }): Promise<Store> {
    const controller = timeoutController();
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error de conexión' }));
      // FIX: Si hay details de Zod, formatearlos como texto legible
      let errMsg = err.message || err.error || 'Error al crear tienda';
      if (err.details && typeof err.details === 'object') {
        const fields = Object.entries(err.details)
          .filter(([k]) => k !== '_errors')
          .map(([field, val]: [string, any]) => {
            const msgs = Array.isArray(val) ? val : (val?._errors || []);
            return msgs.length > 0 ? `${field}: ${msgs.join(', ')}` : null;
          })
          .filter(Boolean);
        if (fields.length > 0) {
          errMsg = `Datos inválidos — ${fields.join(' | ')}`;
        }
      }
      throw new Error(errMsg);
    }
    const result = await res.json();
    return result.data as Store;
  },

  async updateStore(storeId: string, data: Partial<Store>): Promise<Store> {
    const controller = timeoutController();
    const res = await fetch(API_BASE, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ storeId, ...data }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error de conexión' }));
      let errMsg = err.message || err.error || 'Error al actualizar tienda';
      if (err.details && typeof err.details === 'object') {
        const fields = Object.entries(err.details)
          .filter(([k]) => k !== '_errors')
          .map(([field, val]: [string, any]) => {
            const msgs = Array.isArray(val) ? val : (val?._errors || []);
            return msgs.length > 0 ? `${field}: ${msgs.join(', ')}` : null;
          })
          .filter(Boolean);
        if (fields.length > 0) {
          errMsg = `Datos inválidos — ${fields.join(' | ')}`;
        }
      }
      throw new Error(errMsg);
    }
    const result = await res.json();
    return result.data as Store;
  },

  async deleteStore(storeId: string): Promise<void> {
    const controller = timeoutController();
    const res = await fetch(API_BASE, {
      method: 'DELETE',
      headers: authHeaders(),
      body: JSON.stringify({ storeId }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error de conexión' }));
      throw new Error(err.message || err.error || 'Error al eliminar tienda');
    }
  },

  /**
   * F2-T03: Toggle activar/desactivar tienda vía PATCH { is_active: boolean }.
   *
   * Diferencia clave con deleteStore:
   * - toggleStoreStatus: preserva memberships, configuración y datos operativos.
   *   Es una "pausa temporal" — el admin puede reactivar con un clic.
   * - deleteStore: soft-delete que además revoca memberships y limpia active_store_id
   *   de los perfiles de usuario. Es una "baja permanente" con cleanup.
   *
   * Cuando is_active=false, el RLS de Supabase filtra la tienda de las queries de
   * usuarios no-admin, así que los usuarios asignados pierden acceso automáticamente.
   * Al reactivar (is_active=true), todo vuelve a estar operativo sin reconfigurar.
   */
  async toggleStoreStatus(storeId: string, isActive: boolean): Promise<Store> {
    const controller = timeoutController();
    const res = await fetch(API_BASE, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ storeId, is_active: isActive }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error de conexión' }));
      throw new Error(err.message || err.error || 'Error al cambiar estado de tienda');
    }
    const result = await res.json();
    return result.data as Store;
  },

  // Reset-Flow-Fix: resetStore ahora acepta keepCatalog opcional.
  // Si true: mantiene catálogo de productos (solo resetea stock a 0).
  // Si false (default): borra TODO incluyendo catálogo.
  // Usuarios y memberships NUNCA se tocan.
  async resetStore(storeId: string, keepCatalog: boolean = false): Promise<void> {
    const controller = timeoutController(30_000);
    const res = await fetch(`${API_BASE}/reset`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ storeId, keepCatalog }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error de conexión' }));
      throw new Error(err.message || err.error || 'Error al reiniciar tienda');
    }
  },

  /**
   * F4-T01: Operación bulk para activar/desactivar/eliminar múltiples tiendas.
   * Retorna el número de tiendas afectadas.
   */
  async bulkStoreAction(
    storeIds: string[],
    action: 'activate' | 'deactivate' | 'delete'
  ): Promise<{ affected: number; failed?: number }> {
    const controller = timeoutController(30_000); // bulk ops pueden tardar más
    const res = await fetch(`${API_BASE}/bulk`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ storeIds, action }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error de conexión' }));
      throw new Error(err.message || err.error || `Error en operación bulk: ${action}`);
    }
    const result = await res.json();
    return { affected: result.affected ?? 0, failed: result.failed };
  },
};
