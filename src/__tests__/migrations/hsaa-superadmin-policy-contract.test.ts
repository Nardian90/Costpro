/**
 * MISIÓN TRANSVERSAL DE SEGURIDAD (2026-10-27) — Contrato de política y
 * prueba de regresión (Caso K) de la corrección has_store_access_as.
 *
 * Caso K (regresión demostrada, sin revertir producción):
 *   1. Las definiciones ORIGINALES de la familia contenían el check estricto
 *      de perfil «= 'admin'» que rechazaba falsamente al superadmin — se
 *      documenta aquí contra los archivos históricos (no contra producción).
 *   2. La migración 20261027120000 sucede a cada definición original en el
 *      stream (orden lexicográfico de nombres = orden de aplicación), de modo
 *      que el replay del contrato de seguridad termina en la versión corregida.
 *   3. El objetivo de la delegación — is_admin_check — incluye
 *      ('admin','superadmin') por contrato (anti-drift: si alguien lo rompe,
 *      esta batería falla y no toda la cadena silenciosamente).
 *   4. La política efectiva por rol queda fijada como tabla de verdad textual:
 *      superadmin global · admin global (como ya era) · tenant_admin y
 *      operativos por membresía · NULL/desconocido → false.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const NEW = 'supabase/migrations/20261027120000_has_store_access_as_superadmin_policy.sql';
const ORIG_HSAA = 'supabase/migrations/20260726000002_v1_2_devolutions_customers_quotations_kardex_fiscal.sql';
const ORIG_CAN_ADMIN = 'supabase/migrations/20260905000001_w9_b8_modelo_c_undo_reverse_authorization.sql';
const ORIG_CAN_REVERSE = 'supabase/migrations/20260905000002_w9_b10_reverse_document_authorization.sql';
const ORIG_HMAA = 'supabase/migrations/20260818000001_security_hardening_h1_h2_h3.sql';
const IS_ADMIN_CHECK_DEF = 'supabase/migrations/20261026120000_organizaciones_superadmin_pertenencia_unica.sql';

function sql(file: string): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8');
}
function stripComments(t: string): string {
  return t.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}
function fnBody(s: string, name: string): string {
  const start = s.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start === -1) return '';
  const m = /AS\s+(\$[A-Za-z0-9_]*\$)/.exec(s.slice(start)); // cualquier tag $...$
  if (!m) return '';
  const bodyStart = start + m.index + m[0].length;
  const end = s.indexOf(m[1], bodyStart);
  return s.slice(start, end);
}

describe('Caso K — el defecto existía en las definiciones originales (evidencia histórica)', () => {
  it("has_store_access_as v1.2: check estricto de perfil «v_role = 'admin'» (falso rechazo del superadmin)", () => {
    const b = stripComments(fnBody(sql(ORIG_HSAA), 'has_store_access_as'));
    expect(b).toMatch(/v_role\s*=\s*'admin'/);
    expect(b).not.toContain('superadmin');
  });

  it("can_admin_reverse_transaction (w9_b8): check estricto «v_profile_role = 'admin'»", () => {
    const b = stripComments(fnBody(sql(ORIG_CAN_ADMIN), 'can_admin_reverse_transaction'));
    expect(b).toMatch(/v_profile_role\s*=\s*'admin'/);
    expect(b).not.toContain('superadmin');
  });

  it("can_reverse_document (w9_b10): check estricto de perfil «v_profile_role = 'admin'»", () => {
    const b = stripComments(fnBody(sql(ORIG_CAN_REVERSE), 'can_reverse_document'));
    expect(b).toMatch(/v_profile_role\s*=\s*'admin'/);
  });

  it('has_management_access_as (h1_h2_h3): perfil SIN superadmin', () => {
    const b = stripComments(fnBody(sql(ORIG_HMAA), 'has_management_access_as'));
    expect(b).toContain("role IN ('admin', 'manager', 'encargado')");
    expect(b).not.toContain('superadmin');
  });
});

describe('la corrección sucede a cada original en el stream de migraciones', () => {
  const supersessions: Array<[string, string]> = [
    [ORIG_HSAA, 'has_store_access_as'],
    [ORIG_CAN_ADMIN, 'can_admin_reverse_transaction'],
    [ORIG_CAN_REVERSE, 'can_reverse_document'],
    [ORIG_HMAA, 'has_management_access_as'],
  ];

  it.each(supersessions)('%s es anterior y queda sucedida por 20261027120000', (orig) => {
    expect(NEW > orig).toBe(true); // orden de aplicación del stream (lexicográfico)
    const s = sql(NEW);
    for (const [, fn] of supersessions) {
      expect(s).toContain(`CREATE OR REPLACE FUNCTION public.${fn}(`);
    }
  });
});

describe('anti-drift: el objetivo de la delegación conserva su contrato', () => {
  it('is_admin_check incluye (admin, superadmin) y es la fuente central por p_user_id', () => {
    const b = stripComments(fnBody(sql(IS_ADMIN_CHECK_DEF), 'is_admin_check'));
    expect(b).toContain("role IN ('admin', 'superadmin')");
    expect(b).toMatch(/WHERE id = p_user_id/); // identidad server-side, no del cliente
  });

  it('la familia has_store_role_as YA incluía superadmin (política preexistente confirmada)', () => {
    // El stream ya reconocía superadmin en la variante con rol requerido:
    // la corrección ALINEA has_store_access_as con esa política existente.
    const files = [
      'supabase/migrations/20260818000001_security_hardening_h1_h2_h3.sql',
    ];
    const found = files.some((f) => {
      try {
        const b = stripComments(fnBody(sql(f), 'has_store_role_as'));
        return /role IN \('admin', 'superadmin'\)/.test(b);
      } catch {
        return false;
      }
    });
    // Si la definición no está en ese archivo, buscarla en todo el stream
    if (!found) {
      const { readdirSync } = require('node:fs') as typeof import('node:fs');
      const dir = resolve(process.cwd(), 'supabase/migrations');
      const any = readdirSync(dir)
        .filter((f) => f.endsWith('.sql') && f < NEW)
        .some((f) => /role IN \('admin', 'superadmin'\)/.test(stripComments(fnBody(sql(resolve(dir, f)), 'has_store_role_as'))));
      expect(any).toBe(true);
    } else {
      expect(found).toBe(true);
    }
  });
});

describe('política efectiva final (tabla de verdad por rol, texto del código)', () => {
  const s = stripComments(sql(NEW));

  it('superadmin: reconocido por el nivel de plataforma en las 6 funciones', () => {
    const delegations = s.match(/public\.is_admin_check\((p_user_id|p_actor|v_caller_uid)\)/g) || [];
    // raíz (1) + can_admin (1) + can_pos (1) + can_reverse (1) + hmaa (1) + approve_transfer (1)
    expect(delegations.length).toBe(6);
  });

  it('admin de plataforma: conservó su alcance global (ya lo tenía vía el check estricto)', () => {
    // is_admin_check incluye 'admin' → el alcance de admin NO cambió: sigue
    // global, igual que en is_admin()/RLS. No hay NINGÚN cambio que reduzca
    // o amplíe admin: la única diferencia funcional es superadmin. El guard
    // de la migración verifica ese contrato en tiempo de aplicación:
    expect(s).toContain("ILIKE '%''admin'', ''superadmin''%'");
  });

  it('tenant_admin y operativos: siguen atados a membresía activa (sin bypass)', () => {
    // Ninguna de las 6 funciones menciona tenant_admin: no gana bypass.
    expect(s).not.toContain("tenant_admin");
    // Los checks de membresía activa se conservan en raíz y familia
    expect(s.match(/status = 'active'/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it('denegación segura: NULL y desconocidos → false (guards intactos)', () => {
    expect(s).toContain('IF p_user_id IS NULL OR p_store_id IS NULL THEN RETURN false; END IF;');
    expect(s).toContain('IF p_actor IS NULL OR p_store_id IS NULL THEN RETURN false; END IF;');
    expect(s).toContain('IF p_transaction_id IS NULL OR p_actor IS NULL THEN RETURN false; END IF;');
    expect(s).toContain('IF p_actor IS NULL OR p_store_id IS NULL OR p_operation IS NULL THEN RETURN false; END IF;');
  });
});
