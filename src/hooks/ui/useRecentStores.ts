'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuthStore } from '@/store';

/**
 * F5-T03: Hook para gestionar las tiendas recientes y permitir swipe horizontal
 * entre ellas en mobile.
 *
 * Mantiene las últimas 5 tiendas activas en localStorage (key: costpro:recent-stores).
 * El orden es: la más reciente primero.
 *
 * FIX-LINT: usa lazy useState initializer para leer localStorage (no useEffect).
 * El tracking de activeStoreId se hace con un efecto que solo actualiza si el ID
 * realmente cambia (evita cascading renders).
 */

const STORAGE_KEY = 'costpro:recent-stores';
const MAX_RECENT = 5;

export function useRecentStores() {
  const { user } = useAuthStore();

  // Lazy initializer: leer de localStorage al montar (sin useEffect)
  // FIX-BUG: Filtrar IDs que no sean UUID válidos (ej: "store-001" de datos de prueba)
  const [recentStores, setRecentStores] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Filtrar solo UUIDs válidos
          const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const valid = parsed.filter((id: string) => typeof id === 'string' && UUID_REGEX.test(id)).slice(0, MAX_RECENT);
          // Sobrescribir localStorage con la lista limpia
          if (valid.length !== parsed.length) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
          }
          return valid;
        }
      }
    } catch {
      // ignore parse errors
    }
    return [];
  });

  // Añadir una tienda al inicio de la lista de recientes
  const addRecentStore = useCallback((storeId: string) => {
    if (!storeId) return;
    // FIX-BUG: Validar que sea un UUID válido antes de agregar (evita "store-001" etc.)
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(storeId)) return;

    setRecentStores(prev => {
      // Remover si ya existe, luego poner al inicio
      const next = [storeId, ...prev.filter(id => id !== storeId)].slice(0, MAX_RECENT);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  // Obtener la siguiente tienda reciente (para swipe left)
  const getNextStore = useCallback((currentStoreId: string | null | undefined): string | null => {
    if (!currentStoreId || recentStores.length <= 1) return null;
    const currentIdx = recentStores.indexOf(currentStoreId);
    if (currentIdx === -1 || currentIdx >= recentStores.length - 1) return null;
    return recentStores[currentIdx + 1];
  }, [recentStores]);

  // Obtener la tienda anterior (para swipe right)
  const getPrevStore = useCallback((currentStoreId: string | null | undefined): string | null => {
    if (!currentStoreId || recentStores.length <= 1) return null;
    const currentIdx = recentStores.indexOf(currentStoreId);
    if (currentIdx <= 0) return null;
    return recentStores[currentIdx - 1];
  }, [recentStores]);

  // Trackear la tienda activa como reciente.
  // Patrón legítimo de "suscripción a sistema externo" (el auth store):
  // solo actualizamos cuando el ID realmente cambia.
  useEffect(() => {
    if (user?.activeStoreId) {
      addRecentStore(user.activeStoreId);
    }
  }, [user?.activeStoreId, addRecentStore]);

  return {
    recentStores,
    addRecentStore,
    getNextStore,
    getPrevStore,
  };
}
