/**
 * MISIÓN 2026-11-08 — Verificación estática de la migración
 * 20261108120000_cp_catalogo_reconciliacion_datos_compartidos.sql
 * (complemento de CP-CAT-MAESTRO-003: categoría §3.3 «datos compartidos
 * desfasados de filas ya vinculadas» con la tienda como referencia).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261108120000_cp_catalogo_reconciliacion_datos_compartidos.sql';

function sql(): string {
  return readFileSync(resolve(process.cwd(), MIGRATION), 'utf8');
}

function fnBody(name: string): string {
  const s = sql();
  const re = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$function\\$\\n([\\s\\S]*?)\\n\\$function\\$;`
  );
  const m = s.match(re);
  if (!m) throw new Error(`función ${name} no encontrada en la migración`);
  return m[1];
}

describe('migración 20261108120000 — reconciliación de datos compartidos', () => {
  it('existe el archivo de migración', () => {
    expect(sql().length).toBeGreaterThan(5000);
  });

  it('solo gobernador del catálogo (is_catalog_governor) con anti-spoofing v2.12.9', () => {
    const body = fnBody('reconcile_store_catalog_shared_data');
    expect(body).toMatch(
      /WHEN auth\.role\(\) = 'service_role'\s+THEN COALESCE\(p_user_id, auth\.uid\(\)\)/
    );
    expect(body).toMatch(/is_catalog_governor\(v_tenant, v_caller_uid\)/);
    expect(body).toMatch(/ERR_UNAUTHORIZED: solo el gobernador del catálogo reconcilia/);
  });

  it('dry-run completo: reporta without_update_master sin escribir', () => {
    const body = fnBody('reconcile_store_catalog_shared_data');
    expect(body).toMatch(/p_dry_run/);
    expect(body).toMatch(/'action', 'would_update_master'/);
    expect(body).toMatch(/'dry_run', p_dry_run/);
  });

  it('tienda como REFERENCIA: el maestro adopta nombre/imagen locales desfasados', () => {
    const body = fnBody('reconcile_store_catalog_shared_data');
    expect(body).toMatch(/jsonb_set\(v_changes, '\{name\}', to_jsonb\(r\.local_name\)\)/);
    expect(body).toMatch(/jsonb_set\(v_changes, '\{image_path\}', to_jsonb\(r\.local_image\)\)/);
  });

  it('reutiliza fn_master_apply_identity_changes (auditoría por campo + propagación diseñada)', () => {
    const body = fnBody('reconcile_store_catalog_shared_data');
    expect(body).toMatch(/public\.fn_master_apply_identity_changes\(/);
  });

  it('imagen: NULL local no borra la imagen del maestro (sincroniza solo la fila local)', () => {
    const body = fnBody('reconcile_store_catalog_shared_data');
    expect(body).toMatch(/'action', 'local_image_synced'/);
    expect(body).toMatch(/UPDATE public\.products\s+SET image_url = r\.master_image/);
  });

  it('conflictos documentados sin fusión: SKU vinculado ≠ maestro y aislamiento por fila', () => {
    const body = fnBody('reconcile_store_catalog_shared_data');
    expect(body).toMatch(/ERR_SKU_MISMATCH_LINKED/);
    expect(body).toMatch(/EXCEPTION WHEN OTHERS THEN/);
    expect(body).toMatch(/'reason', 'ERR_ROW_PROCESSING'/);
  });

  it('reporta filas sin vínculo (→ incorporate) y maestros sin correspondencia (no elimina)', () => {
    const body = fnBody('reconcile_store_catalog_shared_data');
    expect(body).toMatch(/'unlinked_rows', v_unlinked/);
    expect(body).toMatch(/'masters_without_local_correspondence', v_orphans/);
    expect(body).toMatch(/incorporate_store_products_to_master para altas\/vínculos/);
  });

  it('jamás elimina maestros (misión §3.5: no destructiva)', () => {
    expect(sql()).not.toMatch(/DELETE FROM public\.master_products/);
  });

  it('no toca datos comerciales (sin price/cost_price/stock_current en el cuerpo)', () => {
    const body = fnBody('reconcile_store_catalog_shared_data');
    expect(body).not.toMatch(/price/i);
    expect(body).not.toMatch(/stock_current/i);
  });

  it('auditoría de la operación aplicada (RECONCILE_SHARED_DATA_FROM_STORE)', () => {
    const body = fnBody('reconcile_store_catalog_shared_data');
    expect(body).toMatch(/RECONCILE_SHARED_DATA_FROM_STORE/);
  });

  it('ACL: REVOKE PUBLIC/anon + GRANT authenticated/service_role', () => {
    expect(sql()).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.reconcile_store_catalog_shared_data\(uuid, boolean, uuid\) FROM PUBLIC, anon;\s*\nGRANT EXECUTE ON FUNCTION public\.reconcile_store_catalog_shared_data\(uuid, boolean, uuid\) TO authenticated, service_role;/
    );
  });

  it('guard fail-closed CP-CAT-RECONCILE-GUARD post-migración', () => {
    expect(sql()).toMatch(/CP-CAT-RECONCILE-GUARD/);
    expect(sql()).toMatch(/autorización de gobernador ausente/);
    expect(sql()).toMatch(/la RPC no debe tocar datos comerciales/);
  });

  it('no redefine register_reception (la canónica vive en 20261107120000 — sin mecanismos paralelos)', () => {
    expect(sql()).not.toMatch(/CREATE OR REPLACE FUNCTION public\.register_reception/);
    expect(sql()).not.toMatch(/ensure_master_product_for_local/);
  });
});
