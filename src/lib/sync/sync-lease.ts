/**
 * CP-POS-002 (D6) — Lease de procesamiento compartido entre pestañas.
 * ============================================================================
 * El cerrojo en memoria (syncEngine.isSyncing) NO protege entre contextos
 * JS: dos pestañas del mismo navegador pueden procesar la cola a la vez y
 * enviar la MISMA operación simultáneamente. Este módulo implementa un
 * lease con propietario y vencimiento en localStorage (almacenamiento
 * duradero COMPARTIDO entre pestañas del mismo origen, con eventos
 * 'storage' para notificación cruzada).
 *
 * Propiedades:
 *   · Adquisición atómica: localStorage.getItem+setItem son síncronos en
 *     un solo hilo de evento — entre el read del check y el write del
 *     claim no hay await (la función acquire es 100% síncrona), por lo que
 *     dos pestañas no pueden interleavear la adquisición dentro del mismo
 *     navegador. (localStorage es por origen y bloqueante: la exclusión es
 *     real entre contextos.)
 *   · Vencimiento (TTL): si la pestaña propietaria muere (crash, cierre),
 *     el lease expira y otra ejecución puede recuperarlo — la operación
 *     en in-flight se reintenta con la MISMA llave (idempotencia del
 *     servidor certificada: registry + param_hash).
 *   · Renovación: el motor renueva mientras procesa (heartbeat), para que
 *     un lote largo no expire a mitad.
 *   · Liberación: al terminar (finally). Si el lease ya no es nuestro
 *     (expiró y otra pestaña lo tomó), NO se libera el ajeno.
 *
 * Alcance honesto (documentado en POS-002_DISENO_OFFLINE.md): el lease
 * coordina pestañas del MISMO navegador. Dos navegadores distintos no
 * comparten localStorage — para eso rige la idempotencia del servidor por
 * llave y la detección de conflictos (D4), como exige la misión (§1: el
 * overselling físico entre dispositivos se detecta y concilia, no se
 * elimina).
 */

const LEASE_KEY = 'cp_pos_002_sync_lease';
/** TTL del lease: una pestaña muerta libera el procesamiento en 30 s. */
export const SYNC_LEASE_TTL_MS = 30_000;
/** Renovación: heartbeat a la mitad del TTL mientras el lote corre. */
export const SYNC_LEASE_RENEW_MS = 15_000;

interface LeaseRecord {
  /** Identificador del propietario (tabId único por contexto). */
  owner: string;
  /** Epoch ms en que el lease deja de ser válido. */
  expiresAt: number;
}

/** Contexto con localStorage no disponible (SSR/tests) → sin lease (el
 *  cerrojo en memoria del motor sigue operando). */
function storageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function readLease(now: number): LeaseRecord | null {
  if (!storageAvailable()) return null;
  try {
    const raw = localStorage.getItem(LEASE_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as LeaseRecord;
    if (
      !rec ||
      typeof rec.owner !== 'string' ||
      typeof rec.expiresAt !== 'number' ||
      !Number.isFinite(rec.expiresAt)
    ) {
      return null;
    }
    // Lease vencido: basura recuperable — lo tratamos como inexistente.
    if (rec.expiresAt <= now) return null;
    return rec;
  } catch {
    return null;
  }
}

function writeLease(rec: LeaseRecord): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(LEASE_KEY, JSON.stringify(rec));
  } catch {
    // Cuota llena/privado: el motor sigue con el cerrojo en memoria.
  }
}

export const syncLease = {
  /**
   * Intenta adquirir el lease de procesamiento. Retorna true si esta
   * ejecución es la propietaria (lease nuevo o ya suyo y vigente).
   * SINCRONA por diseño: sin await entre check y claim.
   */
  acquire(ownerId: string, now = Date.now(), ttlMs = SYNC_LEASE_TTL_MS): boolean {
    if (!storageAvailable()) return true; // sin storage: solo cerrojo en memoria
    const current = readLease(now);
    if (current && current.owner !== ownerId) return false; // vigente ajeno
    writeLease({ owner: ownerId, expiresAt: now + ttlMs });
    return true;
  },

  /** Renueva el lease SI seguimos siendo los dueños (heartbeat). */
  renew(ownerId: string, now = Date.now(), ttlMs = SYNC_LEASE_TTL_MS): boolean {
    if (!storageAvailable()) return true;
    const current = readLease(now);
    if (!current || current.owner !== ownerId) return false; // lo perdimos
    writeLease({ owner: ownerId, expiresAt: now + ttlMs });
    return true;
  },

  /**
   * Libera el lease. Si expiró y otra ejecución lo tomó, NO libera el
   * ajeno (el propietario solo libera lo suyo).
   */
  release(ownerId: string, now = Date.now()): void {
    if (!storageAvailable()) return;
    const current = readLease(now);
    if (current && current.owner === ownerId) {
      try {
        localStorage.removeItem(LEASE_KEY);
      } catch {
        // ignorar: expirará solo
      }
    }
  },

  /** Inspección (tests): lease vigente para owner, o null. */
  peek(now = Date.now()): LeaseRecord | null {
    return readLease(now);
  },

  /** Limpieza total (tests). */
  clear(): void {
    if (!storageAvailable()) return;
    try {
      localStorage.removeItem(LEASE_KEY);
    } catch {
      /* noop */
    }
  },
};
