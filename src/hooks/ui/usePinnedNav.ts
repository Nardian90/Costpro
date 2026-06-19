'use client';

/* eslint-disable react-hooks/set-state-in-effect -- Tarea-4: este hook sincroniza
   localStorage con estado React. El patrón setState-in-effect es legítimo aquí
   porque es una sincronización con un sistema externo (localStorage), no una
   actualización derivada de props/state. Ver: https://react.dev/learn/you-might-not-need-an-effect#fetching-data */

/**
 * usePinnedNav — Accesos rápidos personalizados por usuario.
 *
 * ════════════════════════════════════════════════════════════════════════
 * E-2 (IA Audit): usuarios pueden fijar accesos rápidos.
 * ════════════════════════════════════════════════════════════════════════
 *
 * Permite al usuario "fijar" vistas que usa frecuentemente para que aparezcan
 * en una sección "Fijados" al inicio del sidebar (debajo del grupo ESCRITORIO).
 *
 * Casos de uso:
 *  - Clerk fija "Terminal" y "Arqueo" para acceso 1-clic sin expandir submenus.
 *  - Warehouse fija "Recepciones" y "Transferencias".
 *  - Manager fija "Dashboard" y "Reportes".
 *
 * Almacenamiento: localStorage con clave `costpro:pinned-nav:${userId}`.
 * Máximo 5 items fijados (para no llenar el sidebar).
 *
 * UI: cada item del sidebar tiene un icon "pin" al hover. Al fijar, aparece
 * una sección "FIJADOS" al inicio del sidebar con los items fijados. Al
 * desfijar, el item vuelve a su posición original.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ViewType } from '@/store';

const STORAGE_KEY_PREFIX = 'costpro:pinned-nav:';
const MAX_PINNED = 5;

function loadPinned(userId: string): ViewType[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + userId);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_PINNED) as ViewType[];
  } catch {
    return [];
  }
}

function savePinned(userId: string, pinned: ViewType[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + userId, JSON.stringify(pinned));
  } catch {
    // fail silently
  }
}

export function usePinnedNav(userId: string | undefined) {
  // Tarea-4: React 19 lint fix — lazy initial state + ref to avoid setState in effect.
  const [pinned, setPinned] = useState<ViewType[]>(() => {
    if (!userId || typeof window === 'undefined') return [];
    return loadPinned(userId);
  });
  const prevUserIdRef = useRef(userId);

  useEffect(() => {
    if (prevUserIdRef.current === userId) return;
    prevUserIdRef.current = userId;
    const newData = userId ? loadPinned(userId) : [];
    setPinned(newData);
  }, [userId]);

  const pin = useCallback((view: ViewType) => {
    if (!userId) return;
    setPinned(prev => {
      if (prev.includes(view)) return prev;
      if (prev.length >= MAX_PINNED) return prev; // No exceder el límite
      const next = [...prev, view];
      savePinned(userId, next);
      return next;
    });
  }, [userId]);

  const unpin = useCallback((view: ViewType) => {
    if (!userId) return;
    setPinned(prev => {
      const next = prev.filter(v => v !== view);
      savePinned(userId, next);
      return next;
    });
  }, [userId]);

  const togglePin = useCallback((view: ViewType) => {
    if (!userId) return;
    setPinned(prev => {
      if (prev.includes(view)) {
        const next = prev.filter(v => v !== view);
        savePinned(userId, next);
        return next;
      }
      if (prev.length >= MAX_PINNED) return prev;
      const next = [...prev, view];
      savePinned(userId, next);
      return next;
    });
  }, [userId]);

  const isPinned = useCallback((view: ViewType) => pinned.includes(view), [pinned]);

  return {
    pinned,
    pin,
    unpin,
    togglePin,
    isPinned,
    canPinMore: pinned.length < MAX_PINNED,
    maxPinned: MAX_PINNED,
  };
}

export default usePinnedNav;
