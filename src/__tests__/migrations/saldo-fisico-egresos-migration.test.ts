/**
 * MISIÓN POST-MERGE (2026-10-24) — Verificación estática de la migración
 * 20261024220000_saldo_fisico_egresos_multimoneda.sql (Fase F).
 *
 * Contrato crítico del cierre del riesgo contable «saldo canónico vs físico»:
 *   - La rama ORDINARIA de egresos de create_cash_flow_document valida contra
 *     el SALDO FÍSICO POR MONEDA (misma fuente autoritativa que
 *     entrega_efectivo: get_cash_currency_summary -> net -> v_currency).
 *   - La disciplina canónica del turno (ERR_INSUFFICIENT_CASH) y la regla del
 *     fondo vigente (ERR_FUND_INSUFFICIENT) se CONSERVAN (reglas legítimas).
 *   - reverse_cash_flow_document valida la reversión de un INGRESO contra el
 *     físico por moneda del documento original (nunca deja el físico negativo).
 *   - El patrón determinista de idempotencia de 20261024180000 permanece
 *     intacto (la corrección no regresa el defecto de reintento de red).
 *   - ACL service_role-only con las firmas REALES (13-arg y 3-arg).
 *   - Sin cambios de esquema: solo CREATE OR REPLACE (mecanismo estándar).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261024220000_saldo_fisico_egresos_multimoneda.sql';

function sql(): string {
  return readFileSync(resolve(process.cwd(), MIGRATION), 'utf8');
}

describe('migración 20261024220000 — saldo físico por moneda en egresos y reversiones', () => {
  it('contiene las DOS funciones corregidas y NADA de DDL de esquema', () => {
    const s = sql();
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.create_cash_flow_document\(/);
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.reverse_cash_flow_document\(/);
    // Sin cambios de esquema (anti-regresión: la corrección es solo lógica)
    expect(s).not.toMatch(/\bCREATE TABLE\b/i);
    expect(s).not.toMatch(/\bALTER TABLE\b/i);
    expect(s).not.toMatch(/\bDROP TABLE\b/i);
    expect(s).not.toMatch(/\bCREATE INDEX\b/i);
  });

  it('create_cash_flow_document: la rama ordinaria valida FÍSICO por moneda (fuente única)', () => {
    const s = sql();
    // La validación física aparece DOS veces: entrega_efectivo (existente) +
    // rama ordinaria (nueva). Ambas usan la MISMA fuente autoritativa.
    const matches = s.match(/get_cash_currency_summary\(p_store_id, NULL, NULL\)/g) ?? [];
    expect(matches.length).toBe(2);
    // El rechazo por físico con la moneda del documento y el importe NATIVO
    expect(s).toMatch(/'ERR_INSUFFICIENT_CURRENCY: saldo físico % disponible=%, egreso=%', v_currency, round\(v_balance_currency, 2\), round\(v_amount, 2\)/);
    // El egreso ordinario compara el IMPORTE NATIVO (no el canónico): un egreso
    // de 150 USD no puede financiarse con CUP abundante.
    expect(s).toMatch(/IF v_amount > v_balance_currency \+ 0\.005 THEN/);
  });

  it('create_cash_flow_document: las reglas legítimas se CONSERVAN', () => {
    const s = sql();
    // Disciplina canónica del turno (v2.23.0) — intacta
    expect(s).toMatch(/IF v_amount_cup > v_expected_cash \+ 0\.005 THEN/);
    expect(s).toMatch(/'ERR_INSUFFICIENT_CASH: disponible=%, egreso=%'/);
    // Regla del fondo vigente — intacta
    expect(s).toMatch(/'ERR_FUND_INSUFFICIENT: fondo vigente=%, devolución=%'/);
    // Rol de autoridad para entrega + contraparte obligatoria — intactos
    expect(s).toContain('ERR_DELIVERY_ROLE');
    expect(s).toContain('ERR_COUNTERPARTY_REQUIRED');
  });

  it('create_cash_flow_document: patrón determinista de idempotencia INTACTO', () => {
    const s = sql();
    // Patrón de 20261024180000 (replay benigno de reintentos de red)
    expect(s).toContain("COALESCE(p_operation_date::text, '')");
    expect(s).not.toContain("COALESCE(p_operation_date, 'now')::text");
  });

  it('reverse_cash_flow_document: reversión de ingreso no deja el FÍSICO negativo', () => {
    const s = sql();
    // Validación física por moneda del documento original (importe nativo)
    expect(s).toMatch(/get_cash_currency_summary\(v_doc\.store_id, NULL, NULL\)/);
    expect(s).toMatch(/-> 'net' ->> v_doc\.currency/);
    expect(s).toMatch(/IF v_doc\.amount > v_balance_currency \+ 0\.005 THEN/);
    expect(s).toMatch(/'ERR_INSUFFICIENT_CURRENCY: anular este ingreso dejaría el saldo físico % en negativo \(disponible=%, reversión=%\)'/);
    // El chequeo canónico existente se conserva
    expect(s).toMatch(/'ERR_INSUFFICIENT_CASH: anular este ingreso dejaría el efectivo esperado en negativo/);
    // Protecciones previas intactas: doble anulación + advisory lock
    expect(s).toContain('ERR_ALREADY_ANNULLED');
    expect(s).toMatch(/pg_advisory_xact_lock\(hashtext\(v_doc\.store_id::text\)\)/);
  });

  it('ACL service_role-only con las firmas REALES (13-arg y 3-arg)', () => {
    const s = sql();
    const sig13 = 'create_cash_flow_document(uuid, text, text, numeric, text, numeric, timestamptz, text, text, text, uuid, text, uuid)';
    const sig3 = 'reverse_cash_flow_document(uuid, text, uuid)';
    expect(s).toContain(`revoke all on function public.${sig13} from public;`);
    expect(s).toContain(`grant execute on function public.${sig13} to service_role;`);
    expect(s).toContain(`revoke all on function public.${sig3} from public;`);
    expect(s).toContain(`grant execute on function public.${sig3} to service_role;`);
    // Nunca grant a authenticated (convención de mutaciones)
    expect(s).not.toMatch(/grant execute on function public\.(create|reverse)_cash_flow_document.*to authenticated/);
  });

  it('documenta la causa raíz, la regla y el estado de aplicación (auditoría)', () => {
    const s = sql();
    expect(s).toContain('APLICACIÓN A PRODUCCIÓN PENDIENTE DE AUTORIZACIÓN');
    expect(s).toContain('no se compensan implícitamente');
    expect(s).toContain('MISIÓN POST-MERGE 2026-10-24');
  });
});
