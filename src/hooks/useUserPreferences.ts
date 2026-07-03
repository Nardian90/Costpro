'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { logger } from '@/lib/logger';

/**
 * F-02b: Hook para leer/escribir preferencias de usuario en Supabase.
 *
 * Características:
 *   - **Cross-device**: la preferencia se sincroniza entre móvil y desktop
 *     del mismo usuario via la tabla `user_preferences` (RLS-scoped).
 *   - **Fallback a localStorage** si Supabase no está disponible (offline,
 *     sin auth, error de red). localStorage NUNCA se elimina — es la capa
 *     de resiliencia offline que ya existía en F-02a.
 *   - **Migración transparente**: al cargar, si hay valor en localStorage
 *     pero no en Supabase, se sube el de localStorage a Supabase. Así,
 *     usuarios existentes con preferencia guardada en localStorage ven
 *     su preferencia migrada automáticamente la primera vez que abren
 *     la app post-deploy de F-02b, sin acción manual.
 *   - **Sync**: si `userId` cambia (login/logout), se recarga la
 *     preferencia desde Supabase (o localStorage si no hay auth).
 *
 * Tabla Supabase (ver migration `20260703000005_user_preferences.sql`):
 *   - PK (user_id, preference_key)
 *   - RLS: cada usuario solo puede leer/escribir SUS preferencias.
 *   - `preference_value` es JSONB — el hook lo serializa/deserializa.
 *
 * Convención de keys:
 *   - La `key` pasada al hook (ej. `'costeo-dinamico:rate-source'`) se
 *     guarda en Supabase tal cual.
 *   - En localStorage se guarda con prefijo `costpro:` (ej.
 *     `costpro:costeo-dinamico:rate-source`), consistente con F-02a
 *     (`RATE_SOURCE_STORAGE_KEY`) y `useStoreNotifications`
 *     (`costpro:read-notifications`).
 *
 * @param key Clave de preferencia (ej. 'costeo-dinamico:rate-source')
 * @param defaultValue Valor por defecto si no hay preferencia guardada
 * @returns `{ value, update, loading }` donde `update` es async
 */
export function useUserPreferences<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const userId = useAuthStore(s => s.user?.id ?? null);

  // Cargar preferencia al montar o cambiar userId/key
  useEffect(() => {
    if (!userId) {
      // Sin auth — usar localStorage exclusivamente (offline / pre-login)
      const local = readLocalStorage<T>(key);
      if (local !== undefined) {
        setValue(local);
      }
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // 1. Intentar cargar desde Supabase
        const { data, error } = await supabase
          .from('user_preferences')
          .select('preference_value')
          .eq('user_id', userId)
          .eq('preference_key', key)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          // PostgREST/RLS error — fallback a localStorage
          logger.warn('DATABASE', 'USER_PREFERENCES_LOAD_FAILED', {
            key, userId, error: error.message,
          });
          const local = readLocalStorage<T>(key);
          if (local !== undefined) setValue(local);
          return;
        }

        if (data?.preference_value != null) {
          // Preferencia existe en Supabase → usarla
          setValue(data.preference_value as T);
          // Mirror a localStorage para mantener la capa offline sincronizada
          writeLocalStorage(key, data.preference_value as T);
          return;
        }

        // 2. No existe en Supabase → mirar localStorage (migración)
        const local = readLocalStorage<T>(key);
        if (local !== undefined) {
          setValue(local);
          // Migración transparente: subir a Supabase para futuros dispositivos
          try {
            await supabase.from('user_preferences').upsert({
              user_id: userId,
              preference_key: key,
              preference_value: local as unknown as Record<string, unknown> | string | number | boolean | null,
            });
            logger.info('DATABASE', 'USER_PREFERENCES_MIGRATED', {
              key, userId,
            });
          } catch (err: any) {
            // La migración falló, pero el valor está en localStorage.
            // No es crítico — se reintentará la próxima vez que cargue.
            logger.warn('DATABASE', 'USER_PREFERENCES_MIGRATION_FAILED', {
              key, userId, error: err?.message ?? String(err),
            });
          }
        }
        // Si no hay ni en Supabase ni en localStorage, se queda con defaultValue
      } catch (err: any) {
        if (cancelled) return;
        logger.warn('DATABASE', 'USER_PREFERENCES_LOAD_FAILED', {
          key, userId, error: err?.message ?? String(err),
        });
        // Fallback a localStorage ante error inesperado (red caída, etc.)
        const local = readLocalStorage<T>(key);
        if (local !== undefined) setValue(local);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, key]);

  // Suscripción Realtime: si la preferencia cambia en otro dispositivo,
  // actualizar automáticamente sin necesidad de refresh.
  //
  // F-02d: supabase.channel() abre un WebSocket que recibe eventos
  // `postgres_changes` de la tabla `user_preferences` filtrados por
  // `user_id`. RLS de Realtime garantiza que el cliente solo reciba
  // eventos de filas que puede ver (sus propias preferencias).
  //
  // El callback filtra por `preference_key` porque el canal recibe
  // TODAS las preferencias del usuario (no solo la de este hook), y
  // cada instancia del hook solo se preocupa por su `key`.
  //
  // On DELETE → revertir a `defaultValue` (la preferencia fue borrada
  // en otro dispositivo, probablemente por un "reset" del usuario).
  // On INSERT/UPDATE → aplicar el nuevo valor y mirror a localStorage
  // para mantener la capa offline consistente.
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`user_preferences:${userId}:${key}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'user_preferences',
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          // Solo nos interesa si el cambio es para nuestra key
          const newRow = payload.new;
          const oldRow = payload.old;
          const changedKey = newRow?.preference_key || oldRow?.preference_key;
          if (changedKey !== key) return;

          if (payload.eventType === 'DELETE' || !newRow) {
            // Preferencia eliminada → volver a default
            setValue(defaultValue);
          } else {
            // INSERT o UPDATE → usar el nuevo valor
            const newValue = newRow.preference_value;
            setValue(newValue as T);
            // Actualizar también localStorage para mantener consistencia offline
            if (typeof window !== 'undefined') {
              try {
                localStorage.setItem(`costpro:${key}`, JSON.stringify(newValue));
              } catch {}
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, key, defaultValue]);

  // Guardar preferencia (async pero el caller no necesita await)
  const update = useCallback(async (newValue: T) => {
    // Actualizar estado local inmediatamente (optimístico)
    setValue(newValue);

    // Siempre actualizar localStorage (capa offline, síncrona)
    writeLocalStorage(key, newValue);

    // Si hay auth, actualizar Supabase (async, no bloqueante)
    if (userId) {
      try {
        const { error } = await supabase
          .from('user_preferences')
          .upsert({
            user_id: userId,
            preference_key: key,
            preference_value: newValue as unknown as Record<string, unknown> | string | number | boolean | null,
          });
        if (error) {
          logger.warn('DATABASE', 'USER_PREFERENCES_SAVE_FAILED', {
            key, userId, error: error.message,
          });
          // No lanzar — el valor ya está en localStorage. El usuario no
          // debe ver un error si la nube está caída pero la preferencia
          // funciona localmente.
        }
      } catch (err: any) {
        logger.warn('DATABASE', 'USER_PREFERENCES_SAVE_FAILED', {
          key, userId, error: err?.message ?? String(err),
        });
      }
    } else {
      // Sin auth — solo localStorage. No es error, solo modo offline.
      logger.info('DATABASE', 'USER_PREFERENCES_LOCAL_ONLY', { key });
    }
  }, [userId, key]);

  return { value, update, loading };
}

// ─── Helpers de localStorage ──────────────────────────────────────────
// Aislados para facilitar testing (mock de `localStorage` global) y para
// encapsular el manejo de JSON parse/stringify con try/catch silencioso.

const STORAGE_PREFIX = 'costpro:';

function storageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

function readLocalStorage<T>(key: string): T | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (raw === null) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    // localStorage corrupto o JSON inválido — ignorar silenciosamente.
    // Devolver undefined hace que el caller use el defaultValue.
    return undefined;
  }
}

function writeLocalStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(key), JSON.stringify(value));
  } catch {
    // Storage lleno o privado (Safari private mode) — no es crítico.
    // El estado en memoria sigue siendo la fuente de verdad para la
    // sesión actual, y Supabase (si hay auth) ya tiene el valor.
  }
}
