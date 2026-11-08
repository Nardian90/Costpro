/**
 * CP-POS-002 (D5) — Caducidad y antigüedad del snapshot.
 * - Antigüedad desde el timestamp REAL guardado por saveSnapshot.
 * - Timestamps inválidos/inexistentes → 'unknown' (nunca "fresco").
 * - Aviso a partir de 24 h SIN bloquear la venta.
 * - Antigüedad por snapshot individual (products_<storeId>), no global.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('localforage', () => ({
  default: {
    config: vi.fn(),
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: unknown) => { store.set(k, v); }),
    removeItem: vi.fn(async (k: string) => { store.delete(k); }),
  },
}));

import { offlineStorage } from '@/lib/sync/offline-storage';
import { computeSnapshotAge, OFFLINE_SNAPSHOT_WARN_HOURS } from '@/hooks/useUnresolvedSales';

const STORE = '11111111-1111-4111-8111-111111111111';
const KEY = `products_${STORE}`;
const HOUR = 3_600_000;

beforeEach(() => {
  store.clear();
});

describe('CP-POS-002 · D5 antigüedad del snapshot', () => {
  it('constante de la misión: 24 horas', () => {
    expect(OFFLINE_SNAPSHOT_WARN_HOURS).toBe(24);
  });

  it('computeSnapshotAge: fresco antes de 24 h, aviso después (sin bloqueo)', () => {
    const now = 10 * HOUR;
    expect(computeSnapshotAge(now - 1 * HOUR, now)).toEqual({ state: 'ok', hours: 1 });
    expect(computeSnapshotAge(now - 23.9 * HOUR, now).state).toBe('ok');
    const warn = computeSnapshotAge(now - 25 * HOUR, now);
    expect(warn.state).toBe('warn');
    expect(warn.hours).toBe(25);
    // Límite exacto: >= 24 h avisa.
    expect(computeSnapshotAge(now - 24 * HOUR, now).state).toBe('warn');
    expect(computeSnapshotAge(now - 23 * HOUR, now).state).toBe('ok');
  });

  it('timestamps inválidos o inexistentes → unknown (tratamiento controlado)', () => {
    expect(computeSnapshotAge(null, 1000)).toEqual({ state: 'unknown', hours: null });
    expect(computeSnapshotAge(NaN, 1000).state).toBe('unknown');
    // Timestamp "del futuro" (reloj corrupto): no se trata como fresco.
    expect(computeSnapshotAge(5_000, 1_000).state).toBe('unknown');
  });

  it('getSnapshotTimestamp devuelve el timestamp REAL del snapshot de la tienda', async () => {
    const ts = Date.now() - 2 * HOUR;
    await offlineStorage.saveSnapshot(KEY, [{ id: 'p1' }]);
    // Recuperar el timestamp persistido (saveSnapshot usa Date.now() real:
    // leemos el valor guardado para comparar).
    const stored = await offlineStorage.getSnapshotTimestamp(KEY);
    expect(stored).not.toBeNull();
    expect(stored!).toBeGreaterThan(ts);
  });

  it('sin snapshot → getSnapshotTimestamp null (bloqueo de venta offline controlado por el caller)', async () => {
    expect(await offlineStorage.getSnapshotTimestamp(`products_otra-tienda`)).toBeNull();
  });

  it('antigüedad por snapshot INDIVIDUAL: una tienda reciente no disfraza a otra vieja', async () => {
    const OTHER = '99999999-9999-4999-8999-999999999999';
    const snapshots = {
      [`products_${STORE}`]: { data: [], timestamp: Date.now() - 1 * HOUR },
      [`products_${OTHER}`]: { data: [], timestamp: Date.now() - 30 * HOUR },
    };
    store.set('offline_snapshot', snapshots);
    const freshAge = computeSnapshotAge(
      await offlineStorage.getSnapshotTimestamp(`products_${STORE}`),
      Date.now(),
    );
    const staleAge = computeSnapshotAge(
      await offlineStorage.getSnapshotTimestamp(`products_${OTHER}`),
      Date.now(),
    );
    expect(freshAge.state).toBe('ok');
    expect(staleAge.state).toBe('warn');
    expect(staleAge.hours).toBeGreaterThanOrEqual(29);
  });

  it('snapshot corrupto (timestamp no numérico) → null, no lanza', async () => {
    store.set('offline_snapshot', {
      [KEY]: { data: [], timestamp: 'corrupto' },
    });
    expect(await offlineStorage.getSnapshotTimestamp(KEY)).toBeNull();
  });
});
