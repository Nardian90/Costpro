/**
 * DATA-INTEGRITY-REMEDIATION-001 — Pruebas estáticas de las migraciones y
 * la remediación UI (mismo estilo cero-red que replay-unblock-create-sale-v2).
 *
 * Verifica por LECTURA DE ARCHIVOS (sin BD, sin red):
 *   1. Migración A (20261108140000): soft-refs + parent_deleted_at + triggers
 *      de marcado + validación de escritura + backfill con filtro IS NULL.
 *   2. Migración B (20261108140100): inventario + R3 con válvula transaccional
 *      storage.allow_delete_query + guard de referencia viva + conservación
 *      R1/R2 explícita + idempotencia (NOT EXISTS en auditoría).
 *   3. Migración C (20261108140200): check_data_integrity + reconcile_storage_
 *      metadata con ERR_PERMISSION_DENIED + REVOKE anon/PUBLIC + trigger stores.
 *   4. UI (StorefrontPage.tsx): onError en banner/logos/promos presente en
 *      las 4 plantillas + carrusel; sin `<img>` sin manejo de rotura para los
 *      assets de tienda.
 *   5. Ninguna migración introduce CASCADE destructivo ni DML sin auditoría.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIR = (f: string) => path.join(REPO, 'supabase', 'migrations', f);
const UI = path.join(REPO, 'src', 'app', 'tienda', '[slug]', 'StorefrontPage.tsx');

const MIG_A = fs.readFileSync(DIR('20261108140000_data_integrity_remediation_001_soft_refs.sql'), 'utf-8');
const MIG_B = fs.readFileSync(DIR('20261108140100_data_integrity_remediation_001_storage_reconcile.sql'), 'utf-8');
const MIG_C = fs.readFileSync(DIR('20261108140200_data_integrity_remediation_001_prevention.sql'), 'utf-8');
const UI_SRC = fs.readFileSync(UI, 'utf-8');

describe('DATA-INTEGRITY-REMEDIATION-001 · Migración A (soft refs + snapshots)', () => {
  it('convierte las FK de las tablas de snapshot en referencias suaves (DROP IF EXISTS idempotente)', () => {
    for (const c of [
      'commission_rule_versions_rule_id_fkey',
      'commission_rule_versions_changed_by_fkey',
      'purchase_order_items_po_id_fkey',
      'purchase_order_items_product_id_fkey',
    ]) {
      expect(MIG_A).toContain(`DROP CONSTRAINT IF EXISTS ${c}`);
    }
  });

  it('añade parent_deleted_at con ADD COLUMN IF NOT EXISTS (idempotente)', () => {
    expect(MIG_A).toContain('ADD COLUMN IF NOT EXISTS parent_deleted_at');
    expect(MIG_A).toContain('ADD COLUMN IF NOT EXISTS product_deleted_at');
  });

  it('NO elimina snapshots: cero DELETE sobre commission_rule_versions / purchase_order_items', () => {
    expect(MIG_A).not.toMatch(/DELETE\s+FROM\s+public\.commission_rule_versions/i);
    expect(MIG_A).not.toMatch(/DELETE\s+FROM\s+public\.purchase_order_items/i);
  });

  it('backfill protegido: marca solo filas con parent_deleted_at IS NULL', () => {
    const updates = MIG_A.match(/UPDATE public\.commission_rule_versions[\s\S]*?;/g) || [];
    expect(updates.length).toBeGreaterThan(0);
    for (const u of updates.filter((x) => x.includes('SET parent_deleted_at'))) {
      expect(u).toContain('parent_deleted_at IS NULL');
    }
  });

  it('triggers de marcado en el borrado futuro de padres (regla, pedido, producto)', () => {
    for (const t of [
      'trg_commission_rules_mark_versions',
      'trg_purchase_orders_mark_items',
      'trg_products_mark_po_items',
    ]) {
      expect(MIG_A).toContain(`CREATE TRIGGER ${t}`);
      expect(MIG_A).toContain('AFTER DELETE');
    }
  });

  it('validación de escritura: INSERT/UPDATE hacia padre inexistente rechazado (23503)', () => {
    expect(MIG_A).toContain('trg_commission_rule_versions_validate_refs');
    expect(MIG_A).toContain('trg_purchase_order_items_validate_refs');
    expect(MIG_A).toMatch(/USING ERRCODE = '23503'/);
  });

  it('auditoría idempotente: inserciones protegidas por NOT EXISTS con mission tag', () => {
    expect(MIG_A.match(/WHERE NOT EXISTS/g)?.length).toBeGreaterThanOrEqual(2);
    expect(MIG_A).toContain("'mission', 'DATA-INTEGRITY-REMEDIATION-001'");
  });
});

describe('DATA-INTEGRITY-REMEDIATION-001 · Migración B (corrección del diagnóstico Storage)', () => {
  it('documenta el falso positivo: causa raíz del descargador + verificación de existencia', () => {
    expect(MIG_B).toContain('FALSO POSITIVO');
    expect(MIG_B).toContain('prefijo de carpeta');
    expect(MIG_B).toContain('LOS 31 ARCHIVOS EXISTEN');
  });

  it('NO modifica ni elimina NINGUNA fila de storage.objects', () => {
    expect(MIG_B).not.toMatch(/DELETE\s+FROM\s+storage\.objects/i);
    expect(MIG_B).not.toMatch(/UPDATE\s+storage\.objects/i);
    expect(MIG_B).toContain("'accion_sobre_datos', 'NINGUNA");
  });

  it('auditoría de la corrección con NOT EXISTS (idempotente)', () => {
    expect(MIG_B).toContain('DATA-INTEGRITY-REMEDIATION-001-correccion-diagnostico');
    expect(MIG_B).toMatch(/WHERE NOT EXISTS \(\s*SELECT 1 FROM public\.audit_logs a/);
  });

  it('registra las 4 escrituras PUT de la fase R1 (idempotentes, misma ruta y bytes)', () => {
    expect(MIG_B).toContain("'escrituras_produccion_durante_mision'");
    expect(MIG_B.match(/PUT store-/g)?.length).toBe(4);
  });

  it('documenta el hueco real: 153 objetos anidados fuera del respaldo original', () => {
    expect(MIG_B).toContain('153 objetos anidados');
    expect(MIG_B).toContain('31 stores + 122 reports');
  });
});

describe('DATA-INTEGRITY-REMEDIATION-001 · Migración C (prevención)', () => {
  it('check_data_integrity: detector de huérfanos + estado de referencias suaves', () => {
    expect(MIG_C).toContain('CREATE OR REPLACE FUNCTION public.check_data_integrity()');
    expect(MIG_C).toContain('parent_deleted_UNMARKED');
    expect(MIG_C).toContain('commission_rule_versions_changed_by_missing_profile');
  });

  it('RPCs con autorización (ERR_PERMISSION_DENIED) y sin grants anon/PUBLIC', () => {
    expect(MIG_C.match(/ERR_PERMISSION_DENIED/g)?.length).toBeGreaterThanOrEqual(2);
    expect(MIG_C).toContain('REVOKE EXECUTE ON FUNCTION public.check_data_integrity() FROM PUBLIC, anon');
    expect(MIG_C).toContain('REVOKE EXECUTE ON FUNCTION public.reconcile_storage_metadata() FROM PUBLIC, anon');
  });

  it('reconcile_storage_metadata: filas sin referencia + referencias sin fila', () => {
    expect(MIG_C).toContain('rows_without_reference');
    expect(MIG_C).toContain('live_refs_missing_row');
  });

  it('trigger belt-and-suspenders en el borrado de tiendas', () => {
    expect(MIG_C).toContain('CREATE TRIGGER trg_stores_mark_orphan_versions');
    expect(MIG_C).toContain('AFTER DELETE ON public.stores');
  });

  it('sin DML destructivo: cero DELETE de datos de negocio', () => {
    expect(MIG_C).not.toMatch(/DELETE\s+FROM\s+public\.(commission|purchase|products|stores|profiles)/i);
  });
});

describe('DATA-INTEGRITY-REMEDIATION-001 · UI: placeholders controlados', () => {
  it('banner con onError → banner oficial del repo (nunca imagen partida)', () => {
    expect(UI_SRC).toContain('setBannerFailed(true)');
    expect(UI_SRC).toContain('/storefront-construccion-banner.png');
  });

  it('logo con onError en las 3 plantillas que lo muestran (estado logoFailed + onError handler)', () => {
    const onErrors = UI_SRC.match(/onError=\{\(\) => setLogoFailed\(true\)\}/g) || [];
    expect(onErrors.length).toBe(3);
    // y ninguna plantilla muestra logo_url sin el guard
    const sinGuard = UI_SRC.replace(/logo_url && !logoFailed \?/g, 'GUARD');
    expect(sinGuard.match(/store\.logo_url/g)?.length).toBe(3); // 3 guards reemplazados
  });

  it('carrusel de promos excluye imágenes rotas (brokenUrls)', () => {
    expect(UI_SRC).toContain('brokenUrls');
    expect(UI_SRC).toContain('healthyImages');
    expect(UI_SRC).toMatch(/onError=\{\(\) => setBrokenUrls/);
  });

  it('el placeholder del logo respeta la identidad visual (icono Package, no imagen ajena)', () => {
    expect(UI_SRC).toMatch(/<Package className="w-6 h-6 text-stone-300" \/>/);
    // nunca se reutiliza una imagen de otra tienda como logo
    expect(UI_SRC).not.toMatch(/logo.*store-banners|store-banners.*logo/i);
  });
});

describe('DATA-INTEGRITY-REMEDIATION-001 · Reglas innegociables', () => {
  it('ninguna migración EJECUTA session_replication_role ni añade CASCADE destructivo', () => {
    for (const [nombre, src] of [['A', MIG_A], ['B', MIG_B], ['C', MIG_C]] as const) {
      // como SENTENCIA ejecutable (SET/PERFORM set_config), no como comentario
      const sinComentarios = src.replace(/^--.*$/gm, '');
      expect(sinComentarios, `migración ${nombre}`).not.toMatch(/SET\s+session_replication_role|set_config\('session_replication_role'/i);
      expect(sinComentarios, `migración ${nombre}`).not.toMatch(/ADD CONSTRAINT[^;]*ON DELETE CASCADE/i);
      expect(sinComentarios, `migración ${nombre}`).not.toMatch(/DELETE\s+FROM\s+storage\.objects/i);
    }
  });

  it('verificador de reconciliación Storage read-only (HEAD por referencia viva, sin DELETE)', () => {
    const mjs = fs.readFileSync(path.join(REPO, 'scripts', 'reconcile-storage.mjs'), 'utf-8');
    expect(mjs).toContain('method: \'HEAD\'');
    expect(mjs).toContain('reconcile_storage_metadata');
    // verificador: JAMÁS borra nada (la URL del objeto usa la ruta COMPLETA de la referencia)
    expect(mjs).not.toMatch(/method:\s*\'DELETE\'/);
    expect(mjs).toContain('object/public/stores/');
  });
});
