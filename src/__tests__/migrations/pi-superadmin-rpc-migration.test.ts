/**
 * MISIÓN INVENTARIO FÍSICO / SUPERADMIN (2026-10-26) — Verificación estática
 * de la migración 20261027030000_pi_superadmin_rpc_authorization.sql.
 *
 * Contrato crítico:
 *   - Las 12 RPCs del módulo PI (11 de escritura + confirm_inventory_adjustment)
 *     reconocen el nivel administrativo: is_admin_check(v_caller_uid) OR
 *     has_store_role/has_store_access_as — patrón ya usado por las RPCs
 *     hermanas del módulo (register_physical_inventory_sheet,
 *     get_physical_inventory_reconciliation) y ESPEJO de la RLS de las
 *     propias tablas (is_admin() OR has_store_role(...)).
 *   - Ningún gate queda sin bypass administrativo.
 *   - NO se debilita has_store_role ni has_store_access_as (compartidas).
 *   - Los roles operativos siguen requeridos en el OR (no se elimina el
 *     chequeo de membresía — se AÑADE el nivel administrativo).
 *   - v_caller_uid (patrón anti-spoofing H-7) se conserva en cada función.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261027030000_pi_superadmin_rpc_authorization.sql';
const ORIGINAL = 'supabase/migrations/20261023000000_create_physical_inventory_module.sql';

function sql(file = MIGRATION): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8');
}

const FUNCS = [
  'create_physical_inventory',
  'prepare_physical_inventory',
  'start_physical_inventory_count',
  'record_physical_inventory_counts',
  'complete_physical_inventory_count',
  'submit_physical_inventory_reconciliation',
  'review_physical_inventory_item',
  'submit_physical_inventory_authorization',
  'generate_adjustments_from_physical_inventory',
  'close_physical_inventory',
  'void_physical_inventory',
  'confirm_inventory_adjustment',
];

describe('migración 20261027030000 — gates administrativos del módulo PI', () => {
  it('recrea las 12 RPCs del módulo', () => {
    const s = sql();
    for (const fn of FUNCS) {
      expect(s).toContain(`CREATE OR REPLACE FUNCTION public.${fn}(`);
    }
  });

  it('cada gate incluye is_admin_check(v_caller_uid) OR has_store_role/has_store_access_as', () => {
    const s = sql();
    const gates = s.match(
      /IF NOT \(public\.is_admin_check\(v_caller_uid\)\s*\n\s*OR public\.(has_store_role|has_store_access_as)\(v_caller_uid,[^)]*\)\) THEN/g
    );
    expect(gates).not.toBeNull();
    expect(gates!.length).toBe(12);
  });

  it('NO queda ningún gate solo-memberships (sin bypass administrativo)', () => {
    // Solo SQL ejecutable: se excluyen las líneas de comentario del encabezado
    // (que documentan el estado «antes» con fines de revisión).
    const s = sql()
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    expect(s).not.toMatch(/IF NOT public\.has_store_role\(/);
    expect(s).not.toMatch(/IF NOT public\.has_store_access_as\(/);
  });

  it('NO redefine las funciones compartidas has_store_role / has_store_access_as (corrección quirúrgica)', () => {
    const s = sql();
    expect(s).not.toMatch(/CREATE OR REPLACE FUNCTION public\.has_store_role/);
    expect(s).not.toMatch(/CREATE OR REPLACE FUNCTION public\.has_store_access_as/);
    expect(s).not.toMatch(/CREATE OR REPLACE FUNCTION public\.is_admin_check/); // se USA, no se redefine
  });

  it('conserva el patrón anti-spoofing H-7 (v_caller_uid desde auth.uid()/p_user_id)', () => {
    const s = sql();
    const callers = s.match(/v_caller_uid UUID := CASE WHEN auth\.role\(\) = 'service_role'/g);
    expect(callers).not.toBeNull();
    expect(callers!.length).toBe(12);
  });

  it('conserva los mensajes de error de autorización originales (código de error estable)', () => {
    const s = sql();
    for (const err of [
      'ERR_UNAUTHORIZED_CREATE_PI',
      'ERR_UNAUTHORIZED_PREPARE_PI',
      'ERR_UNAUTHORIZED_COUNT',
      'ERR_UNAUTHORIZED_RECONCILE',
      'ERR_UNAUTHORIZED_REVIEW',
      'ERR_UNAUTHORIZED_SUBMIT',
      'ERR_UNAUTHORIZED_GENERATE_ADJUSTMENTS',
      'ERR_UNAUTHORIZED_CLOSE',
      'ERR_UNAUTHORIZED_VOID',
    ]) {
      expect(s).toContain(err);
    }
  });

  it('las funciones son byte-idénticas al original SALVO el gate (sin reescrituras accidentales)', () => {
    const src = sql(ORIGINAL);
    const mig = sql();
    for (const fn of FUNCS) {
      const extract = (s: string) => {
        const start = s.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
        const end = s.indexOf('\n$$;', start);
        return s.slice(start, end + 4);
      };
      const original = extract(src);
      const migrated = extract(mig);
      // Normalizar el gate transformado de vuelta al original y comparar
      const renormalized = migrated
        .replace(
          /IF NOT \(public\.is_admin_check\(v_caller_uid\)\s*\n\s*OR public\.(has_store_role|has_store_access_as)\(([^)]*)\)\) THEN/g,
          (_m, fn2, args) => `IF NOT public.${fn2}(${args}) THEN`
        );
      const norm = (x: string) => x.replace(/\s+/g, ' ').trim();
      expect(norm(renormalized)).toBe(norm(original));
    }
  });
});
