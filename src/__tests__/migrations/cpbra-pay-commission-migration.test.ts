/**
 * §0.2 pay_commission — contrato de la migración
 * 20261127150000_cpbra_pay_commission_encargado.sql (estático, sin BD).
 *
 * Misión CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 FASE 3:
 * decisión del propietario — admin, manager y ENCARGADO pueden pagar
 * comisiones dentro de su tienda; clerk/usuario NO. La barrera autoritativa
 * es el gate del propio RPC (ACL authenticated + SECURITY DEFINER): un solo
 * has_store_role_as(ARRAY['admin','manager','encargado']) — patrón R-05.
 * La mecánica del cajón (advisory por tienda, guard físico de moneda,
 * idempotencia natural, gate de estado, regla de actor) queda intacta.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'supabase', 'migrations');
const PC = readFileSync(join(DIR, '20261127150000_cpbra_pay_commission_encargado.sql'), 'utf8');
// Cuerpo vivo previo (fuente de la re-emisión)
const VIVA = readFileSync(join(DIR, '20261120210000_cp_fin004_engine_rules_normalization.sql'), 'utf8');

const body = (sql: string, fn: string): string => {
  const m = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\([\\s\\S]*?\\n\\$function\\$;`));
  return m ? m[0] : '';
};
const stripComments = (s: string): string => s.replace(/--[^\n]*/g, '');

describe('CP-BRA §0.2 — 20261127150000_cpbra_pay_commission_encargado.sql', () => {
  it('1. migración transaccional y firma certificada de pay_commission preservada', () => {
    expect(PC).toMatch(/^BEGIN;/m);
    expect(PC).toMatch(/\nCOMMIT;/);
    expect(PC).toContain(
      'CREATE OR REPLACE FUNCTION public.pay_commission(p_payment_id uuid, p_payment_method text, p_reference text DEFAULT NULL::text, p_currency text DEFAULT NULL::text, p_exchange_rate numeric DEFAULT NULL::numeric, p_paid_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_user_id uuid DEFAULT NULL::uuid)'
    );
  });

  it('2. el gate exige EXACTAMENTE admin, manager y encargado en el CÓDIGO (sin comentarios)', () => {
    const code = stripComments(body(PC, 'pay_commission'));
    expect(code).toContain("public.has_store_role_as(v_uid, v_comm.store_id, ARRAY['admin', 'manager', 'encargado']::text[])");
    expect(code).toContain('ERR_FORBIDDEN_ROLE');
    // El gate anterior (solo admin|manager en dos llamadas) desapareció
    expect(code).not.toContain("has_store_role_as(v_uid, v_comm.store_id, 'admin')");
    expect(code).not.toContain("requiere admin o manager'");
  });

  it('3. la mecánica del cajón queda INTACTA (advisory, guard físico, idempotencia, estado, fechas)', () => {
    const code = stripComments(body(PC, 'pay_commission'));
    expect(code).toContain('pg_advisory_xact_lock(hashtext(v_comm.store_id::text))');
    expect(code).toContain('ERR_INSUFFICIENT_CURRENCY');
    expect(code).toContain('get_cash_currency_summary');
    expect(code).toContain("idempotent_replay', true");
    expect(code).toContain('ERR_COMMISSION_STATE_CHANGED');
    expect(code).toContain('ERR_PAYMENT_DATE_FUTURE');
    expect(code).toContain("v_comm.status NOT IN ('approved', 'draft')");
  });

  it('4. regla de actor intacta: p_user_id SOLO para service_role (anti-spoofing)', () => {
    const code = stripComments(body(PC, 'pay_commission'));
    expect(code).toContain("CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END");
    expect(code).toContain('IF v_uid IS NULL THEN RAISE EXCEPTION');
  });

  it('5. el ÚNICO cambio de código respecto al cuerpo vivo (20261120210000) es el gate de roles', () => {
    const live = body(VIVA, 'pay_commission');
    const nueva = body(PC, 'pay_commission');
    expect(live).toBeTruthy();
    const norm = (s: string) => stripComments(s).split('\n').map((l) => l.trim()).filter(Boolean);
    const removed = norm(live).filter((l) => !norm(nueva).includes(l));
    const added = norm(nueva).filter((l) => !norm(live).includes(l));
    // Lo eliminado: el gate sin encargado
    expect(removed.join('\n')).toContain("has_store_role_as(v_uid, v_comm.store_id, 'admin')");
    // Lo añadido: el gate con los tres roles (comentarios no cuentan)
    expect(added.join('\n')).toContain("ARRAY['admin', 'manager', 'encargado']::text[]");
    expect(added.length).toBeLessThanOrEqual(4);
  });

  it('6. ACL invariante: REVOKE PUBLIC/anon + GRANT authenticated, service_role', () => {
    expect(PC).toMatch(/REVOKE ALL ON FUNCTION public\.pay_commission\(uuid, text, text, text, numeric, timestamp with time zone, uuid\) FROM PUBLIC;/);
    expect(PC).toMatch(/REVOKE ALL ON FUNCTION public\.pay_commission\(uuid, text, text, text, numeric, timestamp with time zone, uuid\) FROM anon;/);
    expect(PC).toMatch(/GRANT EXECUTE ON FUNCTION public\.pay_commission\(uuid, text, text, text, numeric, timestamp with time zone, uuid\) TO authenticated, service_role;/);
  });

  it('7. guards de aplicación fail-closed (PC-GUARD firma; PC-VERIFY gate+cajón+ACL sin comentarios)', () => {
    expect(PC).toContain('PC-GUARD: pay_commission(uuid,text,text,text,numeric,timestamptz,uuid) no existe');
    expect(PC).toContain('PC-VERIFY: el gate no exige admin/manager/encargado');
    expect(PC).toContain('PC-VERIFY: la regla de actor (p_user_id solo service_role) se alteró');
    expect(PC).toContain('PC-VERIFY: ACL divergente tras la reemisión');
    expect(PC).toContain("regexp_replace(v_def, '--[^\\n]*', '', 'g')");
  });

  it('8. SECURITY DEFINER + search_path preservados', () => {
    const code = body(PC, 'pay_commission');
    expect(code).toContain('SECURITY DEFINER');
    expect(code).toContain("SET search_path TO 'public', 'pg_temp'");
  });

  it('9. sin edición de histórico FUERA del RPC: ningún UPDATE/DELETE de datos por la migración (el único UPDATE es el del propio RPC, dentro de su cuerpo)', () => {
    const fnBody = body(PC, 'pay_commission');
    // La migración, SIN el cuerpo de la función, no toca datos
    const outside = stripComments(PC.replace(fnBody, ''));
    expect(outside).not.toMatch(/UPDATE\s+public\./i);
    expect(outside).not.toMatch(/DELETE\s+FROM\s+public\./i);
    // y no existe backfill adicional (solo DDL + ACL + COMMENT + guards)
    expect(outside).not.toMatch(/INSERT\s+INTO\s+public\./i);
  });

  it('10. sin secretos en el SQL', () => {
    const patterns = [
      'github' + '_pat_',
      'sb_' + 'secret_',
      'sbp_',
      'sb_' + 'publishable_',
      'eyJ' + 'hbGciOi',
    ];
    for (const p of patterns) expect(PC).not.toContain(p);
  });

  it('11. el manifiesto replay incluye la migración (posición 222; baseline 223 desde FASE 4)', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'audit-evidence', 'INFRA-011', 'e2e-migrations-manifest.json'), 'utf8')
    );
    // COSTPRO-SALES-MODAL-INPUT-AND-TRANSFER-VALIDATION-001: el stream creció
    // a 226 con 20261128120000 (+1 R-06 de main) (create_sale_v2 /36, transfer identity).
    expect(manifest.total_incluidos).toBe(227); // CP-FX-001: +1 migración 20261128120000_cp_fx_recovery_traceability
    const entry = manifest.archivos.find((a: { nombre: string }) => a.nombre === '20261127150000_cpbra_pay_commission_encargado.sql');
    expect(entry).toBeDefined();
    expect(entry.estado).toBe('incluido');
    expect(entry.sha256_original).toBe(entry.sha256_generado);
  });
});
