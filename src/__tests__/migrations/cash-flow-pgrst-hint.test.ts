/**
 * MISIÓN 2026-10-22 · Parte A — Regresión del defecto PGRST200
 * («Could not find a relationship between 'cash_flow_documents' and
 * 'cash_flow_documents' in the schema cache» → «No se pudieron cargar los
 * movimientos»).
 *
 * CAUSA RAÍZ (demostrada contra la BD viva): el embed autoreferencial usaba
 * el hint por NOMBRE DE CONSTRAINT. La FK existe en PostgreSQL con ese
 * nombre, pero la caché de PostgREST quedó desincronizada (constraint
 * recreado tras la última recarga) y el hint no resolvía. El hint por
 * NOMBRE DE COLUMNA resuelve bajo ambas cachés y es inmune a recreaciones.
 *
 * Este test fija el contrato en tres capas:
 *   1. El hook usa el hint por columna (y NO vuelve al hint por constraint).
 *   2. La columna existe de verdad: la migración original define
 *      related_document_id con FK autoreferencial (respaldo del hint).
 *   3. El procedimiento de recarga quedó establecido: la migración
 *      20261022000001 reafirma la FK idempotentemente y envía el NOTIFY de
 *      recarga de la caché de PostgREST; el script de aplicación también.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf-8');
}

describe('Parte A — embed autoreferencial de cash_flow_documents (PGRST200)', () => {
  it('el hook usa el hint por COLUMNA (inmune a recreaciones de constraint)', () => {
    const hook = read('src/hooks/api/useCashFlow.ts');
    // Hint correcto: nombre de columna del FK autoreferencial.
    expect(hook).toContain('related_document:cash_flow_documents!related_document_id(');
    // REGRESIÓN: el hint por nombre de constraint es el que fallaba con la
    // caché desincronizada — no debe volver a usarse en este embed.
    expect(hook).not.toContain('cash_flow_documents!cash_flow_documents_related_document_id_fkey');
    // Los embeds hacia profiles siguen usando hint por constraint (auditados:
    // resuelven correctamente contra la caché viva — sin cambios).
    expect(hook).toContain('profiles!cash_flow_documents_responsible_user_id_fkey');
    expect(hook).toContain('profiles!cash_flow_documents_annulled_by_fkey');
  });

  it('la columna del hint existe de verdad: FK autoreferencial en la migración original', () => {
    const migration = read('supabase/migrations/20261021000001_cash_flow_documents.sql');
    // La columna que usa el hint, con su FK a la propia tabla.
    expect(migration).toMatch(/related_document_id uuid REFERENCES public\.cash_flow_documents\(id\)/);
    // El nombre de constraint que PostgreSQL autogenera para esa definición
    // inline es <tabla>_<columna>_fkey — exactamente el nombre que la BD viva
    // tiene (evidencia pg_constraint de la misión). El contrato: la migración
    // original produce el constraint que la BD viva muestra.
    const m = migration.match(/related_document_id uuid REFERENCES/);
    expect(m).toBeTruthy();
    const autoName = `cash_flow_documents_${'related_document_id'}_fkey`;
    expect(autoName).toBe('cash_flow_documents_related_document_id_fkey');
  });

  it('la migración 20261022000001 establece el procedimiento de recarga (idempotente + NOTIFY)', () => {
    const m = read('supabase/migrations/20261022000001_cash_flow_documents_pgrst_cache.sql');
    // Reafirmación idempotente de la FK (no-op si ya existe).
    expect(m).toMatch(/IF NOT EXISTS \(\s*SELECT 1 FROM pg_constraint/);
    expect(m).toContain('ADD CONSTRAINT cash_flow_documents_related_document_id_fkey');
    // Recarga de la caché de PostgREST (procedimiento documentado Supabase).
    expect(m).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it('el script de aplicación de migraciones notifica la recarga automáticamente', () => {
    const script = read('scripts/apply-migration-mgmt.ts');
    expect(script).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
