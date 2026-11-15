/**
 * CP-VALUATION-NOMINAL-ACTIVATION-004 (2026-11-15) — migraciones correctivas:
 *   · 20261115120000_cp_valuation_nominal_pp64: normalización nominal 1 CUP de
 *     los 64 productos PUERTO PADRE con cost_average=0 (decisión vinculante del
 *     propietario). Escritor canónico fn_recalc_wac (stock=0), patrón sellado
 *     (stock>0 / huérfanos), snapshot auditable con identificadores exactos y
 *     RLS deny-all desde la creación, verificación fail-closed de integridad y
 *     idempotencia estricta (los bucles solo procesan filas TODAVÍA en cero).
 *   · 20261115120100_cp_valuation_activation_nominal: activate_master_product
 *     nace filas locales con cost_average=1 (nominal, patrón del importador
 *     20261114190200). La reactivación (already_active) NUNCA degrada el WAC.
 *     Validaciones multitienda y de seguridad VERBATIM de 20261114190100.
 *
 * Contratos estáticos verificados aquí:
 *  · Migración 1: tabla de auditoría con RLS habilitado + revoke a anon/
 *    authenticated; 3 vías de escritura (fn_recalc_wac / token sellado /
 *    huérfano); filtro p.cost_average = 0 en los 3 bucles (idempotencia);
 *    verificaciones fail-closed (cero universal, costos documentales,
 *    integridad stock/precio/sku/nombre/maestro, cero documentos ficticios,
 *    asientos wac_change_log); asiento global audit_logs con la misión.
 *  · Migración 2: firma y atributos idénticos a 20261114190100 (uuid,uuid,
 *    uuid,product_operational_class / SECURITY DEFINER / search_path public);
 *    validaciones VERBATIM (ERR_*, has_store_access_as, is_admin_check,
 *    roles, maestro por tenant, catálogo conectado); INSERT con cost_average=1
 *    y min_stock 1; already_active SIN tocar cost_average (preexistente_
 *    intacto); REVOKE/GRANT exactos; verificación fail-closed del cuerpo.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIG_PP64 = 'supabase/migrations/20261115120000_cp_valuation_nominal_pp64.sql';
const MIG_ACT = 'supabase/migrations/20261115120100_cp_valuation_activation_nominal.sql';

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), 'utf8');
}

describe('20261115120000 — normalización nominal 1 CUP de los 64 PUERTO PADRE', () => {
  const s = read(MIG_PP64);

  it('tabla de auditoría nace PROTEGIDA: RLS habilitado + revoke a anon/authenticated', () => {
    expect(s).toMatch(/create table if not exists public\.cp_cost_nominal_pp64_20261115_audit/);
    expect(s).toMatch(/alter table public\.cp_cost_nominal_pp64_20261115_audit enable row level security/);
    expect(s).toMatch(/revoke all on public\.cp_cost_nominal_pp64_20261115_audit from anon, authenticated/);
    // identificadores exactos + situación completa para la verificación de integridad
    for (const col of ['product_id', 'store_id', 'store_name', 'sku', 'master_product_id',
      'old_cost_average', 'old_cost_price', 'old_price', 'old_stock', 'old_sku', 'old_name']) {
      expect(s).toContain(col);
    }
    expect(s).toMatch(/mission\s+text not null default 'CP-VALUATION-NOMINAL-ACTIVATION-004'/);
  });

  it('vía canónica: fn_recalc_wac con qty_in=1/uc_in=1 para stock=0 (blend D-01 → exactamente 1)', () => {
    expect(s).toMatch(/perform public\.fn_recalc_wac\(/);
    expect(s).toContain("'cp_valuation_004_nominal'");
    expect(s).toMatch(/r\.store_id, r\.product_id, 'cp_valuation_004_nominal',\s*\n\s*1, 1,/);
    expect(s).toMatch(/stock_current = 0/);
  });

  it('vía sellada (stock>0 y huérfanos): token app.wac_writer + asiento explícito en wac_change_log', () => {
    expect(s).toMatch(/set local app\.wac_writer = 'fn_recalc_wac';/);
    expect(s).toMatch(/insert into public\.wac_change_log[\s\S]*?'cp_valuation_004_nominal_owner_decision'/);
    expect(s).toMatch(/wac_before, wac_after/);
  });

  it('IDEMPOTENCIA ESTRICTA: los 3 bucles solo procesan filas TODAVÍA en cost_average = 0', () => {
    const loops = s.match(/for r in[\s\S]*?loop/g) ?? [];
    expect(loops.length).toBe(3);
    for (const l of loops) expect(l).toMatch(/and p\.cost_average = 0/);
    // snapshot idempotente por producto
    expect(s).toMatch(/on conflict \(product_id\) do nothing/);
  });

  it('verificación fail-closed: cero universal, costos documentales, integridad y cero documentos ficticios', () => {
    expect(s).toMatch(/quedan % productos con cost_average = 0/);
    expect(s).toMatch(/% productos con cost_average nulo/);
    expect(s).toMatch(/% productos con cost_average negativo/);
    expect(s).toMatch(/costos documentales ALTERADOS/);
    expect(s).toMatch(/stock\/precio\/sku\/nombre\/maestro ALTERADOS/);
    expect(s).toMatch(/p\.stock_current\s+is distinct from a\.old_stock/);
    expect(s).toMatch(/p\.price\s+is distinct from a\.old_price/);
    expect(s).toMatch(/p\.master_product_id is distinct from a\.master_product_id/);
    expect(s).toMatch(/documentos alterados \(receipts/);
    expect(s).toMatch(/asientos wac_change_log % < esperados/);
    expect(s).toMatch(/% precios negativos/);
  });

  it('asiento global de auditoría con la misión y la autorización del propietario', () => {
    expect(s).toContain("values ('COST_NOMINAL_PP64_OWNER_DECISION', 'system'");
    expect(s).toContain("'CP-VALUATION-NOMINAL-ACTIVATION-004'");
    expect(s).toMatch(/ADENDA CP-VALUATION-NOMINAL-ACTIVATION-004/);
    expect(s).toContain('decision ya autorizada, sin nueva autorización');
  });
});

describe('20261115120100 — activate_master_product respeta la política nominal', () => {
  const s = read(MIG_ACT);
  const body = s.slice(
    s.indexOf('CREATE OR REPLACE FUNCTION public.activate_master_product'),
    s.indexOf('$function$', s.indexOf('AS $function$', s.indexOf('CREATE OR REPLACE FUNCTION public.activate_master_product')) + 13),
  );

  it('identidad idéntica: firma, atributos y anti-spoofing de 20261114190100', () => {
    expect(body).toMatch(/CREATE OR REPLACE FUNCTION public\.activate_master_product\(\s*p_master_id uuid,\s*p_store_id uuid,\s*p_user_id uuid DEFAULT NULL,\s*p_operational_class public\.product_operational_class DEFAULT 'venta'\s*\)/);
    expect(body).toMatch(/RETURNS jsonb/);
    expect(body).toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/SET search_path TO 'public'/);
    expect(body).toMatch(/CASE WHEN auth\.role\(\) = 'service_role'\s+THEN COALESCE\(p_user_id, auth\.uid\(\)\) ELSE auth\.uid\(\) END/);
  });

  it('validaciones VERBATIM: autorización, roles, maestro por tenant y catálogo conectado', () => {
    for (const check of ['ERR_UNAUTHENTICATED', 'ERR_STORE_NOT_FOUND', 'ERR_UNAUTHORIZED',
      'ERR_MASTER_NOT_FOUND', 'ERR_STORE_MISMATCH', 'ERR_MASTER_ARCHIVED', 'ERR_STORE_NOT_CONNECTED',
      'has_store_access_as', 'is_admin_check', 'has_store_role_as', 'is_catalog_store_connected']) {
      expect(body).toContain(check);
    }
    expect(body).toMatch(/ARRAY\['admin','manager','encargado'\]::text\[\]/);
  });

  it('ALTA: fila local con cost_average=1 nominal (patrón importador), price/cost_price propios en 0', () => {
    expect(body).toMatch(/cost_price, cost_average,\s*\n\s*min_stock/);
    expect(body).toMatch(/0, 'CUP', 0, 1, 1, 0, true, true, p_operational_class\)/);
    expect(body).toMatch(/nominal_cost_assigned.*true/);
    expect(body).toMatch(/cost_average_origin.*'nominal_1cup_owner_policy'/);
    expect(body).toMatch(/CP-VALUATION-NOMINAL-ACTIVATION-004/);
    // la primera recepción real sustituye el nominal vía el escritor canónico
    expect(body).toMatch(/fn_recalc_wac/);
  });

  it('REACTIVACIÓN: NUNCA toca cost_average (preexistente_intacto) — sin degradación de WAC', () => {
    const already = body.slice(body.indexOf('IF v_existing IS NOT NULL'), body.indexOf('END IF;', body.indexOf('IF v_existing IS NOT NULL')));
    expect(already).not.toMatch(/SET\s+cost_average/);
    expect(body).toMatch(/cost_average_origin.*'preexistente_intacto'/);
    // la vía already_active solo actualiza la clasificación pedida
    expect(already).toMatch(/SET operational_class = p_operational_class/);
  });

  it('ACL exactos: REVOKE a PUBLIC/anon + GRANT solo a authenticated/service_role', () => {
    expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.activate_master_product\(uuid, uuid, uuid, public\.product_operational_class\) FROM PUBLIC, anon;/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.activate_master_product\(uuid, uuid, uuid, public\.product_operational_class\) TO authenticated, service_role;/);
  });

  it('verificación fail-closed del cuerpo tras el CREATE OR REPLACE', () => {
    expect(s).toMatch(/CP-VALUATION-004: activate_master_product NO existe tras la migración/);
    expect(s).toMatch(/el cuerpo del RPC no incorpora la política nominal/);
    expect(s).toMatch(/nominal_1cup_owner_policy/);
    expect(s).toMatch(/preexistente_intacto/);
  });
});
