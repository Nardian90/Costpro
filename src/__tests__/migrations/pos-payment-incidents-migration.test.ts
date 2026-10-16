/**
 * MISIÓN-FLEX (2026-10-17) — Verificación estática de la migración de
 * incidencias de pago. El entorno local no dispone de Postgres/Supabase
 * (la ejecución real corresponde al pipeline autorizado del proyecto); este
 * test asegura que la migración contiene los elementos críticos de la misión:
 *   - REGLA INNEGOCIABLE: guard ERR_NEGATIVE_SALE + CHECK total >= 0.
 *   - Flexibilización SOLO con incidencias (sin incidencias = rechazo canónico).
 *   - Nota automática + columnas nuevas + evento SALE_PAYMENT_INCIDENT.
 *   - Invariantes de integridad intactos (stock, tasa, supervisor, idempotencia).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261017000000_pos_payment_incidents_negative_guard.sql';

function sql(): string {
  // Resuelto desde la raíz del repo (vitest corre con root = proyecto)
  return readFileSync(resolve(process.cwd(), MIGRATION), 'utf-8');
}

describe('migración 20261017000000 — incidencias de pago y venta negativa', () => {
  it('define las columnas nuevas aditivas (notes, payment_incidents)', () => {
    const s = sql();
    expect(s).toContain('ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS notes text;');
    expect(s).toContain('ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_incidents jsonb;');
  });

  it('relaja chk_mixed_payment_consistency SOLO cuando la venta porta payment_incidents', () => {
    const s = sql();
    expect(s).toContain('DROP CONSTRAINT IF EXISTS chk_mixed_payment_consistency');
    expect(s).toMatch(/payment_method <> 'mixed'\s+OR ABS\(\(cash_amount \+ transfer_amount \+ zelle_amount\) - total_amount\) <= 1\.00\s+OR payment_incidents IS NOT NULL/);
  });

  it('REGLA INNEGOCIABLE: CHECK de total no negativo a nivel DDL (NOT VALID)', () => {
    const s = sql();
    expect(s).toContain('ADD CONSTRAINT chk_transaction_total_non_negative');
    expect(s).toMatch(/CHECK \(total_amount >= 0\) NOT VALID/);
  });

  it('create_sale_v2 acepta p_notes y p_payment_incidents opcionales (compatibilidad de firma)', () => {
    const s = sql();
    expect(s).toContain('p_notes text DEFAULT NULL::text');
    expect(s).toContain('p_payment_incidents jsonb DEFAULT NULL::jsonb');
  });

  it('guard explícito ERR_NEGATIVE_SALE antes de persistir la venta', () => {
    const s = sql();
    expect(s).toMatch(/IF v_calculated_total < 0 THEN\s+RAISE EXCEPTION 'ERR_NEGATIVE_SALE/);
  });

  it('guardrail de tasa: sin tasa real de USD/EUR las incidencias NO se aceptan', () => {
    const s = sql();
    expect(s).toContain("IF v_item_currency IN ('USD', 'EUR') THEN");
    expect(s).toContain('ERR_RATE_REQUIRED_FOR_INCIDENT');
  });

  it('los gates de pago solo se relajan con incidencias (fail-closed sin ellas)', () => {
    const s = sql();
    // Paso 14: el rechazo canónico ERR_PAYMENT_MISMATCH se conserva y solo se
    // omite cuando v_incidents está presente
    expect(s).toMatch(/IF v_incidents IS NULL THEN\s+RAISE EXCEPTION 'ERR_PAYMENT_MISMATCH/);
    expect(s).toMatch(/IF v_incidents IS NULL THEN\s+RAISE EXCEPTION 'ERR_PAYMENT_INVARIANT_VIOLATED/);
  });

  it('persiste nota (preservando la manual) e incidencias en la venta', () => {
    const s = sql();
    expect(s).toContain('notes, payment_incidents');
    expect(s).toContain('v_notes_final, v_incidents');
    expect(s).toContain("v_notes_final || E'\\n' || v_incidence_note");
    expect(s).toContain("'INCIDENCIA DE PAGO: venta registrada con pago insuficiente. Total: '");
    expect(s).toContain("'INCIDENCIA DE PAGO: sobrepago detectado. Total de venta: '");
  });

  it('emite el evento de auditoría SALE_PAYMENT_INCIDENT en la misma transacción', () => {
    const s = sql();
    expect(s).toMatch(/IF v_has_payment_incident THEN\s+INSERT INTO public\.audit_logs/);
    expect(s).toContain("VALUES ('SALE_PAYMENT_INCIDENT', 'transactions', v_tx_id, p_store_id, v_uid,");
  });

  it('los metadatos del CREATE_SALE_V2 incluyen las incidencias y la nota', () => {
    const s = sql();
    expect(s).toContain("'has_payment_incident', v_has_payment_incident");
    expect(s).toContain("'payment_diff_cup', v_payment_diff");
    expect(s).toContain("'sale_notes', v_notes_final");
  });

  it('no rompe invariantes de integridad preexistentes (stock, tasa, supervisor, idempotencia, WAC)', () => {
    const s = sql();
    expect(s).toContain('ERR_INSUFFICIENT_STOCK');
    expect(s).toContain('ERR_RATE_STALE');
    expect(s).toContain('ERR_EXCHANGE_RATE_UNAVAILABLE');
    expect(s).toContain('ERR_SUPERVISOR_REQUIRED');
    expect(s).toContain('ERR_IDEMPOTENCY_KEY_REUSE');
    expect(s).toContain('ERR_TOTAL_MISMATCH');
    expect(s).toContain('register_stock_movement');
    expect(s).toContain('pg_advisory_xact_lock');
    expect(s).toContain('ERR_ZELLE_REQUIRES_RATE');
  });

  it('la identidad de idempotencia incluye notas e incidencias (reintentos sin duplicados)', () => {
    const s = sql();
    expect(s).toContain("'|notes=' || COALESCE(p_notes, '')");
    expect(s).toContain("'|payment_incidents=' || COALESCE(p_payment_incidents::text, '')");
  });

  it('el auto-total Zelle NO infla importes parciales cuando hay incidencias', () => {
    const s = sql();
    expect(s).toContain("IF p_payment_incidents IS NULL AND p_payment_method = 'zelle'");
  });
});
