/**
 * CP-FIN-110-POSTREVIEW-HARDENING-111 — Test de contrato de la migración
 * correctiva 20261122130000 (patrón cp-fin110-enervida-migration.test.ts:
 * asserts estáticos sobre el SQL, sin BD). Valida lo no negociable de los
 * cinco hallazgos de la revisión del PR #1682:
 *   P0-1 órdenes closed-completadas reconocibles (pase 5 + fuentes conc.),
 *   P0-2 conversión del presupuesto ANTES de restar pagos,
 *   P0-3 detector de fallback con criterio cash-específico,
 *   P0-4 RPC atómico e idempotente de rectificaciones.
 * Y el no-retoque de la migración ya aplicada 20261122120000.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION = resolve(
  process.cwd(),
  'supabase/migrations/20261122130000_cp_fin111_postreview_hardening.sql',
);
const sql = readFileSync(MIGRATION, 'utf8');

const RECOGIBLE =
  "(o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))";

describe('migración CP-FIN-111 (postreview hardening)', () => {
  it('existe, transaccional, idempotente y NO toca la migración 110 aplicada', () => {
    expect(sql).toContain('20261122130000');
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/COMMIT;/m);
    // Reproduce los cuerpos vigentes con CREATE OR REPLACE (jamás DROP/ALTER
    // de la migración ya aplicada 20261122120000 ni renombrado de objetos).
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.fin_generation_build');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.fin_get_reconciliation');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.fin_rectification_apply');
    expect(sql).not.toMatch(/DROP FUNCTION IF EXISTS public\.fin_generation_build/);
    expect(sql).not.toMatch(/DROP FUNCTION IF EXISTS public\.fin_get_reconciliation/);
    expect(sql).not.toContain('20261122120000_cp_fin110_enervida_reconciliation_fix.sql');
  });

  it('P0-1 — pase 5 del build: órdenes RECONOCIBLES (completed o closed-con-evidencia)', () => {
    // El predicado del reconocimiento de pase 5 exige evidencia documental de
    // finalización real (completion_date del RPC de cierre completed→closed).
    const recIdx = sql.indexOf('-- CP-FIN-111 (P0-1): reconocimiento de órdenes RECONOCIBLES');
    expect(recIdx).toBeGreaterThan(-1);
    const pase5 = sql.slice(recIdx, recIdx + 1400);
    expect(pase5).toContain("SELECT 'ORDEN_TRABAJO', o.id, 'reconocimiento', NULL");
    expect(pase5).toContain(RECOGIBLE);
    // La v1 (status = 'completed' suelto) NO queda en el pase 5.
    expect(pase5).not.toContain("AND o.status = 'completed'\n");
    // No se convierten todas las closed en ingresos: voided/reversed y
    // closed-sin-evidencia quedan fuera (comentario de doctrina explícito).
    expect(pase5).toContain('voided');
    expect(pase5).toContain('completion_date IS NOT NULL');
  });

  it('P0-1 — fuentes de conciliación alineadas al MISMO predicado (ACT_CXC, ING_SERVICIOS_PREST, PAS_ANTICIPOS_CLI)', () => {
    // ACT_CXC: valor operacional y contadores con el predicado reconocible.
    const cxc = sql.slice(sql.indexOf("SELECT 'ACT_CXC'"), sql.indexOf("SELECT 'ACT_OTROS_CORR'"));
    expect((cxc.match(new RegExp(RECOGIBLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length).toBeGreaterThanOrEqual(3);
    // ING_SERVICIOS_PREST: 3 subconsultas con el predicado.
    const isp = sql.slice(sql.indexOf("SELECT 'ING_SERVICIOS_PREST'"), sql.indexOf("SELECT 'ING_DESCUENTOS'"));
    expect((isp.match(new RegExp(RECOGIBLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length).toBeGreaterThanOrEqual(3);
    // PAS_ANTICIPOS_CLI: la negación del predicado (los anticipos de órdenes
    // NO reconocibles permanecen como pasivo) y el exceso en reconocibles.
    const ant = sql.slice(sql.indexOf("SELECT 'PAS_ANTICIPOS_CLI'"), sql.indexOf("SELECT 'ING_VENTAS'"));
    expect(ant).toContain(`NOT ${RECOGIBLE}`);
    // Ningún predicado suelto de órdenes: toda referencia pasa por el
    // predicado reconocible o su negación.
    const sinSuelto = sql.replace(new RegExp(RECOGIBLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
    expect(sinSuelto).not.toContain("o.status = 'completed'");
    expect(sinSuelto).not.toContain("o.status <> 'completed'");
  });

  it('P0-2 — ACT_CXC convierte el presupuesto a CUP ANTES de restar los pagos', () => {
    // Ejemplo obligatorio de la misión: 100 USD @ 800, pagado 10 USD (8.000 CUP)
    // → CxC 72.000. La fórmula convierte budget_total × tasa y DESPUÉS resta
    // paid_amount (la v2 restaba monedas distintas: daba 0).
    expect(sql).toContain('unidades homogéneas');
    expect(sql).toContain('budget_total\n                * CASE WHEN coalesce(o.budget_currency');
    const cxc = sql.slice(sql.indexOf('unidades homogéneas'), sql.indexOf('anticipos_cobrados'));
    // La resta de paid_amount ocurre DESPUÉS de la conversión (orden de la fórmula)
    expect(cxc.indexOf('budget_exchange_rate END')).toBeGreaterThan(-1);
    expect(cxc).toMatch(/greatest\(o\.budget_total\s*\*\s*CASE[\s\S]*?- o\.paid_amount, 0\)/);
    // Documentación del ejemplo obligatorio en la migración
    expect(sql).toContain('CxC 72.000 CUP');
  });

  it('P0-3 — detector de fallback con el MISMO criterio semántico que fin_compute_metrics', () => {
    // El detector NO suprime el hallazgo por la mera existencia de filas del
    // riel: exige la AUSENCIA de cobro de EFECTIVO canónico (suma por grupo = 0).
    const fb = sql.slice(sql.indexOf('AND NOT EXISTS ('), sql.indexOf('-- Cuentas financieras'));
    expect(fb).toContain("pt.payment_method = 'cash'");
    expect(fb).toContain("lower(coalesce(pt.currency, 'cup')) IN ('cup', 'usd', 'eur', 'mlc')");
    expect(fb).toContain('GROUP BY lower(coalesce(pt.currency');
    expect(fb).toContain('HAVING sum(pt.amount_cup) <> 0');
    // Doctrina: la fila de transferencia NO suprime el detector.
    expect(sql).toContain('NO suprime el hallazgo');
  });

  it('P0-4 — fin_rectification_apply: atómico, idempotente-completo, con reparación controlada', () => {
    // Asiento + movimientos + partida doble + auditoría en la MISMA función
    // (una transacción); validaciones ANTES y DESPUÉS de escribir.
    const rpc = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.fin_rectification_apply'));
    expect(rpc).toContain("event = 'ajuste_manual'");
    expect(rpc).toContain("'ya_completa'");
    expect(rpc).toContain("'reparada'");
    expect(rpc).toContain("'creada'");
    expect(rpc).toContain('ERR_RECTIFICACION_PARCIAL');
    expect(rpc).toContain('ERR_RECTIFICACION_DESQUILIBRADA');
    expect(rpc).toContain('ERR_RECTIFICACION_VERIFICACION');
    expect(rpc).toContain('ERR_RECTIFICACION_AMBIGUA');
    expect(rpc).toContain('SYSTEM_RECTIFICATION_APPLIED');
    expect(rpc).toContain('SYSTEM_RECTIFICATION_REPAIRED');
    // Partida doble exigida previa y post-inserción.
    expect(rpc).toMatch(/ERR_RECTIFICACION_DESQUILIBRADA[\s\S]*?INSERT INTO public\.fin_entries/);
    expect(rpc).toMatch(/INSERT INTO public\.fin_movements[\s\S]*?ERR_RECTIFICACION_VERIFICACION/);
    // Idempotencia con alcance de GENERACIÓN (el pase 4 copia el asiento a la
    // nueva generación con el mismo document_number) + serialización.
    expect(rpc).toContain('e.generation_id = v_gen');
    expect(rpc).toContain('pg_advisory_xact_lock');
    expect(rpc).toContain('jsonb_array_length(p_movements)');
    // Reparación controlada SOLO con p_repair=true; sin ella, error explícito.
    expect(rpc).toMatch(/IF NOT coalesce\(p_repair, false\) THEN[\s\S]*?ERR_RECTIFICACION_PARCIAL/);
    expect(rpc).toContain('DELETE FROM public.fin_movements WHERE entry_id');
  });

  it('P0-4 — ACL pura del canal de rectificaciones (service_role exclusivo)', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.fin_rectification_apply[^;]*FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.fin_rectification_apply[^;]*TO service_role/);
    // Sin chequeo interno de auth.role() (patrón ACL pura del motor).
    const rpc = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.fin_rectification_apply'));
    expect(rpc).not.toMatch(/IF\s+auth\.role\(\)/);
    expect(rpc).toContain('SECURITY DEFINER');
    expect(rpc).toContain("SET search_path = 'public', 'pg_temp'");
  });

  it('docs_pend y sin_resp cubren ORDEN_TRABAJO (reconocimiento y pagos)', () => {
    expect(sql).toContain("SELECT 'ORDEN_TRABAJO', count(*) FROM public.production_orders o");
    expect(sql).toContain("SELECT 'ORDEN_TRABAJO', count(*) FROM public.payment_transactions pt");
    expect(sql).toContain("OR e.document_type = 'ORDEN_TRABAJO' AND NOT EXISTS");
  });

  it('versión de metodología CP-FIN-REC-001/v3 documentada', () => {
    expect(sql).toContain("v_met_ver text := 'CP-FIN-REC-001/v3'");
    expect(sql).toContain('CP-FIN-REC-001/v3 (misión POSTREVIEW-HARDENING-111');
  });

  it('seguridad: SECURITY DEFINER con search_path en todas las funciones reemplazadas', () => {
    for (const fn of ['fin_generation_build', 'fin_get_reconciliation', 'fin_rectification_apply']) {
      const idx = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}`);
      const header = sql.slice(idx, idx + 700);
      expect(header).toContain('SECURITY DEFINER');
      expect(header).toMatch(/search_path/i);
    }
  });

  it('idioma: doctrina y comentarios en español', () => {
    expect(sql).toContain('RECONOCIBLES');
    expect(sql).toContain('unidades homogéneas');
    expect(sql).toContain('NO suprime el hallazgo');
    expect(sql).toContain('reparación CONTROLADA');
    expect(sql).toContain('órdenes');
    expect(sql).toContain('fuente operacional');
  });
});
