/**
 * MISIÓN INGRESOS/EGRESOS DE CAJA (2026-10-20) — Verificación estática de la
 * migración 20261021000001. Asegura los elementos críticos del contrato:
 *
 *   - Tabla cash_flow_documents con CHECKs documentales (tipo/concepto/moneda/
 *     tasa/estado), numeración única por tienda y trazabilidad completa.
 *   - UNA sola escritura del dinero: payment_transactions ref_type 'cash_flow'
 *     (CHECK extendido + índice parcial); SIN escrituras en cash_movements
 *     (legacy write-only — anti-doble-conteo).
 *   - Numeración documental reutilizada: document_sequences + 'cash_flow' → IE.
 *   - RPC create_cash_flow_document: actor-explícito, advisory lock, FOR UPDATE
 *     del turno, turno abierto obligatorio, fecha operativa en ventana,
 *     egreso ≤ efectivo disponible, devolución ≤ fondo vigente, tasa USD
 *     server-side, idempotencia, auditoría atómica.
 *   - RPC reverse_cash_flow_document: motivo ≥ 3, fila contraria con
 *     payment_date = now() (nunca DELETE), estado terminal + anulación
 *     trazable, doble anulación imposible.
 *   - Las TRES fórmulas de caja incorporan cash_flow in/out (cierre + espejo
 *     + reporte) — sin divergencia tipo 'adjustment'.
 *   - RLS por tienda + ACL service_role-only para mutaciones, authenticated
 *     para lecturas.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261021000001_cash_flow_documents.sql';

function sql(): string {
  return readFileSync(resolve(process.cwd(), MIGRATION), 'utf-8');
}

describe('migración 20261021000001 — tabla documental cash_flow_documents', () => {
  it('crea la tabla con CHECKs documentales y de integridad monetaria', () => {
    const s = sql();
    expect(s).toContain('CREATE TABLE IF NOT EXISTS public.cash_flow_documents');
    expect(s).toMatch(/doc_type text NOT NULL CHECK \(doc_type IN \('ingreso', 'egreso'\)\)/);
    expect(s).toMatch(/'constitucion_fondo', 'reposicion_fondo',\s*'devolucion_total_fondo', 'devolucion_parcial_fondo',\s*'otro_ingreso', 'otro_egreso'/);
    // Matriz tipo↔concepto (un egreso jamás lleva concepto de ingreso)
    expect(s).toContain('CONSTRAINT cash_flow_documents_type_concept_check');
    // Importe positivo, monedas admitidas, invariante de tasa (CUP=1, USD>1)
    expect(s).toMatch(/amount numeric NOT NULL CHECK \(amount > 0\)/);
    expect(s).toMatch(/currency text NOT NULL CHECK \(currency IN \('CUP', 'USD'\)\)/);
    expect(s).toMatch(/\(currency = 'CUP' AND exchange_rate = 1\)/);
    expect(s).toMatch(/\(currency = 'USD' AND exchange_rate > 1\)/);
    // amount_cup GENERATED (conversión única en escritura)
    expect(s).toMatch(/amount_cup numeric GENERATED ALWAYS AS/);
    // Estados reales del proceso: confirmado | anulado
    expect(s).toMatch(/status text NOT NULL DEFAULT 'confirmado' CHECK \(status IN \('confirmado', 'anulado'\)\)/);
    // Justificación obligatoria a nivel de dato
    expect(s).toMatch(/justification text NOT NULL CHECK \(btrim\(justification\) <> ''\)/);
  });

  it('numeración única por tienda + idempotencia documental + índices', () => {
    const s = sql();
    expect(s).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_flow_documents_store_number');
    expect(s).toContain('ON public.cash_flow_documents (store_id, document_number)');
    expect(s).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_flow_documents_idempotency');
    expect(s).toContain('CREATE INDEX IF NOT EXISTS idx_cash_flow_documents_store_date');
    expect(s).toContain('CREATE INDEX IF NOT EXISTS idx_cash_flow_documents_store_status');
  });

  it('RLS por tienda con escritura solo vía RPC (REVOKE + GRANT explícitos)', () => {
    const s = sql();
    expect(s).toContain('ALTER TABLE public.cash_flow_documents ENABLE ROW LEVEL SECURITY');
    expect(s).toContain('REVOKE ALL ON TABLE public.cash_flow_documents FROM anon, authenticated, PUBLIC');
    expect(s).toContain('FOR SELECT TO authenticated');
    expect(s).toContain('USING (public.has_store_access(store_id))');
    expect(s).toContain('GRANT SELECT ON TABLE public.cash_flow_documents TO authenticated');
    expect(s).toContain('GRANT SELECT, INSERT, UPDATE ON TABLE public.cash_flow_documents TO service_role');
  });

  it('trazabilidad documental completa (responsable, contraparte, anulación, vínculos)', () => {
    const s = sql();
    for (const col of [
      'responsible_user_id', 'counterparty', 'justification', 'notes',
      'related_document_id', 'payment_transaction_id',
      'annulment_payment_transaction_id', 'annulled_at', 'annulled_by',
      'annulment_reason', 'created_by', 'confirmed_at', 'confirmed_by',
      'closure_id', 'operation_date', 'idempotency_key',
    ]) {
      expect(s).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });
});

describe('migración 20261021000001 — ledger: una sola escritura del dinero', () => {
  it('extiende el CHECK de ref_type con cash_flow + reconciliación viva (R1-R3) + índices', () => {
    const s = sql();
    expect(s).toContain('DROP CONSTRAINT IF EXISTS payment_transactions_ref_type_check');
    // R1 — UNIÓN reconciliada con la BD viva (auditoría 2026-10-21): 'devolution'
    // (release W7 vivo, 2 filas reales) se conserva; 'adjustment' y 'cash_flow' se añaden.
    expect(s).toMatch(/CHECK \(ref_type IN \('receipt', 'service', 'production_order', 'work', 'sale', 'commission', 'devolution', 'adjustment', 'cash_flow'\)\)/);
    expect(s).toContain('CREATE INDEX IF NOT EXISTS idx_payment_txn_cash_flow');
    expect(s).toContain("WHERE ref_type = 'cash_flow'");
    // R2 — columna direction (autocontención del replay) + check unión ('in','out','refund'):
    // los egresos y las contra-filas de anulación de ingreso usan direction='out'.
    expect(s).toContain("ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'in'");
    expect(s).toMatch(/CHECK \(direction IN \('in', 'out', 'refund'\)\)/);
    expect(s).toContain('DROP CONSTRAINT IF EXISTS payment_transactions_direction_check');
    // R3 — índice parcial de ajustes subsumido (20261012000001 no aplicado en vivo).
    expect(s).toContain('CREATE INDEX IF NOT EXISTS idx_payment_txn_adjustments');
  });

  it('NO escribe en cash_movements (legacy write-only — anti doble conteo)', () => {
    const s = sql();
    expect(s).not.toMatch(/INSERT INTO public\.cash_movements/);
    expect(s).not.toMatch(/INSERT INTO cash_movements/);
  });

  it('numeración documental reutilizada: document_sequences + next_document_number con IE', () => {
    const s = sql();
    expect(s).toContain("ALTER TABLE public.document_sequences");
    expect(s).toMatch(/CHECK \(document_type IN \('invoice', 'credit_note', 'quotation', 'z_report', 'vale_salida', 'cash_flow'\)\)/);
    expect(s).toContain("WHEN 'cash_flow' THEN 'IE'");
    // ACL re-declarada IDÉNTICA a la certificada (service_role-only)
    expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.next_document_number\(uuid, text, uuid\) FROM PUBLIC, anon, authenticated;/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.next_document_number\(uuid, text, uuid\) TO service_role;/);
  });
});

describe('migración 20261021000001 — RPC create_cash_flow_document', () => {
  it('actor-explícito (CASE service_role) + roles de registro + fail-closed', () => {
    const s = sql();
    expect(s).toContain('CREATE OR REPLACE FUNCTION public.create_cash_flow_document(');
    expect(s).toMatch(/CASE WHEN auth\.role\(\) = 'service_role' THEN COALESCE\(p_user_id, auth\.uid\(\)\) ELSE auth\.uid\(\) END/);
    // Patrón fail-closed (NO el vulnerable IS NOT NULL AND NOT)
    expect(s).toMatch(/IF v_caller_uid IS NULL OR NOT public\.has_store_access_as\(v_caller_uid, p_store_id\) THEN/);
    // Roles: registrar exige admin/manager/encargado/clerk
    expect(s).toMatch(/ARRAY\['admin', 'manager', 'encargado', 'clerk'\]/);
  });

  it('advisory lock por tienda + FOR UPDATE del turno + turno abierto obligatorio', () => {
    const s = sql();
    expect(s).toMatch(/PERFORM pg_advisory_xact_lock\(hashtext\(p_store_id::text\)\);/);
    expect(s).toMatch(/FOR UPDATE;\s+IF NOT FOUND THEN\s+RAISE EXCEPTION 'ERR_NO_OPEN_SHIFT/);
    expect(s).toContain('ERR_NO_OPEN_SHIFT');
  });

  it('política temporal: validate_operation_date + ventana del turno (doctrina FIJA)', () => {
    const s = sql();
    expect(s).toMatch(/PERFORM public\.validate_operation_date\(v_op_date, p_store_id\);/);
    expect(s).toContain('ERR_DATE_OUTSIDE_SHIFT');
    expect(s).toMatch(/IF v_op_date <= v_shift\.created_at OR v_op_date > now\(\) THEN/);
  });

  it('reglas de negocio: egreso ≤ efectivo, devolución ≤ fondo, precisión, justificación', () => {
    const s = sql();
    expect(s).toContain('ERR_INSUFFICIENT_CASH');
    expect(s).toContain('ERR_FUND_INSUFFICIENT');
    expect(s).toContain('ERR_AMOUNT_PRECISION');
    expect(s).toContain('ERR_JUSTIFICATION_REQUIRED');
    expect(s).toContain('ERR_CONCEPT_TYPE_MISMATCH');
    expect(s).toContain('ERR_RELATED_DOC_INVALID');
  });

  it('tasa USD resuelta server-side (jerarquía tienda → BCC → elToque, fail-closed)', () => {
    const s = sql();
    expect(s).toMatch(/FROM public\.store_exchange_rates ser/);
    expect(s).toMatch(/er\.source = 'BCC' AND er\.segment = '3'/);
    expect(s).toMatch(/er\.source = 'elToque'/);
    expect(s).toContain('ERR_EXCHANGE_RATE_UNAVAILABLE');
    expect(s).toContain("v_rate_effective < now() - INTERVAL '45 days'");
  });

  it('idempotencia v2.26 (pre-check + registro post-éxito) y auditoría atómica', () => {
    const s = sql();
    expect(s).toMatch(/FROM public\.idempotency_registry ir/);
    expect(s).toMatch(/operation = 'create_cash_flow_document'/);
    expect(s).toContain('ERR_IDEMPOTENCY_KEY_REUSE');
    expect(s).toMatch(/INSERT INTO public\.idempotency_registry/);
    expect(s).toMatch(/'CASH_FLOW_CREATED', 'cash_flow_documents'/);
  });

  it('inserta documento + UNA fila payment_transactions(ref_type=cash_flow) + link', () => {
    const s = sql();
    expect(s).toMatch(/INSERT INTO public\.cash_flow_documents \(/);
    expect(s).toMatch(/INSERT INTO public\.payment_transactions \(/);
    expect(s).toMatch(/'cash_flow', v_doc_id/);
    expect(s).toMatch(/CASE v_doc_type WHEN 'ingreso' THEN 'in' ELSE 'out' END/);
    expect(s).toMatch(/SET payment_transaction_id = v_payment_id/);
  });

  it('ACL service_role-only (único llamador: la ruta API con cliente admin)', () => {
    const s = sql();
    expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.create_cash_flow_document\([^)]*\) FROM PUBLIC, anon, authenticated;/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_cash_flow_document\([^)]*\) TO service_role;/);
  });
});

describe('migración 20261021000001 — RPC reverse_cash_flow_document', () => {
  it('FOR UPDATE del documento + motivo obligatorio ≥ 3 + rol superior', () => {
    const s = sql();
    expect(s).toContain('CREATE OR REPLACE FUNCTION public.reverse_cash_flow_document(');
    expect(s).toMatch(/WHERE id = p_document_id\s+FOR UPDATE/);
    expect(s).toContain('ERR_REASON_REQUIRED');
    expect(s).toMatch(/IF length\(v_reason\) < 3 THEN/);
    expect(s).toMatch(/ARRAY\['admin', 'manager', 'encargado'\]/);
    expect(s).toContain('ERR_FORBIDDEN_ROLE');
  });

  it('doble anulación imposible (estado terminal re-chequeado bajo lock)', () => {
    const s = sql();
    expect(s).toMatch(/IF v_doc\.status <> 'confirmado' THEN/);
    expect(s).toContain('ERR_ALREADY_ANNULLED');
  });

  it('fila CONTRARIA en el ledger con payment_date = now() (nunca DELETE ni UPDATE de importes)', () => {
    const s = sql();
    expect(s).toMatch(/'cf-anul-' \|\| v_doc\.id::text/);
    expect(s).toMatch(/CASE v_doc\.doc_type WHEN 'ingreso' THEN 'out' ELSE 'in' END/);
    expect(s).toMatch(/v_doc\.currency, v_doc\.exchange_rate, now\(\),/);
    expect(s).not.toMatch(/DELETE FROM public\.payment_transactions/);
    // El importe de la fila original jamás se modifica
    expect(s).not.toMatch(/UPDATE public\.payment_transactions SET amount/);
  });

  it('anular un ingreso exige efectivo disponible (la reversión saca dinero)', () => {
    const s = sql();
    expect(s).toMatch(/IF v_doc\.doc_type = 'ingreso' THEN/);
    expect(s).toMatch(/anular este ingreso dejaría el efectivo esperado en negativo/);
  });

  it('estado anulado con trazabilidad completa + auditoría atómica', () => {
    const s = sql();
    expect(s).toMatch(/status = 'anulado',\s+annulled_at = now\(\),\s+annulled_by = v_caller_uid,/);
    expect(s).toMatch(/annulment_reason = v_reason,\s+annulment_payment_transaction_id = v_contra_id/);
    expect(s).toMatch(/'CASH_FLOW_ANNULLED', 'cash_flow_documents'/);
  });
});

describe('migración 20261021000001 — las TRES fórmulas incorporan cash_flow (anti-divergencia)', () => {
  it('close_cash_shift v2.21.0: término in/out en fórmula, respuesta y auditoría', () => {
    const s = sql();
    expect(s).toContain('CREATE OR REPLACE FUNCTION public.close_cash_shift(');
    expect(s).toMatch(/v_cash_flow_in numeric := 0;/);
    expect(s).toMatch(/v_cash_flow_out numeric := 0;/);
    expect(s).toMatch(/\+ v_cash_sales \+ v_cash_production \+ v_cash_flow_in\s+- v_cash_outflows - v_cash_commissions - v_cash_flow_out/);
    expect(s).toMatch(/'cash_flow_in', v_cash_flow_in,/);
    expect(s).toMatch(/'cash_flow_out', v_cash_flow_out,/);
    expect(s).toContain("'formula', 'v2.21.0'");
    // ACL service_role-only intacta
    expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.close_cash_shift\(uuid, numeric, numeric, text, uuid\) FROM PUBLIC, anon, authenticated;/);
  });

  it('get_cash_shift_expected v2.21.0: espejo con cash_flow_in/out en la respuesta', () => {
    const s = sql();
    expect(s).toMatch(/'cash_flow_in', v_cash_flow_in,\s+'cash_flow_out', v_cash_flow_out,/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_cash_shift_expected\(uuid\) TO authenticated;/);
  });

  it('get_cash_report: grupo cash_flow_groups + totales in/out en balance_cup', () => {
    const s = sql();
    expect(s).toContain("'cash_flow_groups', v_cash_flow_groups");
    expect(s).toContain('v_cash_flow_in_total_cup');
    expect(s).toContain('v_cash_flow_out_total_cup');
    expect(s).toMatch(/\+ v_cash_flow_in_total_cup\s+- v_payments_total_cup - v_commissions_total_cup - v_cash_flow_out_total_cup/);
  });

  it('RPC get_cash_flow_summary (authenticated) con barrera REM-R2-READ y fondo vigente', () => {
    const s = sql();
    expect(s).toContain('CREATE OR REPLACE FUNCTION public.get_cash_flow_summary(');
    expect(s).toMatch(/IF auth\.role\(\) <> 'service_role' THEN/);
    expect(s).toMatch(/ERR_UNAUTHORIZED_STORE/);
    expect(s).toContain("'fondo_vigente', v_fondo");
    expect(s).toContain("'fondo_ingresado', v_fondo_in");
    expect(s).toContain("'fondo_devuelto', v_fondo_out");
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_cash_flow_summary\(uuid, timestamptz, timestamptz\) TO authenticated;/);
  });

  it('termina con NOTIFY de recarga y documenta el DOWN reversible', () => {
    const s = sql();
    expect(s.trim().endsWith("NOTIFY pgrst, 'reload schema';") || s.includes("NOTIFY pgrst, 'reload schema';")).toBe(true);
    expect(s).toContain('-- ─── DOWN');
    expect(s).toMatch(/DROP FUNCTION IF EXISTS public\.create_cash_flow_document/);
    expect(s).toMatch(/DROP TABLE IF EXISTS public\.cash_flow_documents CASCADE/);
  });
});
