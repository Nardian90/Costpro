/**
 * CP-FIN-110 — Test de contrato de la migración de corrección integral
 * (patrón cp-fin-reconciliation-migration.test.ts: asserts estáticos sobre el
 * SQL, sin BD). Valida lo no negociable del diagnóstico D1-D12:
 * riel-primacía, reglas ORDEN_TRABAJO equilibradas, triggers, pase 5,
 * CP-FIN-REC-001/v2 y no-circularidad.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION = resolve(
  process.cwd(),
  'supabase/migrations/20261122120000_cp_fin110_enervida_reconciliation_fix.sql',
);
const sql = readFileSync(MIGRATION, 'utf8');

describe('migración CP-FIN-110 (auditoría forense ENERVIDA)', () => {
  it('existe, transaccional e idempotente', () => {
    expect(sql).toContain('20261122120000');
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/COMMIT;/m);
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.fin_compute_metrics');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.fin_get_reconciliation');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.fin_generation_build');
  });

  it('D2/D3 — riel-primacía: el fallback settlement/carve SOLO sin riel de pagos', () => {
    // La condición del fallback exige que NO haya ningún cobro de efectivo
    // registrado en payment_transactions (cualquier moneda).
    const cond = sql.match(
      /IF coalesce\(\(v ->> 'cob_cash_cup'\)::numeric, 0\) = 0\s+AND coalesce\(\(v ->> 'cob_cash_usd_cup'\)::numeric, 0\) = 0\s+AND coalesce\(\(v ->> 'cob_cash_eur_cup'\)::numeric, 0\) = 0\s+AND coalesce\(\(v ->> 'cob_cash_mlc_cup'\)::numeric, 0\) = 0 THEN/,
    );
    expect(cond).not.toBeNull();
    // Comentario de doctrina (riel-primacía CP-FIN-002)
    expect(sql).toContain('riel-primacía');
    expect(sql).toContain('RECT-MON');
  });

  it('D1 — regla ORDEN_TRABAJO v1: anticipos y reconocimiento equilibrados', () => {
    expect(sql).toContain("'ORDEN_TRABAJO', NULL, 1, 'active'");
    const regla = sql.slice(
      sql.indexOf("'ORDEN_TRABAJO', NULL, 1, 'active'"),
      sql.indexOf('Desactivar versiones anteriores'),
    );
    // pago: Dr @cuenta_financiera (canónico medio×moneda) / Cr PAS_ANTICIPOS_CLI
    expect(regla).toContain('"tipo":"cuenta_financiera"');
    expect(regla).toContain('"categoria":"@cuenta_financiera"');
    expect(regla).toContain('"categoria":"PAS_ANTICIPOS_CLI"');
    // reconocimiento: PAS_ANT aplicado + ACT_CXC saldo + ING_SERVICIOS_PREST total
    expect(regla).toContain('"metrica":"anticipos_aplicados_cup"');
    expect(regla).toContain('"metrica":"pendiente_cup"');
    expect(regla).toContain('"metrica":"total_cup"');
    expect(regla).toContain('"categoria":"ING_SERVICIOS_PREST"');
    expect(regla).toContain('"categoria":"ACT_CXC"');
    // equilibrio estructural: least(anticipos,total) + greatest(total−anticipos,0) = total
    expect(sql).toMatch(/least\(coalesce\(v_cogs, 0\), v_total_cup\)/);
    expect(sql).toMatch(/greatest\(v_total_cup - coalesce\(v_cogs, 0\), 0\)/);
  });

  it('D1 — triggers: anticipos en payment_transactions y finalización en production_orders', () => {
    expect(sql).toContain("ELSIF NEW.ref_type IN ('work', 'production_order')");
    expect(sql).toMatch(/CREATE TRIGGER fin_trg_payment_transactions/);
    expect(sql).toMatch(
      /CREATE TRIGGER fin_trg_production_orders\s+AFTER UPDATE ON public\.production_orders\s+FOR EACH ROW WHEN \(NEW\.status = 'completed' AND OLD\.status IS DISTINCT FROM 'completed'\)/,
    );
    // Guard de tipo: solo service/work (producción de inventario fuera de alcance)
    expect(sql).toContain("IN ('service', 'work')");
  });

  it('D1 — pase 5 del build cubre ORDEN_TRABAJO (anticipos + reconocimientos)', () => {
    expect(sql).toContain("SELECT 'ORDEN_TRABAJO', pt.ref_id, 'pago', pt.id");
    expect(sql).toContain("SELECT 'ORDEN_TRABAJO', o.id, 'reconocimiento', NULL");
  });

  it('D5/D6/D7/D9/D10 — CP-FIN-REC-001/v2 con cambios documentados', () => {
    expect(sql).toContain("v_met_ver text := 'CP-FIN-REC-001/v2'");
    // D5: vales de costo cero fuera del detector de pendientes
    expect(sql).toMatch(/SELECT 'VALE_SALIDA', count\(\*\) FROM public\.issue_slips i[\s\S]*?coalesce\(i\.total_cost, 0\) > 0/);
    // D6: COGS redondeo por venta (misma política del motor)
    expect(sql).toContain('round(sum(ti.quantity * coalesce(NULLIF(ti.cost_at_sale, 0), p.cost_average, 0)), 2) AS s');
    // D7: ACT_CXC solo órdenes completed
    expect(sql).toMatch(/SELECT 'ACT_CXC', false, 14,[\s\S]*?o\.status = 'completed'/);
    // D9: PAS_ANTICIPOS_CLI con anticipos de órdenes no completadas
    expect(sql).toMatch(/SELECT 'PAS_ANTICIPOS_CLI', false, 36,[\s\S]*?o\.status <> 'completed'/);
    // D10: ING_SERVICIOS_PREST conciliable por completion_date
    expect(sql).toContain("SELECT 'ING_SERVICIOS_PREST', true, 61,");
    expect(sql).toContain('coalesce(o.completion_date, o.order_date) BETWEEN p_from AND p_to');
    // fb detector v2: solo ventas sin filas en el riel
    expect(sql).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM public\.payment_transactions pt\s*WHERE pt\.ref_type = 'sale' AND pt\.ref_id = t\.id\)/);
    // fuente production_orders en fuentes_actualizadas
    expect(sql).toContain("'production_orders', (SELECT max(updated_at)::text FROM public.production_orders");
  });

  it('no-circularidad preservada: el lado operacional no lee el mayor', () => {
    const recon = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.fin_get_reconciliation'),
    );
    const opBlock = recon.slice(recon.indexOf('-- ── Lado OPERACIONAL'), recon.indexOf('-- ── Lado CONTABLE'));
    expect(opBlock.length).toBeGreaterThan(5000);
    // El lado operacional (CTE op) no puede leer fin_entries/fin_movements
    expect(opBlock).not.toContain('fin_movements');
    expect(opBlock).not.toContain('fin_entries');
    // Las nuevas fuentes son operativas
    expect(opBlock).toContain('production_orders');
    expect(opBlock).toContain('payment_transactions');
    expect(opBlock).toContain('store_credit_ledger');
  });

  it('seguridad: SECURITY DEFINER con search_path en todas las funciones nuevas', () => {
    const fcm = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.fin_compute_metrics'),
      sql.indexOf('-- §2'),
    );
    expect(fcm).toMatch(/SECURITY DEFINER\s+SET search_path (?:TO|=) 'public', 'pg_temp'/);
    const trg = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.fin_trg_payment_transactions'));
    expect(trg).toMatch(/SECURITY DEFINER SET search_path = 'public', 'pg_temp'/);
    expect(sql).not.toMatch(/set_config\s*\(/);
    expect(sql).not.toMatch(/EXECUTE\s+''\s*\|\|/);
  });

  it('idioma: todo el SQL y comentarios en español', () => {
    expect(sql).toContain('anticipos');
    expect(sql).toContain('riel');
    expect(sql).toContain('órdenes');
    expect(sql).toContain('fuente operacional canónica');
  });
});
