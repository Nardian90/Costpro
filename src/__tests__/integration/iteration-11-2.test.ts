/**
 * Iteración 11.2 — Pruebas PT-11.2.x (create_sale_v2)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

describe('PT-11.2.1 — Migrations de Iteración 11.2', () => {
  const expected = [
    '20260807000001_v2_16_1_transaction_items_full_columns.sql',
    '20260807000002_v2_16_2_has_store_role_as.sql',
    '20260807000003_v2_16_3_create_sale_v2.sql',
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

describe('PT-11.2.2 — transaction_items 15 columnas nuevas', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260807000001_v2_16_1_transaction_items_full_columns.sql'), 'utf-8');
  it('zelle_paid', () => expect(sql).toContain('zelle_paid NUMERIC'));
  it('currency', () => expect(sql).toContain('currency TEXT'));
  it('exchange_rate', () => expect(sql).toContain('exchange_rate NUMERIC'));
  it('cash_currency', () => expect(sql).toContain('cash_currency TEXT'));
  it('transfer_currency', () => expect(sql).toContain('transfer_currency TEXT'));
  it('zelle_currency', () => expect(sql).toContain('zelle_currency TEXT'));
  it('cash_discount_type', () => expect(sql).toContain('cash_discount_type TEXT'));
  it('cash_discount_value', () => expect(sql).toContain('cash_discount_value NUMERIC'));
  it('cash_discount_currency', () => expect(sql).toContain('cash_discount_currency TEXT'));
  it('transfer_discount_* (3)', () => {
    expect(sql).toContain('transfer_discount_type TEXT');
    expect(sql).toContain('transfer_discount_value NUMERIC');
    expect(sql).toContain('transfer_discount_currency TEXT');
  });
  it('zelle_discount_* (3)', () => {
    expect(sql).toContain('zelle_discount_type TEXT');
    expect(sql).toContain('zelle_discount_value NUMERIC');
    expect(sql).toContain('zelle_discount_currency TEXT');
  });
  it('todas son ADD COLUMN IF NOT EXISTS', () => expect(sql).toContain('ADD COLUMN IF NOT EXISTS'));
});

describe('PT-11.2.3 — has_store_role_as function', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260807000002_v2_16_2_has_store_role_as.sql'), 'utf-8');
  it('acepta p_user_id explicit', () => expect(sql).toContain('p_user_id uuid'));
  it('acepta p_store_id', () => expect(sql).toContain('p_store_id uuid'));
  it('acepta p_roles text[]', () => expect(sql).toContain('p_roles text[]'));
  it('admin global bypasses', () => expect(sql).toContain("role IN ('admin', 'superadmin')"));
  it('check membership', () => expect(sql).toContain('user_store_memberships'));
  it('SECURITY DEFINER', () => expect(sql).toContain('SECURITY DEFINER'));
});

describe('PT-11.2.4 — create_sale_v2 RPC (C-1, C-2, C-3, C-6, H-9, H-19)', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260807000003_v2_16_3_create_sale_v2.sql'), 'utf-8');

  // C-1: SELECT FOR UPDATE
  it('pg_advisory_xact_lock por store', () => expect(sql).toContain('pg_advisory_xact_lock(hashtext(p_store_id'));
  it('SELECT FOR UPDATE en inventory', () => expect(sql).toContain('FOR UPDATE'));
  it('pre-valida stock (ERR_INSUFFICIENT_STOCK)', () => expect(sql).toContain('ERR_INSUFFICIENT_STOCK'));

  // C-2: recálculo server-side
  it('recalcula subtotal', () => expect(sql).toContain('v_calculated_subtotal'));
  it('recalcula discount', () => expect(sql).toContain('v_discount_amount'));
  it('recalcula tax', () => expect(sql).toContain('v_calculated_tax'));
  it('recalcula total', () => expect(sql).toContain('v_calculated_total'));
  it('valida total mismatch', () => expect(sql).toContain('ERR_TOTAL_MISMATCH'));

  // C-3: supervisor auth
  it('valida descuento >= 15%', () => expect(sql).toContain('v_effective_discount_pct >= 15'));
  it('ERR_SUPERVISOR_REQUIRED', () => expect(sql).toContain('ERR_SUPERVISOR_REQUIRED'));
  it('ERR_SUPERVISOR_UNAUTHORIZED', () => expect(sql).toContain('ERR_SUPERVISOR_UNAUTHORIZED'));
  it('usa has_store_role_as', () => expect(sql).toContain('has_store_role_as'));

  // C-6: 22 columnas en transaction_items
  it('INSERT transaction_items con cash_paid', () => expect(sql).toContain("v_item->>'cash_paid'"));
  it('INSERT transaction_items con zelle_paid', () => expect(sql).toContain("v_item->>'zelle_paid'"));
  it('INSERT transaction_items con currency', () => expect(sql).toContain("v_item->>'currency'"));
  it('INSERT transaction_items con cash_discount_type', () => expect(sql).toContain("v_item->>'cash_discount_type'"));
  it('INSERT transaction_items con zelle_discount_value', () => expect(sql).toContain("v_item->>'zelle_discount_value'"));

  // H-9: customer_id atómico
  it('acepta p_customer_id', () => expect(sql).toContain('p_customer_id uuid'));
  it('acepta p_customer_name', () => expect(sql).toContain('p_customer_name text'));
  it('INSERT transactions con customer_id', () => expect(sql).toContain('customer_id, customer_name'));

  // H-19: payment validation
  it('valida payment split', () => expect(sql).toContain('ERR_PAYMENT_MISMATCH'));

  // Audit log
  it('audit_logs con CREATE_SALE_V2', () => expect(sql).toContain("'CREATE_SALE_V2'"));
  it('audit_logs con v2_checkout=true', () => expect(sql).toContain("'v2_checkout', true"));
  it('audit_logs con supervisor_id', () => expect(sql).toContain("'supervisor_id'"));

  // No modifica create_sale viejo
  it('NO hace DROP de create_sale', () => expect(sql).not.toContain('DROP FUNCTION IF EXISTS public.create_sale('));

  // SECURIY DEFINER
  it('SECURITY DEFINER', () => expect(sql).toContain('SECURITY DEFINER'));
  it('search_path set', () => expect(sql).toContain('SET search_path TO public, pg_temp'));
});

describe('PT-11.2.5 — API /api/pos/checkout', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'pos', 'checkout', 'route.ts'), 'utf-8');
  it('export POST', () => expect(src).toContain('export const POST'));
  it('withAuth', () => expect(src).toContain('withAuth'));
  it('rateLimit 30/min', () => expect(src).toContain('maxRequests: 30'));
  it('CSRF', () => expect(src).toContain('validateOrigin'));
  it('Zod validation', () => expect(src).toContain('checkoutSchema'));
  it('invoca create_sale_v2', () => expect(src).toContain("rpc('create_sale_v2'"));
  it('mapea items a JSONB', () => expect(src).toContain('itemsJsonb'));
  it('ERR_TOTAL_MISMATCH → 422', () => expect(src).toContain('ERR_TOTAL_MISMATCH'));
  it('ERR_SUPERVISOR_REQUIRED → 403', () => expect(src).toContain('ERR_SUPERVISOR_REQUIRED'));
  it('ERR_PAYMENT_MISMATCH → 422', () => expect(src).toContain('ERR_PAYMENT_MISMATCH'));
  it('ERR_INSUFFICIENT_STOCK → 409', () => expect(src).toContain('ERR_INSUFFICIENT_STOCK'));
});

describe('PT-11.2.6 — API /api/auth/supervisor-check', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'auth', 'supervisor-check', 'route.ts'), 'utf-8');
  it('export POST', () => expect(src).toContain('export const POST'));
  it('withAuth', () => expect(src).toContain('withAuth'));
  it('rateLimit 5/min (brute-force protection)', () => expect(src).toContain('maxRequests: 5'));
  it('CSRF', () => expect(src).toContain('validateOrigin'));
  it('signInWithPassword server-side', () => expect(src).toContain('signInWithPassword'));
  it('verifica membership', () => expect(src).toContain('user_store_memberships'));
  it('retorna supervisor_user_id', () => expect(src).toContain('supervisor_user_id'));
  it('signOut after check', () => expect(src).toContain('signOut'));
});

describe('PT-11.2.7 — Feature flag + pilot stores', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'config', 'features.ts'), 'utf-8');
  it('USE_V2_CHECKOUT default false', () => {
    expect(src).toContain("=== 'true' || false");
  });
  it('V2_CHECKOUT_PILOT_STORES', () => {
    expect(src).toContain('V2_CHECKOUT_PILOT_STORES');
    expect(src).toContain('NEXT_PUBLIC_V2_CHECKOUT_PILOT_STORES');
  });
  it('shouldUseV2Checkout helper', () => {
    expect(src).toContain('export function shouldUseV2Checkout');
  });
  it('pilot stores empty → all stores', () => {
    expect(src).toContain('length === 0) return true');
  });
});

describe('PT-11.2.8 — usePOSCheckout feature flag integration', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'components', 'views', 'terminal', 'views', 'pos', 'usePOSCheckout.ts'), 'utf-8');
  it('importa shouldUseV2Checkout', () => expect(src).toContain('shouldUseV2Checkout'));
  it('usa fetch /api/pos/checkout cuando v2', () => {
    expect(src).toContain("fetch('/api/pos/checkout'");
    expect(src).toContain("shouldUseV2Checkout(user.activeStoreId)");
  });
  it('NO hace UPDATE post-RPC cuando v2', () => {
    expect(src).toContain('!useV2 && (safeCustomerId');
  });
  it('mantiene path viejo (createSale) cuando !v2', () => {
    expect(src).toContain('await createSale({');
  });
});

describe('PT-11.2.9 — SupervisorAuthModal server-side', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'components', 'views', 'terminal', 'views', 'pos', 'SupervisorAuthModal.tsx'), 'utf-8');
  it('llama /api/auth/supervisor-check', () => {
    expect(src).toContain("fetch('/api/auth/supervisor-check'");
  });
  it('NO usa signInWithPassword en cliente', () => {
    // El signInWithPassword solo debe aparecer en el endpoint server-side, no en el modal
    expect(src).not.toContain('supabase.auth.signInWithPassword');
  });
  it('pasa supervisor_user_id al caller', () => {
    expect(src).toContain('onAuthorize(data.supervisor_user_id)');
  });
});

describe('PT-11.2.10 — Regresión: iteraciones anteriores intactas', () => {
  it('create_sale viejo NO fue dropeado (permanece como fallback)', () => {
    // create_sale debe seguir teniendo su migración original de 11.1
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.includes('create_sale_validate_op_date'));
    expect(files.length).toBeGreaterThan(0);
  });
  it('USE_V2_CHECKOUT default false en código (activado via .env)', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'config', 'features.ts'), 'utf-8');
    expect(src).toContain("=== 'true' || false");
  });
  it('tests de 11.1, 12, 13 siguen presentes', () => {
    const testFiles = readdirSync(join(process.cwd(), 'src', '__tests__', 'integration'));
    expect(testFiles).toContain('iteration-11-1.test.ts');
    expect(testFiles).toContain('iteration-12.test.ts');
    expect(testFiles).toContain('iteration-13.test.ts');
  });
});

describe('PT-11.2.11 — Sync batch migrado a create_sale_v2 (TD-11.2.1 resolved)', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'sync', 'batch', 'route.ts'), 'utf-8');
  it('usa create_sale_v2 (no create_sale viejo)', () => {
    expect(src).toContain("rpc('create_sale_v2'");
    // No debe contener la llamada directa al RPC viejo para sales
    const saleSection = src.substring(src.indexOf("case 'sale'"), src.indexOf("case 'reception'"));
    expect(saleSection).not.toContain("rpc('create_sale'");
  });
  it('mapea payload a formato v2', () => {
    expect(src).toContain('v2Payload');
    expect(src).toContain('p_supervisor_user_id');
    expect(src).toContain('p_customer_id');
  });
  it('usa idempotencyKey del operation', () => {
    expect(src).toContain('p_idempotency_key: op.idempotencyKey');
  });
  it('pasa p_user_id del session', () => {
    expect(src).toContain('p_user_id: session.user.id');
  });
});
