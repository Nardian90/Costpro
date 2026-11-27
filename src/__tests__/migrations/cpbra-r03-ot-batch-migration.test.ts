/**
 * R-03 — contrato de la migración
 * 20261127140000_cpbra_r03_ot_payment_batch.sql (estático, sin BD).
 *
 * Misión CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 §0.1/§3.3:
 * decisión del propietario — INDEPENDENCIA entre órdenes, ATOMICIDAD dentro
 * de cada orden. register_ot_payment_batch confirma TODOS los componentes de
 * UNA OT en una sola transacción o ninguno (sin pagos parciales dentro de la
 * orden); la operación multi-OT parcial vive en la ruta /api/payments/ot-batch.
 * El motor single, el batch receipt|service y el trigger permanecen intactos.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'supabase', 'migrations');
const R03 = readFileSync(join(DIR, '20261127140000_cpbra_r03_ot_payment_batch.sql'), 'utf8');
// Motor single (semántica contable autoritativa que debe espejarse)
const MOTOR = readFileSync(join(DIR, '20261126140000_cpbra_r01_r14_payment_engine.sql'), 'utf8');
// Batch receipt|service (R-26) — el espejo estructural del que deriva el patrón
const BATCH = readFileSync(join(DIR, '20261127120000_cpbra_r26_batch_reversal_netting.sql'), 'utf8');

const body = (sql: string, fn: string): string => {
  const m = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\([\\s\\S]*?\\n\\$function\\$;`));
  return m ? m[0] : '';
};

const stripComments = (s: string): string => s.replace(/--[^\n]*/g, '');

describe('CP-BRA R-03 — 20261127140000_cpbra_r03_ot_payment_batch.sql', () => {
  it('1. migración transaccional (BEGIN/COMMIT) y firma espejo del batch certificado', () => {
    expect(R03).toMatch(/^BEGIN;/m);
    expect(R03).toMatch(/\nCOMMIT;/);
    expect(R03).toContain(
      'CREATE OR REPLACE FUNCTION public.register_ot_payment_batch(\n  p_store_id uuid,\n  p_ref_type text,\n  p_ref_id uuid,\n  p_payments jsonb,\n  p_paid_by uuid,\n  p_payment_date timestamptz DEFAULT NULL::timestamptz,\n  p_idempotency_key text DEFAULT NULL::text\n)'
    );
  });

  it('2. exclusividad de OT: ref_type production_order|work SOLO (el batch CxP permanece separado)', () => {
    const code = stripComments(body(R03, 'register_ot_payment_batch'));
    expect(code).toContain("p_ref_type NOT IN ('production_order', 'work')");
    expect(code).toContain('ERR_REF_TYPE_INVALID');
    // El lote receipt|service NO fue tocado por esta migración
    expect(R03).not.toContain('CREATE OR REPLACE FUNCTION public.register_supplier_payment_batch');
    expect(R03).not.toContain('CREATE OR REPLACE FUNCTION public.register_supplier_payment(');
  });

  it('3. atomicidad por orden: lock FOR UPDATE primero + inserción vía el motor single en UNA transacción', () => {
    const code = stripComments(body(R03, 'register_ot_payment_batch'));
    expect(code).toContain('FROM public.production_orders WHERE id = p_ref_id FOR UPDATE');
    // Los componentes pasan por el motor single certificado (sin INSERT propio)
    expect(code).toContain('public.register_supplier_payment(');
    expect(code).not.toMatch(/INSERT INTO public\.payment_transactions/i);
  });

  it('4. gate de estado de la OT (ERR_ORDER_NOT_PAYABLE) y store mismatch fail-closed', () => {
    const code = stripComments(body(R03, 'register_ot_payment_batch'));
    expect(code).toContain("COALESCE(v_doc_status, 'draft') = 'voided'");
    expect(code).toContain('ERR_ORDER_NOT_PAYABLE');
    expect(code).toContain('El documento no pertenece a la tienda especificada');
  });

  it('5. UNA sola fórmula de saldo: pre-check NETEA contra-filas con el CASE canónico del motor single', () => {
    const r03code = body(R03, 'register_ot_payment_batch');
    const motorCode = body(MOTOR, 'register_supplier_payment');
    const batchCode = body(BATCH, 'register_supplier_payment_batch');
    const canonical = "CASE WHEN COALESCE(pt.direction, 'in') = 'reversal' THEN";
    for (const c of [r03code, motorCode, batchCode]) expect(c).toContain(canonical);
    // La fórmula del lote OT es EXACTAMENTE la del motor single (moneda del documento)
    const norm = (s: string) => stripComments(s).split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
    const sumO = norm(r03code);
    const sumM = norm(motorCode);
    for (const frag of [
      '-CASE WHEN pt.currency = v_doc_currency THEN pt.amount',
      'ELSE pt.amount_cup / v_doc_rate END',
    ]) {
      expect(sumO).toContain(frag);
      expect(sumM).toContain(frag);
    }
    // Saldo pendiente = total del documento − pagado NETEADO (mismo patrón;
    // los nombres de variables locales difieren: v_doc_total vs v_total)
    expect(sumO).toMatch(/v_balance := v_\w+ - v_paid;/);
    expect(sumM).toMatch(/v_balance := v_\w+ - v_paid;/);
  });

  it('6. fast-path de replay por bloque ANTES del pre-check de overpay (lección ADN-008/P1)', () => {
    const code = stripComments(body(R03, 'register_ot_payment_batch'));
    expect(code).toContain('v_replay_complete');
    expect(code).toContain("'replayed', true");
    const idxReplay = code.indexOf('v_replay_complete THEN');
    const idxOverpay = code.indexOf('ERR_BATCH_OVERPAY');
    expect(idxReplay).toBeGreaterThan(-1);
    expect(idxOverpay).toBeGreaterThan(idxReplay);
    // Idempotencia de bloque '<key>:<i>' idéntica al batch certificado
    expect(code).toContain("v_block_key || ':' || v_idx");
  });

  it('7. aritmética CP-FIN-004 de componentes intacta (zelle→external_transfer, riel divisa, tasas fail-closed)', () => {
    const code = stripComments(body(R03, 'register_ot_payment_batch'));
    expect(code).toContain('ERR_BATCH_SIZE');
    expect(code).toContain('ERR_COMPONENT_INVALID');
    expect(code).toContain('ERR_TASA_NO_DISPONIBLE');
    expect(code).toContain("IF lower(v_method) = 'zelle' THEN v_method := 'external_transfer'; END IF;");
    expect(code).toContain("v_method = 'external_transfer' AND v_currency NOT IN ('USD', 'EUR')");
  });

  it('8. ACL certificada: service_role EXCLUSIVA (REVOKE PUBLIC/anon/authenticated)', () => {
    expect(R03).toMatch(/REVOKE EXECUTE ON FUNCTION public\.register_ot_payment_batch\(uuid, text, uuid, jsonb, uuid, timestamptz, text\) FROM PUBLIC, anon, authenticated;/);
    expect(R03).toMatch(/GRANT EXECUTE ON FUNCTION public\.register_ot_payment_batch\(uuid, text, uuid, jsonb, uuid, timestamptz, text\) TO service_role;/);
  });

  it('9. SECURITY DEFINER + search_path + validate_operation_date (gate de fechas)', () => {
    const code = body(R03, 'register_ot_payment_batch');
    expect(code).toContain('SECURITY DEFINER');
    expect(code).toContain("SET search_path TO 'public', 'extensions'");
    expect(code).toContain('PERFORM public.validate_operation_date(');
  });

  it('10. sin edición de histórico: la migración NO contiene UPDATE/DELETE sobre payment_transactions/fin_*', () => {
    const code = stripComments(R03);
    expect(code).not.toMatch(/UPDATE\s+public\.payment_transactions/i);
    expect(code).not.toMatch(/DELETE\s+FROM\s+public\.payment_transactions/i);
    expect(code).not.toMatch(/UPDATE\s+public\.fin_/i);
    expect(code).not.toMatch(/DELETE\s+FROM\s+public\.fin_/i);
  });

  it('11. guards de aplicación fail-closed (R03-GUARD firma del motor; R03-VERIFY neteo+ACL sin comentarios)', () => {
    expect(R03).toContain('R03-GUARD: register_supplier_payment (firma certificada 20261126140000) no existe');
    expect(R03).toContain('R03-VERIFY: register_ot_payment_batch no existe tras la emisión');
    expect(R03).toContain('R03-VERIFY: el pre-check no netea contra-filas');
    expect(R03).toContain('R03-VERIFY: ACL divergente tras la emisión');
    expect(R03).toContain("regexp_replace(v_def, '--[^\\n]*', '', 'g')");
  });

  it('12. sin secretos en el SQL', () => {
    const patterns = [
      'github' + '_pat_',
      'sb_' + 'secret_',
      'sbp_',
      'sb_' + 'publishable_',
      'eyJ' + 'hbGciOi',
    ];
    for (const p of patterns) expect(R03).not.toContain(p);
  });

  it('13. el manifiesto replay incluye la migración (posición 221; baseline 222 desde §0.2 pay_commission)', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'audit-evidence', 'INFRA-011', 'e2e-migrations-manifest.json'), 'utf8')
    );
    expect(manifest.total_incluidos).toBe(225);
    const entry = manifest.archivos.find((a: { nombre: string }) => a.nombre === '20261127140000_cpbra_r03_ot_payment_batch.sql');
    expect(entry).toBeDefined();
    expect(entry.estado).toBe('incluido');
    expect(entry.posicion).toBe(222);
    expect(entry.sha256_original).toBe(entry.sha256_generado);
  });
});
