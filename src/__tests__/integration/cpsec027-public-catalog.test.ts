/**
 * CP-SEC-027 — Invariantes del catálogo público sin exposición de costos.
 *
 * Tres capas de invariantes, derivadas de la verificación VIVA del
 * 2026-10-19 (docs/audits/evidence/20261019-cp-sec-027-publico/INFORME.md):
 *
 *   A. Invariantes de MIGRACIÓN: la superficie pública debe ser exclusivamente
 *      las vistas (public_catalog_v / public_storefronts_v /
 *      public_variants_v) con columnas de presentación; el rol anon NO debe
 *      tener policies ni SELECT sobre las tablas products/stores/
 *      product_variants.
 *   B. Invariantes de CÓDIGO: los consumidores públicos (vitrina SSR y
 *      storefront API) consultan las vistas, no las tablas; sus selects no
 *      contienen columnas sensibles; los publish flows (service-role) quedan
 *      intactos.
 *   C. Invariantes de EVIDENCIA (raw JSON commiteado): la exposición previa
 *      (103/103 productos públicos con costo real legibles por anon) queda
 *      congelada como línea base. Si la policy anon reaparece, la evidencia
 *      debe regenerarse y estos tests documentan el estado pre-fix.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const VITRINA_PAGE = join(process.cwd(), 'src', 'app', 'tienda', '[slug]', 'page.tsx');
const STOREFRONT_API = join(process.cwd(), 'src', 'app', 'api', 'storefront', '[slug]', 'route.ts');
const WHATSAPP_PUBLISH = join(process.cwd(), 'src', 'lib', 'whatsapp', 'publish.ts');
const TELEGRAM_PUBLISH = join(process.cwd(), 'src', 'lib', 'telegram', 'publish.ts');
const EVIDENCE_DIR = join(
  process.cwd(),
  'docs',
  'audits',
  'evidence',
  '20261019-cp-sec-027-publico',
  'raw'
);

const MIGRATION = '20261019000001_cp_sec_027_catalogo_publico.sql';

const read = (p: string): string => {
  if (!existsSync(p)) throw new Error(`Archivo faltante: ${p}`);
  return readFileSync(p, 'utf-8');
};

const migration = read(join(MIGRATIONS_DIR, MIGRATION));
const vitrina = read(VITRINA_PAGE);
const storefrontApi = read(STOREFRONT_API);
const whatsappPublish = read(WHATSAPP_PUBLISH);
const telegramPublish = read(TELEGRAM_PUBLISH);

/** Quita comentarios -- de SQL (para aserciones sobre código ejecutable). */
function stripSqlComments(sql: string): string {
  return sql.replace(/^\s*--.*$/gm, '');
}

/** Quita comentarios de línea y de bloque de TypeScript (aserciones sobre código). */
function stripTsComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Parte EJECUTABLE de la migración (sin el procedimiento de reversión documentado). */
const migrationExecutable = stripSqlComments(
  migration.split('PROCEDIMIENTO DE REVERSIÓN')[0]
);
const vitrinaCode = stripTsComments(vitrina);
const storefrontApiCode = stripTsComments(storefrontApi);

/** Extrae la lista de columnas del SELECT de una vista CREATE VIEW. */
function viewColumns(sql: string, viewName: string): string[] {
  const re = new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+VIEW\\s+public\\.${viewName}\\b[\\s\\S]*?AS\\s+SELECT\\s+([\\s\\S]*?)\\s+FROM\\s`,
    'i'
  );
  const m = re.exec(sql);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((c) => c.trim().replace(/^p\.|^s\.|^v\./, '').replace(/\s+as\s+\w+/i, ''))
    .map((c) => c.replace(/--.*$/, '').trim())
    .filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Invariantes de migración — la vista es la frontera pública
// ─────────────────────────────────────────────────────────────────────────────

describe('CP-SEC-027.A — Migración: vistas públicas como única superficie', () => {
  it('A.1: la migración existe y crea public_catalog_v', () => {
    expect(migration).toContain('CREATE OR REPLACE VIEW public.public_catalog_v');
  });

  it('A.2: public_catalog_v EXCLUYE todas las columnas de costo y sensibles', () => {
    const cols = viewColumns(migration, 'public_catalog_v');
    expect(cols.length).toBeGreaterThan(0);
    const forbidden = [
      'cost_average',
      'cost_price',
      'precio_empresa',
      'precio_empresa_currency',
      'supplier',
      'min_stock',
      'tenant_id',
      'cost_sheet_id',
      'status',
      'is_complete',
      'has_movements',
      'fc_auto_enabled',
      'barcode',
      'barcode_type',
      'category_id',
      'search_vector',
      'created_at',
      'updated_at',
    ];
    for (const f of forbidden) {
      expect(cols).not.toContain(f);
    }
  });

  it('A.3: public_catalog_v INCLUYE las columnas de presentación que consumen los flujos públicos', () => {
    const cols = viewColumns(migration, 'public_catalog_v');
    for (const required of [
      'id',
      'store_id',
      'name',
      'description',
      'sku',
      'price',
      'price_currency',
      'price_visible',
      'stock_visible',
      'stock_current',
      'on_promotion',
      'unit_of_measure',
      'image_url',
      'public_image_url',
      'category',
      'is_active',
      'visible_en_tienda',
    ]) {
      expect(cols).toContain(required);
    }
  });

  it('A.4: public_catalog_v filtra por is_active AND visible_en_tienda (paridad con la policy retirada)', () => {
    expect(migration).toContain('WHERE p.is_active = true AND p.visible_en_tienda = true');
  });

  it('A.5: public_storefronts_v EXCLUYE tenant_id, bank_account, nit, signature_url, stamp_url', () => {
    const cols = viewColumns(migration, 'public_storefronts_v');
    expect(cols.length).toBeGreaterThan(0);
    for (const forbidden of [
      'tenant_id',
      'bank_account',
      'nit',
      'signature_url',
      'stamp_url',
      'created_by',
      'is_archived',
      'archived_at',
      'archived_by',
      'backup_restore_protected',
      'latitude',
      'longitude',
    ]) {
      expect(cols).not.toContain(forbidden);
    }
  });

  it('A.6: public_storefronts_v INCLUYE las columnas de vitrina que usa la SSR', () => {
    const cols = viewColumns(migration, 'public_storefronts_v');
    for (const required of [
      'id',
      'name',
      'address',
      'phone',
      'email',
      'logo_url',
      'slug',
      'plantilla',
      'reeup',
      'is_active',
      'banner_url',
      'store_tagline',
      'whatsapp_group_url',
      'telegram_url',
      'services',
      'promo_images',
      'opening_hours',
      'banner_cta_text',
      'banner_cta_link',
    ]) {
      expect(cols).toContain(required);
    }
  });

  it('A.7: public_variants_v EXCLUYE precio_empresa (sensible según FIX-SEC-H6)', () => {
    const cols = viewColumns(migration, 'public_variants_v');
    expect(cols.length).toBeGreaterThan(0);
    expect(cols).not.toContain('precio_empresa');
    for (const required of ['id', 'product_id', 'name', 'sku', 'price', 'conversion_factor']) {
      expect(cols).toContain(required);
    }
  });

  it('A.8: las vistas se crean con security_barrier (defensa en profundidad)', () => {
    const count = (migration.match(/security_barrier\s*=\s*true/g) || []).length;
    expect(count).toBe(3);
  });

  it('A.9: la migración retira las policies anon de las tablas', () => {
    expect(migrationExecutable).toContain('DROP POLICY IF EXISTS "products_public_read_anon" ON public.products');
    expect(migrationExecutable).toContain('DROP POLICY IF EXISTS "stores_select_anon" ON public.stores');
  });

  it('A.10: la migración revoca SELECT de las tablas al rol anon', () => {
    expect(migrationExecutable).toContain('REVOKE SELECT ON public.products FROM anon');
    expect(migrationExecutable).toContain('REVOKE SELECT ON public.stores FROM anon');
    expect(migrationExecutable).toContain('REVOKE SELECT ON public.product_variants FROM anon');
  });

  it('A.11: la migración concede SELECT de las vistas SOLO a anon (no a authenticated ni service_role)', () => {
    expect(migrationExecutable).toContain('GRANT SELECT ON public.public_catalog_v TO anon');
    expect(migrationExecutable).toContain('GRANT SELECT ON public.public_storefronts_v TO anon');
    expect(migrationExecutable).toContain('GRANT SELECT ON public.public_variants_v TO anon');
    expect(migrationExecutable).not.toMatch(/GRANT\s+SELECT[^;]*\bTO\b[^;]*\bauthenticated\b/i);
    expect(migrationExecutable).not.toMatch(/GRANT\s+SELECT[^;]*\bTO\b[^;]*\bservice_role\b/i);
  });

  it('A.12: la policy de variantes recreada NO incluye anon y conserva el predicado para authenticated', () => {
    expect(migrationExecutable).toContain('FOR SELECT TO authenticated');
    expect(migrationExecutable).not.toMatch(/TO\s+anon\s*,\s*authenticated/);
    // mismo predicado que la policy out-of-band original (paridad authenticated)
    expect(migrationExecutable).toContain('products.visible_en_tienda = true');
  });

  it('A.13: la migración documenta el procedimiento de reversión completo', () => {
    expect(migration).toContain('PROCEDIMIENTO DE REVERSIÓN');
    const reversal = migration.split('PROCEDIMIENTO DE REVERSIÓN')[1] || '';
    expect(reversal).toContain('GRANT SELECT ON public.products TO anon');
    expect(reversal).toContain('CREATE POLICY "products_public_read_anon"');
    expect(reversal).toContain('CREATE POLICY "stores_select_anon"');
  });

  it('A.14: la migración NO define funciones (no toca el contrato de superficie Layer A/C)', () => {
    expect(migration).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i);
    expect(migration).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION/i);
    expect(migration).not.toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Invariantes de código — consumidores públicos sobre las vistas
// ─────────────────────────────────────────────────────────────────────────────

describe('CP-SEC-027.B — Código: consumidores públicos usan las vistas', () => {
  it('B.1: la vitrina SSR no consulta las tablas products/stores/product_variants/inventory', () => {
    expect(vitrina).not.toMatch(/\.from\(['"]products['"]\)/);
    expect(vitrina).not.toMatch(/\.from\(['"]stores['"]\)/);
    expect(vitrina).not.toMatch(/\.from\(['"]product_variants['"]\)/);
    expect(vitrina).not.toMatch(/\.from\(['"]inventory['"]\)/);
  });

  it('B.2: la vitrina SSR consulta las tres vistas públicas', () => {
    expect(vitrina).toContain(".from('public_storefronts_v')");
    expect(vitrina).toContain(".from('public_catalog_v')");
    expect(vitrina).toContain(".from('public_variants_v')");
  });

  it('B.3: la vitrina SSR no selecciona columnas de costo en ningún select (código, sin comentarios)', () => {
    expect(vitrinaCode).not.toMatch(/cost_average/);
    expect(vitrinaCode).not.toMatch(/cost_price/);
    expect(vitrinaCode).not.toMatch(/min_stock/);
    expect(vitrinaCode).not.toMatch(/precio_empresa/);
  });

  it('B.4: la storefront API no consulta las tablas products/stores', () => {
    expect(storefrontApi).not.toMatch(/\.from\(['"]products['"]\)/);
    expect(storefrontApi).not.toMatch(/\.from\(['"]stores['"]\)/);
    expect(storefrontApi).not.toMatch(/\.from\(['"]product_variants['"]\)/);
  });

  it('B.5: la storefront API consulta las tres vistas públicas', () => {
    expect(storefrontApi).toContain(".from('public_storefronts_v')");
    expect(storefrontApi).toContain(".from('public_catalog_v')");
    expect(storefrontApi).toContain(".from('public_variants_v')");
  });

  it('B.6: la storefront API no selecciona columnas de costo (código, sin comentarios)', () => {
    expect(storefrontApiCode).not.toMatch(/cost_average/);
    expect(storefrontApiCode).not.toMatch(/cost_price/);
    expect(storefrontApiCode).not.toMatch(/precio_empresa/);
  });

  it('B.7: los publish flows (service-role) quedan intactos — usan cliente service-role', () => {
    expect(whatsappPublish).toContain('SERVICE_ROLE_KEY');
    expect(telegramPublish).toContain('SERVICE_ROLE_KEY');
  });

  it('B.8: la vitrina conserva la ruta RPC service-role (get_paginated_products) como camino principal', () => {
    expect(vitrina).toContain("getSupabaseAdminSafe");
    expect(vitrina).toContain("get_paginated_products");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Invariantes de evidencia — línea base congelada del estado pre-fix
// ─────────────────────────────────────────────────────────────────────────────

describe('CP-SEC-027.C — Evidencia viva congelada (estado pre-fix, 2026-10-19)', () => {
  it('C.1: la exposición pre-fix estaba activa: 103 productos públicos con costo real', () => {
    const raw = JSON.parse(read(join(EVIDENCE_DIR, '08_exposicion_actual.json')));
    // Management API devuelve filas con claves minúsculas o según alias
    const row = Array.isArray(raw) ? raw[0] : (raw as Record<string, unknown>);
    const total = Number(row?.total ?? (row as Record<string, number>)?.count ?? 0);
    const conCosto = Number(row?.con_costo_real ?? 0);
    expect(total).toBe(103);
    expect(conCosto).toBe(103);
  });

  it('C.2: las policies anon vivas estaban documentadas antes del fix', () => {
    const policies = JSON.parse(read(join(EVIDENCE_DIR, '03_politicas_vivas.json')));
    const names = (policies as Array<{ policyname: string }>).map((p) => p.policyname);
    expect(names).toContain('products_public_read_anon');
    expect(names).toContain('stores_select_anon');
    expect(names).toContain('Variantes públicas - lectura');
  });

  it('C.3: RLS estaba (y debe seguir) habilitado en las 4 tablas de la superficie pública', () => {
    const rls = JSON.parse(read(join(EVIDENCE_DIR, '02_rls_status.json')));
    for (const t of ['products', 'stores', 'product_variants', 'inventory']) {
      const row = (rls as Array<{ table_name: string; rls_enabled: boolean }>).find(
        (r) => r.table_name === t
      );
      expect(row?.rls_enabled).toBe(true);
    }
  });

  it('C.4: el rol anon tenía SELECT de tabla (lo que la migración revoca)', () => {
    const grants = JSON.parse(read(join(EVIDENCE_DIR, '04_grants_tabla.json')));
    const anonSelect = (grants as Array<{ grantee: string; table_name: string; privilege_type: string }>)
      .filter((g) => g.grantee === 'anon' && g.privilege_type === 'SELECT')
      .map((g) => g.table_name);
    for (const t of ['products', 'stores', 'product_variants', 'inventory']) {
      expect(anonSelect).toContain(t);
    }
  });
});
