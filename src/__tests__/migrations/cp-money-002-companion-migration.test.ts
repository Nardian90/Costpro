/**
 * CP-MONEY-002 (D2+D3, posmerge #1467) — Verificación estática de la
 * migración companion 20261025120000.
 *
 * El entorno local no dispone de Postgres/Supabase (la ejecución real
 * corresponde al pipeline autorizado del proyecto; la sintaxis fue además
 * validada con el parser oficial de PostgreSQL — libpg-query — para el SQL
 * completo y el cuerpo plpgsql). Este test asegura que la companion:
 *
 *   D2 — ELIMINA el overload legado de 31 params que la 20261024150000 dejó
 *        vivo (CREATE OR REPLACE con lista de parámetros DISTINTA crea un
 *        SEGUNDO overload; dos firmas coexistiendo reproducen el incidente
 *        PGRST203 del 2026-10-18). El DROP usa la firma de identidad EXACTA
 *        desplegada (verificada con pg_get_function_identity_arguments el
 *        2026-10-24) y SIN p_payment_components — borrar otra firma destruiría
 *        la función nueva.
 *
 *   D3 — AÑADE el rechazo de componentes DUPLICADOS (mismo método+moneda dos
 *        veces) en §13.7: sin él, §17 inserta filas del ledger con la MISMA
 *        idempotency_key 'pay-<method>-<currency>-<tx>' y payment_transactions
 *        NO tiene UNIQUE(idempotency_key) (verificado: solo PK) → filas
 *        duplicadas en la fuente autoritativa del Reporte Entrega.
 *
 * Además preserva las invariantes de la 20261024150000 (param_hash con
 * componentes, §17 una fila por componente con tasa persistida, PT011,
 * ACL de paridad y recarga del caché de PostgREST).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261025120000_cp_money_002_postmerge_integrity.sql';

function sql(): string {
  return readFileSync(resolve(process.cwd(), MIGRATION), 'utf-8');
}

/** Firma de identidad de la create_sale_v2 legada desplegada en producción
 *  (v2.24.1 — 31 params, SIN p_payment_components). */
const LEGACY_SIGNATURE =
  'public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text, p_notes text, p_payment_incidents jsonb, p_cash_received_cup numeric, p_cash_received_usd numeric, p_change_given_cup numeric, p_change_given_usd numeric, p_change_currency text)';

describe('migración companion 20261025120000 (CP-MONEY-002) — D2: un solo overload', () => {
  it('hace DROP de la firma legada de 31 params con la identidad EXACTA', () => {
    const s = sql();
    expect(s).toContain(`DROP FUNCTION IF EXISTS ${LEGACY_SIGNATURE};`);
  });

  it('el DROP NO incluye p_payment_components (no destruye la firma nueva)', () => {
    const dropLine = sql().split('\n').find((l) => l.startsWith('DROP FUNCTION IF EXISTS'));
    expect(dropLine).toBeDefined();
    expect(dropLine!).not.toContain('p_payment_components');
  });

  it('el DROP usa IF EXISTS (idempotente en BD ya corregidas)', () => {
    const dropLine = sql().split('\n').find((l) => l.startsWith('DROP FUNCTION IF EXISTS'));
    expect(dropLine).toBeDefined();
  });

  it('redefine UNA sola vez la firma de 32 params con p_payment_components DEFAULT NULL', () => {
    const s = sql();
    const creates = s.match(/CREATE OR REPLACE FUNCTION public\.create_sale_v2\(/g) || [];
    expect(creates.length).toBe(1);
    expect(s).toContain('p_change_currency text DEFAULT NULL::text, p_payment_components jsonb DEFAULT NULL::jsonb)');
  });

  it('ACL de paridad: GRANT EXECUTE a authenticated y service_role sobre la firma nueva', () => {
    const s = sql();
    const grants = s.match(/^GRANT EXECUTE ON FUNCTION public\.create_sale_v2\(/gm) || [];
    expect(grants.length).toBe(2);
    expect(s).toContain('p_payment_components jsonb) TO authenticated;');
    expect(s).toContain('p_payment_components jsonb) TO service_role;');
  });

  it('recarga el caché de PostgREST (patrón del repo)', () => {
    expect(sql()).toContain("NOTIFY pgrst, 'reload schema';");
  });
});

describe('migración companion 20261025120000 (CP-MONEY-002) — D3: duplicados', () => {
  it('§13.7 rechaza componentes duplicados por (método, moneda) — fail-closed', () => {
    const s = sql();
    expect(s).toMatch(
      /GROUP BY lower\(btrim\(c->>'method'\)\), upper\(btrim\(c->>'currency'\)\)\s+HAVING count\(\*\) > 1/,
    );
    expect(s).toContain(
      "RAISE EXCEPTION 'ERR_PAYMENT_COMPONENTS_INVALID: componentes duplicados",
    );
  });

  it('el rechazo vive DENTRO del bloque de componentes (§13.7, antes de la resolución de tasa)', () => {
    const s = sql();
    const dupIdx = s.indexOf('componentes duplicados — agrupa');
    const tasaIdx = s.indexOf('-- Tasa USD de la operación');
    const nullIdx = s.indexOf('IF p_payment_components IS NOT NULL THEN');
    expect(nullIdx).toBeGreaterThan(-1);
    expect(dupIdx).toBeGreaterThan(nullIdx);
    expect(tasaIdx).toBeGreaterThan(dupIdx);
  });
});

describe('migración companion 20261025120000 (CP-MONEY-002) — invariantes de la v2.25.0 preservadas', () => {
  it('param_hash de idempotencia incluye los componentes', () => {
    expect(sql()).toContain("'|payment_components=' || COALESCE(p_payment_components::text, '')");
  });

  it('§17 persiste UNA FILA por componente con moneda real y tasa de la operación', () => {
    const s = sql();
    expect(s).toContain("CASE WHEN v_comp_cur = 'USD' THEN v_usd_rate ELSE 1.0 END");
    expect(s).toContain("'pay-' || v_comp_method || '-' || v_comp_cur || '-' || v_tx_id::text");
  });

  it('PT011: la validación post-INSERT Σ(amount_cup) = total sigue presente', () => {
    expect(sql()).toContain('ERR_PAYMENT_INVARIANT_VIOLATED');
  });

  it('seguridad intacta: SECURITY DEFINER + search_path fijado + auth por tienda', () => {
    const s = sql();
    expect(s).toContain('SECURITY DEFINER');
    expect(s).toContain("SET search_path TO 'public', 'pg_temp'");
    expect(s).toContain('has_store_access_as');
  });

  it('sin componentes el flujo previo se conserva (§13.7 con NULL no deriva pools)', () => {
    const s = sql();
    expect(s).toContain('v_components_ok := false;');
    expect(s).toContain('IF NOT v_components_ok AND v_zelle_amt > 0 THEN');
  });
});
