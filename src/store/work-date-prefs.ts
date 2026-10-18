/**
 * WORK DATE PREFERENCES STORE — MISIÓN FECHAS DE TRABAJO (2026-10-18).
 *
 * Preferencia persistente de «fecha de trabajo» por USUARIO + TIENDA + TIPO
 * DE MOVIMIENTO (alcance recomendado por la misión §3.4).
 *
 * QUÉ ES: el default de la fecha efectiva que el PRÓXIMO documento del tipo
 * mostrará en su selector al abrirse. El selector del formulario sigue siendo
 * el control visible y autoritativo en el momento de crear: el usuario puede
 * cambiarla ahí (elección local del documento, no muta la preferencia).
 *
 * QUÉ NO ES:
 *   - NO es un ajuste global de fechas (alcance por tienda+usuario+tipo —
 *     cambiar la mía no cambia la de otros usuarios ni de otras tiendas).
 *   - NO elude la validación de servidor: toda fecha llega igualmente al gate
 *     canónico (validate_operation_date) y a las rutas (checkNotFutureOperationDate).
 *   - NO toca documentos históricos ni fechas ya persistidas.
 *
 * PERSISTENCIA: localStorage, clave `costpro:work-date-pref:${userId}:${storeId}`
 * (mismo convenio de uso personal que costpro:pinned-nav:${userId} — E-2 IA
 * Audit). Elección documentada en el informe de la misión: la preferencia es
 * una ayuda de operativa personal del puesto de trabajo, no configuración del
 * negocio (eso vive en la BD con RLS). Sin persistencia global nueva.
 *
 * Valor ausente / null = HOY implícito (convención canónica del proyecto:
 * el servidor estampa NOW()). Valores 'YYYY-MM-DD'.
 */

'use client';

import { create } from 'zustand';
import { PREFERENCE_ENABLED_TYPES, getMovementType } from '@/config/work-dates/movement-types';

export type WorkDatePrefs = Record<string, string>;

const KEY_PREFIX = 'costpro:work-date-pref:';

function scopeKey(userId: string, storeId: string): string {
  return `${KEY_PREFIX}${userId}:${storeId}`;
}

function loadScope(userId: string, storeId: string): WorkDatePrefs {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(scopeKey(userId, storeId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: WorkDatePrefs = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      // Sanitizar: solo tipos habilitados y fechas YYYY-MM-DD.
      if (PREFERENCE_ENABLED_TYPES.includes(k) && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function saveScope(userId: string, storeId: string, prefs: WorkDatePrefs) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(scopeKey(userId, storeId), JSON.stringify(prefs));
  } catch {
    // fail silently — la preferencia es un default, no un dato crítico
  }
}

interface WorkDatePrefsState {
  /** Scope activo: `${userId}:${storeId}` (null = sin usuario/tienda). */
  scope: string | null;
  /** Preferencias del scope activo. */
  prefs: WorkDatePrefs;
  /** Carga (o recarga) el scope al cambiar de usuario o tienda activa. */
  loadScope: (userId: string | null | undefined, storeId: string | null | undefined) => void;
  /** Fija la fecha de trabajo de un tipo (valida tipo + formato). */
  setWorkDate: (type: string, date: string) => boolean;
  /** Limpia la preferencia de un tipo (vuelve a HOY implícito). */
  clearWorkDate: (type: string) => void;
}

export const useWorkDatePrefsStore = create<WorkDatePrefsState>((set, get) => ({
  scope: null,
  prefs: {},

  loadScope: (userId, storeId) => {
    if (!userId || !storeId) {
      set({ scope: null, prefs: {} });
      return;
    }
    const scope = `${userId}:${storeId}`;
    if (get().scope === scope) return; // ya cargado
    set({ scope, prefs: loadScope(userId, storeId) });
  },

  setWorkDate: (type, date) => {
    const { scope, prefs } = get();
    if (!scope) return false;
    if (!PREFERENCE_ENABLED_TYPES.includes(type)) return false; // tipo sin preferencia (fija/informativa)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false; // formato de día de negocio
    const next = { ...prefs, [type]: date };
    set({ prefs: next });
    const [userId, storeId] = scope.split(':');
    saveScope(userId, storeId, next);
    return true;
  },

  clearWorkDate: (type) => {
    const { scope, prefs } = get();
    if (!scope || !(type in prefs)) return;
    const next = { ...prefs };
    delete next[type];
    set({ prefs: next });
    const [userId, storeId] = scope.split(':');
    saveScope(userId, storeId, next);
  },
}));

/** Lee la preferencia cruda de un tipo (sin validar contra límites). */
export function readWorkDatePref(state: WorkDatePrefsState, type: string): string | null {
  return state.prefs[type] ?? null;
}

/** ¿El tipo admite preferencia de fecha de trabajo? */
export function typeSupportsPreference(type: string): boolean {
  return getMovementType(type)?.preferenceEnabled ?? false;
}
