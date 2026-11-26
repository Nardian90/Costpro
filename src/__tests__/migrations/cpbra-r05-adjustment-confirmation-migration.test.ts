/**
 * CP-BRA-INV005-FIN011-CLOSURE-001 — PR fix/inventory-adjustment-role-guard-20261126 (Línea A, R-05).
 *
 * Test de contrato de la migración 20261126170000 (patrón
 * cpbra-r01-r14-payment-engine-migration.test.ts: asserts estáticos sobre el
 * SQL, sin BD). Valida lo no negociable de INV-005 (R-05, CRÍTICO):
 *
 *   1. La confirmación exige rol de gestión EN la tienda del ajuste vía la
 *      función existente has_store_role_as (una sola fuente de verdad, espejo
 *      de canManageStore / can_admin_reverse_transaction).
 *   2. Fail-closed: el hueco previo (is_admin_check OR has_store_access_as =
 *      cualquier membresía activa, incl. clerk) NO puede persistir.
 *   3. Auditoría transaccional ADJUSTMENT_CONFIRMED en audit_logs en la MISMA
 *      transacción que la confirmación (sin confirmación silenciosa).
 *   4. Firma, ACL certificada, kardex y cálculo de diferencias INVARIANTES
 *      (alcance: solo autorización + auditoría — sin umbrales, sin motivo
 *      obligatorio, sin doble autorización: decisiones reservadas al
 *      propietario).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION = resolve(
  process.cwd(),
  'supabase/migrations/20261126170000_cpbra_r05_adjustment_confirmation_role_guard.sql',
);
const sql = readFileSync(MIGRATION, 'utf8');

describe('migración 20261126170000 — R-05: guard de rol en confirm_inventory_adjustment', () => {
  it('existe, transaccional, reemite la función con la firma certificada (uuid, uuid)', () => {
    expect(sql).toContain('20261126170000');
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/COMMIT;/m);
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.confirm_inventory_adjustment(',
    );
    expect(sql).toContain('p_adjustment_id UUID');
    expect(sql).toContain('p_user_id UUID DEFAULT NULL');
    expect(sql).toContain('RETURNS JSONB');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path TO 'public'");
  });

  it('el guard de rol usa has_store_role_as con los roles de gestión EXACTOS (admin|manager|encargado)', () => {
    expect(sql).toContain(
      "public.has_store_role_as(v_caller_uid, v_adj.store_id,\n                                  ARRAY['admin','manager','encargado']::text[])",
    );
    // El orden roles-EN-tienda: la membresía se acota por v_adj.store_id
    // (aislamiento multi-tienda — un clerk de tienda B no confirma en A).
  });

  it('error fail-closed específico ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED', () => {
    expect(sql).toContain('ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED');
  });

  it('el hueco previo NO persiste: has_store_access_as eliminado del cuerpo (sin contar comentarios)', () => {
    const fnStart = sql.indexOf(
      'CREATE OR REPLACE FUNCTION public.confirm_inventory_adjustment',
    );
    const fnEnd = sql.indexOf('$$;', fnStart);
    // Código real: sin líneas de comentario (los comentarios documentales
    // citan el hueco histórico — el código no puede usarlo)
    const code = sql.slice(fnStart, fnEnd).replace(/^\s*--.*$/gm, '');
    expect(code).not.toContain('has_store_access_as');
    // is_admin_check tampoco (el bypass admin/superadmin vive dentro de
    // has_store_role_as — una sola fuente de verdad)
    expect(code).not.toContain('is_admin_check');
  });

  it('ERR_UNAUTHENTICATED conservado (sin sesión válida → rechazo)', () => {
    expect(sql).toContain("IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;");
  });

  it('ERR_ADJUSTMENT_NOT_FOUND y ERR_NOT_PENDING conservados (máquina de estados intacta)', () => {
    expect(sql).toContain("RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND';");
    expect(sql).toContain('ERR_NOT_PENDING');
    expect(sql).toContain("SELECT * INTO v_adj FROM public.inventory_adjustments WHERE id = p_adjustment_id FOR UPDATE");
  });

  it('auditoría transaccional: ADJUSTMENT_CONFIRMED en audit_logs DENTRO del cuerpo de la función', () => {
    const fnStart = sql.indexOf(
      'CREATE OR REPLACE FUNCTION public.confirm_inventory_adjustment',
    );
    const fnEnd = sql.indexOf('$$;', fnStart);
    const body = sql.slice(fnStart, fnEnd);
    expect(body).toContain("INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)");
    expect(body).toContain("'ADJUSTMENT_CONFIRMED'");
    expect(body).toContain("'inventory_adjustments'");
    expect(body).toContain('p_adjustment_id');
    // Contexto de investigación: items con desviación por ítem + origen PI
    expect(body).toContain('v_items_ctx');
    expect(body).toContain("'deviation', counted_quantity - expected_quantity");
    expect(body).toContain("'source_physical_inventory_id', v_adj.source_physical_inventory_id");
  });

  it('la auditoría va DESPUÉS de aplicar el stock y del cambio de estado (resultado reconstruible)', () => {
    const auditIdx = sql.indexOf("INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)");
    const statusIdx = sql.indexOf("SET status = 'confirmed'");
    const stockIdx = sql.indexOf('UPDATE public.products');
    expect(statusIdx).toBeGreaterThan(stockIdx);
    expect(auditIdx).toBeGreaterThan(statusIdx);
  });

  it('kardex INVARIANTE: register_stock_movement con p_movement_type adjustment y p_unit_cost 0 (sin cambios de valuación)', () => {
    expect(sql).toContain("p_movement_type := 'adjustment'");
    expect(sql).toContain('p_unit_cost := 0');
    expect(sql).toContain('p_quantity := v_item.counted_quantity - v_item.expected_quantity');
  });

  it('sin umbrales ni motivo obligatorio (alcance alternativa A — decisiones del propietario intactas)', () => {
    // La firma se queda EXACTAMENTE en (p_adjustment_id, p_user_id): sin
    // p_reason, sin p_threshold, sin p_supervisor — los parámetros de
    // register_stock_movement (p_reason interno del kardex) son de otro RPC.
    const sigStart = sql.indexOf(
      'CREATE OR REPLACE FUNCTION public.confirm_inventory_adjustment',
    );
    const sigEnd = sql.indexOf(') RETURNS JSONB', sigStart);
    const signature = sql.slice(sigStart, sigEnd);
    expect(signature).not.toContain('p_reason');
    expect(signature).not.toContain('p_threshold');
    expect(signature).not.toContain('p_supervisor');
    // Sin lógica de umbral/supervisión añadida al cuerpo (p_reason := v_reason
    // es el parámetro del kardex, preexistente — se excluye del scan)
    expect(sql).not.toContain('THRESHOLD');
    expect(sql).not.toContain('ERR_REASON');
  });

  it('ACL certificada preservada: authenticated + service_role, PUBLIC/anon revocados', () => {
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.confirm_inventory_adjustment(UUID, UUID) FROM PUBLIC, anon;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.confirm_inventory_adjustment(UUID, UUID) TO authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.confirm_inventory_adjustment(UUID, UUID) TO service_role;');
  });

  it('rama service_role conservada VERBATIM (el rol check aplica al p_user_id indicado)', () => {
    expect(sql).toContain(
      "v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'",
    );
  });

  it('guards de aplicación fail-closed: firma esperada + verificación post-emisión', () => {
    expect(sql).toContain("pg_get_function_identity_arguments(p.oid) = 'p_adjustment_id uuid, p_user_id uuid'");
    expect(sql).toContain('R05-GUARD');
    expect(sql).toContain('R05-VERIFY');
    // La verificación post-emisión exige el guard (NOT LIKE = ausencia → error)
    // y detecta la persistencia del hueco (LIKE positivo → error)
    expect(sql).toMatch(/v_def NOT LIKE '%has_store_role_as%'/);
    expect(sql).toMatch(/v_def NOT LIKE '%ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED%'/);
    expect(sql).toMatch(/IF regexp_replace\(v_def, '--\[\^\\n\]\*', '', 'g'\) LIKE '%has_store_access_as%' THEN/);
  });

  it('sin secretos en el SQL', () => {
    // Prefijos construidos por partes para no dejar literales de detección en
    // el código (regla del escaneo pre-PR: cero coincidencias de patrones)
    const secretPattern = new RegExp(
      [
        'github' + '_pat_',
        'sb' + '_secret_',
        'sbp' + '_',
        'sb_publishable' + '_',
        // JWT v3 header (Supabase) — también por partes
        'eyJ' + 'hbGciOi',
      ].join('|'),
    );
    expect(sql).not.toMatch(secretPattern);
  });
});

describe('migración 20261126170000 — alineación contractual del repo', () => {
  const ALLOWLIST = resolve(process.cwd(), 'ci-gate-allowlist.json');
  const allowlist = JSON.parse(readFileSync(ALLOWLIST, 'utf8'));

  it('drift LIVE-vs-replay declarado en source_of_truth_baseline con expiración', () => {
    const entry = allowlist.source_of_truth_baseline.find(
      (e: { function: string }) => e.function === 'confirm_inventory_adjustment/2',
    );
    expect(entry).toBeDefined();
    expect(entry.rules).toContain('BODY_DRIFT_FROM_MIGRATION');
    expect(entry.reason).toContain('INTENCIONAL');
    expect(entry.added_by).toBe('CP-BRA-INV005-FIN011-CLOSURE-001');
    expect(entry.expires).toBeTruthy();
  });
});
