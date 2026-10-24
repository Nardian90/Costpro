/**
 * CP-MONEY-002 (D1, posmerge #1467) — CONTRATO DE REPLAY OFFLINE de
 * /api/sync/batch con p_payment_components.
 *
 * Defecto demostrado (sonda contra la BD viva 2026-10-24): el replay
 * construía v2Payload con `p_payment_components: op.payload... ?? null` —
 * la clave viajaba SIEMPRE (null incluido) y una clave null TAMBIÉN rompe
 * la resolución de PostgREST contra una BD sin migrar (PGRST202) → TODO
 * replay de ventas offline fallaba, incluidas las encoladas por builds
 * legados (CUP canónico, sin desglose).
 *
 * Contrato corregido: la clave viaja SOLO si el payload encolado la trae.
 * Sin la clave el RPC resuelve por DEFAULT NULL (firma de 32 params) o por
 * la firma legada de 31 params — en ambos casos el flujo es el previo.
 *
 * Patrón: source-contract test (mismo estilo que sync-batch-pnotes.test.ts),
 * porque montar el route completo exige sesiones Supabase reales.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routeSrc = readFileSync(
  join(process.cwd(), 'src', 'app', 'api', 'sync', 'batch', 'route.ts'),
  'utf-8',
);

const activeCode = routeSrc
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

describe('CP-MONEY-002 D1 · /api/sync/batch replay de ventas con desglose por moneda', () => {
  it('la clave p_payment_components viaja SOLO cuando el payload encolado la trae (spread condicional)', () => {
    expect(activeCode).toContain('...(op.payload.p_payment_components');
    expect(activeCode).toContain('? { p_payment_components: op.payload.p_payment_components }');
  });

  it('REGRESIÓN: la forma anterior (?? null → clave SIEMPRE presente) está retirada', () => {
    // La forma antigua enviaba la clave incluso para replays legados —
    // PGRST202 contra la BD sin migrar y fallo de TODO el batch de ventas.
    expect(activeCode).not.toContain(
      'p_payment_components: op.payload.p_payment_components ?? null',
    );
  });

  it('el passthrough conserva la validación de estructura en el RPC (§13.7 de create_sale_v2)', () => {
    // El replay NO valida el desglose: la validación de estructura/tasas/
    // pools derivados vive en la BD (migración 20261024150000 §13.7). Este
    // check ancla la coherencia contrato-replay ↔ contrato-RPC.
    const migration = readFileSync(
      join(
        process.cwd(),
        'supabase',
        'migrations',
        '20261024150000_mision_pagos_mixtos_multimoneda_v2_25_0.sql',
      ),
      'utf-8',
    );
    expect(migration).toContain('ERR_PAYMENT_COMPONENTS_INVALID');
    expect(migration).toContain('p_payment_components jsonb DEFAULT NULL::jsonb');
  });
});
