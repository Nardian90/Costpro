/**
 * MISIÓN CP-RECEPCIONES-CATALOGO-MAESTRO-001 (2026-11-25) — contrato estático
 * de las migraciones y del frontend de la misión.
 *
 * Migración 1 (20261125130000 — renumeración supervisada):
 *   - Renumeración transaccional de los 16 maestros AUTO-* de la recepción
 *     ENT-000005-2026 al consecutivo OFICIAL (257..272) usando el generador
 *     oficial (cero segunda fuente de verdad), con el MISMO advisory lock por
 *     tenant que el generador (serialización contra tiendas creando
 *     productos a la vez).
 *   - master_change_log + audit_logs por producto y de lote; idempotente
 *     (already_renumbered); fail-closed ante cualquier desviación; guard de
 *     integridad intra-transacción (receipt_items/stock_movements/kardex/
 *     saldos antes == después); REVOKE a PUBLIC/anon/authenticated.
 *
 * Migración 2 (20261125131000 — altas en borradores):
 *   - add_reception_items: líneas nuevas en recepciones PENDING con
 *     resolución por el escritor canónico (resolve_reception_import_rows),
 *     códigos oficiales, validaciones de coherencia, protección anti-
 *     duplicados con salto idempotente, recalculo del total y auditoría;
 *     SIN tocar inventario (ni movimientos ni kardex ni WAC).
 *   - save_pending_reception_changes: guardado ATÓMICO de cabecera +
 *     actualizaciones + altas en una sola transacción.
 *
 * Frontend:
 *   - El generador OCR-* client-side fue eliminado (paridad con AUTO-*
 *     eliminado en CP-RECEP-001): sin SKU detectado, la fila viaja sin
 *     código y el servidor asigna el oficial.
 *   - El modal de edición de borradores expone el panel de altas con sus
 *     data-testids y el payload del guardado incluye newItems.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const M_RENUM = 'supabase/migrations/20261125130000_cp_catmaestro001_renumber_enervida_auto.sql';
const M_ADD = 'supabase/migrations/20261125131000_cp_catmaestro001_add_reception_items.sql';
const M_ACL = 'supabase/migrations/20261125132000_cp_catmaestro001_reception_rpc_acl.sql';
const M_DROP = 'supabase/migrations/20261125133000_cp_catmaestro001_drop_renumber_tool.sql';
const USE_RECEPTION_STATE = 'src/components/views/terminal/views/inventory/useReceptionState.ts';
const DETAILS_MODAL = 'src/components/views/terminal/views/receptions/ReceptionDetailsModal.tsx';
const ADD_PANEL = 'src/components/views/terminal/views/receptions/ReceptionAddItemsPanel.tsx';
const HISTORY_VIEW = 'src/components/views/terminal/views/receptions/useReceptionsHistoryView.ts';
const PATCH_ROUTE = 'src/app/api/inventory/receptions/[id]/route.ts';

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), 'utf8');
}

describe('20261125130000 — renumeración supervisada de los 16 AUTO-* de ENT-000005-2026', () => {
  const s = read(M_RENUM);

  it('existe la función y cubre EXACTAMENTE los 16 maestros de la recepción', () => {
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.cp_catmaestro001_renumber_auto_masters\(/);
    // Los 16 pares verificados (id + SKU antiguo exacto).
    expect(s).toMatch(/AUTO-MWV0TMXS-1/);
    expect(s).toMatch(/AUTO-MWV1C5KV-F/);
    expect(s).toMatch(/AUTO-MWV1D9VA-G/);
    expect(s).toMatch(/47380573-a546-4286-80fb-8d5ba374551e/);
    // El «Cable para Ecoflow» (recepción ajena) NO está en el alcance de
    // pares (los comentarios del expediente sí lo citan como EXCLUIDO).
    expect(s).not.toMatch(/"old_sku":\"AUTO-MWTIJE8Y-1\"/);
    expect(s).not.toMatch(/"old_sku":"AUTO-MWTIJE8Y-1"/);
  });

  it('usa el GENERADOR OFICIAL (cero segunda fuente de verdad) y su mismo lock', () => {
    expect(s).toMatch(/next_master_catalog_sku\(p_tenant\)/);
    expect(s).toMatch(/pg_advisory_xact_lock\(\s*hashtextextended\('cp_master_sku_consecutivo:/);
  });

  it('es transaccional, auditable e idempotente', () => {
    expect(s).toMatch(/p_dry_run boolean DEFAULT true/);
    expect(s).toMatch(/already_renumbered/);
    expect(s).toMatch(/master_change_log/);
    expect(s).toMatch(/audit_logs/);
    expect(s).toMatch(/CP_CATMAESTRO001_SKU_RENUMBER/);
    expect(s).toMatch(/CP_CATMAESTRO001_BATCH_RENUMBER/);
  });

  it('fail-closed ante desviaciones y protección de integridad', () => {
    expect(s).toMatch(/ERR_MASTER_NOT_FOUND/);
    expect(s).toMatch(/ERR_UNEXPECTED_SKU/);
    expect(s).toMatch(/ERR_LOCALS_IN_OTHER_STORES/);
    expect(s).toMatch(/ERR_MASTER_RACE/);
    // Guard intra-transacción: la corrección NO puede tocar la historia.
    expect(s).toMatch(/v_post_receipt_items <> v_snapshot_receipt_items/);
    expect(s).toMatch(/v_post_products IS DISTINCT FROM v_snapshot_products/);
  });

  it('superficie de ejecución restringida (solo Management API/service_role)', () => {
    expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.cp_catmaestro001_renumber_auto_masters\(boolean, uuid, uuid, uuid, uuid, jsonb\)\s*\n?\s*FROM PUBLIC, anon, authenticated/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.cp_catmaestro001_renumber_auto_masters\(boolean, uuid, uuid, uuid, uuid, jsonb\)\s*\n?\s*TO service_role/);
  });
});

describe('20261125131000 — altas de productos en borradores (add_reception_items)', () => {
  const s = read(M_ADD);

  it('existe la RPC con guard de estado pendiente-only y autorización', () => {
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.add_reception_items\(/);
    expect(s).toMatch(/ERR_NOT_EDITABLE: solo se pueden agregar productos a recepciones pendientes/);
    expect(s).toMatch(/has_store_access_as/);
    expect(s).toMatch(/ERR_UNAUTHORIZED/);
  });

  it('resuelve las líneas nuevas con el ESCRITOR CANÓNICO (atómico)', () => {
    expect(s).toMatch(/public\.resolve_reception_import_rows\(/);
    // Fail-closed por fila bloqueada: revierte TODO (sin huérfanos).
    expect(s).toMatch(/ERR_ROWS_BLOCKED/);
    expect(s).toMatch(/transacción revertida/);
    // Emparejamiento posicional determinista.
    expect(s).toMatch(/v_resolve_cursor/);
  });

  it('tienda no conectada: fila local con el código canónico del tenant', () => {
    expect(s).toMatch(/new_local/);
    expect(s).toMatch(/next_master_catalog_sku\(v_tenant\)/);
    expect(s).toMatch(/RECEPTION_ADD_ITEM_LOCAL_CREATED/);
  });

  it('protección de duplicados + idempotencia de reintento', () => {
    expect(s).toMatch(/ERR_PRODUCT_ALREADY_IN_RECEIPT/);
    expect(s).toMatch(/already_present_idempotent/);
    expect(s).toMatch(/ERR_DUPLICATE_IN_BATCH/);
  });

  it('validaciones de coherencia económica y recálculo del total', () => {
    expect(s).toMatch(/ERR_INVALID_QUANTITY/);
    expect(s).toMatch(/ERR_INVALID_UNIT_COST/);
    expect(s).toMatch(/ERR_INVALID_TASA/);
    expect(s).toMatch(/calculate_receipt_total_cup\(p_receipt_id\)/);
    expect(s).toMatch(/reception_items_added/);
  });

  it('NO toca inventario (doctrina del módulo: el inventario aplica al confirmar)', () => {
    // Sin INSERT/PERFORM sobre inventario: el guard mencionarlos en su
    // propio texto de verificación es intencional (defensa en profundidad).
    expect(s).not.toMatch(/INSERT INTO public\.(stock_movements|kardex_entries)/);
    expect(s).not.toMatch(/PERFORM public\.(register_stock_movement|fn_recalc_wac)/);
    expect(s).not.toMatch(/UPDATE public\.(stock_movements|kardex_entries)/);
  });

  it('save_pending_reception_changes reutiliza las RPC canónicas (guardado atómico)', () => {
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.save_pending_reception_changes\(/);
    expect(s).toMatch(/public\.update_reception_items\(p_receipt_id, p_item_updates, v_caller_uid\)/);
    expect(s).toMatch(/public\.add_reception_items\(p_receipt_id, p_new_items, v_caller_uid\)/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.add_reception_items\(uuid, jsonb, uuid\) TO authenticated, service_role/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.save_pending_reception_changes\(uuid, jsonb, jsonb, jsonb, uuid\) TO authenticated, service_role/);
  });

  it('ACL endurecida desde el origen (cierre CI PR #1710): revoca PUBLIC/anon antes de los grants', () => {
    // Hallazgo secdef_public_grant del SQL Security Gate: el grant implícito
    // de PUBLIC/anon sobre SECURITY DEFINER es vector de escalada.
    expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.add_reception_items\(uuid, jsonb, uuid\)\s*\n?\s*FROM PUBLIC, anon/);
    expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.save_pending_reception_changes\(uuid, jsonb, jsonb, jsonb, uuid\)\s*\n?\s*FROM PUBLIC, anon/);
  });
});

describe('20261125132000 — cierre CI PR #1710: ACL canónica de las RPC de borradores', () => {
  const s = read(M_ACL);

  it('revoca PUBLIC y anon de AMBAS RPC (raíz del hallazgo secdef_public_grant)', () => {
    expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.add_reception_items\(uuid, jsonb, uuid\)\s*\n?\s*FROM PUBLIC, anon/);
    expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.save_pending_reception_changes\(uuid, jsonb, jsonb, jsonb, uuid\)\s*\n?\s*FROM PUBLIC, anon/);
  });

  it('re-declara la superficie canónica (authenticated + service_role únicamente)', () => {
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.add_reception_items\(uuid, jsonb, uuid\)\s*\n?\s*TO authenticated, service_role/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.save_pending_reception_changes\(uuid, jsonb, jsonb, jsonb, uuid\)\s*\n?\s*TO authenticated, service_role/);
  });

  it('guard fail-closed que verifica el estado de ACL (proacl sin =X ni anon=X)', () => {
    expect(s).toMatch(/CP-CATMAESTRO001-ACL-GUARD/);
    expect(s).toMatch(/unnest\(p\.proacl\)/);
    expect(s).toMatch(/RAISE EXCEPTION 'CP-CATMAESTRO001-ACL-GUARD/);
  });

  it('idempotente y sin DDL destructivo (solo REVOKE/GRANT/GUARD)', () => {
    expect(s).not.toMatch(/DROP FUNCTION/);
    expect(s).not.toMatch(/INSERT INTO/);
    expect(s).not.toMatch(/UPDATE public\./);
  });
});

describe('20261125133000 — cierre CI PR #1710: retiro de la herramienta one-shot de renumeración', () => {
  const s = read(M_DROP);

  it('DROP idempotente de la función one-shot (hallazgo secdef_no_auth)', () => {
    expect(s).toMatch(/DROP FUNCTION IF EXISTS public\.cp_catmaestro001_renumber_auto_masters\(\s*\n?\s*boolean, uuid, uuid, uuid, uuid, jsonb\)/);
  });

  it('guard fail-closed: la función ya no existe tras la migración', () => {
    expect(s).toMatch(/CP-CATMAESTRO001-DROP-GUARD/);
    expect(s).toMatch(/RAISE EXCEPTION 'CP-CATMAESTRO001-DROP-GUARD/);
  });

  it('documenta la trazabilidad (historial en migración 20261125130000 + audit_logs)', () => {
    // La herramienta queda versionada (recreable) y su historial de aplicación
    // vive en master_change_log + audit_logs + docs/audits (texto del header).
    expect(s).toMatch(/20261125130000/);
    expect(s).toMatch(/master_change_log \+ audit_logs/);
  });

  it('sin efectos colaterales: no toca datos ni otras funciones', () => {
    expect(s).not.toMatch(/INSERT INTO/);
    expect(s).not.toMatch(/UPDATE /);
    expect(s).not.toMatch(/GRANT EXECUTE/);
    // Solo el DROP de la herramienta one-shot — nada más.
    const drops = s.match(/DROP FUNCTION IF EXISTS public\.[a-z0-9_]+/g) || [];
    expect(drops).toHaveLength(1);
  });
});

describe('frontend — un solo generador de códigos (el oficial, server-side)', () => {
  it('useReceptionState: el fallback OCR-* fue ELIMINADO', () => {
    const s = read(USE_RECEPTION_STATE);
    // El generador vivo estaría en código: `sku: item.sku || `OCR-…``.
    expect(s).not.toMatch(/sku: item\.sku \|\| `OCR-/);
    expect(s).not.toMatch(/sku: item\.sku \|\| `AUTO-/);
    // Sin SKU detectado → fila sin código (el servidor asigna el oficial).
    expect(s).toMatch(/sku: item\.sku \|\| '',/);
  });

  it('panel de altas: existe, se integra en el modal y viaja en el guardado', () => {
    const panel = read(ADD_PANEL);
    expect(panel).toMatch(/get_products_for_reception/);
    expect(panel).toMatch(/data-testid="reception-add-items-search"/);
    expect(panel).toMatch(/el sistema asignará el siguiente código del Catálogo Maestro|siguiente código disponible del Catálogo Maestro/);
    expect(panel).toMatch(/origin: 'master'/);

    const modal = read(DETAILS_MODAL);
    expect(modal).toMatch(/ReceptionAddItemsPanel/);
    expect(modal).toMatch(/receipt\?\.status === 'pending' && receipt\?\.store_id/);
    expect(modal).toMatch(/const newItems = newLines\.map/);

    const history = read(HISTORY_VIEW);
    expect(history).toMatch(/newItems\?: Array</);
    expect(history).toMatch(/queryClient\.invalidateQueries\(\{ queryKey: \['receipt-items', receiptId\] \}\)/);

    const route = read(PATCH_ROUTE);
    expect(route).toMatch(/save_pending_reception_changes/);
    expect(route).toMatch(/p_new_items: newItems/);
    expect(route).toMatch(/newItems: z\.array\(z\.unknown\(\)\)\.optional\(\)/);
  });
});
