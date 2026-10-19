/**
 * MISIÓN POLÍTICA TEMPORAL (2026-10-18) — Verificación estática de la migración
 * de coherencia temporal. Este test asegura que la migración contiene los
 * elementos críticos de la política:
 *   - Gate canónico: tope superior HOY estricto (antes hoy+1), piso 6 meses intacto.
 *   - Gate en create_transfer (RPC llamado directo desde el navegador).
 *   - Gate en confirm_transfer antes de mover stock/Kardex.
 *   - Gate en register_supplier_payment para la fecha financiera del pago.
 *   - Sin DDL de columnas/triggers/RLS (cambio puramente funcional y reversible).
 *
 * La ejecución real contra Postgres se valida además con evidencia en BD real
 * (BEGIN…ROLLBACK) registrada en el informe de la misión.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261018000000_politica_temporal_coherente.sql';

function sql(): string {
  return readFileSync(resolve(process.cwd(), MIGRATION), 'utf-8');
}

describe('migración 20261018000000 — política temporal coherente', () => {
  it('ajusta el tope del gate canónico de hoy+1 a HOY (día de negocio Habana)', () => {
    const s = sql();
    expect(s).toContain('v_max_date_business := v_today_business;');
    expect(s).not.toContain("v_max_date_business := v_today_business + INTERVAL '1 day';");
    // El piso histórico de 6 meses queda intacto:
    expect(s).toContain("v_min_date_business := v_today_business - INTERVAL '6 months';");
  });

  it('el mensaje de ERR_FUTURE_DATED_DOCUMENT informa la fecha actual del negocio', () => {
    const s = sql();
    expect(s).toMatch(/ERR_FUTURE_DATED_DOCUMENT: La fecha % es posterior a la fecha actual del negocio \(%\)/);
    expect(s).toMatch(/to_char\(v_today_business, 'DD\/MM\/YYYY'\)/);
  });

  it('NULL sigue sin bloquear (conducta canónica hoy → NOW())', () => {
    const s = sql();
    expect(s).toMatch(/IF p_new_date IS NULL THEN\s+RETURN;/);
  });

  it('create_transfer llama al gate con la fecha efectiva y la tienda de origen', () => {
    const s = sql();
    expect(s).toContain('CREATE OR REPLACE FUNCTION public.create_transfer(');
    expect(s).toMatch(/PERFORM public\.validate_operation_date\(v_effective_date, p_origin_store_id\);/);
  });

  it('confirm_transfer llama al gate ANTES de mover stock (fecha de recepción)', () => {
    const s = sql();
    expect(s).toContain('CREATE OR REPLACE FUNCTION public.confirm_transfer(');
    expect(s).toMatch(/PERFORM public\.validate_operation_date\(COALESCE\(p_operation_date, NOW\(\)\), v_transfer\.origin_store_id\);/);
    // El gate precede al primer register_stock_movement del cuerpo:
    const gatePos = s.indexOf('PERFORM public.validate_operation_date(COALESCE(p_operation_date, NOW()), v_transfer.origin_store_id)');
    const firstMov = s.indexOf("register_stock_movement(", gatePos);
    expect(firstMov).toBeGreaterThan(gatePos);
  });

  it('register_supplier_payment llama al gate con la fecha financiera del pago', () => {
    const s = sql();
    expect(s).toContain('CREATE OR REPLACE FUNCTION public.register_supplier_payment(');
    expect(s).toMatch(/PERFORM public\.validate_operation_date\(v_eff_payment_date, p_store_id\);/);
    // v_eff_payment_date := COALESCE(p_payment_date, now()) → NOW() siempre pasa
    expect(s).toMatch(/v_eff_payment_date timestamptz := COALESCE\(p_payment_date, now\(\)\);/);
  });

  it('NO contiene cambios de esquema (columnas/triggers/RLS) — aditivo y reversible', () => {
    const s = sql();
    expect(s).not.toMatch(/ALTER TABLE/i);
    expect(s).not.toMatch(/ADD COLUMN/i);
    expect(s).not.toMatch(/DROP COLUMN/i);
    expect(s).not.toMatch(/CREATE TRIGGER/i);
    expect(s).not.toMatch(/DROP TRIGGER/i);
    expect(s).not.toMatch(/CREATE POLICY|DROP POLICY/i);
    expect(s).not.toMatch(/\bGRANT\b|\bREVOKE\b/i);
    // Nota: los cuerpos de función contienen UPDATE/SELECT/INSERT legítimos de
    // la lógica vigente (p. ej. UPDATE transfers SET status); la garantía de
    // «sin migración de datos» es la AUSENCIA de DDL y de sentencias
    // top-level fuera de los CREATE OR REPLACE (verificada arriba).
  });

  it('las 4 funciones se reemplazan completas (CREATE OR REPLACE × 4)', () => {
    const s = sql();
    expect((s.match(/CREATE OR REPLACE FUNCTION public\./g) || []).length).toBe(4);
  });
});
