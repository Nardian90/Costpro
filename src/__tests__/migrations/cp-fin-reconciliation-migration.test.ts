/**
 * CP-FIN-REC-001 — Test de contrato de la migración de conciliación
 * (patrón cp-fin-partida-doble-migration.test.ts: asserts estáticos sobre el
 * SQL, sin BD). Valida lo no negociable: seguridad, RLS, guard anti-spoofing,
 * ACL service_role, corrección PAS_CREDITO_TIENDA y sanidad fail-closed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION = resolve(
  process.cwd(),
  'supabase/migrations/20261121230000_cp_fin_reconciliation_operativa_contable.sql',
);
const sql = readFileSync(MIGRATION, 'utf8');

describe('migración CP-FIN-REC-001 (conciliación operativa-contable)', () => {
  it('existe y es una transacción única idempotente', () => {
    expect(sql).toContain('20261121230000');
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/COMMIT;/m);
    // Idempotencia DDL
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.fin_reconciliation_config');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.fin_reconciliation_snapshots');
  });

  it('RPC principal: SECURITY DEFINER + guard anti-spoofing + search_path', () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.fin_get_reconciliation\(\s*p_store_id uuid, p_as_of date,/m,
    );
    expect(sql).toMatch(
      /SECURITY DEFINER SET search_path = 'public', 'pg_temp'\s+AS \$function\$/m,
    );
    // Guard V2.12.9 (mismo patrón de todos los RPC fin_*)
    expect(sql).toMatch(
      /v_caller uuid := CASE WHEN auth\.role\(\) = 'service_role' THEN coalesce\(p_user_id, auth\.uid\(\)\) ELSE auth\.uid\(\) END;/,
    );
    // Fail-closed: IS NULL OR NOT está ausente, patrón vulnerable IS NOT NULL AND NOT directo NO presente
    expect(sql).not.toMatch(/IS NOT NULL AND NOT public\.has_store_access_as/);
    expect(sql).toMatch(/RAISE EXCEPTION 'ERR_UNAUTHORIZED';/);
  });

  it('prohibición de conciliación circular: el lado operacional NO lee fin_movements', () => {
    // El helper de flujos operacionales solo toca tablas operativas + aperturas
    const helper = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.fin_cash_flows_operacional'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.fin_get_reconciliation'),
    );
    expect(helper).not.toContain('fin_movements');
    expect(helper).not.toContain('fin_entries');
    expect(helper).toContain('payment_transactions');
    expect(helper).toContain('cash_flow_documents');
  });

  it('el lado contable filtra por la generación activa', () => {
    expect(sql).toMatch(/v_gen uuid := public\.fin_active_generation\(p_store_id\);/);
    expect(sql).toMatch(/e\.generation_id IS NOT DISTINCT FROM v_gen/);
  });

  it('convención documentada de la diferencia y estados requeridos', () => {
    expect(sql).toContain('round(l.valor_op - l.valor_contable, 2) AS diferencia');
    for (const estado of ['CONCILIADO', 'DIFERENCIA', 'ALERTA', 'INCOMPLETO', 'NO_CONCILIABLE', 'PENDIENTE']) {
      expect(sql).toContain(`'${estado}'`);
    }
    expect(sql).toContain('NO CONCILIABLE — FALTA FUENTE OPERACIONAL');
  });

  it('corrección del defecto PAS_CREDITO_TIENDA (regla DEVOLUCION v4)', () => {
    expect(sql).toContain('PAS_CREDITO_TIENDA');
    expect(sql).toMatch(/"categoria":"PAS_ANTICIPOS_CLI","sentido":"credito","origen":\{"tipo":"metrica","metrica":"store_credit_cup"\}/);
    // Idempotente por marcador de notas (patrón del repo)
    expect(sql).toContain("notes LIKE '%CP-FIN-REC-001%'");
  });

  it('RLS + ACL: lectura por membresía, escritura exclusiva service_role, anon sin nada', () => {
    expect(sql).toContain('ALTER TABLE public.fin_reconciliation_snapshots ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('fin_reconciliation_snapshots_select');
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.fin_get_reconciliation\(uuid, date, date, date, uuid\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.fin_get_reconciliation\(uuid, date, date, date, uuid\) TO service_role;/);
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.fin_reconciliation_snapshot_save\(uuid, date, date, date, uuid\) FROM PUBLIC, anon, authenticated;/,
    );
    // Sin políticas de escritura (canal service_role exclusivo)
    expect(sql).not.toMatch(/CREATE POLICY \w+ ON public\.fin_reconciliation_snapshots\s+FOR (INSERT|UPDATE|DELETE)/);
  });

  it('el guardado de snapshot recalcula server-side y exige nivel de gestión', () => {
    expect(sql).toMatch(
      /v_res := public\.fin_get_reconciliation\(p_store_id, p_as_of, p_from, p_to, v_caller\);/,
    );
    expect(sql).toMatch(
      /OR public\.can_manage_store_as\(v_caller, p_store_id\)\) THEN/,
    );
  });

  it('tolerancias por cuenta sembradas (nunca un porcentaje genérico)', () => {
    expect(sql).toContain("('ACT_INVENTARIO',       0.01, 100.00, 0.010");
    expect(sql).toContain("('ACT_EFECTIVO_CUP',     0.01,   1.00, 0.000");
    expect(sql).toContain("('GAS_COSTO_VENTAS',     0.01, 100.00, 0.005");
    // ON CONFLICT DO UPDATE: la config es ajustable sin nueva migración destructiva
    expect(sql).toMatch(/ON CONFLICT \(category_code\) DO UPDATE/);
  });

  it('sanity checks fail-closed al final de la migración', () => {
    expect(sql).toMatch(/SANITY_FAIL: fin_reconciliation_snapshots sin RLS/);
    expect(sql).toMatch(/SANITY_FAIL: snapshots NO debe tener políticas de escritura/);
    expect(sql).toMatch(/SANITY_FAIL: anon tiene privilegios sobre tablas de conciliación/);
    expect(sql).toMatch(/SANITY_FAIL: la regla activa aún referencia PAS_CREDITO_TIENDA/);
  });
});
