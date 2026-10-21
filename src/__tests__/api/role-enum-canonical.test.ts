/**
 * Test de contrato — CP-SEC-015 (Misión Continua 2026-10-21).
 *
 * El valor canónico del rol superior en la BD de CostPro es `superadmin`
 * (SIN guion bajo): 13 migraciones lo usan en listas de roles, p. ej.
 * `20260820000001_security_fix_spoofable_caller_uid.sql` y las de
 * managed_create_v2. El valor `super_admin` (CON guion bajo) nunca existió
 * en la BD: las dos comparaciones que lo usaban (pick3/advisor y
 * pick3/subscription) eran código muerto — un superadmin NO recibía el
 * acceso ilimitado que la ruta le prometía (FIX-ADMIN-UNLIMITED).
 *
 * Este test es un GUARDIÁN estático: impide que vuelva a introducirse el
 * valor muerto en src/ (mismo patrón de source-scan que iteration-12).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname } from 'path';

const SRC_ROOT = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (['.ts', '.tsx'].includes(extname(name)) && !name.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

describe('CP-SEC-015 — enumeración canónica de roles', () => {
  it('1 · NINGÚN archivo de src/ usa el valor muerto `super_admin` (con guion bajo)', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      const src = readFileSync(file, 'utf8');
      if (src.includes("'super_admin'") || src.includes('"super_admin"')) {
        offenders.push(file.replace(SRC_ROOT + '/', ''));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('2 · las rutas pick3 reconocen al superadmin con el valor canónico', () => {
    const advisor = readFileSync(
      join(SRC_ROOT, 'app/api/pick3/advisor/route.ts'), 'utf8');
    const subscription = readFileSync(
      join(SRC_ROOT, 'app/api/pick3/subscription/route.ts'), 'utf8');
    expect(advisor).toContain("session.user.role === 'superadmin'");
    expect(subscription).toContain("session.user.role !== 'superadmin'");
  });

  it('3 · el schema de creación gestionada usa el mismo enum canónico', async () => {
    const { managedCreateUserSchema } = await import('@/validation/api-schemas');
    const role = managedCreateUserSchema.shape.p_role;
    // Verificación por comportamiento (robusta a la versión interna de Zod):
    expect(role.safeParse('superadmin').success).toBe(true);
    expect(role.safeParse('super_admin').success).toBe(false);
  });
});
