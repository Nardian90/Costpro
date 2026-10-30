/**
 * MISIÓN CP-CAT-MAESTRO-002 (2026-10-30) — F2: propagación de imagen compartida.
 *
 * Contrato estático de la migración:
 *   20261030120000 — fn_master_apply_identity_changes propaga image_path a
 *   products.image_url de las filas vinculadas.
 *
 * Invariantes verificados:
 *  - La propagación de imagen SOLO ocurre cuando el cambio incluye image_path.
 *  - Solo toca image_url/updated_at: jamás precio, costo ni existencias.
 *  - La función conserva SECURITY DEFINER + search_path + guard fail-closed.
 *  - ACL: EXECUTE revocado a PUBLIC/anon/authenticated; concedido a service_role.
 *  - No elimina objetos del bucket (solo cambia referencias).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261030120000_cp_catalogo_master_image_propagation.sql';

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), 'utf8');
}

describe('20261030120000 — propagación de imagen compartida del maestro', () => {
  const s = read(MIGRATION);

  it('redefine fn_master_apply_identity_changes conservando SECURITY DEFINER y search_path', () => {
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_master_apply_identity_changes/);
    expect(s).toMatch(/SECURITY DEFINER/);
    expect(s).toMatch(/SET search_path TO 'public'/);
  });

  it('propaga image_path a products.image_url SOLO cuando el cambio incluye imagen', () => {
    expect(s).toMatch(/IF p_changes->>'image_path' IS NOT NULL THEN/);
    expect(s).toMatch(/UPDATE public\.products pr\s+SET image_url = m\.image_path/);
    expect(s).toMatch(/WHERE m\.id = pr\.master_product_id\s+AND pr\.master_product_id = p_master_id/);
  });

  it('no toca datos comerciales: el UPDATE de propagación solo cambia image_url y updated_at', () => {
    const bloque = s.slice(s.indexOf("IF p_changes->>'image_path' IS NOT NULL"));
    expect(bloque).toMatch(/SET image_url = m\.image_path,\s+updated_at = now\(\)/);
    expect(bloque).not.toMatch(/price|cost_price|stock_current|min_stock/);
  });

  it('cada propagación exige maestro con imagen vigente (m.image_path IS NOT NULL)', () => {
    const bloque = s.slice(s.indexOf("IF p_changes->>'image_path' IS NOT NULL"));
    expect(bloque).toMatch(/AND m\.image_path IS NOT NULL/);
  });

  it('no elimina objetos del bucket: solo cambia referencias', () => {
    expect(s).not.toMatch(/storage\.objects|supabase_storage|DELETE FROM storage|remove.*object/i);
  });

  it('conserva la propagación histórica de SKU/nombre y el registro por campo en master_change_log', () => {
    expect(s).toMatch(/IF v_new_sku IS NOT NULL OR p_changes->>'name' IS NOT NULL THEN/);
    expect(s).toMatch(/INSERT INTO public\.master_change_log/);
    expect(s).toMatch(/v_changes_applied := v_changes_applied \|\| jsonb_build_object/);
  });

  it('ACL: EXECUTE revocado a PUBLIC/anon/authenticated y concedido solo a service_role', () => {
    expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.fn_master_apply_identity_changes\(uuid, jsonb, uuid, uuid, uuid\) FROM PUBLIC, anon, authenticated;/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.fn_master_apply_identity_changes\(uuid, jsonb, uuid, uuid, uuid\) TO service_role;/);
  });

  it('incluye guard fail-closed de verificación post-instalación', () => {
    expect(s).toMatch(/CP-CAT-MAESTRO-002-GUARD/);
    expect(s).toMatch(/DO \$guard\$/);
    expect(s).toMatch(/RAISE EXCEPTION 'CP-CAT-MAESTRO-002-GUARD/);
  });

  it('documenta reversibilidad e idempotencia y prohíbe aplicación directa a producción', () => {
    expect(s).toMatch(/REVERSIBILIDAD/);
    expect(s).toMatch(/IDEMPOTENCIA|IDEMPOTENTE/i);
    expect(s).toMatch(/NO aplicar a producción sin autorización/);
  });
});
