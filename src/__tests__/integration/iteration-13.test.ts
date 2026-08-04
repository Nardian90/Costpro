/**
 * Iteración 13 — Pruebas PT-13.x (Soft Multi-Tenant)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

describe('PT-13.1 — Migrations de Iteración 13 (10 total)', () => {
  const expected = [
    '20260806000001_v2_15_1_tenants_enriched.sql',
    '20260806000002_v2_15_2_user_role_tenant_admin.sql',
    '20260806000003_v2_15_3_migrate_existing_to_default_tenant.sql',
    '20260806000004_v2_15_4_on_auth_user_created_tenant.sql',
    '20260806000005_v2_15_5_create_store_with_tenant.sql',
    '20260806000006_v2_15_6_managed_update_tenant_plan.sql',
    '20260806000007_v2_15_7_check_tenant_store_quota.sql',
    '20260806000008_v2_15_8_tenant_reports.sql',
    '20260806000009_v2_15_9_validate_tenant_access.sql',
    '20260806000010_v2_15_10_tenant_branding_defaults.sql',
  ];
  for (const f of expected) {
    it(`${f} existe`, () => {
      expect(readdirSync(MIGRATIONS_DIR)).toContain(f);
    });
  }
});

describe('PT-13.2 — tenants table enriquecida', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260806000001_v2_15_1_tenants_enriched.sql'), 'utf-8');
  it('tiene owner_id', () => expect(sql).toContain('owner_id'));
  it('tiene plan plan_t', () => expect(sql).toContain('plan plan_t'));
  it('tiene subscription_status con CHECK', () => expect(sql).toContain("CHECK (subscription_status IN ('trial'"));
  it('tiene stripe_customer_id UNIQUE', () => expect(sql).toContain('tenants_stripe_customer_id_idx'));
  it('tiene custom_domain UNIQUE', () => expect(sql).toContain('tenants_custom_domain_idx'));
  it('tiene branding jsonb', () => expect(sql).toContain('branding JSONB'));
  it('tiene trial_ends_at', () => expect(sql).toContain('trial_ends_at'));
  it('RLS permite tenant owner ver su tenant', () => expect(sql).toContain('owner_id = auth.uid()'));
});

describe('PT-13.3 — tenant_admin en enum', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260806000002_v2_15_2_user_role_tenant_admin.sql'), 'utf-8');
  it('ALTER TYPE ADD VALUE tenant_admin', () => expect(sql).toContain("ADD VALUE IF NOT EXISTS 'tenant_admin'"));
});

describe('PT-13.4 — on_auth_user_created modificado', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260806000004_v2_15_4_on_auth_user_created_tenant.sql'), 'utf-8');
  it('lee company_name de metadata', () => expect(sql).toContain("raw_user_meta_data->>'company_name'"));
  it('INSERT tenants con owner_id=NEW.id', () => expect(sql).toContain('NEW.id'));
  it('plan default free', () => expect(sql).toContain("'free'::plan_t"));
  it('subscription_status trial', () => expect(sql).toContain("'trial'"));
  it('trial_ends_at 14 days', () => expect(sql).toContain("interval '14 days'"));
  it('role default tenant_admin', () => expect(sql).toContain("'tenant_admin'::USER_ROLE"));
});

describe('PT-13.5 — create_store_with_membership con tenant_id', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260806000005_v2_15_5_create_store_with_tenant.sql'), 'utf-8');
  it('acepta p_tenant_id', () => expect(sql).toContain('p_tenant_id uuid'));
  it('resuelve tenant del caller si NULL', () => expect(sql).toContain('COALESCE(p_tenant_id'));
  it('cuenta stores por tenant', () => expect(sql).toContain('WHERE tenant_id = v_tenant'));
  it('INSERTa store con tenant_id', () => expect(sql).toContain('v_tenant)'));
  it('raise ERR_STORE_LIMIT_REACHED', () => expect(sql).toContain('ERR_STORE_LIMIT_REACHED'));
});

describe('PT-13.6 — managed_update_tenant_plan', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260806000006_v2_15_6_managed_update_tenant_plan.sql'), 'utf-8');
  it('actualiza tenants.plan', () => expect(sql).toContain('UPDATE public.tenants SET'));
  it('sync profiles.plan', () => expect(sql).toContain('UPDATE public.profiles SET'));
  it('WHERE tenant_id', () => expect(sql).toContain('WHERE tenant_id = p_tenant_id'));
  it('audit log TENANT_PLAN_UPDATED', () => expect(sql).toContain("'TENANT_PLAN_UPDATED'"));
});

describe('PT-13.7 — check_tenant_store_quota per-tenant', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260806000007_v2_15_7_check_tenant_store_quota.sql'), 'utf-8');
  it('cuenta WHERE tenant_id', () => expect(sql).toContain('WHERE tenant_id = p_tenant_id AND is_active'));
  it('limits: free=1, pro=3, enterprise=10', () => {
    expect(sql).toContain("WHEN 'free'::plan_t THEN 1");
    expect(sql).toContain("WHEN 'pro'::plan_t THEN 3");
    expect(sql).toContain("WHEN 'enterprise'::plan_t THEN 10");
  });
});

describe('PT-13.8 — tenant consolidated reports', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260806000008_v2_15_8_tenant_reports.sql'), 'utf-8');
  it('get_tenant_cash_report existe', () => expect(sql).toContain('get_tenant_cash_report'));
  it('get_tenant_sales_summary existe', () => expect(sql).toContain('get_tenant_sales_summary'));
  it('valida owner_id o admin', () => expect(sql).toContain('owner_id = auth.uid()'));
  it('agrega across stores', () => expect(sql).toContain('store_id IN (SELECT id FROM public.stores WHERE tenant_id'));
});

describe('PT-13.9 — validate_tenant_access', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260806000009_v2_15_9_validate_tenant_access.sql'), 'utf-8');
  it('global admin bypasses', () => expect(sql).toContain("v_user_role IN ('admin', 'superadmin')"));
  it('retorna true para legacy (tenant_id NULL)', () => expect(sql).toContain('Legacy store without tenant'));
  it('compara user_tenant = store_tenant', () => expect(sql).toContain('v_user_tenant = v_store_tenant'));
});

describe('PT-13.10 — API routes existen', () => {
  it('POST /api/billing/checkout existe', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'billing', 'checkout', 'route.ts'), 'utf-8');
    expect(src).toContain('export const POST');
    expect(src).toContain('createCheckoutSession');
  });
  it('POST /api/billing/webhook existe', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'billing', 'webhook', 'route.ts'), 'utf-8');
    expect(src).toContain('verifyWebhookSignature');
    expect(src).toContain('stripe_event_id');
  });
  it('POST /api/billing/portal existe', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'billing', 'portal', 'route.ts'), 'utf-8');
    expect(src).toContain('createCustomerPortalSession');
  });
  it('GET+PATCH /api/tenants/[id] existe', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'tenants', '[id]', 'route.ts'), 'utf-8');
    expect(src).toContain('export const GET');
    expect(src).toContain('export const PATCH');
  });
  it('GET /api/tenants/[id]/reports/cash existe', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'tenants', '[id]', 'reports', 'cash', 'route.ts'), 'utf-8');
    expect(src).toContain('get_tenant_cash_report');
  });
  it('GET /api/tenants/[id]/reports/sales existe', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'tenants', '[id]', 'reports', 'sales', 'route.ts'), 'utf-8');
    expect(src).toContain('get_tenant_sales_summary');
  });
});

describe('PT-13.11 — Frontend cambios', () => {
  it('RegisterForm tiene company_name field', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'components', 'auth', 'RegisterForm.tsx'), 'utf-8');
    expect(src).toContain('companyName');
    expect(src).toContain('company_name');
    expect(src).toContain('Building2');
  });
  it('RegisterForm NO hardcodea role: costo', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'components', 'auth', 'RegisterForm.tsx'), 'utf-8');
    expect(src).not.toContain("role: 'costo'");
  });
  it('TenantConfigView existe', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'components', 'views', 'terminal', 'views', 'tenant', 'TenantConfigView.tsx'), 'utf-8');
    expect(src).toContain('TenantConfigView');
    expect(src).toContain('upgradeMutation');
    expect(src).toContain('saveMutation');
  });
  it('stripe.ts lib existe con checkout + webhook', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'lib', 'billing', 'stripe.ts'), 'utf-8');
    expect(src).toContain('createCheckoutSession');
    expect(src).toContain('verifyWebhookSignature');
    expect(src).toContain('createCustomerPortalSession');
  });
});

describe('PT-13.12 — Cada migration tiene DOWN', () => {
  const files = readdirSync(MIGRATIONS_DIR).filter(f => f.startsWith('20260806') && f.endsWith('.sql'));
  for (const f of files) {
    it(`${f} tiene DOWN`, () => {
      expect(readFileSync(join(MIGRATIONS_DIR, f), 'utf-8')).toContain('DOWN');
    });
  }
});

describe('PT-13.13 — Feature flag USE_V2_CHECKOUT sigue false', () => {
  it('features.ts no se modificó', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'config', 'features.ts'), 'utf-8');
    expect(src).toContain("=== 'true' || false");
  });
});

describe('PT-13.14 — Migración default tenant', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260806000003_v2_15_3_migrate_existing_to_default_tenant.sql'), 'utf-8');
  it('crea Default Tenant', () => expect(sql).toContain("'Default Tenant'"));
  it('asigna owner = primer admin', () => expect(sql).toContain("WHERE role = 'admin'"));
  it('UPDATE profiles SET tenant_id', () => expect(sql).toContain('UPDATE public.profiles SET tenant_id'));
  it('UPDATE stores SET tenant_id', () => expect(sql).toContain('UPDATE public.stores SET tenant_id'));
  it('plan enterprise para default', () => expect(sql).toContain("'enterprise'::plan_t"));
});

describe('PT-13.15 — Webhook idempotency', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'billing', 'webhook', 'route.ts'), 'utf-8');
  it('verifica firma', () => expect(src).toContain('verifyWebhookSignature'));
  it('check idempotency via stripe_event_id', () => expect(src).toContain('stripe_event_id'));
  it('handles checkout.session.completed', () => expect(src).toContain('checkout.session.completed'));
  it('handles customer.subscription.deleted', () => expect(src).toContain('customer.subscription.deleted'));
  it('handles invoice.paid', () => expect(src).toContain('invoice.paid'));
});
