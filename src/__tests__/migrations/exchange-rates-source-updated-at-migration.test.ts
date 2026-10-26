/**
 * exchange-rates-source-updated-at-migration.test.ts — Contrato de la
 * migración 20261027010000_exchange_rates_source_updated_at.sql (misión
 * IC-DIVIZA-002 §5: persistir la hora de actualización del proveedor).
 *
 * Verifica SOBRE EL ARCHIVO (sin BD, contrato estático):
 *   1. ADD COLUMN IF NOT EXISTS source_updated_at timestamptz — idempotente.
 *   2. La columna queda NULLABLE y SIN default — ningún upsert legado
 *      (BCC, elToque histórico, manual, bulk-upload Excel) puede romperse.
 *   3. COMMENT ON COLUMN documenta la distinción source_updated_at vs
 *      captured_at (proveedor vs CostPro).
 *   4. NINGÚN cambio de datos: sin UPDATE/INSERT/DELETE de filas existentes.
 *   5. NINGUNA función, CHECK, RLS o índice se modifica: el paso informal
 *      contable sigue priorizando (rate_date DESC, captured_at DESC).
 *   6. DO de sanidad: excepción si la columna no fuera nullable/sin default.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SQL = readFileSync(
  join(__dirname, '../../../supabase/migrations/20261027010000_exchange_rates_source_updated_at.sql'),
  'utf8',
);

describe('migración 20261027010000_exchange_rates_source_updated_at.sql', () => {
  it('añade la columna de forma aditiva e idempotente (ADD COLUMN IF NOT EXISTS)', () => {
    expect(SQL).toMatch(/ALTER TABLE public\.exchange_rates\s+ADD COLUMN IF NOT EXISTS source_updated_at timestamptz/);
  });

  it('la columna es nullable y sin default — los upserts legados no se rompen', () => {
    // ADD COLUMN sin NOT NULL y sin DEFAULT: timestamptz puro.
    const addColumn = SQL.match(/ADD COLUMN IF NOT EXISTS source_updated_at timestamptz\s*;/);
    expect(addColumn).not.toBeNull();
    expect(SQL).not.toMatch(/source_updated_at\s+timestamptz\s+NOT NULL/i);
    expect(SQL).not.toMatch(/source_updated_at\s+timestamptz\s+DEFAULT/i);
    // El DO de sanidad exige nullable + sin default (falla si alguien lo cambia)
    expect(SQL).toMatch(/is_nullable <> 'YES' OR column_default IS NOT NULL/);
    expect(SQL).toMatch(/RAISE EXCEPTION 'source_updated_at debe ser nullable y sin default \(aditiva\)'/);
  });

  it('documenta la distinción proveedor vs CostPro (COMMENT ON COLUMN)', () => {
    expect(SQL).toMatch(/COMMENT ON COLUMN public\.exchange_rates\.source_updated_at IS/);
    expect(SQL).toMatch(/Hora en que el PROVEEDOR actualizó la cotización/);
    expect(SQL).toMatch(/Distinta de captured_at/);
    expect(SQL).toMatch(/NO es criterio de frescura contable/);
  });

  it('NINGÚN cambio de datos: sin UPDATE/INSERT/DELETE de filas existentes', () => {
    expect(SQL).not.toMatch(/\bUPDATE\s+public\.exchange_rates\b/i);
    expect(SQL).not.toMatch(/\bINSERT\s+INTO\s+public\.exchange_rates\b/i);
    expect(SQL).not.toMatch(/\bDELETE\s+FROM\s+public\.exchange_rates\b/i);
    expect(SQL).not.toMatch(/\bTRUNCATE\b/i);
    // El histórico no se re-atribuye ni re-fecha: sin UPDATE de source/rate_date
    expect(SQL).not.toMatch(/SET\s+(source|rate_date|rate)\s*=/i);
  });

  it('NINGUNA función, CHECK, RLS o índice se modifica (superficie intacta)', () => {
    expect(SQL).not.toMatch(/CREATE OR REPLACE FUNCTION/i);
    expect(SQL).not.toMatch(/DROP CONSTRAINT/i);
    expect(SQL).not.toMatch(/ADD CONSTRAINT/i);
    expect(SQL).not.toMatch(/CREATE POLICY/i);
    expect(SQL).not.toMatch(/DROP POLICY/i);
    expect(SQL).not.toMatch(/CREATE (UNIQUE )?INDEX/i);
    expect(SQL).not.toMatch(/CREATE ROLE|GRANT|REVOKE/i);
    // Sin ALTER TABLE adicionales más allá de la columna nueva
    const alters = SQL.match(/ALTER TABLE[^;]+;/g) ?? [];
    expect(alters.length).toBe(1);
  });
});
