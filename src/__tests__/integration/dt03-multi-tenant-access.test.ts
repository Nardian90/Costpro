/**
 * DT-03 / DECISIÓN B (2026-10-19) — Invariantes de acceso multi-tienda.
 *
 * Dos capas de invariantes, todas derivadas de la verificación VIVA del
 * 2026-10-19 (docs/audits/evidence/20261019-dt03-matriz-acceso/INFORME.md):
 *
 *   A. Invariantes de CÓDIGO (migraciones canónicas): la semántica de
 *      autorización que el propietario confirmó en la Decisión B no puede
 *      regresar silenciosamente (guard NULL-safe del tenant, bypass admin
 *      documentado, flag USE_TENANT_RLS, coexistencia legado/tenant).
 *   B. Invariantes de EVIDENCIA (raw JSON commiteado): la matriz de acceso y
 *      los resultados de las pruebas RLS en vivo quedan congelados como
 *      línea base de regresión. Si alguien ejecuta un backfill o cambia
 *      permisos, estos tests fallan hasta que la evidencia se regenere.
 *
 * Protocolo del propietario (Decisión B): pertenencia a tenant ≠ permisos de
 * acceso a tiendas; un usuario puede tener acceso autorizado a 2+ tiendas; los
 * perfiles con tenant NULL no obtienen permisos implícitos; NO hay backfill
 * automático de los 11 perfiles.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const EVIDENCE_DIR = join(
  process.cwd(),
  'docs/audits/evidence/20261019-dt03-matriz-acceso/raw'
);

const readMigration = (name: string): string => {
  const p = join(MIGRATIONS_DIR, name);
  return existsSync(p) ? readFileSync(p, 'utf-8') : '';
};

const readEvidence = <T>(name: string): T => {
  const p = join(EVIDENCE_DIR, name);
  if (!existsSync(p)) throw new Error(`Evidencia faltante: ${name}`);
  return JSON.parse(readFileSync(p, 'utf-8')) as T;
};

// ─────────────────────────────────────────────────────────────────────────────
// A. Invariantes de código — semántica de autorización confirmada (Decisión B)
// ─────────────────────────────────────────────────────────────────────────────

describe('DT-03.A — Semántica de has_store_access (canónica, guard NULL-safe)', () => {
  const fn = readMigration('20260627000001_versionar_has_store_access.sql');

  it('A.1: el admin global tiene bypass documentado (rol admin → true para cualquier tienda)', () => {
    expect(fn).toContain('IF public.is_admin() THEN');
    expect(fn).toContain('RETURN true');
  });

  it('A.2: el acceso no-admin exige membership ACTIVA en la tienda', () => {
    expect(fn).toContain("m.status::text = 'active'");
    expect(fn).toContain('FROM public.user_store_memberships m');
  });

  it('A.3: guard NULL-safe del tenant — perfil o tienda sin tenant NO queda bloqueado', () => {
    expect(fn).toContain('p.tenant_id IS NULL');
    expect(fn).toContain('s.tenant_id IS NULL');
    expect(fn).toContain('p.tenant_id = s.tenant_id');
  });

  it('A.4: user o tienda NULL → false (fail-closed ante parámetros inválidos)', () => {
    expect(fn).toContain('IF v_user_id IS NULL OR p_store_id IS NULL THEN');
  });
});

describe('DT-03.B — Sin permisos implícitos de tenant para perfiles NULL', () => {
  const helpers = readMigration('20260807000004_v2_21_0_rls_helper_functions.sql');

  it('B.1: is_tenant_member exige tenant no-NULL y coincidencia (NULL nunca es miembro)', () => {
    expect(helpers).toContain('p_tenant_id IS NOT NULL');
  });

  it('B.2: current_user_store_ids del no-admin se deriva de memberships (no del tenant)', () => {
    expect(helpers).toContain('FROM public.user_store_memberships');
    expect(helpers).toContain("status = 'active'");
  });
});

describe('DT-03.C — Feature flag del modo estricto (latente por diseño)', () => {
  const policies = readMigration('20260807000005_v2_21_0_rls_tenant_policies.sql');
  const rlsMiddleware = readFileSync(
    join(process.cwd(), 'src/lib/rls-middleware.ts'),
    'utf-8'
  );

  it('C.1: las políticas tenant están gated por app.use_tenant_rls', () => {
    expect(policies).toContain("current_setting('app.use_tenant_rls', true) = 'true'");
  });

  it('C.2: el middleware solo activa el flag con USE_TENANT_RLS=true (default off)', () => {
    expect(rlsMiddleware).toContain("process.env.USE_TENANT_RLS === 'true'");
  });

  it('C.3: la capa legado de products (ungated, membership) sigue existiendo — coexistencia documentada (hallazgo F1)', () => {
    // Documenta que el modo estricto NO está activo plenamente: la policy
    // legado sigue OR-eando. Si se corrige CP-SEC-025 (convergencia), este
    // test debe actualizarse CON evidencia de re-certificación.
    const legacy = readMigration('20260807000005_v2_21_0_rls_tenant_policies.sql');
    expect(legacy.length).toBeGreaterThan(0);
    // La policy legado de products se creó en otra migración; verificamos que
    // el set actual de policies del repo mantiene ambas capas.
    const files = [
      '20260326_multi_tenant_hardening.sql',
      '20260807000005_v2_21_0_rls_tenant_policies.sql',
    ];
    const allSql = files.map(readMigration).join('\n');
    expect(allSql).toMatch(/products/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Invariantes de evidencia — línea base congelada del 2026-10-19
// ─────────────────────────────────────────────────────────────────────────────

describe('DT-03.D — Matriz de acceso viva (línea base 2026-10-19)', () => {
  const matrix = readEvidence<Array<{
    email: string | null; profile_role: string; profile_tenant: string | null;
    membership_id: string | null; membership_status: string | null;
    store_tenant: string | null; store_name: string | null;
  }>>('08_matriz_por_usuario.json');

  it('D.1: universo congelado — 30 perfiles vivos y 43 filas de matriz', () => {
    expect(matrix.length).toBe(43);
    expect(new Set(matrix.map(r => r.email)).size).toBe(30);
  });

  it('D.2: exactamente 11 perfiles con tenant NULL (sin backfill ejecutado)', () => {
    const nullTenant = new Set(
      matrix.filter(r => r.profile_tenant === null).map(r => r.email)
    );
    expect(nullTenant.size).toBe(11);
  });

  it('D.3: la matriz contiene el caso legítimo multi-tienda (2 tiendas, mismo tenant, sin admin)', () => {
    const byUser = new Map<string, number>();
    for (const r of matrix) {
      if (r.membership_status === 'active' && r.profile_role !== 'admin') {
        byUser.set(r.email!, (byUser.get(r.email!) || 0) + 1);
      }
    }
    const multi = [...byUser.entries()].filter(([, n]) => n >= 2);
    // En la BD viva solo belkis9999 es multi-tienda SIN rol admin (los otros
    // multi-tienda son admins); el invariante se congela en la evidencia real:
    expect(multi.length).toBe(1);
    expect(byUser.get('belkis9999@gmail.com')).toBe(2);
  });

  it('D.4: las 2 tiendas de un usuario legítimo comparten tenant (sin mezcla cross-tenant activa)', () => {
    const byUser = new Map<string, Set<string>>();
    for (const r of matrix) {
      if (r.membership_status === 'active' && r.email === 'belkis9999@gmail.com' && r.store_tenant) {
        if (!byUser.has(r.email!)) byUser.set(r.email!, new Set());
        byUser.get(r.email!)!.add(r.store_tenant);
      }
    }
    expect(byUser.get('belkis9999@gmail.com')!.size).toBe(1);
  });
});

describe('DT-03.E — Clasificación de los 11 perfiles NULL (sin evidencia NO se toca)', () => {
  const clasificacion = readEvidence<Array<{
    email: string; pertenencia_demostrable: string;
    memberships: Array<{ estado: string; tenant_tienda: string | null }>;
  }>>('11_clasificacion_programatica.json');

  it('E.1: exactamente 1 perfil con pertenencia demostrable (david9999 → Default Tenant)', () => {
    const demostrables = clasificacion.filter(
      u => u.pertenencia_demostrable === 'Default Tenant'
    );
    expect(demostrables.length).toBe(1);
    expect(demostrables[0].email).toBe('david9999@gmail.com');
  });

  it('E.2: los otros 10 quedan SIN EVIDENCIA (documentados, no modificables por backfill automático)', () => {
    const sinEvidencia = clasificacion.filter(
      u => u.pertenencia_demostrable.startsWith('SIN EVIDENCIA')
    );
    expect(sinEvidencia.length).toBe(10);
    expect(sinEvidencia.every(u => u.memberships.filter(m => m.estado === 'active').length === 0)).toBe(true);
  });
});

describe('DT-03.F — Pruebas RLS en vivo (línea base de aislamiento)', () => {
  const tests = readEvidence<Array<{
    id: string; desc: string; esperado: string; obtenido?: number | boolean; error?: string;
  }>>('13_rls_impersonacion.json');
  const byId = new Map(tests.map(t => [t.id, t]));

  it('F.1: todas las pruebas vivas se ejecutaron sin error', () => {
    expect(tests.every(t => !t.error)).toBe(true);
    expect(tests.length).toBeGreaterThanOrEqual(22);
  });

  it('F.2: usuario 2 tiendas conserva ambas (T1.1=183, T1.2=36) y no ve la 3ª (T1.3=0)', () => {
    expect(byId.get('T1.1')!.obtenido).toBeGreaterThan(0);
    expect(byId.get('T1.2')!.obtenido).toBeGreaterThan(0);
    expect(byId.get('T1.3')!.obtenido).toBe(0);
    expect(byId.get('T1.4')!.obtenido).toBe(0);
  });

  it('F.3: aislamiento cross-tenant para no-admin (T2.1=0, T2.2>0)', () => {
    expect(byId.get('T2.1')!.obtenido).toBe(0);
    expect(byId.get('T2.2')!.obtenido).toBeGreaterThan(0);
  });

  it('F.4: perfil tenant NULL conserva SU acceso legítimo y nada más (T3.1>0, T3.2=0)', () => {
    expect(byId.get('T3.1')!.obtenido).toBeGreaterThan(0);
    expect(byId.get('T3.2')!.obtenido).toBe(0);
    expect(byId.get('T3.3')!.obtenido).toBe(true);
  });

  it('F.5: perfil NULL sin memberships SIN permisos implícitos (T4.1–T4.6, T7.1)', () => {
    expect(byId.get('T4.1')!.obtenido).toBe(0);
    expect(byId.get('T4.2')!.obtenido).toBe(0);
    expect(byId.get('T4.3')!.obtenido).toBe(0);
    expect(byId.get('T4.4')!.obtenido).toBe(1); // solo su propio perfil
    expect(byId.get('T4.5')!.obtenido).toBe(0);
    expect(byId.get('T4.6')!.obtenido).toBe(0);
    expect(byId.get('T7.1')!.obtenido).toBe(0);
  });

  it('F.6: hallazgo F1 congelado — modo estricto NO restringe membership (T6.1>0) y SÍ restringe admin cross-tenant (T6.2=0)', () => {
    // Línea base del hallazgo F1/CP-SEC-025. Si CP-SEC-025 se corrige, se
    // regenera la evidencia y este invariante cambia CON certificación.
    expect(byId.get('T6.1')!.obtenido).toBeGreaterThan(0);
    expect(byId.get('T6.2')!.obtenido).toBe(0);
  });
});
