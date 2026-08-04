/**
 * Iteración Fiscal — Pruebas PT-FISCAL.x
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

describe('PT-FISCAL.1 — Migrations de Iteración Fiscal', () => {
  const expected = [
    '20260810000001_v2_19_1_document_sequences.sql',
    '20260810000002_v2_19_2_z_reports.sql',
    '20260810000003_v2_19_3_invoice_number_fiscal_lock.sql',
    '20260810000004_v2_19_4_devolution_sequence.sql',
    '20260810000005_v2_19_5_fiscal_closings_immutable.sql',
    '20260810000006_v2_19_6_fiscal_reports.sql',
    '20260810000007_v2_19_7_retention_policy.sql',
  ];
  for (const f of expected) {
    it(`${f} existe`, () => {
      expect(readdirSync(MIGRATIONS_DIR)).toContain(f);
    });
    it(`${f} tiene DOWN`, () => {
      const content = readFileSync(join(MIGRATIONS_DIR, f), 'utf-8');
      // Migration 7 is just COMMENTs — no DOWN needed
      if (f.includes('retention_policy')) return;
      expect(content).toContain('DOWN');
    });
  }
});

describe('PT-FISCAL.2 — document_sequences + next_document_number (F-C1)', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260810000001_v2_19_1_document_sequences.sql'), 'utf-8');
  it('tabla document_sequences con CHECK completo (Aclaración 1)', () => {
    expect(sql).toContain("CHECK (document_type IN ('invoice', 'credit_note', 'quotation', 'z_report'))");
  });
  it('UNIQUE index en (store_id, document_type, year)', () => {
    expect(sql).toContain('document_sequences_store_type_year_idx');
  });
  it('next_document_number usa SELECT FOR UPDATE', () => {
    expect(sql).toContain('FOR UPDATE');
  });
  it('next_document_number genera FAC- prefix', () => {
    expect(sql).toContain("'FAC'");
  });
  it('next_document_number genera NC- prefix', () => {
    expect(sql).toContain("'NC'");
  });
  it('next_document_number genera COT- prefix', () => {
    expect(sql).toContain("'COT'");
  });
  it('next_document_number genera ZR- prefix', () => {
    expect(sql).toContain("'z_report'") // document_type check
    expect(sql).toContain("'ZR'");
  });
  it('SECURITY DEFINER', () => expect(sql).toContain('SECURITY DEFINER'));
});

describe('PT-FISCAL.3 — z_reports table + integración close_cash_shift (F-C2)', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260810000002_v2_19_2_z_reports.sql'), 'utf-8');
  it('tabla z_reports existe', () => expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.z_reports'));
  it('FK a cash_closures', () => expect(sql).toContain('REFERENCES public.cash_closures'));
  it('z_report_number UNIQUE', () => expect(sql).toContain('z_reports_z_report_number_idx'));
  it('trigger inmutabilidad', () => {
    expect(sql).toContain('prevent_z_report_edit');
    expect(sql).toContain('BEFORE UPDATE OR DELETE');
  });
  it('close_cash_shift genera Z Report (Aclaración 2: aditivo)', () => {
    expect(sql).toContain('Iteración Fiscal (F-C2): Generar Z Report');
    expect(sql).toContain('next_document_number');
    expect(sql).toContain("'z_report'");
  });
  it('ERR_Z_REPORT_GENERATION_FAILED en excepción (Aclaración 2)', () => {
    expect(sql).toContain('ERR_Z_REPORT_GENERATION_FAILED');
  });
  it('Z Report audit log', () => {
    expect(sql).toContain("'Z_REPORT_GENERATED'");
  });
});

describe('PT-FISCAL.4 — invoice_number + fiscal lock (F-C1, F-C3)', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260810000003_v2_19_3_invoice_number_fiscal_lock.sql'), 'utf-8');
  it('ALTER TABLE transactions ADD invoice_number', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS invoice_number text');
  });
  it('validate_operation_date checkea fiscal_closings', () => {
    expect(sql).toContain('fiscal_closings');
    expect(sql).toContain('ERR_FISCAL_PERIOD_CLOSED');
  });
  it('create_sale_v2 asigna invoice_number', () => {
    expect(sql).toContain("next_document_number(p_store_id, 'invoice'");
    expect(sql).toContain('v_invoice_number');
  });
  it('create_sale_v2 persiste invoice_number en INSERT', () => {
    expect(sql).toContain('invoice_number');
  });
  it('create_sale_v2 audit incluye invoice_number', () => {
    expect(sql).toContain("'invoice_number', v_invoice_number");
  });
});

describe('PT-FISCAL.5 — devolución secuencial (F-H1)', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260810000004_v2_19_4_devolution_sequence.sql'), 'utf-8');
  it('usa next_document_number credit_note', () => {
    expect(sql).toContain("next_document_number(p_store_id, 'credit_note'");
  });
  it('NO usa epoch % 1000000 en código activo', () => {
    // Filter comments to check only active code
    const activeLines = sql.split('\n').filter(l => !l.trim().startsWith('--'));
    const activeCode = activeLines.join('\n');
    expect(activeCode).not.toContain('% 1000000');
  });
});

describe('PT-FISCAL.6 — fiscal_closings inmutable locked (F-H2)', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260810000005_v2_19_5_fiscal_closings_immutable.sql'), 'utf-8');
  it('trigger BEFORE UPDATE OR DELETE', () => {
    expect(sql).toContain('BEFORE UPDATE OR DELETE');
  });
  it('valida OLD.status=locked', () => {
    expect(sql).contains("OLD.status = 'locked'");
  });
  it('RAISE ERR_FISCAL_CLOSING_LOCKED', () => {
    expect(sql).toContain('ERR_FISCAL_CLOSING_LOCKED');
  });
  it('bypass con app.bypass_fiscal_lock', () => {
    expect(sql).toContain('app.bypass_fiscal_lock');
  });
});

describe('PT-FISCAL.7 — fiscal reports (F-H3, F-H4)', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260810000006_v2_19_6_fiscal_reports.sql'), 'utf-8');
  it('get_sales_book existe', () => expect(sql).toContain('get_sales_book'));
  it('get_purchases_book existe', () => expect(sql).toContain('get_purchases_book'));
  it('get_tax_report existe', () => expect(sql).toContain('get_tax_report'));
  it('get_tax_report calcula net_tax_payable', () => expect(sql).toContain('net_tax_payable'));
  it('get_sales_book incluye voided', () => expect(sql).toContain("'voided'"));
  it('todos son STABLE SECURITY DEFINER', () => {
    expect(sql).toContain('STABLE SECURITY DEFINER');
  });
});

describe('PT-FISCAL.8 — API routes', () => {
  it('GET /api/fiscal/sales-book existe', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'fiscal', 'sales-book', 'route.ts'), 'utf-8');
    expect(src).toContain('get_sales_book');
  });
  it('GET /api/fiscal/purchases-book existe', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'fiscal', 'purchases-book', 'route.ts'), 'utf-8');
    expect(src).toContain('get_purchases_book');
  });
  it('GET /api/fiscal/tax-report existe', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'fiscal', 'tax-report', 'route.ts'), 'utf-8');
    expect(src).toContain('get_tax_report');
  });
});

describe('PT-FISCAL.9 — Documentación', () => {
  it('docs/fiscal-sequencing.md existe con política de gaps', () => {
    const src = readFileSync(join(process.cwd(), 'docs', 'fiscal-sequencing.md'), 'utf-8');
    expect(src).toContain('expected and accepted');
    expect(src.toLowerCase()).toContain('not reused');
  });
});

describe('PT-FISCAL.10 — Regresión', () => {
  it('tests de iteraciones anteriores presentes', () => {
    const testFiles = readdirSync(join(process.cwd(), 'src', '__tests__', 'integration'));
    expect(testFiles).toContain('iteration-11-1.test.ts');
    expect(testFiles).toContain('iteration-11-2.test.ts');
    expect(testFiles).toContain('iteration-11-3.test.ts');
    expect(testFiles).toContain('iteration-11-4.test.ts');
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
