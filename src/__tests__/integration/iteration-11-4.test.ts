/**
 * Iteración 11.4 — Pruebas PT-11.4.x (Cash Closures + Comisiones + Auditoría)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

describe('PT-11.4.1 — Migrations de Iteración 11.4', () => {
  const expected = [
    '20260809000001_v2_18_1_cash_closure_immutability.sql',
    '20260809000002_v2_18_2_close_cash_shift.sql',
    '20260809000003_v2_18_3_commission_reversal_trigger.sql',
    '20260809000004_v2_18_4_audit_triggers.sql',
  ];
  for (const f of expected) {
    it(`${f} existe`, () => {
      expect(readdirSync(MIGRATIONS_DIR)).toContain(f);
    });
    it(`${f} tiene DOWN`, () => {
      expect(readFileSync(join(MIGRATIONS_DIR, f), 'utf-8')).toContain('DOWN');
    });
  }
});

describe('PT-11.4.2 — close_cash_shift RPC (H-3, M-8, M-9, M-CR4)', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260809000002_v2_18_2_close_cash_shift.sql'), 'utf-8');
  it('usa pg_advisory_xact_lock', () => expect(sql).toContain('pg_advisory_xact_lock'));
  it('usa SELECT FOR UPDATE', () => expect(sql).toContain('FOR UPDATE'));
  it('valida status=pendiente', () => expect(sql).toContain('ERR_CLOSURE_NOT_PENDING'));
  it('recalcula system_expected_total server-side', () => expect(sql).toContain('v_system_expected_total'));
  it('incluye cash_sales', () => expect(sql).toContain('v_cash_sales'));
  it('incluye transfer_sales', () => expect(sql).toContain('v_transfer_sales'));
  it('incluye zelle_sales (corrección solicitada)', () => expect(sql).toContain('v_zelle_sales'));
  it('incluye cash_payments_to_suppliers', () => expect(sql).toContain('v_cash_payments'));
  it('incluye cash_commissions_paid', () => expect(sql).toContain('v_cash_commissions'));
  it('incluye opening_balance', () => expect(sql).toContain('opening_balance'));
  it('escribe audit_logs CASH_CLOSURE_FINALIZED', () => expect(sql).toContain("'CASH_CLOSURE_FINALIZED'"));
  it('audit incluye v2_close=true', () => expect(sql).toContain("'v2_close', true"));
  it('SECURITY DEFINER', () => expect(sql).toContain('SECURITY DEFINER'));
});

describe('PT-11.4.3 — reopen_cash_shift RPC', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260809000002_v2_18_2_close_cash_shift.sql'), 'utf-8');
  it('requiere reason min 3 chars', () => expect(sql).toContain('ERR_REASON_REQUIRED'));
  it('valida status=cerrado', () => expect(sql).toContain('ERR_CLOSURE_NOT_CLOSED'));
  it('requiere admin/manager', () => expect(sql).toContain("ARRAY['admin', 'manager']"));
  it('usa app.bypass_closure_lock', () => expect(sql).toContain('app.bypass_closure_lock'));
  it('escribe audit CASH_CLOSURE_REOPENED', () => expect(sql).toContain("'CASH_CLOSURE_REOPENED'"));
});

describe('PT-11.4.4 — Trigger inmutabilidad cash_closures (H-3)', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260809000001_v2_18_1_cash_closure_immutability.sql'), 'utf-8');
  it('trigger BEFORE UPDATE OR DELETE', () => expect(sql).toContain('BEFORE UPDATE OR DELETE'));
  it('valida OLD.status=cerrado', () => expect(sql).toContain("OLD.status = 'cerrado'"));
  it('RAISE ERR_CASH_CLOSURE_LOCKED', () => expect(sql).toContain('ERR_CASH_CLOSURE_LOCKED'));
  it('bypass con app.bypass_closure_lock', () => expect(sql).toContain('app.bypass_closure_lock'));
});

describe('PT-11.4.5 — Trigger comisiones Opción A (H-4)', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260809000003_v2_18_3_commission_reversal_trigger.sql'), 'utf-8');
  it('AFTER UPDATE OF status', () => expect(sql).toContain('AFTER UPDATE OF status'));
  it('dispara en voided', () => expect(sql).toContain("'voided'"));
  it('dispara en reversed', () => expect(sql).toContain("'reversed'"));
  it('NO cancela (usa flagged_for_review)', () => {
    expect(sql).toContain("'flagged_for_review'");
    expect(sql).not.toContain("status = 'cancelled'");
  });
  it('añade flagged_for_review al CHECK', () => expect(sql).toContain("'flagged_for_review'"));
  it('escribe COMMISSION_FLAGGED_FOR_REVIEW audit', () => expect(sql).toContain("'COMMISSION_FLAGGED_FOR_REVIEW'"));
  it('NO crea ajuste negativo', () => expect(sql).not.toContain('-v_payment'));
  it('SECURITY DEFINER', () => expect(sql).toContain('SECURITY DEFINER'));
});

describe('PT-11.4.6 — Audit triggers (H-5)', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260809000004_v2_18_4_audit_triggers.sql'), 'utf-8');
  it('trigger en cash_closures', () => {
    expect(sql).toContain('trg_audit_cash_closures');
    expect(sql).toContain('CASH_CLOSURE_CREATED');
  });
  it('trigger en commission_payments', () => {
    expect(sql).toContain('trg_audit_commission_payments');
    expect(sql).toContain('COMMISSION_PAYMENT_CREATED');
  });
  it('trigger en fiscal_closings', () => {
    expect(sql).toContain('trg_audit_fiscal_closings');
    expect(sql).toContain('FISCAL_CLOSING_CREATED');
  });
  it('trigger en payment_transactions (reemplaza register_supplier_payment audit)', () => {
    expect(sql).toContain('trg_audit_payment_transactions');
    expect(sql).toContain('SUPPLIER_PAYMENT_REGISTERED');
  });
  it('skip duplicación cuando close_cash_shift ya auditó', () => {
    expect(sql).toContain('close_cash_shift ya escribió');
  });
});

describe('PT-11.4.7 — API /api/cash-closures/close', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'cash-closures', 'close', 'route.ts'), 'utf-8');
  it('export POST', () => expect(src).toContain('export const POST'));
  it('withAuth', () => expect(src).toContain('withAuth'));
  it('rateLimit', () => expect(src).toContain('rateLimit'));
  it('invoca close_cash_shift RPC', () => expect(src).toContain("rpc('close_cash_shift'"));
  it('CSRF', () => expect(src).toContain('validateOrigin'));
});

describe('PT-11.4.8 — API /api/cash-closures/reopen', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'cash-closures', 'reopen', 'route.ts'), 'utf-8');
  it('export POST', () => expect(src).toContain('export const POST'));
  it('rateLimit 5/min (estricto)', () => expect(src).toContain('maxRequests: 5'));
  it('invoca reopen_cash_shift RPC', () => expect(src).toContain("rpc('reopen_cash_shift'"));
  it('requiere reason min 3', () => expect(src).toContain('min(3)'));
});

describe('PT-11.4.9 — /api/cash-report valida canManageStore (H-7)', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'cash-report', 'route.ts'), 'utf-8');
  it('importa canManageStore', () => expect(src).toContain('canManageStore'));
  it('valida antes de invocar RPC', () => expect(src).toContain('No tienes acceso a esta tienda'));
});

describe('PT-11.4.10 — /api/commissions/payments valida canManageStore (H-8)', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'commissions', 'payments', 'route.ts'), 'utf-8');
  it('importa canManageStore', () => expect(src).toContain('canManageStore'));
  it('valida antes de crear payment', () => expect(src).toContain('No tienes acceso a esta tienda'));
});

describe('PT-11.4.11 — useCashClosures refactor', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'hooks', 'api', 'useCashClosures.ts'), 'utf-8');
  it('usa fetch /api/cash-closures/close cuando status=cerrado', () => {
    expect(src).toContain("fetch('/api/cash-closures/close'");
    expect(src).toContain("closure.status === 'cerrado'");
  });
  it('NO llama logCashClosureFinalized (audit atómico en RPC)', () => {
    // Solo debe aparecer en comentarios, no en código activo
    const activeLines = src.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
    const activeCode = activeLines.join('\n');
    expect(activeCode).not.toContain('logCashClosureFinalized(');
  });
  it('mantiene path viejo para updates no-cierre', () => {
    expect(src).toContain('cashService.updateClosure');
  });
});

describe('PT-11.4.12 — Regresión: iteraciones anteriores', () => {
  it('tests de 11.1, 11.2, 11.3, 12, 13 siguen presentes', () => {
    const testFiles = readdirSync(join(process.cwd(), 'src', '__tests__', 'integration'));
    expect(testFiles).toContain('iteration-11-1.test.ts');
    expect(testFiles).toContain('iteration-11-2.test.ts');
    expect(testFiles).toContain('iteration-11-3.test.ts');
    expect(testFiles).toContain('iteration-12.test.ts');
    expect(testFiles).toContain('iteration-13.test.ts');
  });
  it('USE_V2_CHECKOUT sigue activo', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'config', 'features.ts'), 'utf-8');
    expect(src).toContain('USE_V2_CHECKOUT');
  });
  it('USE_V2_REVERSE sigue activo', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'config', 'features.ts'), 'utf-8');
    expect(src).toContain('USE_V2_REVERSE');
  });
});
