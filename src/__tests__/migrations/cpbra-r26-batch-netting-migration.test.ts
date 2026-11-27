/**
 * R-26 / F011-002 — contrato de la migración
 * 20261127120000_cpbra_r26_batch_reversal_netting.sql (estático, sin BD).
 *
 * Misión CP-BRA-R05-APPROVAL-AND-R25-R26-REMEDIATION-001 §4.3/§4.4:
 * el pre-check de saldo de register_supplier_payment_batch debe netear las
 * contra-filas direction='reversal' con la MISMA semántica del motor single
 * (20261126140000 §2) y del trigger update_payment_status — una sola fórmula
 * para el mismo concepto de saldo pendiente. Histórico jamás editado.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'supabase', 'migrations');
const R26 = readFileSync(join(DIR, '20261127120000_cpbra_r26_batch_reversal_netting.sql'), 'utf8');
// Emisión vigente previa (fuente del cuerpo re-emitido)
const VIVA = readFileSync(join(DIR, '20261121200000_cp_log_unification_master_visibility.sql'), 'utf8');
// Motor single (semántica contable autoritativa que debe espejarse)
const MOTOR = readFileSync(join(DIR, '20261126140000_cpbra_r01_r14_payment_engine.sql'), 'utf8');

const body = (sql: string, fn: string): string => {
  const m = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\([\\s\\S]*?\\n\\$\\$?function\\$\\$?;`))
    || sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\([\\s\\S]*?\\n\\$function\\$;`));
  return m ? m[0] : '';
};

const stripComments = (s: string): string => s.replace(/--[^\n]*/g, '');

describe('CP-BRA R-26 — 20261127120000_cpbra_r26_batch_reversal_netting.sql', () => {
  it('1. migración transaccional (BEGIN/COMMIT) y firma certificada del batch preservada', () => {
    expect(R26).toMatch(/^BEGIN;/m);
    expect(R26).toMatch(/\nCOMMIT;/);
    expect(R26).toContain(
      'CREATE OR REPLACE FUNCTION public.register_supplier_payment_batch(\n  p_store_id uuid,\n  p_ref_type text,\n  p_ref_id uuid,\n  p_payments jsonb,\n  p_paid_by uuid,\n  p_payment_date timestamptz DEFAULT NULL::timestamptz,\n  p_idempotency_key text DEFAULT NULL::text\n)'
    );
  });

  it('2. el pre-check netea contra-filas: CASE direction=\'reversal\' en el CÓDIGO (sin comentarios)', () => {
    const code = stripComments(body(R26, 'register_supplier_payment_batch'));
    expect(code).toContain("CASE WHEN COALESCE(pt.direction, 'in') = 'reversal' THEN");
    expect(code).toContain('INTO v_paid');
  });

  it('3. el neteo es EXACTAMENTE el del motor single (20261126140000 §2) — sin fórmulas paralelas', () => {
    const r26code = body(R26, 'register_supplier_payment_batch');
    const motorCode = body(MOTOR, 'register_supplier_payment');
    // El patrón del SUM neteado del batch debe contener el mismo fragmento
    // canónico que el motor single (moneda del documento, contra-fila resta)
    const canonical = "CASE WHEN COALESCE(pt.direction, 'in') = 'reversal' THEN";
    expect(r26code).toContain(canonical);
    expect(motorCode).toContain(canonical);
    // Ambos restan el importe en moneda del documento (amount vs amount_cup/rate)
    expect(r26code).toContain('-CASE WHEN pt.currency = v_doc_currency THEN pt.amount');
    expect(motorCode).toContain('-CASE WHEN pt.currency = v_doc_currency THEN pt.amount');
  });

  it('4. el único cambio de CÓDIGO respecto al cuerpo vivo es el SUM del pre-check', () => {
    const live = body(VIVA, 'register_supplier_payment_batch');
    const nueva = body(R26, 'register_supplier_payment_batch');
    expect(live).toBeTruthy();
    const oldCode = stripComments(live);
    const newCode = stripComments(nueva);
    // Sin comentarios, las diferencias son SOLO las líneas del SUM
    const norm = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
    const oldN = norm(oldCode);
    const newN = norm(newCode);
    // Líneas de código que difieren (set, no orden)
    const removed = oldN.filter((l) => !newN.includes(l));
    const added = newN.filter((l) => !oldN.includes(l));
    // El defecto eliminado: el cierre del SUM sin neteo
    // (la línea "CASE WHEN pt.currency..." persiste como rama ELSE del neteo;
    // lo que DESAPARECE es el cierre sin END del SUM defectuoso)
    expect(removed.join('\n')).toContain('ELSE pt.amount_cup / v_doc_rate');
    expect(removed.join('\n')).not.toContain('END');
    // Lo añadido: el CASE de neteo (sin tocar nada más)
    expect(added.length).toBeLessThanOrEqual(8);
    expect(added.join('\n')).toContain("COALESCE(pt.direction, 'in') = 'reversal'");
    // Nada de la aritmética de componentes ni del fast path de replay cambió
    expect(newCode).toContain('v_sum_in_doc := v_sum_in_doc + v_amount_in_doc');
    expect(newCode).toContain('v_replay_complete');
    expect(newCode).toContain("'replayed', true");
    expect(newCode).toContain('ERR_BATCH_SIZE');
    expect(newCode).toContain('ERR_COMPONENT_INVALID');
    expect(newCode).toContain('ERR_TASA_NO_DISPONIBLE');
    expect(newCode).toContain('ERR_SERVICE_NOT_ACTIVE');
    expect(newCode).toContain('ERR_RECEIPT_NOT_PAYABLE');
    // El fast path de replay sigue precediendo al pre-check de overpay
    const idxReplay = newCode.indexOf('v_replay_complete THEN');
    const idxOverpay = newCode.indexOf('ERR_BATCH_OVERPAY');
    expect(idxReplay).toBeGreaterThan(-1);
    expect(idxOverpay).toBeGreaterThan(idxReplay);
  });

  it('5. máquina de estado del documento intacta (lock FOR UPDATE + gates service/receipt)', () => {
    const code = stripComments(body(R26, 'register_supplier_payment_batch'));
    expect(code).toContain('FOR UPDATE');
    expect(code).toContain("COALESCE(v_doc_status, 'active') <> 'active'");
    expect(code).toContain("IN ('voided', 'reversed')");
    expect(code).toContain('register_supplier_payment(');
  });

  it('6. rechazo de overpay verdadero preservado (ERR_BATCH_OVERPAY) — comparación contra saldo neto', () => {
    const code = stripComments(body(R26, 'register_supplier_payment_batch'));
    expect(code).toContain('v_balance := v_doc_total - v_paid;');
    expect(code).toContain('IF v_sum_in_doc > v_balance THEN');
    expect(code).toContain('ERR_BATCH_OVERPAY');
  });

  it('7. ACL certificada preservada: service_role exclusiva (REVOKE PUBLIC/anon/authenticated)', () => {
    expect(R26).toMatch(/REVOKE EXECUTE ON FUNCTION public\.register_supplier_payment_batch\(uuid, text, uuid, jsonb, uuid, timestamptz, text\) FROM PUBLIC, anon, authenticated;/);
    expect(R26).toMatch(/GRANT EXECUTE ON FUNCTION public\.register_supplier_payment_batch\(uuid, text, uuid, jsonb, uuid, timestamptz, text\) TO service_role;/);
  });

  it('8. SECURITY DEFINER + search_path preservados', () => {
    const code = body(R26, 'register_supplier_payment_batch');
    expect(code).toContain('SECURITY DEFINER');
    expect(code).toContain("SET search_path TO 'public', 'extensions'");
  });

  it('9. sin edición de histórico: la migración NO contiene UPDATE/DELETE sobre payment_transactions', () => {
    const code = stripComments(R26);
    expect(code).not.toMatch(/UPDATE\s+public\.payment_transactions/i);
    expect(code).not.toMatch(/DELETE\s+FROM\s+public\.payment_transactions/i);
    expect(code).not.toMatch(/UPDATE\s+public\.fin_/i);
  });

  it('10. guards de aplicación fail-closed (R26-GUARD firma; R26-VERIFY neteo+ACL sin contar comentarios)', () => {
    expect(R26).toContain('R26-GUARD: register_supplier_payment_batch(uuid,text,uuid,jsonb,uuid,timestamptz,text) no existe');
    expect(R26).toContain('R26-VERIFY: el pre-check no netea contra-filas');
    expect(R26).toContain('R26-VERIFY: ACL divergente tras la reemisión');
    // El VERIFY usa el cuerpo sin comentarios (regexp_replace) — patrón R-05
    expect(R26).toContain("regexp_replace(v_def, '--[^\\n]*', '', 'g')");
  });

  it('11. sin secretos en el SQL', () => {
    // Patrones construidos por partes para no auto-detectarse
    const patterns = [
      'github' + '_pat_',
      'sb_' + 'secret_',
      'sbp_',
      'sb_' + 'publishable_',
      'eyJ' + 'hbGciOi',
    ];
    for (const p of patterns) expect(R26).not.toContain(p);
  });

  it('12. el manifiesto replay incluye la migración (posición 220; baseline 222 con R-03 + §0.2 pay_commission)', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'audit-evidence', 'INFRA-011', 'e2e-migrations-manifest.json'), 'utf8')
    );
    // R-03 (20261127140000) añadió la posición 221 y §0.2 pay_commission
    // (20261127150000) la 222 al stream → baseline 222. La posición de R-26
    // (220) permanece intacta.
    // COSTPRO-SALES-MODAL-INPUT-AND-TRANSFER-VALIDATION-001: el stream creció
    // a 226 con 20261128120000 (+1 R-06 de main) (create_sale_v2 /36, transfer identity).
    expect(manifest.total_incluidos).toBe(226);
    const entry = manifest.archivos.find((a: { nombre: string }) => a.nombre === '20261127120000_cpbra_r26_batch_reversal_netting.sql');
    expect(entry).toBeDefined();
    expect(entry.estado).toBe('incluido');
    expect(entry.posicion).toBe(220);
    expect(entry.sha256_original).toBe(entry.sha256_generado);
  });
});
