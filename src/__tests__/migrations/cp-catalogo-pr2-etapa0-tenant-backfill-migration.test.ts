/**
 * MISIÓN CATÁLOGO MAESTRO (2026-10-28) — PR 2 · ETAPA 0.
 *
 * Contrato estático de la migración 20261028100000_cp_catalogo_etapa0_backfill
 * _products_tenant_id.sql: backfill DETERMINISTA de products.tenant_id desde
 * stores.tenant_id con 5 verificaciones fail-closed (V1-V5), manifiesto de
 * evidencia en audit_logs (antes/después) y aborto transaccional ante
 * inconsistencias no contempladas (misión §7).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIG = 'supabase/migrations/20261028100000_cp_catalogo_etapa0_backfill_products_tenant_id.sql';

function sql(): string {
  return readFileSync(resolve(process.cwd(), MIG), 'utf8');
}

describe('migración 20261028100000 — etapa 0: backfill determinista de tenant_id', () => {
  const s = sql();

  it('deriva el tenant EXCLUSIVAMENTE de la tienda propietaria (sin coincidencias aproximadas)', () => {
    // Único UPDATE del documento: JOIN stores por store_id, sin matching por nombre/SKU
    expect(s).toMatch(/UPDATE public\.products p\s+SET tenant_id = s\.tenant_id/);
    expect(s).toMatch(/FROM public\.stores s\s+WHERE s\.id = p\.store_id/);
    expect(s).toMatch(/p\.tenant_id IS NULL\s+AND s\.tenant_id IS NOT NULL/);
    // No hay matching aproximado por nombre o SKU en el UPDATE
    const updateBlock = s.slice(s.indexOf('UPDATE public.products'), s.indexOf('V4: la cantidad'));
    expect(updateBlock).not.toMatch(/lower\(|similarity|levenshtein|p\.name|p\.sku =/i);
  });

  it('contiene las 5 verificaciones fail-closed V1-V5 con RAISE EXCEPTION', () => {
    expect(s).toMatch(/ETAPA0-V3: .*ambiguos/);
    expect(s).toMatch(/ETAPA0-V2: .*contradicciones/);
    expect(s).toMatch(/ETAPA0-V4: .*cuantificaron|ETAPA0-V4: .*actualizaron/);
    expect(s).toMatch(/ETAPA0-V5: .*nulos restantes/);
    // V1: FK tiendas→organización (JOIN a tenants implícito por FK; el JOIN de verificación usa stores)
    expect(s).toMatch(/public\.stores s ON s\.id = p\.store_id/);
  });

  it('es transaccional: cualquier verificación fallida aborta (DO block con excepciones)', () => {
    expect(s).toMatch(/DO \$etapa0\$/);
    expect((s.match(/RAISE EXCEPTION 'ETAPA0-/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('persiste manifiesto de evidencia antes y después en audit_logs', () => {
    // 4 INSERT statements (global system + por-tienda × [antes, despues])
    // + 2 referencias en los EXISTS del bucle 'despues' = 6 ocurrencias literales
    expect((s.match(/CP_CATALOGO_ETAPA0_BACKFILL_TENANT_ID/g) || []).length).toBe(6);
    expect((s.match(/'fase', 'antes'/g) || []).length).toBe(2);
    expect((s.match(/'fase', 'despues'/g) || []).length).toBe(2);
    // Filas globales con table_name='system' (cumplen audit_logs_store_id_check sin store_id)
    expect((s.match(/'system', NULL, NULL/g) || []).length).toBe(2);
    // Filas por tienda con store_id (cumplen el constraint)
    expect((s.match(/'products', v_sid, NULL/g) || []).length).toBe(2);
  });

  it('es idempotente y cuantifica antes de modificar (dry-run interno)', () => {
    expect(s).toMatch(/nada que remediar \(0 filas/);
    // Cuantificación previa antes del UPDATE
    const preIdx = s.indexOf("jsonb_agg(jsonb_build_object(\n           'id', p.id");
    const updIdx = s.indexOf('UPDATE public.products');
    expect(preIdx).toBeGreaterThan(-1);
    expect(preIdx).toBeLessThan(updIdx);
  });

  it('no toca datos comerciales ni identificadores (alcance restringido a tenant_id)', () => {
    // Solo se actualizan tenant_id y updated_at
    expect(s).toMatch(/SET tenant_id = s\.tenant_id,\s*\n\s*updated_at =/);
    // Sin DELETE, sin TRUNCATE, sin cambios de esquema
    expect(s).not.toMatch(/DELETE FROM|TRUNCATE|ALTER TABLE|CREATE TABLE|DROP /i);
  });
});
