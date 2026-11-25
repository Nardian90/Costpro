/**
 * MISIÓN CP-RECEPCIONES-PDF-STOCK-MASTER-SKU-001 (2026-11-25) — contrato estático
 * de las dos migraciones de la misión.
 *
 * Migración 1 (20261125120000_cp_recep001_confirm_notes_link.sql):
 *   - confirm_pending_reception escribe el ENLACE DOCUMENTAL notes=receipt_id
 *     en los movimientos de la confirmación (doctrina saldo posterior,
 *     lib/inventory/saldo-posterior.ts). Causa raíz del «s/d»: la versión
 *     certificada anterior (20260916000001) insertaba notes=NULL.
 *   - Backfill CONSERVADOR cp_recep001_backfill_confirm_notes: solo lotes con
 *     emparejamiento inequívoco (updated_at==created_at del lote + multiset
 *     producto/cantidad completo). Los huérfanos sin candidata quedan «s/d»
 *     justificado (88 movimientos históricos verificados en producción).
 *
 * Migración 2 (20261125120100_cp_recep001_master_sku_consecutivo.sql):
 *   - next_master_catalog_sku: generador OFICIAL del consecutivo del Catálogo
 *     Maestro (prefijo contiguo 1..N → N+1; advisory xact lock por tenant;
 *     salto defensivo contra master_products Y products del tenant).
 *   - assign_next_catalog_sku: RPC fina para el fallback local de borradores.
 *   - fn_classify_reception_import_row: filas sin SKU en tienda conectada ya
 *     NO son error (auto_sku) — elimina la presión que creaba el generador
 *     AUTO-* del cliente (17 maestros AUTO-* verificados en producción).
 *   - resolve_reception_import_rows + register_reception: asignación
 *     server-side del código oficial; el resultado porta el código asignado.
 *   - Ningún generador en el cliente (useReceptionState/useReceptions).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const M1 = 'supabase/migrations/20261125120000_cp_recep001_confirm_notes_link.sql';
const M2 = 'supabase/migrations/20261125120100_cp_recep001_master_sku_consecutivo.sql';
const USE_RECEPTION_STATE = 'src/components/views/terminal/views/inventory/useReceptionState.ts';
const USE_RECEPTIONS = 'src/hooks/api/useReceptions.ts';
const SC204 = 'src/lib/legal/sc204.ts';

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), 'utf8');
}

describe('20261125120000 — enlace documental del saldo (confirm_pending_reception + backfill)', () => {
  const s = read(M1);

  it('la RPC certificada escribe notes=p_receipt_id::text en los movimientos', () => {
    expect(s).toMatch(/INSERT INTO stock_movements[\s\S]*notes[\s\S]*p_receipt_id::text/);
    // Conserva la semántica del kardex (reference_doc literal histórico).
    expect(s).toMatch(/'Confirmacion recepcion'/);
    // Conserva la doctrina W62-01: WAC primero → movimiento después.
    expect(s).toMatch(/fn_recalc_wac/);
    expect(s).toMatch(/ERR_RECEIPT_ALREADY_CONFIRMED/);
    expect(s).toMatch(/has_store_access_as/);
  });

  it('mantiene la firma certificada de 3 argumentos y su superficie de ejecución', () => {
    expect(s).toMatch(/confirm_pending_reception\(p_receipt_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone\)/);
    expect(s).toMatch(/SECURITY DEFINER/);
    expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.confirm_pending_reception\(uuid, uuid, timestamptz\) FROM PUBLIC, anon/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.confirm_pending_reception\(uuid, uuid, timestamptz\) TO authenticated, service_role/);
  });

  it('el backfill es conservador: solo lotes inequívocos, sin tocar huérfanos sin candidata', () => {
    expect(s).toMatch(/cp_recep001_backfill_confirm_notes/);
    // Patrón exacto del escritor defectuoso (nada más entra).
    expect(s).toMatch(/movement_type = 'purchase'/);
    expect(s).toMatch(/notes IS NULL/);
    expect(s).toMatch(/reference_doc = 'Confirmacion recepcion'/);
    // Instante exacto de confirmación (updated_at = v_effective_date = created_at).
    expect(s).toMatch(/r\.updated_at = v_batch\.created_at/);
    // Ambigüedad → CONTINUE (conserva el s/d justificado).
    expect(s).toMatch(/IF v_n_candidates <> 1 THEN[\s\S]*CONTINUE/);
    // Multiset completo: cada movimiento con su ítem y conteos 1-a-1.
    expect(s).toMatch(/ri\.product_id = m\.product_id/);
    expect(s).toMatch(/ri\.quantity = m\.quantity_change/);
    expect(s).toMatch(/v_mov_count = v_batch\.movs AND v_items_count = v_batch\.movs/);
    // Modo dry-run para verificación idempotente.
    expect(s).toMatch(/p_dry_run boolean DEFAULT false/);
    // Trazabilidad auditada.
    expect(s).toMatch(/CP_RECEP001_CONFIRM_NOTES_BACKFILL/);
    // Solo EXECUTE para service_role (la aplicación es de migración).
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.cp_recep001_backfill_confirm_notes\(boolean\) TO service_role/);
  });

  it('ejecuta el backfill una vez y trae guard fail-closed', () => {
    expect(s).toMatch(/cp_recep001_backfill_confirm_notes\(false\)/);
    expect(s).toMatch(/CP-RECEP001-GUARD/);
    // Guard B: re-ejecuta el dry-run y exige 0 pendientes.
    expect(s).toMatch(/cp_recep001_backfill_confirm_notes\(true\)/);
    expect(s).toMatch(/quedan .* movimientos de confirmación inequívocamente enlazables/);
  });

  it('no borra recepciones, ni re-crea productos, ni renumera nada', () => {
    expect(s).not.toMatch(/DELETE FROM public\.receipts/);
    expect(s).not.toMatch(/DELETE FROM public\.receipt_items/);
    expect(s).not.toMatch(/DELETE FROM public\.products/);
    expect(s).not.toMatch(/UPDATE public\.master_products/);
    expect(s).not.toMatch(/UPDATE public\.products/);
  });
});

describe('20261125120100 — consecutivo oficial del Catálogo Maestro', () => {
  const s = read(M2);

  it('el generador oficial existe con advisory lock por tenant y prefijo contiguo', () => {
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.next_master_catalog_sku\(p_tenant_id uuid\)/);
    expect(s).toMatch(/pg_advisory_xact_lock\(hashtextextended\('cp_master_sku_consecutivo:' \|\| p_tenant_id::text, 0\)\)/);
    // Regla forward-only: primer hueco del prefijo 1..N → N+1.
    expect(s).toMatch(/generate_series\(1, 100000\)/);
    expect(s).toMatch(/mp\.sku ~ '\^\[0-9\]\{1,9\}\$'/);
    // Salto defensivo contra maestros Y locales del tenant (sin doble asignación).
    expect(s).toMatch(/public\.master_products mp[\s\S]*lower\(btrim\(mp\.sku\)\) = v_candidate::text/);
    expect(s).toMatch(/public\.products p[\s\S]*JOIN public\.stores s ON s\.id = p\.store_id/);
    expect(s).toMatch(/ERR_SKU_SPACE_EXHAUSTED/);
  });

  it('la RPC fina assign_next_catalog_sku solo atiende usuarios con acceso a la tienda', () => {
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.assign_next_catalog_sku\(p_store_id uuid\)/);
    expect(s).toMatch(/has_store_access_as\(v_caller, p_store_id\)/);
    expect(s).toMatch(/RETURN public\.next_master_catalog_sku\(v_tenant\)/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.assign_next_catalog_sku\(uuid\) TO authenticated/);
    expect(s).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.assign_next_catalog_sku\(uuid\) TO anon/);
  });

  it('el clasificador ya NO rechaza filas sin SKU en tienda conectada (auto_sku)', () => {
    expect(s).toMatch(/INFO_SKU_AUTOASSIGN/);
    expect(s).toMatch(/v_auto_sku boolean := FALSE/);
    expect(s).toMatch(/'auto_sku', v_auto_sku/);
    // El CUERPO vigente de fn_classify_reception_import_row no contiene el
    // rechazo viejo (las únicas apariciones permitidas son: el comentario
    // histórico del encabezado y el guard que VERIFICA su ausencia).
    const classifyBody = s.match(/CREATE OR REPLACE FUNCTION public\.fn_classify_reception_import_row\([\s\S]*?\$function\$;/)?.[0] ?? '';
    expect(classifyBody).toBeTruthy();
    expect(classifyBody).not.toMatch(/ERR_PRODUCT_WITHOUT_SKU/);
    // La protección anti-duplicados por NOMBRE se conserva.
    expect(classifyBody).toMatch(/ERR_NAME_MATCH_REQUIRES_REVIEW/);
    // El guard verifica la ausencia del rechazo viejo en la función certificada.
    expect(s).toMatch(/v_fn2 LIKE '%ERR_PRODUCT_WITHOUT_SKU%'/);
  });

  it('el escritor canónico asigna el código oficial en new_master sin SKU y lo devuelve', () => {
    expect(s).toMatch(/IF v_sku IS NULL THEN[\s\S]*v_sku := public\.next_master_catalog_sku\(v_tenant\);[\s\S]*v_auto_skus_assigned := v_auto_skus_assigned \+ 1;/);
    expect(s).toMatch(/'sku_assigned_by_server', \(\(v_class->>'sku'\) IS NULL\)/);
    expect(s).toMatch(/'auto_skus_assigned', v_auto_skus_assigned/);
    // La carrera entre tiendas sigue reutilizando el maestro ganador.
    expect(s).toMatch(/ERR_MASTER_SKU_RACE/);
  });

  it('register_reception asigna el código oficial para new_product sin SKU (ruta legacy)', () => {
    expect(s).toMatch(/v_new_sku := public\.next_master_catalog_sku\(v_new_tenant_id\)/);
    // Ya no exige SKU tecleado.
    expect(s).not.toMatch(/el producto nuevo requiere sku/);
    // El nombre sigue siendo obligatorio.
    expect(s).toMatch(/ERR_NEW_PRODUCT_INVALID: el producto nuevo % requiere nombre/);
    // Tenant resuelto ANTES de la asignación.
    expect(s).toMatch(/CP-RECEP-001: el tenant se resuelve ANTES de la asignación de código/);
    // Auditoría con conteo de auto-asignados.
    expect(s).toMatch(/'new_products_sku_autoassigned', v_new_skus_autoassigned/);
  });

  it('guard fail-closed presente en la migración 2', () => {
    expect(s).toMatch(/CP-RECEP001-SKU-GUARD/);
    expect(s).toMatch(/next_master_catalog_sku sin lock por tenant o sin fuente maestro/);
    expect(s).toMatch(/sigue rechazando filas sin SKU/);
    expect(s).toMatch(/resolve_reception_import_rows no usa el generador oficial/);
    expect(s).toMatch(/register_reception no usa el generador oficial/);
  });
});

describe('frontend — un solo generador (servidor); el cliente nunca inventa códigos', () => {
  const state = read(USE_RECEPTION_STATE);
  const hooks = read(USE_RECEPTIONS);

  it('useReceptionState: sin generador AUTO-*; mapeo del escritor por índice', () => {
    // Sin código real en el archivo (la mención permitida es el comentario
    // histórico que documenta la eliminación del generador).
    const stateCode = state.replace(/\/\/.*$/gm, '');
    expect(stateCode).not.toMatch(/AUTO-\$\{Date\.now\(\)/);
    expect(stateCode).not.toMatch(/autoSkuSeq/);
    expect(state).toMatch(/CP-RECEP-001: SKU OPCIONAL/);
    // executeSubmit: sku '' → null al escritor; mapeo por local_id/índice.
    expect(state).toMatch(/sku: i\.sku \|\| null/);
    expect(state).toMatch(/resolvedByLocalId/);
    // El importador adopta el código oficial asignado.
    expect(state).toMatch(/la fila adopta el código oficial si el servidor lo asignó/);
  });

  it('useReceptions (borradores): resolución canónica + fallback con código oficial', () => {
    // El generador client-side desapareció del CÓDIGO (la única mención
    // permitida es el comentario histórico que documenta su eliminación).
    const codeWithoutComments = hooks.replace(/\/\/.*$/gm, '');
    expect(codeWithoutComments).not.toMatch(/SKU-\$\{Date\.now\(\)/);
    expect(codeWithoutComments).not.toMatch(/create_master_product/);
    expect(hooks).toMatch(/assign_next_catalog_sku/);
    expect(hooks).toMatch(/resolve_reception_import_rows/);
    expect(hooks).toMatch(/emparejamiento es POR POSICIÓN/);
  });

  it('sc204: la opción de valores económicos viaja por modelo y render', () => {
    const s = read(SC204);
    expect(s).toMatch(/incluirValoresEconomicos/);
    // Sin valores: columnas omitidas y sin totales que revelen lo excluido.
    expect(s).toMatch(/const tableHead = incluirValores/);
    expect(s).toMatch(/if \(incluirValores\) \{[\s\S]*totalsByCurrency/);
    // El render decide columnas según el modelo (default compatible).
    expect(s).toMatch(/const incluirValores = model\.incluirValoresEconomicos !== false;/);
    // El orquestador acepta las opciones de exportación.
    expect(s).toMatch(/export async function exportSc204ForReceipt\([\s\S]*options\?: Sc204ExportOptions/);
  });
});
