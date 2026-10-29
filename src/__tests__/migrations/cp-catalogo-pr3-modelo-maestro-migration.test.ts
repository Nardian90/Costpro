/**
 * MISIÓN CATÁLOGO MAESTRO (2026-10-28) — PR 3 · ETAPA 1: modelo maestro.
 *
 * Contrato estático de las 4 migraciones del modelo:
 *   20261028110000 — esquema (5 tablas, columna de vínculo, triggers, RLS)
 *   20261028112000 — RPCs de gobernanza (gobernadores, conexión, búsqueda)
 *   20261028112100 — RPCs de ciclo de vida (crear/activar/editar/proponer/revisar)
 *   20261028112200 — endurecimiento ACL de helpers
 *
 * Invariantes verificados: identidad sin datos comerciales; RLS solo-SELECT;
 * escrituras exclusivamente por RPC SECURITY DEFINER con anti-spoofing;
 * capacidad organizacional (sin admins automáticos); separación
 * cambios-aplicados / propuestas-pendientes; reversibilidad.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SCHEMA = 'supabase/migrations/20261028110000_cp_catalogo_master_model_schema.sql';
const RPCS_GOB = 'supabase/migrations/20261028112000_cp_catalogo_rpcs_gobernanza.sql';
const RPCS_VIDA = 'supabase/migrations/20261028112100_cp_catalogo_rpcs_ciclo_vida.sql';
const ACL = 'supabase/migrations/20261028112200_cp_catalogo_helpers_acl_hardening.sql';

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), 'utf8');
}

describe('20261028110000 — esquema del modelo maestro', () => {
  const s = read(SCHEMA);

  it('master_products porta SOLO identidad: sin columnas comerciales ni de existencia', () => {
    const table = s.slice(s.indexOf('CREATE TABLE IF NOT EXISTS public.master_products'), s.indexOf('COMMENT ON TABLE public.master_products'));
    for (const prohibido of ['price', 'cost', 'stock', 'supplier', 'visible_en_tienda', 'on_promotion']) {
      expect(table).not.toMatch(new RegExp(`\\b${prohibido}`, 'i'));
    }
    for (const identidad of ['sku', 'name', 'image_path', 'barcode', 'unit_of_measure', 'is_service', 'status', 'tenant_id']) {
      expect(table).toMatch(new RegExp(`\\b${identidad}\\b`));
    }
  });

  it('unicidad de SKU POR ORGANIZACIÓN (no global) y barcode global parcial', () => {
    expect(s).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS master_products_tenant_sku_unique\s+ON public\.master_products \(tenant_id, sku\)/);
    expect(s).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS master_products_barcode_unique\s+ON public\.master_products \(barcode\) WHERE barcode IS NOT NULL AND barcode <> ''/);
  });

  it('catálogo: una conexión por tienda, estados explícitos, coherencia de tenant por trigger', () => {
    expect(s).toMatch(/store_id UUID NOT NULL UNIQUE REFERENCES public\.stores\(id\)/);
    expect(s).toMatch(/status IN \('connected','disconnected'\)/);
    expect(s).toMatch(/trg_catalog_link_tenant_coherence/);
    expect(s).toMatch(/ERR_TENANT_MISMATCH: la tienda % no pertenece a la organización/);
  });

  it('vínculo local anulable con unicidad (maestro, tienda) e índice', () => {
    expect(s).toMatch(/ADD COLUMN IF NOT EXISTS master_product_id UUID REFERENCES public\.master_products\(id\)/);
    expect(s).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS products_master_store_unique\s+ON public\.products \(master_product_id, store_id\) WHERE master_product_id IS NOT NULL/);
    expect(s).toMatch(/CREATE INDEX IF NOT EXISTS idx_products_master_product_id/);
  });

  it('trigger de identidad: coerción servidor de SKU/nombre al maestro; NULL = coste cero', () => {
    expect(s).toMatch(/BEFORE INSERT OR UPDATE OF sku, name, master_product_id ON public\.products/);
    expect(s).toMatch(/IF NEW\.master_product_id IS NULL THEN\s*\n\s*RETURN NEW/);
    expect(s).toMatch(/SELECT m\.sku, m\.name INTO NEW\.sku, NEW\.name/);
    expect(s).toMatch(/ERR_MASTER_NOT_FOUND/);
  });

  it('ensure_product_barcode: no auto-genera código interno en filas vinculadas', () => {
    expect(s).toMatch(/IF NEW\.master_product_id IS NOT NULL THEN[\s\S]*?RETURN NEW/);
    // El camino legacy (no vinculado) conserva la generación
    expect(s).toMatch(/generate_internal_barcode\(\)/);
  });

  it('gobernador = propietario del tenant O concesión explícita; SIN admins automáticos', () => {
    const helper = s.slice(s.indexOf('is_catalog_governor(p_tenant_id uuid, p_user_id uuid)'), s.indexOf('is_catalog_store_connected'));
    expect(helper).toMatch(/tenants WHERE id = p_tenant_id AND owner_id = p_user_id/);
    expect(helper).toMatch(/catalog_governors WHERE tenant_id = p_tenant_id AND user_id = p_user_id/);
    // NO hay atajo por rol de plataforma en la definición del helper
    expect(helper).not.toMatch(/is_admin|superadmin|role IN/);
  });

  it('helpers STABLE SECURITY DEFINER con search_path fijado', () => {
    const helpers = s.slice(s.indexOf('9) Helpers'), s.indexOf('10) RLS'));
    expect((helpers.match(/STABLE\s*\n\s*SECURITY DEFINER\s*\n\s*SET search_path TO public/g) || []).length).toBe(3);
  });

  it('RLS habilitado en las 5 tablas y SOLO políticas de SELECT (escritura solo vía RPC)', () => {
    expect((s.match(/ENABLE ROW LEVEL SECURITY/g) || []).length).toBe(5);
    expect((s.match(/CREATE POLICY/g) || []).length).toBe(5);
    expect(s).not.toMatch(/FOR INSERT|FOR UPDATE|FOR DELETE/);
    expect((s.match(/GRANT SELECT ON public\.(master_products|catalog_store_links|master_change_log|master_change_proposals|catalog_governors) TO authenticated/g) || []).length).toBe(5);
    expect(s).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)/);
  });

  it('guard post-migración fail-closed (5/5/5/1/2)', () => {
    expect(s).toMatch(/GUARD modelo maestro/);
    expect(s).toMatch(/\(esperado 5\/5\/5\/1\/2\)/);
  });
});

describe('20261028112000 — RPCs de gobernanza', () => {
  const s = read(RPCS_GOB);

  it('las 4 funciones usan SECURITY DEFINER + search_path público', () => {
    expect((s.match(/SECURITY DEFINER\s*\n\s*SET search_path TO 'public'/g) || []).length).toBe(4);
  });

  it('anti-spoofing v2.12.9 en todas (service_role ? COALESCE : auth.uid)', () => {
    expect((s.match(/WHEN auth\.role\(\) = 'service_role'\s*\n\s*THEN COALESCE\(p_user_id, auth\.uid\(\)\) ELSE auth\.uid\(\) END/g) || []).length).toBe(4);
  });

  it('conectar/desconectar reservado al gobernador (no a admins globales)', () => {
    expect((s.match(/is_catalog_governor\(v_tenant, v_caller_uid\)/g) || []).length).toBe(2);
    expect(s).toMatch(/ERR_UNAUTHORIZED: solo el gobernador del catálogo conecta tiendas/);
    expect(s).toMatch(/ERR_UNAUTHORIZED: solo el gobernador del catálogo desconecta tiendas/);
  });

  it('grant_catalog_governor es SOLO superadmin', () => {
    expect(s).toMatch(/v_caller_role IS DISTINCT FROM 'superadmin'/);
    expect(s).toMatch(/ERR_TENANT_MISMATCH: el usuario % no pertenece a la organización/);
  });

  it('desconexión NO borra productos ni vínculos (solo cambia estado)', () => {
    const start = s.indexOf('disconnect_store_catalog(');
    const fn = s.slice(start, s.indexOf('search_master_products', start));
    expect(fn).not.toMatch(/DELETE FROM/);
    expect(fn).toMatch(/SET status = 'disconnected'/);
  });

  it('búsqueda: guard de conexión y aislamiento por tenant; columnas calificadas (regresión 42702)', () => {
    const fn = s.slice(s.indexOf('search_master_products('), s.indexOf('ACL de las funciones de gobernanza'));
    expect(fn).toMatch(/ERR_STORE_NOT_CONNECTED/);
    expect(fn).toMatch(/m\.tenant_id = v_tenant/);
    // Regresión: ninguna referencia desnuda a id/sku/name/status (colisión con RETURNS TABLE)
    expect(fn).not.toMatch(/WHERE id = p_store_id/);
    expect(fn).toMatch(/WHERE s\.id = p_store_id/);
  });

  it('ACL: REVOKE PUBLIC/anon y GRANT authenticated+service_role (4 funciones)', () => {
    expect((s.match(/REVOKE EXECUTE ON FUNCTION public\.\w+\([^)]*\) FROM PUBLIC, anon;/g) || []).length).toBe(4);
    expect((s.match(/GRANT EXECUTE ON FUNCTION public\.\w+\([^)]*\) TO authenticated, service_role;/g) || []).length).toBe(4);
  });
});

describe('20261028112100 — RPCs de ciclo de vida', () => {
  const s = read(RPCS_VIDA);

  it('helper interno sin EXECUTE para PUBLIC/anon/authenticated', () => {
    expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.fn_master_apply_identity_changes\([^)]*\) FROM PUBLIC, anon, authenticated;/);
  });

  it('crear: dedup por SKU con id del ganador, SKU local existente, transacción atómica', () => {
    expect(s).toMatch(/ERR_MASTER_SKU_EXISTS: %', v_existing_master/);
    expect(s).toMatch(/ERR_SKU_EXISTS_LOCAL/);
    // Traducción de la carrera 23505 (misión §8.1)
    expect(s).toMatch(/WHEN unique_violation THEN/);
    expect(s).toMatch(/carrera de unicidad, revise y vincule/);
  });

  it('crear: exige tienda conectada + rol de tienda (admin/manager/encargado) o admin', () => {
    expect(s).toMatch(/ERR_STORE_NOT_CONNECTED/);
    expect(s).toMatch(/has_store_role_as\(v_caller_uid, p_store_id, ARRAY\['admin','manager','encargado'\]::text\[\]\)/);
  });

  it('activar: defaults de alta manual (0/CUP/1/0) y CERO inventario, movimientos ni recepciones', () => {
    expect(s).toMatch(/0, 'CUP', 0, 1, 0, true, true\)/);
    expect(s).not.toMatch(/INSERT INTO public\.inventory/);
    expect(s).not.toMatch(/register_stock_movement/);
    expect(s).not.toMatch(/INSERT INTO public\.receipts/);
    expect(s).toMatch(/ERR_MASTER_ARCHIVED/);
    expect(s).toMatch(/already_active/);
  });

  it('editar identidad: SOLO gobernador; propaga SKU/nombre; registra por campo', () => {
    expect(s).toMatch(/ERR_UNAUTHORIZED: solo el gobernador del catálogo edita la identidad compartida/);
    expect(s).toMatch(/UPDATE public\.products pr\s+SET sku = m\.sku,\s*\n\s*name = m\.name/);
    expect(s).toMatch(/INSERT INTO public\.master_change_log/);
  });

  it('propuestas ≠ cambios aplicados: entidad propia + revisión gobernador con idempotencia', () => {
    expect(s).toMatch(/master_change_proposals[\s\S]*?status\)\s*VALUES[\s\S]*?'pending'/);
    expect(s).toMatch(/ERR_PROPOSAL_REVIEWED/);
    expect(s).toMatch(/ERR_UNAUTHORIZED: solo el gobernador del catálogo revisa propuestas/);
    expect(s).toMatch(/proposal_id\)/); // trazabilidad de la propuesta en el log aplicado
  });

  it('anti-spoofing y ACL en las 5 funciones de ciclo de vida', () => {
    expect((s.match(/WHEN auth\.role\(\) = 'service_role'\s*\n\s*THEN COALESCE\(p_user_id, auth\.uid\(\)\) ELSE auth\.uid\(\) END/g) || []).length).toBe(5);
    expect((s.match(/REVOKE EXECUTE ON FUNCTION public\.\w+\([^)]*\) FROM PUBLIC, anon;/g) || []).length).toBe(5);
  });
});

describe('20261028112200 — endurecimiento ACL de helpers', () => {
  const s = read(ACL);
  it('revoca PUBLIC/anon y concede a authenticated+service_role (3 helpers) + service_role al helper interno', () => {
    expect((s.match(/REVOKE EXECUTE ON FUNCTION public\.\w+\([^)]*\) FROM PUBLIC, anon;/g) || []).length).toBe(3);
    expect((s.match(/GRANT EXECUTE ON FUNCTION public\.(is_catalog_governor|is_catalog_store_connected|can_read_master_catalog)\([^)]*\) TO authenticated, service_role;/g) || []).length).toBe(3);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.fn_master_apply_identity_changes\([^)]*\) TO service_role;/);
  });
});
