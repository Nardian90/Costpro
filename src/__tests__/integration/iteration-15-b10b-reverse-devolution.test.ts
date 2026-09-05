/**
 * W9.5 — B-10b · Iteración 15
 *
 * Modernización de reverse_devolution al pipeline canónico de inventario:
 *   reverse_devolution → FOR UPDATE → validación → fn_recalc_wac (invariante)
 *   → register_stock_movement('devolution_reverse') → stock_movements
 *   → triggers (inventory / products / kardex) → audit.
 *
 * CONGELA (fuente normativa: audit-evidence/20260905-w9-b10b/):
 *   - movement_type  'devolution_reverse' (enum) y kardex 'devolution_out'
 *   - reference_id   = devolutions.id (trazabilidad estructurada)
 *   - stock          restauración exacta -q (sin clamp GREATEST)
 *   - WAC            invariante (rama q=0; la devolución original no toca WAC)
 *   - state machine  completed → reversed (única; terminal)
 *   - idempotencia   ERR_ALREADY_REVERSED en segundo reverse
 *   - autorización   B-10 intacta: can_reverse_document('devolution') membresía
 *   - audit          REVERSE_DEVOLUTION / ADMIN_REVERSE_DEVOLUTION (+metadata aditiva)
 *   - prohibiciones  sin UPDATE directo products.stock_current ni INSERT directo
 *                    kardex_entries dentro de reverse_devolution (§29)
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

const MIGRATION = '20260905120000_w9_b10b_modernize_reverse_devolution.sql';
const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

const readMig = () => readFileSync(join(MIGRATIONS_DIR, MIGRATION), 'utf-8');
const stripComments = (sql: string) =>
  sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

/** Extrae el cuerpo de una función del SQL de la migración (delimitado por firma). */
const extractFn = (sql: string, signature: string): string => {
  const i = sql.indexOf(signature);
  if (i === -1) return '';
  const start = sql.lastIndexOf('CREATE OR REPLACE FUNCTION', i);
  const openDelim = sql.indexOf('AS $function$', i);
  if (openDelim === -1) return '';
  const end = sql.indexOf('$function$', openDelim + 'AS $function$'.length) + '$function$'.length;
  return sql.slice(start, end);
};

describe('PT-B10B.1 — Migración: enum + pipeline canónico + kardex complementario', () => {
  const mig = readMig();
  const code = stripComments(mig);

  it('existe, versionada y sin destructivos (sin DROP … CASCADE / DROP FUNCTION)', () => {
    expect(mig.length).toBeGreaterThan(1000);
    expect(code).not.toMatch(/DROP\s+[^\n]*CASCADE/i);
    expect(code).not.toMatch(/DROP\s+(FUNCTION|TRIGGER|TABLE|TYPE|POLICY)/i);
  });

  it('movement_type: enum extendido con devolution_reverse (append idempotente)', () => {
    expect(code).toContain("ALTER TYPE public.movement_type ADD VALUE IF NOT EXISTS 'devolution_reverse'");
  });

  it('reverse_devolution muta SOLO vía register_stock_movement (pipeline canónico §29)', () => {
    const fn = extractFn(code, 'public.reverse_devolution(p_devolution_id');
    expect(fn).toContain('public.register_stock_movement(');
    expect(fn).toContain("p_movement_type := 'devolution_reverse'");
  });

  it('prohibiciones §29: sin UPDATE directo de products.stock_current ni INSERT directo kardex', () => {
    const fn = extractFn(code, 'public.reverse_devolution(p_devolution_id');
    expect(fn).not.toMatch(/UPDATE\s+(public\.)?products\s+SET\s+stock_current/i);
    expect(fn).not.toMatch(/INSERT\s+INTO\s+(public\.)?kardex_entries/i);
  });

  it('kardex: rama devolution_reverse → devolution_out (tipo YA sancionado por CHECK)', () => {
    const fn = extractFn(code, 'public.auto_kardex_on_stock_movement()');
    expect(fn).toContain("WHEN NEW.movement_type = 'devolution_reverse' THEN 'devolution_out'");
    // el resto del CASE intacto (los hermanos preservados)
    expect(fn).toContain("WHEN NEW.movement_type = 'sale_reverse' THEN 'sale_reverse'");
    expect(fn).toContain("WHEN NEW.movement_type = 'purchase_reverse' THEN 'purchase_reverse'");
    expect(fn).toContain("WHEN NEW.movement_type = 'production_reverse' THEN 'production_reverse'");
    expect(fn).toContain("WHEN NEW.movement_type = 'return' THEN 'devolution_in'");
  });
});

describe('PT-B10B.2 — reverse_devolution: signo, WAC, trazabilidad, state machine', () => {
  const fn = extractFn(stripComments(readMig()), 'public.reverse_devolution(p_devolution_id');

  it('signo exacto: p_quantity := -v_item.quantity (inversa de la devolución +q)', () => {
    expect(fn).toContain('p_quantity := -v_item.quantity');
    expect(fn).not.toMatch(/GREATEST\(0/); // sin clamp silencioso
  });

  it('WAC invariante: fn_recalc_wac con qty 0 (rama frozen "evento neutro"), sin inversa falsa', () => {
    expect(fn).toContain("public.fn_recalc_wac(");
    expect(fn).toContain("'devolution_reverse',");
    expect(fn).toMatch(/0,\s*0,\s*\n?\s*jsonb_build_object\('rpc',\s*'reverse_devolution'/);
  });

  it('reference_id estructurado: p_sale_id := p_devolution_id (no dependencia de notes)', () => {
    expect(fn).toContain('p_sale_id := p_devolution_id');
  });

  it('FOR UPDATE antes de cualquier mutación (lock → validate → mutate)', () => {
    const lockPos = fn.indexOf('FOR UPDATE');
    const firstMutation = Math.min(
      ...['register_stock_movement', 'UPDATE public.devolutions', "fn_recalc_wac("]
        .map(k => fn.indexOf(k)).filter(i => i >= 0)
    );
    expect(lockPos).toBeGreaterThan(-1);
    expect(lockPos).toBeLessThan(firstMutation);
  });

  it('state machine congelada: solo completed reversible; reversed → ERR_ALREADY_REVERSED', () => {
    expect(fn).toContain("IF v_dev.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'");
    expect(fn).toContain("v_dev.status <> 'completed'");
    expect(fn).toContain("SET status = 'reversed'");
    expect(fn).not.toMatch(/'cancelled'|'refunded'|'failed'/); // no se inventan estados
  });

  it('idempotencia: segundo reverse DENIED por guard de estado (sin efectos dobles)', () => {
    // el guard ERR_ALREADY_REVERSED precede a cualquier mutación
    const guardPos = fn.indexOf('ERR_ALREADY_REVERSED');
    const mutatePos = fn.indexOf('fn_recalc_wac(');
    expect(guardPos).toBeGreaterThan(-1);
    expect(guardPos).toBeLessThan(mutatePos);
  });

  it('costo complementario: movimiento return original → cost_at_sale → cost_average → 0', () => {
    expect(fn).toContain("sm.movement_type = 'return'");
    expect(fn).toContain('ti.cost_at_sale');
    expect(fn).toContain('SELECT cost_average INTO v_uc_dev');
    expect(fn).toContain('COALESCE(v_uc_dev, 0)');
  });
});

describe('PT-B10B.3 — Autorización B-10 congelada y audit enriquecido aditivo', () => {
  const fn = extractFn(stripComments(readMig()), 'public.reverse_devolution(p_devolution_id');

  it('can_reverse_document(uid, store, devolution) presente y SIN cambios de política', () => {
    expect(fn).toContain("public.can_reverse_document(v_uid, v_dev.store_id, 'devolution')");
    // doble barrera (STORE ACCESS ≠ OPERATION AUTHORIZATION) intacta
    expect(fn).toContain('public.has_store_access_as(v_uid, v_dev.store_id)');
  });

  it('identidad: service_role ⇒ COALESCE(p_user_id, auth.uid()); resto ⇒ auth.uid() (anti-forja)', () => {
    expect(fn).toContain("CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END");
  });

  it('audit congelado + metadata aditiva del pipeline', () => {
    expect(fn).toContain("'REVERSE_DEVOLUTION', 'devolutions'");
    expect(fn).toContain("'operation', 'ADMIN_REVERSE_DEVOLUTION'");
    expect(fn).toContain("'old_status', v_dev.status, 'new_status', 'reversed'");
    expect(fn).toContain("'pipeline', 'register_stock_movement'");
    expect(fn).toContain("'movement_type', 'devolution_reverse'");
  });

  it('sin refunds introducidos (§19): la función no toca payment_transactions/cash/commissions', () => {
    expect(fn).not.toMatch(/payment_transactions|cash_movements|commission|store_credit_ledger/i);
  });
});

describe('PT-B10B.4 — No-drift de compañeros y reversibilidad', () => {
  const mig = readMig();

  it('register_stock_movement NO se redefine en la migración (único writer intacto)', () => {
    expect(mig).not.toMatch(/CREATE OR REPLACE FUNCTION\s+public\.register_stock_movement/);
  });

  it('exactamente 2 funciones redefinidas (reverse_devolution + auto_kardex)', () => {
    const fns = stripComments(mig).match(/CREATE OR REPLACE FUNCTION/g) || [];
    expect(fns.length).toBe(2);
  });

  it('header preserva identidad: SECURITY DEFINER + search_path public + firma original', () => {
    expect(mig).toMatch(/reverse_devolution\(p_devolution_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid\)\s*\n RETURNS jsonb\s*\n LANGUAGE plpgsql\s*\n SECURITY DEFINER\s*\n SET search_path TO 'public'/);
  });

  it('rollback existe y restaura los cuerpos PRE (enum documentado como no removible)', () => {
    const rb = readFileSync(join(process.cwd(), 'audit-evidence', '20260905-w9-b10b', 'rollback_reverse_devolution.sql'), 'utf-8');
    expect(rb).toContain('CREATE OR REPLACE FUNCTION public.reverse_devolution');
    expect(rb).toContain('CREATE OR REPLACE FUNCTION public.auto_kardex_on_stock_movement');
    expect(rb).toMatch(/no permite eliminar un valor de enum|SIN USO/i);
  });
});
