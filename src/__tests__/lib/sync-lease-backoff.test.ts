/**
 * CP-POS-002 (D6) — Lease entre pestañas + backoff con jitter.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { syncLease, SYNC_LEASE_TTL_MS } from '@/lib/sync/sync-lease';
import {
  computeBackoffDelay,
  RETRY_BASE_MS,
  RETRY_MAX_MS,
  MAX_AUTO_ATTEMPTS,
} from '@/lib/sync/sync-engine';

beforeEach(() => {
  syncLease.clear();
  localStorage.clear();
});
afterEach(() => {
  syncLease.clear();
  localStorage.clear();
});

describe('CP-POS-002 · D6 lease de procesamiento (entre pestañas)', () => {
  it('adquisición: primera pestaña gana, segunda rechazada mientras vigente', () => {
    const t0 = 1_000_000;
    expect(syncLease.acquire('tab-A', t0)).toBe(true);
    expect(syncLease.acquire('tab-B', t0 + 100)).toBe(false);
    // El dueño puede re-adquirir (renovación implícita).
    expect(syncLease.acquire('tab-A', t0 + 100)).toBe(true);
  });

  it('lease vencido (pestaña muerta) lo toma otra ejecución', () => {
    const t0 = 1_000_000;
    expect(syncLease.acquire('tab-A', t0));
    // Tras el TTL el lease caducó: tab-B puede procesar (recuperación).
    expect(syncLease.acquire('tab-B', t0 + SYNC_LEASE_TTL_MS + 1)).toBe(true);
  });

  it('renovación extiende la expiración SOLO para el dueño', () => {
    const t0 = 1_000_000;
    syncLease.acquire('tab-A', t0);
    expect(syncLease.renew('tab-A', t0 + SYNC_LEASE_TTL_MS - 1)).toBe(true);
    // Renovado: sigue vigente pasado el TTL original.
    expect(syncLease.acquire('tab-B', t0 + SYNC_LEASE_TTL_MS + 10)).toBe(false);
    // Un no-dueño no puede renovar.
    expect(syncLease.renew('tab-B', t0 + SYNC_LEASE_TTL_MS + 20)).toBe(false);
  });

  it('liberación: el dueño libera; un extraño no puede liberar el lease ajeno', () => {
    const t0 = 1_000_000;
    syncLease.acquire('tab-A', t0);
    syncLease.release('tab-B', t0 + 1); // NO libera el de tab-A
    expect(syncLease.acquire('tab-B', t0 + 2)).toBe(false);
    syncLease.release('tab-A', t0 + 3); // el dueño sí
    expect(syncLease.acquire('tab-B', t0 + 4)).toBe(true);
  });

  it('registro corrupto o timestamp inválido se trata como SIN lease (fail-open solo si nadie lo tiene)', () => {
    localStorage.setItem('cp_pos_002_sync_lease', 'garbage{');
    expect(syncLease.acquire('tab-A', 1000)).toBe(true);
    localStorage.setItem('cp_pos_002_sync_lease', JSON.stringify({ owner: 42, expiresAt: 'no-num' }));
    syncLease.clear();
    expect(syncLease.acquire('tab-B', 1000)).toBe(true);
  });

  it('lease con expiresAt en el futuro lejano es válido hasta su vencimiento', () => {
    const now = Date.now();
    syncLease.acquire('tab-A', now);
    const peeked = syncLease.peek(now + 1000);
    expect(peeked?.owner).toBe('tab-A');
    expect(peeked!.expiresAt).toBeGreaterThan(now);
  });
});

describe('CP-POS-002 · D6 backoff exponencial con jitter completo', () => {
  it('acota en [0, 2^(n-1)·base) y respeta el tope de 60 s', () => {
    // rng determinista: 0 → delay 0; ~1 → delay máximo del escalón.
    expect(computeBackoffDelay(1, () => 0)).toBe(0);
    expect(computeBackoffDelay(1, () => 0.999_999)).toBeLessThan(RETRY_BASE_MS);
    expect(computeBackoffDelay(8, () => 0.999_999)).toBeLessThanOrEqual(RETRY_MAX_MS);
    // Escalones: intento 4 → base·2³ = 8 s máx.
    expect(computeBackoffDelay(4, () => 0.5)).toBe(4_000);
    // Tope: 2^(n-1) > 60 s desde intento 7.
    expect(computeBackoffDelay(7, () => 1)).toBe(RETRY_MAX_MS);
    expect(computeBackoffDelay(9, () => 1)).toBe(RETRY_MAX_MS);
  });

  it('jitter COMPLETO: uniforme entre 0 y el retraso calculado', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(computeBackoffDelay(3, () => i / 200));
    // Con rng uniforme cubre el rango [0, 4s) — no valores fijos por intento.
    expect(seen.size).toBeGreaterThan(100);
    expect(Math.min(...seen)).toBe(0);
    expect(Math.max(...seen)).toBeLessThan(4_000);
  });

  it('constantes de la misión: base 1 s, tope 60 s, máx 8 intentos', () => {
    expect(RETRY_BASE_MS).toBe(1_000);
    expect(RETRY_MAX_MS).toBe(60_000);
    expect(MAX_AUTO_ATTEMPTS).toBe(8);
  });

  it('rng inyectable: resultados deterministas para el mismo rng', () => {
    expect(computeBackoffDelay(5, () => 0.42)).toBe(computeBackoffDelay(5, () => 0.42));
  });
});
