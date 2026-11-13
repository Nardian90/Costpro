/**
 * MISIÓN CP-FIN (2026-11-13) — Contrato estático de las migraciones del motor
 * de partida doble (20261113120000 base + 20261113120100 motor).
 *
 * Verifica los elementos críticos del contrato documentados en el expediente
 * docs/audits/2026-11-13-cp-fin-partida-doble/:
 *
 *   BASE: 8 tablas fin_* con CHECKs, índice único de idempotencia por
 *   documento+evento+pago, índice único de una regla activa por ámbito,
 *   RLS multitienda (escritura de entries/movements denegada), grants
 *   endurecidos y semillas (44 categorías, 15 tipos, 10 reglas activas).
 *   MOTOR: equilibrado obligatorio (ERR_UNBALANCED), advisory lock,
 *   métricas por tipo documental real, triggers de contabilización que
 *   NUNCA bloquean el negocio (fin_post_document_safe → posting_errors),
 *   anulación compensatoria (nunca UPDATE del histórico), backfill con
 *   dry_run, informes sin filtro de estado (anulación compensa) y signos
 *   del Estado de Rendimiento (costos negativos se suman con su signo).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = 'supabase/migrations/20261113120000_cp_fin_partida_doble_base.sql';
const MOTOR = 'supabase/migrations/20261113120100_cp_fin_partida_doble_motor.sql';

function base(): string {
  return readFileSync(resolve(process.cwd(), BASE), 'utf8');
}
function motor(): string {
  return readFileSync(resolve(process.cwd(), MOTOR), 'utf8');
}

describe('migración base 20261113120000 — modelo fin_*', () => {
  it('crea las 8 tablas del sistema financiero', () => {
    const s = base();
    for (const t of [
      'fin_categories', 'fin_document_types', 'fin_rule_versions',
      'fin_entries', 'fin_movements', 'fin_opening_balances',
      'fin_posting_errors', 'fin_metric_catalog',
    ]) {
      expect(s).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`);
    }
  });

  it('partida doble: sentidos, importes positivos y amount_cup generado', () => {
    const s = base();
    expect(s).toMatch(/sense text NOT NULL\s+CONSTRAINT fin_movement_sense_check CHECK \(sense IN \('debito', 'credito'\)\)/);
    expect(s).toContain('amount numeric(14,2) NOT NULL CHECK (amount > 0)');
    expect(s).toContain('amount_cup numeric(14,2) GENERATED ALWAYS AS');
    // Invariante de tasa (espejo de payment_transactions): CUP ⇒ 1
    expect(s).toMatch(/\(currency = 'CUP' AND exchange_rate = 1\)/);
  });

  it('idempotencia: único asiento por (tipo, documento, evento, pago)', () => {
    const s = base();
    expect(s).toContain('uq_fin_entries_doc_event');
    expect(s).toMatch(/ON public\.fin_entries \(document_type, document_id, event, COALESCE\(payment_ref/);
    // Una sola regla activa por (tipo, ámbito) — global tratado como valor
    expect(s).toContain('uq_fin_rules_one_active');
  });

  it('RLS: escrituras del ledger SOLO por el motor (deny-all a authenticated)', () => {
    const s = base();
    expect(s).toContain('ALTER TABLE public.fin_entries ENABLE ROW LEVEL SECURITY');
    expect(s).toContain('ALTER TABLE public.fin_movements ENABLE ROW LEVEL SECURITY');
    // SELECT por tienda; sin políticas INSERT/UPDATE/DELETE para entries/movements
    expect(s).toContain('fin_entries_select');
    expect(s).toContain('fin_movements_select');
    expect(s).not.toContain('fin_entries_insert');
    expect(s).not.toContain('fin_movements_insert');
    expect(s).not.toContain('fin_movements_update');
    // Grants: sin INSERT/UPDATE/DELETE sobre el ledger para authenticated
    expect(s).toContain('REVOKE ALL ON public.fin_entries, public.fin_movements FROM anon, authenticated');
  });

  it('semillas: categorías por clase, tipos documentales reales y reglas activas', () => {
    const s = base();
    // Categorías esenciales por clase (muestra representativa)
    for (const code of [
      'ACT_EFECTIVO_CUP', 'ACT_EFECTIVO_USD', 'ACT_BANCOS', 'ACT_INVENTARIO',
      'PAS_CXP_PROV', 'PAS_SERV_PEND', 'PAS_NOMINA_PEND', 'PAS_RETENCIONES',
      'PAT_CAPITAL', 'ING_VENTAS', 'ING_DEVOLUCIONES', 'GAS_COSTO_VENTAS',
      'GAS_SERVICIOS', 'GAS_NOMINAS', 'GAS_COMISIONES', 'GAS_PERDIDA_INV',
    ]) {
      expect(s).toContain(`('${code}',`);
    }
    // Tipos documentales reales (auditoría)
    for (const dt of [
      'VENTA', 'DEVOLUCION_VENTA', 'RECEPCION', 'SERVICIO_RECIBIDO',
      'VALE_SALIDA', 'AJUSTE_INVENTARIO', 'COMISION', 'NOMINA', 'FLUJO_CAJA',
      'TRANSFERENCIA',
    ]) {
      expect(s).toContain(`('${dt}',`);
    }
    // La transferencia interna queda SIN efecto económico (Caso F)
    expect(s).toMatch(/TRANSFERENCIA.*'active', '\[\]'::jsonb/s);
    // Verificación de cierre fail-closed de las semillas
    expect(s).toMatch(/RAISE EXCEPTION 'CP-FIN base: categorías semilla incompletas/);
    expect(s).toMatch(/RAISE EXCEPTION 'CP-FIN base: reglas activas semilla incompletas/);
  });

  it('regla de VENTA: cobros por método + ingreso + costo (partida doble completa)', () => {
    const s = base();
    expect(s).toContain('"metrica":"cob_cash_cup"');
    expect(s).toContain('"metrica":"cob_zelle_usd_cup"');
    expect(s).toContain('"categoria":"ING_VENTAS"');
    expect(s).toContain('"metrica":"costo_productos_cup"');
    expect(s).toContain('"categoria":"GAS_COSTO_VENTAS"');
    // Nómina: gasto gross + obligaciones neto/retenciones (balance por construcción)
    expect(s).toContain('"metrica":"total_gross_cup"');
    expect(s).toContain('"metrica":"total_net_cup"');
    expect(s).toContain('"metrica":"total_deducciones_cup"');
  });
});

describe('migración motor 20261113120100 — motor de contabilización', () => {
  it('equilibrio obligatorio: ERR_UNBALANCED salvo apertura/ajuste manual', () => {
    const s = motor();
    expect(s).toContain('ERR_UNBALANCED');
    expect(s).toMatch(/IF p_event NOT IN \('apertura', 'ajuste_manual'\) AND abs\(v_debit - v_credit\) > 0\.01/);
  });

  it('idempotencia y concurrencia: advisory lock + chequeo de asiento existente', () => {
    const s = motor();
    expect(s).toContain("pg_advisory_xact_lock(hashtext('fin:' || p_doctype || ':' || p_document_id::text))");
    expect(s).toMatch(/IF EXISTS \(\s*SELECT 1 FROM public\.fin_entries e/);
  });

  it('los triggers NUNCA bloquean el negocio: errores aislados y reprocesables', () => {
    const s = motor();
    expect(s).toContain('fin_post_document_safe');
    expect(s).toContain('fin_post_annulment_safe');
    expect(s).toContain('INSERT INTO public.fin_posting_errors');
    // Los 10 triggers de contabilización
    for (const t of [
      'fin_trg_transactions', 'fin_trg_devolutions', 'fin_trg_receipts',
      'fin_trg_received_services', 'fin_trg_issue_slips',
      'fin_trg_inventory_adjustments', 'fin_trg_commission_payments',
      'fin_trg_payrolls', 'fin_trg_cash_flow_documents',
      'fin_trg_payment_transactions',
    ]) {
      expect(s).toContain(`CREATE TRIGGER ${t}`);
    }
    // El trigger de pagos SOLO contabiliza receipts/services (no dobles)
    expect(s).toMatch(/IF NEW\.ref_type = 'receipt' THEN v_doctype := 'RECEPCION';/);
    expect(s).toMatch(/ELSIF NEW\.ref_type = 'service' THEN v_doctype := 'SERVICIO_RECIBIDO';/);
    expect(s).toMatch(/IF coalesce\(NEW\.direction, 'in'\) <> 'in' THEN RETURN/);
  });

  it('anulación compensatoria: asiento inverso enlazado, nunca UPDATE del histórico', () => {
    const s = motor();
    expect(s).toContain('fin_post_document_annulment');
    expect(s).toMatch(/CASE WHEN m\.sense = 'debito' THEN 'credito' ELSE 'debito' END/);
    expect(s).toContain('reversal_of');
    expect(s).toContain("UPDATE public.fin_entries SET status = 'reversed' WHERE id = e.id");
    // Idempotencia de la anulación
    expect(s).toMatch(/WHERE x\.reversal_of = e\.id/);
  });

  it('no re-reconocimiento en pagos: métricas de pago separadas del documento', () => {
    const s = motor();
    expect(s).toContain('importe_pago_cup');
    expect(s).toContain('metodo_pago');
  });

  it('informes: sin filtro de estado (la anulación compensa) y ecuación patrimonial', () => {
    const s = motor();
    // Ningún informe filtra por estado del asiento
    expect(s).not.toContain("e.status = 'posted'");
    // El anulación (línea del bucle) usa la tabla directa sin alias
    expect(s.match(/AND status = 'posted' AND event IN \('reconocimiento', 'pago'\)/g)).toHaveLength(1);
    expect(s).toContain("'equilibrado', abs(v_activos - (v_pasivos + v_patrim + v_resultado)) <= 0.01");
    expect(s).toContain("'sin_apertura'");
    expect(s).toContain("'apertura_tardia'");
  });

  it('Estado de Rendimiento: costos/gastos negativos se SUMAN con su signo', () => {
    const s = motor();
    expect(s).toMatch(/'utilidad_bruta', round\(v_ing_op \+ v_ing_aj \+ v_costo, 2\)/);
    expect(s).toMatch(/'resultado_neto', round\(v_ing_op \+ v_ing_aj \+ v_costo \+ v_gastos \+ v_ing_noop \+ v_gas_noop, 2\)/);
  });

  it('motor interno NO ejecutable por clientes; informes con grant a authenticated', () => {
    const s = motor();
    expect(s).toMatch(/REVOKE ALL ON FUNCTION\s+public\.fin_resolve_rule/);
    expect(s).toMatch(/public\.fin_post_document\(text, uuid, text, uuid, uuid\)/);
    expect(s).toContain('GRANT EXECUTE ON FUNCTION');
    expect(s).toContain('public.fin_get_balance_sheet(uuid, date, uuid)');
    expect(s).toContain('public.fin_simulate(text, uuid, jsonb, jsonb, uuid)');
  });

  it('backfill con dry_run y trazabilidad de auditoría', () => {
    const s = motor();
    expect(s).toContain('p_dry_run boolean DEFAULT true');
    expect(s).toContain("'FIN_BACKFILL'");
    expect(s).toContain("'FIN_RULE_ACTIVATED'");
    expect(s).toContain("'FIN_OPENING_APPLIED'");
  });

  it('resolución de reglas: la de tienda prevalece sobre la global', () => {
    const s = motor();
    expect(s).toMatch(/AND \(rv\.store_id = p_store_id OR rv\.store_id IS NULL\)/);
    expect(s).toMatch(/ORDER BY rv\.store_id DESC NULLS LAST/);
  });
});
