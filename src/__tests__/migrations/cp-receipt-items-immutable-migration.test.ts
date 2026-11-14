/**
 * CP-RECEIPT-INTEGRITY-001 (2026-11-14) — contrato estático de la migración
 * 20261114160000_cp_receipt_items_immutable.sql.
 *
 * La regla de diseño que materializa: una recepción definitivamente
 * confirmada no acepta cambios silenciosos en sus datos económicos
 * (recepciones 'pending' editables; active/voided/reversed inmutables;
 * escape hatch gobernado app.allow_receipt_item_edit='on').
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261114160000_cp_receipt_items_immutable.sql';

function sql(): string {
  return readFileSync(resolve(process.cwd(), MIGRATION), 'utf8');
}

describe('migración 20261114160000 — inmutabilidad económica de receipt_items', () => {
  it('crea la función trigger y el trigger BEFORE UPDATE (solo modificación)', () => {
    const s = sql();
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.trg_fn_receipt_items_economic_immutable\(\)/);
    expect(s).toMatch(/CREATE TRIGGER trg_receipt_items_economic_immutable/);
    expect(s).toMatch(/BEFORE UPDATE ON public\.receipt_items/);
    expect(s).toMatch(/FOR EACH ROW/);
    expect(s).not.toMatch(/BEFORE UPDATE OR DELETE/); // v2: DELETE sin guard (cascada/cleanup)
  });

  it('consulta el estado del padre por NEW.receipt_id (guard solo UPDATE)', () => {
    const s = sql();
    expect(s).toMatch(/IF TG_OP <> 'UPDATE' THEN/);
    expect(s).toMatch(/v_receipt_id := NEW\.receipt_id/);
    expect(s).toMatch(/SELECT r\.status INTO v_status\s+FROM public\.receipts r\s+WHERE r\.id = v_receipt_id/);
  });

  it('bloquea todo estado distinto de pending con código de error único', () => {
    const s = sql();
    expect(s).toMatch(/IF v_status <> 'pending' AND NOT v_authorized THEN/);
    expect(s).toMatch(/ERR_RECEIPT_ITEM_IMMUTABLE/);
    // El mensaje declara el procedimiento autorizado (reversión/anulación o escape hatch)
    expect(s).toMatch(/reversión\/anulación controlada \+ recepción correctiva/);
    expect(s).toMatch(/app\.allow_receipt_item_edit = ''on''/);
  });

  it('escape hatch gobernado: current_setting con missing_ok y valor por defecto off', () => {
    const s = sql();
    expect(s).toMatch(/current_setting\('app\.allow_receipt_item_edit', true\)/);
    expect(s).toMatch(/coalesce\(\s*current_setting\('app\.allow_receipt_item_edit', true\), 'off'\) = 'on'/);
  });

  it('no bloquea la cascada cuando el padre ya no existe', () => {
    const s = sql();
    expect(s).toMatch(/IF v_status IS NULL THEN/);
  });

  it('es idempotente (DROP TRIGGER IF EXISTS antes de crear)', () => {
    expect(sql()).toMatch(/DROP TRIGGER IF EXISTS trg_receipt_items_economic_immutable ON public\.receipt_items/);
  });

  it('documenta por qué el DELETE no se bloquea a nivel de fila (cascada FK + RLS ya existente)', () => {
    expect(sql()).toMatch(/El DELETE NO se bloquea a nivel de fila/);
    expect(sql()).toMatch(/receipt_items_delete_denied/);
    expect(sql()).toMatch(/session_replication_role/);
  });

  it('sin DDL de esquema, sin RLS nueva: solo el invariante de inmutabilidad', () => {
    const s = sql();
    expect(s).not.toMatch(/\bCREATE TABLE\b/i);
    expect(s).not.toMatch(/\bALTER TABLE\b/i);
    expect(s).not.toMatch(/\bDROP TABLE\b/i);
    expect(s).not.toMatch(/\bCREATE POLICY\b/i);
    expect(s).not.toMatch(/\bDROP POLICY\b/i);
    expect(s).not.toMatch(/\bCREATE INDEX\b/i);
  });

  it('documenta compatibilidad con los flujos canónicos vigentes', () => {
    const s = sql();
    expect(s).toMatch(/register_reception/);
    expect(s).toMatch(/update_receipt_item_tasa/);
    expect(s).toMatch(/confirm_pending_reception/);
    expect(s).toMatch(/delete_pending_reception/);
    expect(s).toMatch(/reverse_receipt_v2/);
  });
});
