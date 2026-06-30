'use client';


/**
 * useAdaptiveNav — IA adaptativa para el sidebar.
 *
 * ════════════════════════════════════════════════════════════════════════
 * E-1 (IA Audit): el menú reordena items según frecuencia de uso del rol.
 * ════════════════════════════════════════════════════════════════════════
 *
 * Estrategia:
 *  1. Cada vez que el usuario navega a una vista, se incrementa su contador
 *     en localStorage (clave: `costpro:nav-frequency:${userId}`).
 *  2. El hook expone `getReorderedChildren(parentId, children)` que devuelve
 *     los hijos de un submenu reordenados por frecuencia descendente.
 *  3. Los items nunca se ocultan — solo se reordenan. El usuario siempre
 *     encuentra todos los items, pero los más usados aparecen primero.
 *  4. El reordenamiento se aplica solo dentro de submenus (no entre grupos
 *     raíz, que mantienen su orden semántico).
 *  5. Para roles nuevos (sin historial), no hay reordenamiento — se respeta
 *     el orden declarativo del sidebar.
 *
 * Almacenamiento: localStorage con TTL de 30 días. Si el usuario no usa una
 * vista en 30 días, su contador decae. Esto evita que vistas usadas una vez
 * hace meses queden permanentemente arriba.
 *
 * Privacidad: los datos se almacenan localmente en el navegador del usuario.
 * No se envían al servidor. Cada usuario/rol tiene su propio perfil de uso.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ViewType } from '@/store';

const STORAGE_KEY_PREFIX = 'costpro:nav-frequency:';
const TTL_DAYS = 30;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

interface FrequencyEntry {
  view: ViewType;
  count: number;
  lastUsed: number; // epoch ms
}

interface FrequencyMap {
  entries: Record<string, FrequencyEntry>;
  updatedAt: number;
}

function loadFrequency(userId: string): FrequencyMap {
  if (typeof window === 'undefined') return { entries: {}, updatedAt: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + userId);
    if (!raw) return { entries: {}, updatedAt: Date.now() };
    const parsed = JSON.parse(raw) as FrequencyMap;
    // TTL: limpiar entradas viejas al cargar
    const now = Date.now();
    const entries: Record<string, FrequencyEntry> = {};
    for (const [key, entry] of Object.entries(parsed.entries || {})) {
      if (now - entry.lastUsed < TTL_MS) {
        entries[key] = entry;
      }
    }
    return { entries, updatedAt: now };
  } catch {
    return { entries: {}, updatedAt: Date.now() };
  }
}

function saveFrequency(userId: string, freq: FrequencyMap) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + userId, JSON.stringify(freq));
  } catch {
    // localStorage lleno o deshabilitado — fail silently
  }
}

/**
 * Hook principal. Recibe el userId y la vista actual, y tracking automáticamente.
 * Devuelve `getReorderedChildren` para aplicar el reordenamiento en el sidebar.
 */
export function useAdaptiveNav(userId: string | undefined, currentView: ViewType) {
  // Tarea-4: React 19 lint fix — lazy initial state + ref to avoid setState in effect.
  const [frequency, setFrequency] = useState<FrequencyMap>(() => {
    if (!userId || typeof window === 'undefined') return { entries: {}, updatedAt: 0 };
    return loadFrequency(userId);
  });
  const prevUserIdRef = useRef(userId);

  // Recargar frecuencia solo cuando userId cambia
  useEffect(() => {
    if (prevUserIdRef.current === userId) return;
    prevUserIdRef.current = userId;
    const newData = userId ? loadFrequency(userId) : { entries: {}, updatedAt: 0 };
    setFrequency(newData);
  }, [userId]);

  // Track view visit — legítimo: sincroniza estado externo (localStorage) con React.
  useEffect(() => {
    if (!userId || !currentView) return;
    if (currentView === 'occ') return;

    setFrequency(prev => {
      const now = Date.now();
      const existing = prev.entries[currentView];
      const entry: FrequencyEntry = {
        view: currentView,
        count: (existing?.count || 0) + 1,
        lastUsed: now,
      };
      const next: FrequencyMap = {
        entries: { ...prev.entries, [currentView]: entry },
        updatedAt: now,
      };
      saveFrequency(userId, next);
      return next;
    });
  }, [userId, currentView]);

  /**
   * Reordena los hijos de un submenu por frecuencia descendente.
   * Los items sin uso mantienen su orden declarativo al final.
   * Solo reordena si hay al menos 1 item con count > 0.
   */
  const getReorderedChildren = useCallback(
    <T extends { id: string }>(parentId: string, children: T[]): T[] => {
      // No reordenar si no hay entradas de frecuencia
      const hasData = Object.values(frequency.entries).some(e => e.count > 0);
      if (!hasData) return children;

      // Para preservar orden estable, usamos slice + sort con comparator estable
      const sorted = [...children];
      sorted.sort((a, b) => {
        const freqA = frequency.entries[a.id]?.count || 0;
        const freqB = frequency.entries[b.id]?.count || 0;
        if (freqA === freqB) return 0; // orden declarativo preservado
        return freqB - freqA; // descendente
      });
      return sorted;
    },
    [frequency]
  );

  /**
   * Devuelve el top-N de vistas más usadas (para mostrar como "Accesos rápidos"
   * en el hub u otras superficies).
   */
  const getTopViews = useCallback((n: number = 5): ViewType[] => {
    return Object.values(frequency.entries)
      .sort((a, b) => b.count - a.count)
      .slice(0, n)
      .map(e => e.view);
  }, [frequency]);

  /**
   * Resetea la frecuencia (para depuración o "olvidar mi historial").
   */
  const resetFrequency = useCallback(() => {
    if (!userId) return;
    const empty: FrequencyMap = { entries: {}, updatedAt: Date.now() };
    setFrequency(empty);
    saveFrequency(userId, empty);
  }, [userId]);

  return {
    frequency,
    getReorderedChildren,
    getTopViews,
    resetFrequency,
  };
}

export default useAdaptiveNav;
