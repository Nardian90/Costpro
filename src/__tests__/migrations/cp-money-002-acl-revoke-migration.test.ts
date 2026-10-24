/**
 * CP-MONEY-002 (D5-ACL, posmerge #1469) — Verificación estática de la
 * migración 20261025130000 (REVOKE PUBLIC/anon sobre create_sale_v2/32).
 *
 * ANTECEDENTE (evidencia de solo lectura, 2026-10-24): la companion
 * 20261025120000 crea la /32 como función NUEVA (DROP de la /31 + CREATE). En
 * Supabase toda función nueva de postgres en public hereda el default ACL
 * {postgres, anon, authenticated, service_role} (pg_default_acl verificado en
 * producción). La /31 viva NO tiene anon — fue endurecida con REVOKE
 * PUBLIC/anon (20261004130000 §17.2, 20260927000001 «vector #6», v2.16.3,
 * pr4_4e). Sin este REVOKE la /32 nacería con anon=X y el check EN VIVO
 * `secdef_public_grant` (ci-gate-sql-checks.js, allowlist VACÍA, tolerancia
 * cero) pondría SQL DB Security Checks en ROJO tras la ventana.
 *
 * Este test asegura que la 20261025130000:
 *   D5-1 — REVOCA PUBLIC sobre la firma EXACTA de 32 params (el cierre real:
 *          anon hereda de PUBLIC, pero el default ACL de Supabase concede
 *          anon DIRECTAMENTE, por lo que se requieren AMBOS revoke).
 *   D5-2 — REVOCA anon explícitamente (normalización del grant directo).
 *   D5-3 — NO concede nada nuevo (ningún GRANT: mínimo privilegio).
 *   D5-4 — Es idempotente por construcción (REVOKE de lo ya revocado = no-op)
 *          y ordenada DESPUÉS de la companion por filename (20261025130000 >
 *          20261025120000) en el stream de migraciones.
 *   D5-5 — Recarga el caché de PostgREST tras el cambio de ACL (patrón repo).
 *   D5-6 — No toca firmas: el REVOKE usa la identidad de 32 params EXACTA
 *          (con p_payment_components) — revocar sobre otra firma sería no-op.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261025130000_cp_money_002_acl_revoke_anon.sql';
const COMPANION = 'supabase/migrations/20261025120000_cp_money_002_postmerge_integrity.sql';

function sql(file = MIGRATION): string {
  return readFileSync(resolve(process.cwd(), file), 'utf-8');
}

/** Firma de identidad de la create_sale_v2 NUEVA (32 params, con
 *  p_payment_components) — la misma identidad usada por los GRANT de la
 *  companion 20261025120000. */
const NEW_SIGNATURE =
  'public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text, p_notes text, p_payment_incidents jsonb, p_cash_received_cup numeric, p_cash_received_usd numeric, p_change_given_cup numeric, p_change_given_usd numeric, p_change_currency text, p_payment_components jsonb)';

describe('migración 20261025130000 (CP-MONEY-002 D5-ACL) — REVOKE PUBLIC/anon sobre la /32', () => {
  it('revoca EXECUTE a PUBLIC sobre la firma EXACTA de 32 params (cierre del vector de herencia)', () => {
    const s = sql();
    expect(s).toContain(`REVOKE EXECUTE ON FUNCTION ${NEW_SIGNATURE} FROM PUBLIC;`);
  });

  it('revoca EXECUTE a anon explícitamente (retira el grant DIRECTO del default ACL de Supabase)', () => {
    const s = sql();
    expect(s).toContain(`REVOKE EXECUTE ON FUNCTION ${NEW_SIGNATURE} FROM anon;`);
  });

  it('NO introduce ningún GRANT (mínimo privilegio: solo restringe)', () => {
    const grantLines = sql().split('\n').filter((l) => /\bGRANT\b/.test(l) && !l.trim().startsWith('--'));
    expect(grantLines).toEqual([]);
  });

  it('la identidad revocada coincide EXACTA con la que la companion concede (32 params, con p_payment_components)', () => {
    const companion = sql(COMPANION);
    const companionGrant = companion.match(/GRANT EXECUTE ON FUNCTION (.+?) TO authenticated;/)?.[1];
    expect(companionGrant).toBeDefined();
    // Misma identidad: el REVOKE actúa sobre la función que la companion crea.
    expect(companionGrant).toBe(NEW_SIGNATURE);
    // Y esa identidad es la de 32 params (con p_payment_components al final).
    expect(NEW_SIGNATURE.endsWith('p_payment_components jsonb)')).toBe(true);
  });

  it('se ordena DESPUÉS de la companion en el stream de migraciones (filename ordering)', () => {
    const files = readdirSync(resolve(process.cwd(), 'supabase/migrations')).sort();
    const companionIdx = files.indexOf(COMPANION.split('/').pop()!);
    const revokeIdx = files.indexOf(MIGRATION.split('/').pop()!);
    expect(companionIdx).toBeGreaterThan(-1);
    expect(revokeIdx).toBeGreaterThan(companionIdx);
  });

  it('recarga el caché de PostgREST tras el cambio de ACL (patrón del repo)', () => {
    expect(sql()).toContain(`NOTIFY pgrst, 'reload schema';`);
  });

  it('documenta la evidencia del default ACL de Supabase y el check secdef_public_grant que la motiva', () => {
    const s = sql();
    expect(s).toContain('pg_default_acl');
    expect(s).toContain('secdef_public_grant');
  });
});
