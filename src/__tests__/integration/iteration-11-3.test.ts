/**
 * Iteración 11.3 — Pruebas PT-11.3.x (Reverse/Void/Devolution v2)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

describe('PT-11.3.1 — Migrations de Iteración 11.3', () => {
  const expected = [
    '20260808000001_v2_17_1_reverse_transaction_v2.sql',
    '20260808000002_v2_17_2_create_devolution_v2.sql',
    '20260808000003_v2_17_3_duplicate_adjustment_v2.sql',
    '20260808000004_v2_17_4_reverse_receipt_v2.sql',
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

describe('PT-11.3.2 — reverse_transaction_v2 (C-8)', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260808000001_v2_17_1_reverse_transaction_v2.sql'), 'utf-8');
  it('usa register_stock_movement', () => expect(sql).toContain('register_stock_movement'));
  it('NO hace UPDATE directo a products.stock_current', () => expect(sql).not.toContain('UPDATE public.products SET stock_current'));
  it('movement_type sale_reverse en stock_movements', () => expect(sql).toContain("'sale_reverse'"));
  it('movement_type sale_reverse en kardex_entries', () => {
    // kardex insert also uses 'sale_reverse' (Aclaración 1)
    const kardexSection = sql.substring(sql.indexOf("INSERT INTO public.kardex_entries"));
    expect(kardexSection).toContain("'sale_reverse'");
  });
  it('ALTER TYPE ADD VALUE sale_reverse', () => expect(sql).toContain("ADD VALUE IF NOT EXISTS 'sale_reverse'"));
  it('kardex CHECK alterado para sale_reverse', () => expect(sql).toContain("'sale_reverse'::text"));
  it('SELECT FOR UPDATE', () => expect(sql).toContain('FOR UPDATE'));
  it('valida status=completed', () => expect(sql).toContain("status <> 'completed'"));
  it('audit_logs REVERSE_SALE_V2', () => expect(sql).toContain("'REVERSE_SALE_V2'"));
  it('conversion_factor', () => expect(sql).toContain('conversion_factor'));
  it('SECURITY DEFINER', () => expect(sql).toContain('SECURITY DEFINER'));
});

describe('PT-11.3.3 — create_devolution_v2 (C-9 + H-Dev1)', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260808000002_v2_17_2_create_devolution_v2.sql'), 'utf-8');
  it('usa register_stock_movement', () => expect(sql).toContain('register_stock_movement'));
  it('NO hace UPDATE directo a products.stock_current', () => expect(sql).not.toContain('UPDATE public.products SET stock_current'));
  it('acepta p_idempotency_key', () => expect(sql).toContain('p_idempotency_key'));
  it('idempotencia: SELECT existing', () => expect(sql).toContain('idempotency_key'));
  it('UNIQUE INDEX en devolutions.idempotency_key', () => expect(sql).toContain('devolutions_idempotency_key_idx'));
  it('valida cross-store (original_tx.store_id = p_store_id)', () => expect(sql).toContain('ERR_CROSS_STORE'));
  it('audit_logs DEVOLUTION_CREATED_V2', () => expect(sql).toContain("'DEVOLUTION_CREATED_V2'"));
  it('inserta en kardex_entries', () => expect(sql).toContain('kardex_entries'));
  it('SECURITY DEFINER', () => expect(sql).toContain('SECURITY DEFINER'));
});

describe('PT-11.3.4 — duplicate_inventory_adjustment_v2 (B-11)', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260808000003_v2_17_3_duplicate_adjustment_v2.sql'), 'utf-8');
  it('usa register_stock_movement', () => expect(sql).toContain('register_stock_movement'));
  it('inserta en stock_movements (via register_stock_movement)', () => expect(sql).toContain("'adjustment'"));
  it('audit_logs ADJUSTMENT_DUPLICATED_V2', () => expect(sql).toContain("'ADJUSTMENT_DUPLICATED_V2'"));
  it('SELECT FOR UPDATE', () => expect(sql).toContain('FOR UPDATE'));
  it('SECURITY DEFINER', () => expect(sql).toContain('SECURITY DEFINER'));
});

describe('PT-11.3.5 — reverse_receipt_v2 (B-12)', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260808000004_v2_17_4_reverse_receipt_v2.sql'), 'utf-8');
  it('usa register_stock_movement', () => expect(sql).toContain('register_stock_movement'));
  it('NO usa GREATEST(0 (no clamp)', () => expect(sql).not.toContain('GREATEST(0'));
  it('RAISE ERR_INSUFFICIENT_STOCK si stock < qty', () => expect(sql).toContain('ERR_INSUFFICIENT_STOCK'));
  it('movement_type purchase_reverse en stock_movements', () => expect(sql).toContain("'purchase_reverse'"));
  it('movement_type purchase_reverse en kardex_entries', () => {
    const kardexSection = sql.substring(sql.indexOf("INSERT INTO public.kardex_entries"));
    expect(kardexSection).toContain("'purchase_reverse'");
  });
  it('ALTER TYPE ADD VALUE purchase_reverse', () => expect(sql).toContain("ADD VALUE IF NOT EXISTS 'purchase_reverse'"));
  it('recalcula WAC', () => expect(sql).toContain('cost_average'));
  it('audit_logs REVERSE_RECEIPT_V2', () => expect(sql).toContain("'REVERSE_RECEIPT_V2'"));
  it('SELECT FOR UPDATE', () => expect(sql).toContain('FOR UPDATE'));
  it('SECURITY DEFINER', () => expect(sql).toContain('SECURITY DEFINER'));
});

describe('PT-11.3.6 — void_transaction NO fue modificado', () => {
  it('no hay migration nueva para void_transaction', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.startsWith('20260808') && f.includes('void_transaction'));
    expect(files.length).toBe(0);
  });
});

describe('PT-11.3.7 — RPCs viejos NO fueron dropeados', () => {
  // Solo verificar que las migraciones no hacen DROP de los viejos
  const allSql = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.startsWith('20260808'))
    .map(f => readFileSync(join(MIGRATIONS_DIR, f), 'utf-8'))
    .join('\n');
  it('no dropea reverse_transaction (viejo)', () => {
    // DROP FUNCTION IF EXISTS public.reverse_transaction( sin _v2
    expect(allSql).not.toMatch(/DROP FUNCTION IF EXISTS public\.reverse_transaction\(/);
  });
  it('no dropea create_devolution (viejo)', () => {
    expect(allSql).not.toMatch(/DROP FUNCTION IF EXISTS public\.create_devolution\(/);
  });
  it('no dropea reverse_receipt (viejo)', () => {
    expect(allSql).not.toMatch(/DROP FUNCTION IF EXISTS public\.reverse_receipt\(/);
  });
});

describe('PT-11.3.8 — Feature flag USE_V2_REVERSE', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'config', 'features.ts'), 'utf-8');
  it('USE_V2_REVERSE existe', () => expect(src).toContain('USE_V2_REVERSE'));
  it('default false', () => expect(src).toContain("=== 'true' || false"));
});

describe('PT-11.3.9 — API /api/reverse branch v1/v2', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'reverse', 'route.ts'), 'utf-8');
  it('tiene RPC_MAP_V1', () => expect(src).toContain('RPC_MAP_V1'));
  it('tiene RPC_MAP_V2', () => expect(src).toContain('RPC_MAP_V2'));
  it('v2 usa reverse_transaction_v2', () => expect(src).toContain("'reverse_transaction_v2'"));
  it('v2 usa reverse_receipt_v2', () => expect(src).toContain("'reverse_receipt_v2'"));
  it('v2 usa duplicate_inventory_adjustment_v2', () => expect(src).toContain("'duplicate_inventory_adjustment_v2'"));
  it('selecciona según FEATURES.USE_V2_REVERSE', () => expect(src).toContain('FEATURES.USE_V2_REVERSE'));
  it('transfer sin cambio en v2', () => expect(src).toContain("'reverse_transfer'"));
});

describe('PT-11.3.10 — API /api/devolutions branch v1/v2', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'devolutions', 'route.ts'), 'utf-8');
  it('selecciona create_devolution_v2 si flag activo', () => expect(src).toContain("'create_devolution_v2'"));
  it('pasa p_idempotency_key en v2', () => expect(src).toContain('p_idempotency_key'));
  it('genera idempotency_key con crypto.randomUUID', () => expect(src).toContain('crypto.randomUUID'));
});

describe('PT-11.3.11 — KardexModal labels (Aclaración 2)', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'components', 'views', 'terminal', 'views', 'inventory', 'KardexModal.tsx'), 'utf-8');
  it('mapea sale_reverse → Reverso de venta', () => {
    expect(src).toContain("sale_reverse:");
    expect(src).toContain("'Reverso de venta'");
  });
  it('mapea purchase_reverse → Reverso de recepción', () => {
    expect(src).toContain("purchase_reverse:");
    expect(src).toContain("'Reverso de recepción'");
  });
});

describe('PT-11.3.12 — Regresión: iteraciones anteriores', () => {
  it('tests de 11.1, 11.2, 12, 13 siguen presentes', () => {
    const testFiles = readdirSync(join(process.cwd(), 'src', '__tests__', 'integration'));
    expect(testFiles).toContain('iteration-11-1.test.ts');
    expect(testFiles).toContain('iteration-11-2.test.ts');
    expect(testFiles).toContain('iteration-12.test.ts');
    expect(testFiles).toContain('iteration-13.test.ts');
  });
  it('USE_V2_CHECKOUT sigue activo', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'config', 'features.ts'), 'utf-8');
    expect(src).toContain('USE_V2_CHECKOUT');
  });
});
