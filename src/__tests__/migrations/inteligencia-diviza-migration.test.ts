/**
 * inteligencia-diviza-migration.test.ts — Contrato de la migración
 * 20261027000000_inteligencia_diviza_source.sql (misión IC-DIVIZA).
 *
 * Verifica SOBRE EL ARCHIVO (sin BD, contrato estático):
 *  1. CHECK de source ampliado a ('BCC','elToque','Diviza') — idempotente.
 *  2. Las 4 funciones vivas (create_sale_v2, create_cash_flow_document,
 *     get_cash_balances_by_currency, open_cash_shift) amplían el paso
 *     informal a source IN ('elToque','Diviza') con prioridad por frescura
 *     (ORDER BY rate_date DESC, captured_at DESC LIMIT 1).
 *  3. La etiqueta del rate_source es dinámica ('global_' || lower(er.source))
 *     — refleja el proveedor que ganó, sin hardcodear 'global_eltoque'.
 *  4. La jerarquía contable queda INTACTA: store → BCC seg3 → informal →
 *     fail-closed; y el staleness de 45 días se conserva.
 *  5. NINGÚN cambio de datos: sin UPDATE/INSERT/DELETE de filas existentes.
 *  6. El histórico elToque no se re-atribuye (no hay UPDATE de source).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SQL = readFileSync(
  join(__dirname, '../../../supabase/migrations/20261027000000_inteligencia_diviza_source.sql'),
  'utf8',
);

describe('migración 20261027000000_inteligencia_diviza_source.sql', () => {
  it('incluye el CHECK de fuente con Diviza y es idempotente (DO + IF EXISTS)', () => {
    expect(SQL).toMatch(/exchange_rates_source_check/);
    expect(SQL).toMatch(/CHECK \(source IN \('BCC', 'elToque', 'Diviza'\)\)/);
    // Idempotente: solo sustituye si el CHECK vigente NO incluye Diviza
    expect(SQL).toMatch(/pg_get_constraintdef\(c\.oid\) NOT LIKE '%Diviza%'/);
    expect(SQL).toMatch(/DO \$do\$/);
  });

  it('redefine las 4 funciones vivas con CREATE OR REPLACE', () => {
    for (const fn of [
      'create_sale_v2',
      'create_cash_flow_document',
      'get_cash_balances_by_currency',
      'open_cash_shift',
    ]) {
      const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`);
      expect(SQL.match(re)).not.toBeNull();
    }
  });

  it('el paso informal de las 4 funciones considera Diviza y elToque con prioridad por frescura', () => {
    const widened = SQL.match(/er\.source IN \('elToque', 'Diviza'\)/g) ?? [];
    expect(widened.length).toBeGreaterThanOrEqual(6); // 3 en create_sale_v2 + 3 funciones
    // Prioridad explícita por frescura en cada paso informal ampliado
    const informalSteps = SQL.match(
      /er\.source IN \('elToque', 'Diviza'\)[\s\S]{0,200}?ORDER BY er\.rate_date DESC, er\.captured_at DESC LIMIT 1/g,
    ) ?? [];
    expect(informalSteps.length).toBeGreaterThanOrEqual(6);
  });

  it('la etiqueta rate_source es dinámica (refleja el proveedor que ganó)', () => {
    expect(SQL).toMatch(/'global_' \|\| lower\(er\.source\)/);
    // Sin etiqueta hardcodeada en los SELECT ampliados
    expect(SQL).not.toMatch(/SELECT er\.rate, 'global_eltoque'/);
  });

  it('la jerarquía contable queda intacta: store → BCC seg3 → informal → fail-closed', () => {
    // Paso BCC seg3 antes del informal
    const bccIdx = SQL.indexOf("er.source = 'BCC' AND er.segment = '3'");
    const informalIdx = SQL.indexOf("er.source IN ('elToque', 'Diviza')");
    expect(bccIdx).toBeGreaterThan(0);
    expect(informalIdx).toBeGreaterThan(bccIdx);
    // Fail-closed conservado
    expect(SQL).toMatch(/ERR_EXCHANGE_RATE_UNAVAILABLE/);
    expect(SQL).toMatch(/ERR_RATE_STALE/);
    // Staleness de 45 días sin cambio
    expect(SQL).toMatch(/INTERVAL '45 days'/);
    // store_exchange_rates sigue siendo la primera fuente
    expect(SQL).toMatch(/FROM public\.store_exchange_rates ser/);
  });

  it('NO modifica datos existentes (sin UPDATE/INSERT/DELETE sobre exchange_rates)', () => {
    // El único UPDATE posible sería dentro de funciones; el SQL top-level
    // (fuera de cuerpos de función) no debe contener mutaciones de datos.
    // Chequeo práctico: ninguna sentencia UPDATE ... exchange_rates con SET source
    expect(SQL).not.toMatch(/UPDATE\s+public\.exchange_rates\s+SET\s+source/i);
    expect(SQL).not.toMatch(/INSERT INTO public\.exchange_rates\s+VALUES/i);
    expect(SQL).not.toMatch(/DELETE FROM public\.exchange_rates/i);
  });

  it('documenta el contrato de procedencia (nunca Diviza atribuida a elToque)', () => {
    expect(SQL).toMatch(/Procedencia verdadera e inmutable por fila/);
    expect(SQL).toMatch(/NUNCA se registra una cotización de Diviza atribuida a/i);
    expect(SQL).toMatch(/no se insertan, actualizan ni re-atribuyen filas existentes/i);
  });

  it('preserva los cuerpos vivos: sin ediciones de lógica contable (totales/impuestos)', () => {
    // La migración se generó desde la definición VIVA: los bloques críticos
    // de create_sale_v2 deben seguir presentes verbatim.
    expect(SQL).toMatch(/v_calculated_total := v_calculated_subtotal - v_discount_amount \+ v_calculated_tax/);
    expect(SQL).toMatch(/ERR_TOTAL_MISMATCH/);
    expect(SQL).toMatch(/v_tax_value := GREATEST\(0, v_taxable_base - COALESCE\(v_tc\.min_exempt, 0\)\) \* v_tc\.value \/ 100/);
  });
});
