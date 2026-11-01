/**
 * Test de contrato — CP-PROVEEDORES-001 — migración
 * 20261101120000_suppliers_visibilidad_multiusuario.sql.
 *
 * Fija el contenido de la migración para que el replay del contrato de
 * seguridad termine en la versión corregida (patrón del repositorio, cf.
 * hsaa-superadmin-policy-contract.test.ts):
 *
 *   1. El defecto existía: las policies legadas de suppliers resolvían el
 *      nivel administrativo con «profiles.role = 'admin'» ESTRICTO (el
 *      superadmin, sin membresías por diseño, quedaba fuera) y la rama de
 *      membresía NO exigía status='active'.
 *   2. La migración sucede a las legadas en el stream (DROP IF EXISTS de
 *      las tres + CREATE de las nuevas) — el replay termina en la versión
 *      corregida.
 *   3. Las nuevas políticas delegan en las funciones CANÓNICAS:
 *      has_store_access (membresía activa + coherencia tenant) e is_admin
 *      ('admin'+'superadmin') — la misma fuente de verdad de products y
 *      receipts. Ninguna policy nueva lleva el check estricto de rol.
 *   4. RLS sigue habilitada y NO se crea ninguna policy para anon.
 *   5. Verificación post-migración fail-closed (exactamente 3 políticas).
 *   6. Sin cambios de datos: ningún INSERT/UPDATE/DELETE sobre filas.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const NEW = 'supabase/migrations/20261101120000_suppliers_visibilidad_multiusuario.sql';

function sql(file: string): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8');
}
function stripComments(t: string): string {
  return t.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('Caso histórico — el defecto estaba en las policies legadas de suppliers', () => {
  // Las definiciones legadas viven en la BD (era pre-organizaciones, sin
  // migración en el repo — sondas read-only del expediente). El contrato
  // aquí es que la NUEVA migración retira explícitamente esas tres políticas
  // por nombre, exactamente las que contenían el check estricto.
  it('la migración retira las tres políticas legadas por nombre (DROP IF EXISTS)', () => {
    const s = stripComments(sql(NEW));
    expect(s).toMatch(/DROP POLICY IF EXISTS "suppliers_select_authenticated" ON public\.suppliers/);
    expect(s).toMatch(/DROP POLICY IF EXISTS "suppliers_insert_authenticated" ON public\.suppliers/);
    expect(s).toMatch(/DROP POLICY IF EXISTS "suppliers_update_authenticated" ON public\.suppliers/);
  });
});

describe('Caso K-proveedores — la corrección delega en las funciones canónicas', () => {
  it('SELECT delega en has_store_access(store_id) OR is_admin()', () => {
    const s = stripComments(sql(NEW));
    const sel = s.slice(s.indexOf('CREATE POLICY "suppliers_select_authenticated"'));
    expect(sel).toMatch(/USING \(public\.has_store_access\(store_id\) OR public\.is_admin\(\)\)/);
  });

  it('INSERT exige membresía ACTIVA con rol operativo (admin/manager/encargado) o is_admin()', () => {
    const s = stripComments(sql(NEW));
    const ins = s.slice(s.indexOf('CREATE POLICY "suppliers_insert_authenticated"'));
    expect(ins).toMatch(/m\.status = 'active'/);
    expect(ins).toMatch(/m\.role IN \('admin', 'manager', 'encargado'\)/);
    expect(ins).toMatch(/OR public\.is_admin\(\)/);
  });

  it('UPDATE es simétrico con INSERT (USING y WITH CHECK)', () => {
    const s = stripComments(sql(NEW));
    const upd = s.slice(s.indexOf('CREATE POLICY "suppliers_update_authenticated"'));
    expect(upd).toMatch(/USING \(/);
    expect(upd).toMatch(/WITH CHECK \(/);
    expect(upd).toMatch(/m\.status = 'active'/);
  });

  it('NINGUNA policy nueva lleva el check estricto profiles.role = admin', () => {
    const s = stripComments(sql(NEW));
    const creates = s.slice(s.indexOf('CREATE POLICY'));
    expect(creates).not.toMatch(/profiles\.role = 'admin'/);
    // y no introdujo ningún literal nuevo de rol de perfil fuera del IN de
    // membresía (la delegación administrativa es is_admin(), no un enum local)
    expect(creates.match(/profiles\.role/g)).toBeNull();
  });

  it('is_admin() cubre superadmin por contrato (guard de firma fail-closed)', () => {
    const s = sql(NEW); // con comentarios: el guard documenta la semántica
    // guard del DO $$: ILIKE '%''admin'', ''superadmin''%'
    expect(s).toMatch(/ILIKE '%''admin'', ''superadmin''%'/);
  });

  it('guard fail-closed: aborta si las funciones canónicas no existen', () => {
    const s = stripComments(sql(NEW));
    expect(s).toMatch(/RAISE EXCEPTION 'GUARD: public\.is_admin\(\)/);
    expect(s).toMatch(/RAISE EXCEPTION 'GUARD: public\.has_store_access\(uuid\)/);
  });
});

describe('Caso endurecimiento y fail-closed post-migración', () => {
  it('verificación post: exactamente 3 políticas (SELECT/INSERT/UPDATE) y RLS activa', () => {
    const s = stripComments(sql(NEW));
    expect(s).toMatch(/v_lesser_total <> 3 OR v_select <> 1 OR v_insert <> 1 OR v_update <> 1/);
    expect(s).toMatch(/RAISE EXCEPTION 'VERIFICACIÓN: políticas suppliers inesperadas/);
    expect(s).toMatch(/RAISE EXCEPTION 'VERIFICACIÓN: RLS de suppliers quedó deshabilitada/);
  });

  it('NO crea políticas para anon ni deshabilita RLS', () => {
    const s = stripComments(sql(NEW));
    expect(s).not.toMatch(/TO anon/);
    expect(s).not.toMatch(/DISABLE ROW LEVEL SECURITY/);
    expect(s).not.toMatch(/FORCE ROW LEVEL SECURITY/); // tampoco fuerza (igual que hoy)
  });

  it('sin cambios de datos: ningún INSERT/UPDATE/DELETE sobre filas de suppliers', () => {
    const s = stripComments(sql(NEW));
    // las únicas apariciones de INSERT/UPDATE/DELETE son las cláusulas de
    // política (FOR INSERT / FOR UPDATE) — ninguna instrucción DML de datos
    const dml = s.match(/(?<!FOR )(INSERT INTO|UPDATE public\.suppliers SET|DELETE FROM public\.suppliers)/g);
    expect(dml).toBeNull();
  });

  it('idempotente: DROP IF EXISTS + CREATE permite re-aplicación (verificado en banco)', () => {
    const s = stripComments(sql(NEW));
    expect((s.match(/DROP POLICY IF EXISTS/g) || []).length).toBe(3);
  });
});
