/**
 * cpsec-fx-backup-private-migration.test.ts — Contrato de la migración
 * 20261128173000_cpsec_fx_backup_private.sql (misión
 * CP-SEC-EXCHANGE-RATES-BACKUP-HARDENING-001 §5.8: pruebas contractuales).
 *
 * Verifica SOBRE EL ARCHIVO (sin BD, contrato estático — patrón del repo):
 *   1. Guarda de tabla ausente: la migración NO falla si la tabla no existe
 *      (replay de migraciones de la BD aislada E2E, donde el rollback de
 *      CP-FX-001 la eliminó).
 *   2. Endurecimiento real: ENABLE ROW LEVEL SECURITY + REVOKE ALL a
 *      anon, authenticated y PUBLIC (opción A — tabla exclusivamente
 *      privada; NO una policy USING(true)/WITH CHECK(true) cosmética).
 *   3. CERO policies: la protección es deny-all para no-propietario; no se
 *      fabrica una policy permisiva para «hacer desaparecer» el hallazgo.
 *   4. NINGÚN cambio de datos: sin DML sobre filas (respaldo congelado con
 *      1.607 registros históricos que deben conservarse intactos).
 *   5. NINGÚN cambio sobre exchange_rates (tabla viva) ni sobre el cron de
 *      captura: la actualización de tasas NO se toca.
 *   6. Sin FORCE ROW LEVEL SECURITY (el canal legítimo postgres de
 *      sondeos/rollback debe seguir operando como propietario).
 *   7. service_role SIN revocación (default de plataforma para procesos
 *      privilegiados server-side; su clave es secreta, nunca pública).
 *   8. Verificación fail-closed DENTRO de la transacción: aborta si RLS no
 *      quedó habilitada o si sobreviven grants anon/authenticated.
 *   9. DOCUMENTACIÓN: COMMENT ON TABLE con origen, propósito y prohibición
 *      de eliminación sin autorización del propietario.
 *  10. Rollback versionado presente y coherente (restaura el estado PRE de
 *      grants con advertencia explícita de reintroducir la exposición).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const SQL = readFileSync(
  join(__dirname, '../../../supabase/migrations/20261128173000_cpsec_fx_backup_private.sql'),
  'utf8',
);
const ROLLBACK_PATH = join(
  __dirname, '../../../supabase/rollbacks/20261128173000_rollback_cpsec_fx_backup_private.sql',
);
const T = 'exchange_rates_backup_cpfx001';

describe('migración 20261128173000_cpsec_fx_backup_private.sql', () => {
  it('guarda de tabla ausente: NOTICE + RETURN limpio (replay E2E no se rompe)', () => {
    expect(SQL).toMatch(/IF NOT v_existe THEN/);
    expect(SQL).toMatch(/RAISE NOTICE 'cpsec-fx-backup: exchange_rates_backup_cpfx001 no existe/);
    expect(SQL).toMatch(/RETURN;\s*END IF;/);
  });

  it('formaliza RLS de forma idempotente (ENABLE, sin DISABLE previo)', () => {
    expect(SQL).toMatch(
      new RegExp(`ALTER TABLE public\\.${T}\\s+ENABLE ROW LEVEL SECURITY`),
    );
    expect(SQL).not.toMatch(/DISABLE ROW LEVEL SECURITY/);
  });

  it('revoca TODO privilegio a anon, authenticated y PUBLIC (opción A)', () => {
    expect(SQL).toMatch(new RegExp(`REVOKE ALL ON TABLE public\\.${T} FROM anon`));
    expect(SQL).toMatch(new RegExp(`REVOKE ALL ON TABLE public\\.${T} FROM authenticated`));
    expect(SQL).toMatch(new RegExp(`REVOKE ALL ON TABLE public\\.${T} FROM PUBLIC`));
  });

  it('NO fabrica policies cosméticas: cero CREATE POLICY (deny-all real)', () => {
    expect(SQL).not.toMatch(/CREATE POLICY/i);
    expect(SQL).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(SQL).not.toMatch(/WITH CHECK\s*\(\s*true\s*\)/i);
  });

  it('NO modifica datos: sin INSERT/UPDATE/DELETE/TRUNCATE de filas', () => {
    expect(SQL).not.toMatch(new RegExp(`\\bINSERT\\s+INTO\\s+public\\.${T}`, 'i'));
    expect(SQL).not.toMatch(new RegExp(`\\bUPDATE\\s+public\\.${T}`, 'i'));
    expect(SQL).not.toMatch(new RegExp(`\\bDELETE\\s+FROM\\s+public\\.${T}`, 'i'));
    expect(SQL).not.toMatch(/TRUNCATE/i);
  });

  it('NO toca la tabla viva exchange_rates ni ningún otro objeto del ecosistema de tasas', () => {
    // Ningún ALTER/GRANT/REVOKE/CREATE sobre exchange_rates a secas (sin _backup).
    expect(SQL).not.toMatch(/ALTER TABLE public\.exchange_rates\s(?!_backup)/);
    expect(SQL).not.toMatch(/REVOKE .* ON (TABLE )?public\.exchange_rates\s(?!_backup)/);
    expect(SQL).not.toMatch(/GRANT .* ON (TABLE )?public\.exchange_rates\s(?!_backup)/);
    expect(SQL).not.toMatch(/CREATE (POLICY|INDEX|TRIGGER).*exchange_rates(?!_backup)/);
  });

  it('sin FORCE ROW LEVEL SECURITY (canal legítimo postgres preservado)', () => {
    expect(SQL).not.toMatch(/FORCE ROW LEVEL SECURITY/);
  });

  it('service_role se conserva (proceso privilegiado de plataforma)', () => {
    expect(SQL).not.toMatch(/REVOKE .* FROM service_role/);
    expect(SQL).not.toMatch(/GRANT .* TO service_role/);
  });

  it('verificación fail-closed dentro de la transacción (RLS + grants cero)', () => {
    expect(SQL).toMatch(/RAISE EXCEPTION 'cpsec-fx-backup: RLS no quedó habilitada — abortando'/);
    expect(SQL).toMatch(/RAISE EXCEPTION 'cpsec-fx-backup: quedan grants residuales/);
    expect(SQL).toMatch(/BEGIN;/);
    expect(SQL).toMatch(/COMMIT;/);
  });

  it('documenta origen, propósito y prohibición de DROP sin autorización', () => {
    expect(SQL).toMatch(/COMMENT ON TABLE public\.exchange_rates_backup_cpfx001 IS/);
    expect(SQL).toMatch(/Respaldo CONGELADO de exchange_rates/);
    expect(SQL).toMatch(/CP-FX-001/);
    expect(SQL).toMatch(/NO eliminar sin autorización expresa del propietario/);
  });

  it('rollback versionado presente, coherente y con advertencia de exposición', () => {
    expect(existsSync(ROLLBACK_PATH)).toBe(true);
    const RB = readFileSync(ROLLBACK_PATH, 'utf8');
    expect(RB).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.exchange_rates_backup_cpfx001 TO anon/);
    expect(RB).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.exchange_rates_backup_cpfx001 TO authenticated/);
    expect(RB).toMatch(/REINTRODUCE la exposición/i);
    expect(RB).not.toMatch(/DROP TABLE/i);
  });
});
