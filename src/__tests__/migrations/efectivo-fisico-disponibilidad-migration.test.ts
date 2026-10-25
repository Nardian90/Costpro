/**
 * MISIÓN P0 «EFECTIVO FANTASMA» (2026-10-26) — Verificación estática de la
 * migración 20261026200000_efectivo_fisico_disponibilidad.sql.
 *
 * Contrato crítico del cierre:
 *   - get_cash_flow_summary y get_cash_shift_expected AÑADEN physical_cash
 *     {CUP, USD} y valuation_residual_cup — una sola fuente de verdad para la
 *     disponibilidad física (misma lectura 'infinity' que las autorizaciones).
 *   - valuation_residual_cup = expected_cash − physical_cash.CUP, clasificado
 *     como valoración contable JAMÁS como efectivo disponible.
 *   - Los cuerpos base (fórmula del esperado, ventana del turno, fondo) se
 *     toman VERBATIM de las definiciones vivas: ningún término existente
 *     cambia de valor.
 *   - NINGÚN reductor del cajón se toca (create/reverse_cash_flow_document,
 *     close_cash_shift, etc. quedan en 20261026000000 — sin regresión).
 *   - Sin cambios de esquema (solo CREATE OR REPLACE — aditivo e idempotente).
 *   - ACL idénticas a las vivas (summary: service_role; shift_expected:
 *     authenticated + service_role).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261026200000_efectivo_fisico_disponibilidad.sql';

function sql(): string {
  return readFileSync(resolve(process.cwd(), MIGRATION), 'utf8');
}

describe('migración 20261026200000 — disponibilidad física + residuo de valoración en los RPCs de resumen', () => {
  it('contiene SOLO las DOS funciones de resumen y NADA de DDL de esquema', () => {
    const s = sql();
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.get_cash_shift_expected\(p_store_id uuid\)/);
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.get_cash_flow_summary\(p_store_id uuid, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone\)/);
    // Aditivo: sin cambios de esquema ni de reductores del cajón
    expect(s).not.toMatch(/\bCREATE TABLE\b/i);
    expect(s).not.toMatch(/\bALTER TABLE\b/i);
    expect(s).not.toMatch(/\bDROP TABLE\b/i);
    expect(s).not.toMatch(/\bCREATE INDEX\b/i);
    expect(s).not.toMatch(/CREATE OR REPLACE FUNCTION public\.create_cash_flow_document/);
    expect(s).not.toMatch(/CREATE OR REPLACE FUNCTION public\.reverse_cash_flow_document/);
    expect(s).not.toMatch(/CREATE OR REPLACE FUNCTION public\.close_cash_shift/);
    expect(s).not.toMatch(/CREATE OR REPLACE FUNCTION public\.get_cash_currency_summary/);
  });

  it('AMBAS funciones exponen physical_cash {CUP, USD} del libro autoritativo', () => {
    const s = sql();
    // Dos funciones × (lectura del libro físico + campo en el resultado)
    const lecturas = s.match(/get_cash_currency_summary\(\s*p_store_id, NULL, 'infinity'::timestamptz\)/g) ?? [];
    expect(lecturas.length).toBe(4); // 2 por función (CUP y USD)
    const campos = s.match(/'physical_cash', jsonb_build_object\(/g) ?? [];
    expect(campos.length).toBe(2);
    expect(s).toMatch(/'CUP', round\(v_phys_cup, 2\)/);
    expect(s).toMatch(/'USD', round\(v_phys_usd, 2\)/);
    // La lectura usa el MISMO tope que las autorizaciones del cajón
    // (20261026000000 R1): lo que la UI presenta = lo que el RPC exige.
    expect(s).not.toMatch(/get_cash_currency_summary\(\s*p_store_id, NULL, NULL\)/);
  });

  it('AMBAS funciones exponen valuation_residual_cup = esperado canónico − físico CUP', () => {
    const s = sql();
    const formulas = s.match(/v_valuation_residual := round\(v_expected_cash - v_phys_cup, 2\);/g) ?? [];
    expect(formulas.length).toBe(2);
    const campos = s.match(/'valuation_residual_cup', v_valuation_residual/g) ?? [];
    expect(campos.length).toBe(2);
    // El residuo queda DOCUMENTADO como valoración, no como efectivo
    expect(s).toMatch(/NUNCA es[\s\S]{0,40}efectivo disponible/);
    expect(s).toMatch(/jamás[\s\S]{0,40}disponible/);
    expect(s).toContain('Residuo de valoración');
  });

  it('la fórmula del esperado canónico permanece VERBATIM (sin cambios de valor)', () => {
    const s = sql();
    // La fórmula certificada v2.23.0 + recuperaciones (20261024400000),
    // presente en ambas funciones, sin alteración de términos.
    const formulas = s.match(/v_expected_cash := v_opening \+ v_cash_sales \+ v_cash_production \+ v_cash_flow_in\s*\n\s*- v_cash_outflows - v_cash_commissions - v_cash_flow_out\s*\n\s*- v_cash_refunds \+ v_cash_recoveries;/g) ?? [];
    expect(formulas.length).toBe(2);
    // La ventana del turno y el lado USD físico del arqueo (D8) intactos
    expect(s).toMatch(/v_window_start := COALESCE\(v_window_start, '1970-01-01 00:00:00\+00'::timestamptz\);/);
    expect(s).toMatch(/v_expected_cash_usd := round\(v_opening_usd \+ v_window_usd_net, 2\);/);
    // El período y el fondo de get_cash_flow_summary intactos
    expect(s).toMatch(/'fondo_vigente', v_fondo,/);
    expect(s).toMatch(/'period', jsonb_build_object\(/);
  });

  it('ACL idénticas a las vivas (sin cambios de permisos)', () => {
    const s = sql();
    expect(s).toContain('revoke all on function public.get_cash_shift_expected(uuid) from public;');
    expect(s).toContain('grant execute on function public.get_cash_shift_expected(uuid) to authenticated, service_role;');
    const sig3 = 'get_cash_flow_summary(uuid, timestamp with time zone, timestamp with time zone)';
    expect(s).toContain(`revoke all on function public.${sig3} from public;`);
    expect(s).toContain(`grant execute on function public.${sig3} to service_role;`);
    expect(s).not.toMatch(/grant execute on function public\.get_cash_flow_summary.*to authenticated/);
  });

  it('documenta la regla inviolable y el incidente ENERVIDA (auditoría)', () => {
    const s = sql();
    expect(s).toContain('REGLA INVOLABLE');
    expect(s).toContain('2.820,00');
    expect(s).toContain('MISIÓN EFECTIVO FÍSICO');
    expect(s).toMatch(/^BEGIN;/m);
    expect(s).toMatch(/^COMMIT;/m);
  });
});
