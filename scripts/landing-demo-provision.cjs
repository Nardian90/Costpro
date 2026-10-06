#!/usr/bin/env node
/**
 * landing-demo-provision.cjs — Estado demo CONTROLADO para las capturas del
 * landing (LANDING VISUAL EVIDENCE — FASE 2/16).
 * ============================================================================
 * Crea datos FICTICIOS (sin PII, sin negocios reales):
 *   1 usuario demo (admin) + tenant "Grupo Demo CostPro"
 *   3 tiendas ficticias vía API REAL (POST /api/stores):
 *     Sucursal Habana · Sucursal Vedado · Sucursal Playa
 *   ~18 productos ficticios (canasta básica genérica, CUP)
 *   ventas ficticias vía /api/pos/checkout (V2) — idempotentes por key,
 *   incluyendo historial de 14 días para la ventana de referencia del KPI.
 *
 * Patrón: e2e/fixtures/run-env.ts (tenant aislado + API real + cleanup).
 * Contexto: .e2e-run-contexts/landing-demo-context.json (gitignored).
 * Cleanup: node scripts/landing-demo-cleanup.cjs
 *
 * Requisitos: servidor en localhost:3000 (pm2) + .env con credenciales.
 * Uso:
 *   node scripts/landing-demo-provision.cjs          # provisiona (idempotente)
 *   node scripts/landing-demo-provision.cjs --history # sólo re-crear ventas históricas
 */
const fs = require('fs');
const path = require('path');

// ── env (repo-relative) ──
const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OUT = path.join(__dirname, '..', '.e2e-run-contexts', 'landing-demo-context.json');

const DEMO_EMAIL = 'landing.demo@costpro-e2e.com';
const DEMO_PASS = 'DemoLanding2026!';
const COMPANY = 'Grupo Demo CostPro';

// ── Datos ficticios (sin marcas, sin PII) ──
const STORES = [
  { name: 'Sucursal Habana', slug: 'demo-habana', address: 'Calle 23 esq. L, Vedado, La Habana', phone: '+5350000001' },
  { name: 'Sucursal Vedado', slug: 'demo-vedado', address: 'Calle 19 esq. 42, Vedado, La Habana', phone: '+5350000002' },
  { name: 'Sucursal Playa', slug: 'demo-playa', address: 'Av. 41 esq. 24, Playa, La Habana', phone: '+5350000003' },
];

const PRODUCTS = {
  central: [
    { name: 'Arroz Grano Largo 5kg', sku: 'DEMO-ARZ-005', price: 320, cost: 240, stock: 120, min: 20, cat: 'Alimentos', desc: 'Arroz de grano largo en bolsa de 5 kg.' },
    { name: 'Aceite Girasol 1L', sku: 'DEMO-ACE-001', price: 480, cost: 360, stock: 64, min: 12, cat: 'Alimentos', desc: 'Aceite comestible de girasol, botella de 1 litro.' },
    { name: 'Frijol Negro 1kg', sku: 'DEMO-FRJ-001', price: 260, cost: 190, stock: 85, min: 15, cat: 'Alimentos', desc: 'Frijol negro de la temporada, envasado en bolsa de 1 kg.' },
    { name: 'Azúcar Blanca 1kg', sku: 'DEMO-AZU-001', price: 180, cost: 130, stock: 140, min: 25, cat: 'Alimentos', desc: 'Azúcar blanca refinada de primera calidad, 1 kg.' },
    { name: 'Leche en Polvo 400g', sku: 'DEMO-LEC-400', price: 520, cost: 400, stock: 38, min: 10, cat: 'Lácteos', desc: 'Leche en polvo entera, lata de 400 g.' },
    { name: 'Café Tostado Molido 250g', sku: 'DEMO-CAF-250', price: 350, cost: 265, stock: 55, min: 12, cat: 'Alimentos', desc: 'Café tostado y molido, paquete de 250 g.' },
    { name: 'Detergente en Polvo 900g', sku: 'DEMO-DET-900', price: 300, cost: 225, stock: 47, min: 10, cat: 'Aseo', desc: 'Detergente en polvo para ropa, presentación de 900 g.' },
    { name: 'Jabón de Bañar 90g', sku: 'DEMO-JAB-090', price: 85, cost: 60, stock: 200, min: 40, cat: 'Aseo', desc: 'Jabón de bañar neutro de 90 g.' },
    { name: 'Pasta Dental 100ml', sku: 'DEMO-PST-100', price: 210, cost: 155, stock: 66, min: 15, cat: 'Aseo', desc: 'Pasta dental de 100 ml.' },
    { name: 'Sal Refinada 500g', sku: 'DEMO-SAL-500', price: 60, cost: 42, stock: 180, min: 30, cat: 'Alimentos', desc: 'Sal refinada yodatada, paquete de 500 g.' },
  ],
  vedado: [
    { name: 'Arroz Grano Largo 5kg', sku: 'DEMO-V-ARZ-005', price: 325, cost: 242, stock: 70, min: 15, cat: 'Alimentos', desc: 'Arroz de grano largo en bolsa de 5 kg.' },
    { name: 'Aceite Girasol 1L', sku: 'DEMO-V-ACE-001', price: 485, cost: 362, stock: 28, min: 8, cat: 'Alimentos', desc: 'Aceite comestible de girasol, botella de 1 litro.' },
    { name: 'Pasta Dental 100ml', sku: 'DEMO-V-PST-100', price: 215, cost: 158, stock: 31, min: 8, cat: 'Aseo', desc: 'Pasta dental de 100 ml.' },
    { name: 'Jabón de Bañar 90g', sku: 'DEMO-V-JAB-090', price: 88, cost: 62, stock: 95, min: 20, cat: 'Aseo', desc: 'Jabón de bañar neutro de 90 g.' },
    { name: 'Azúcar Blanca 1kg', sku: 'DEMO-V-AZU-001', price: 185, cost: 133, stock: 60, min: 12, cat: 'Alimentos', desc: 'Azúcar blanca refinada de primera calidad, 1 kg.' },
  ],
  playa: [
    { name: 'Café Tostado Molido 250g', sku: 'DEMO-P-CAF-250', price: 355, cost: 268, stock: 24, min: 6, cat: 'Alimentos', desc: 'Café tostado y molido, paquete de 250 g.' },
    { name: 'Leche en Polvo 400g', sku: 'DEMO-P-LEC-400', price: 525, cost: 402, stock: 18, min: 5, cat: 'Lácteos', desc: 'Leche en polvo entera, lata de 400 g.' },
    { name: 'Detergente en Polvo 900g', sku: 'DEMO-P-DET-900', price: 305, cost: 228, stock: 22, min: 5, cat: 'Aseo', desc: 'Detergente en polvo para ropa, presentación de 900 g.' },
  ],
};

// ── helpers ──
function svc(method, apiPath, body) {
  return fetch(`${SUPABASE_URL}/rest/v1${apiPath}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: body ? 'return=representation' : 'count=exact',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function provision() {
  // 0) health
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  if (!health || !health.ok) throw new Error(`Servidor ${BASE_URL} no responde`);
  console.log('✓ servidor vivo');

  // 1) user demo (sin company_name — FK tenants_owner_id_fkey, ver run-env)
  let userId = null;
  const selUser = await svc('GET', `/profiles?email=eq.${encodeURIComponent(DEMO_EMAIL)}&select=id`);
  if (selUser.ok) {
    const rows = await selUser.json();
    if (rows.length) {
      userId = rows[0].id;
      console.log('• usuario demo ya existe:', userId);
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: DEMO_PASS }),
      });
    }
  }
  if (!userId) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: DEMO_EMAIL, password: DEMO_PASS, email_confirm: true,
        user_metadata: { role: 'admin', full_name: 'Admin Demo' },
      }),
    });
    if (!res.ok) throw new Error(`crear user: HTTP ${res.status} ${await res.text()}`);
    userId = (await res.json()).id;
    console.log('✓ usuario demo creado:', userId);
  }

  // 2) tenant
  let tenantId = null;
  const selT = await svc('GET', `/tenants?name=eq.${encodeURIComponent(COMPANY)}&select=id,owner_id`);
  if (selT.ok) {
    const rows = await selT.json();
    if (rows.length) tenantId = rows[0].id;
  }
  if (!tenantId) {
    const ins = await svc('POST', '/tenants?select=id', [{
      name: COMPANY, owner_id: userId, plan: 'enterprise',
      subscription_status: 'trial',
      trial_ends_at: new Date(Date.now() + 14 * 864e5).toISOString(),
      is_active: true,
    }]);
    if (!ins.ok) throw new Error(`crear tenant: HTTP ${ins.status} ${await ins.text()}`);
    tenantId = (await ins.json())[0].id;
    console.log('✓ tenant demo creado:', tenantId);
  } else {
    console.log('• tenant demo ya existe:', tenantId);
  }

  // 3) patch profile: plan + tenant
  await svc('PATCH', `/profiles?id=eq.${userId}`, { plan: 'enterprise', tenant_id: tenantId, role: 'admin' });
  console.log('✓ profile: enterprise + tenant');

  // 4) sign in
  const signin = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASS }),
  });
  if (!signin.ok) throw new Error(`signin: HTTP ${signin.status} ${await signin.text()}`);
  const { access_token: token } = await signin.json();
  console.log('✓ sesión demo');

  // 5) stores vía API REAL (POST /api/stores)
  const storeIds = {};
  for (const s of STORES) {
    const sel = await svc('GET', `/stores?slug=eq.${s.slug}&select=id`);
    const rows = sel.ok ? await sel.json() : [];
    if (rows.length) {
      storeIds[s.slug] = rows[0].id;
      console.log(`• tienda ya existe: ${s.name}`);
      continue;
    }
    const res = await fetch(`${BASE_URL}/api/stores`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({
        name: s.name, address: s.address, phone: s.phone,
        email: `demo-${s.slug}@costpro-e2e.com`, slug: s.slug, plantilla: 'construccion',
      }),
    });
    if (!res.ok) throw new Error(`crear tienda ${s.name}: HTTP ${res.status} ${await res.text()}`);
    const json = await res.json();
    storeIds[s.slug] = json?.data?.store_id ?? json?.data?.id ?? json?.store_id;
    console.log(`✓ tienda creada: ${s.name} → ${storeIds[s.slug]}`);
  }
  const centralId = storeIds['demo-habana'];
  const vedadoId = storeIds['demo-vedado'];

  // 6) active store = central
  await svc('PATCH', `/profiles?id=eq.${userId}`, { active_store_id: centralId });

  // 7) productos (idempotentes por SKU)
  const productIds = {};
  async function seedProducts(storeId, list, tag) {
    for (const p of list) {
      const sel = await svc('GET', `/products?sku=eq.${encodeURIComponent(p.sku)}&store_id=eq.${storeId}&select=id`);
      const rows = sel.ok ? await sel.json() : [];
      let pid;
      if (rows.length) {
        pid = rows[0].id;
      } else {
        const ins = await svc('POST', '/products', [{
          store_id: storeId, name: p.name, description: p.desc,
          sku: p.sku, price: p.price, cost_price: p.cost, category: p.cat,
          unit_of_measure: 'unidad', supplier: 'Proveedor Demo',
          is_active: true, status: 'ACTIVE', price_currency: 'CUP',
          stock_current: p.stock, cost_average: p.cost, min_stock: p.min || 1,
          visible_en_tienda: true, price_visible: true, stock_visible: true,
          // Imágenes demo locales (public/landing/demo-products) — sólo las
          // 6 principales; el resto muestra el placeholder real del producto.
          ...(Object.prototype.hasOwnProperty.call(IMG, p.sku) ? { image_url: `${BASE_URL}/landing/demo-products/${IMG[p.sku]}` } : {}),
        }]);
        if (!ins.ok) throw new Error(`seed producto ${p.sku}: HTTP ${ins.status} ${await ins.text()}`);
        pid = (await ins.json())[0].id;
        await svc('POST', '/inventory', [{
          store_id: storeId, product_id: pid, quantity: p.stock,
          low_stock_threshold: p.min || 0, version: 1,
        }]).catch(() => {});
      }
      productIds[p.sku] = pid;
    }
    console.log(`✓ productos ${tag}: ${list.length}`);
  }
  await seedProducts(centralId, PRODUCTS.central, 'central');
  await seedProducts(vedadoId, PRODUCTS.vedado, 'vedado');
  await seedProducts(storeIds['demo-playa'], PRODUCTS.playa, 'playa');

  // 8) ventas ficticias vía /api/pos/checkout (V2) — idempotentes por key
  // FIX (2026-10-06): las keys ahora llevan el sufijo del tenant. Antes las keys
  // fijas («demo-sale-0001») quedaban ligadas a la identidad (actor/tienda) de
  // una provisión anterior y un re-provisionamiento fallaba entero con
  // ERR_IDEMPOTENCY_KEY_REUSE (409) — así lo hizo la segunda corrida tras el
  // reset del entorno. Con sufijo: estables dentro del tenant, únicas entre
  // provisionamientos. Además, el rate-limit del checkout es 30 req/min por
  // usuario → pacing para no reventar la ventana.
  const KSUF = String(tenantId).slice(0, 8);
  const S = PRODUCTS.central;
  const sales = [
    { key: `demo-${KSUF}-sale-0001`, method: 'cash', store: centralId, items: [{ sku: S[0].sku, qty: 2 }, { sku: S[1].sku, qty: 1 }, { sku: S[7].sku, qty: 3 }], customer: 'Cliente eventual' },
    { key: `demo-${KSUF}-sale-0002`, method: 'transfer', store: centralId, items: [{ sku: S[4].sku, qty: 2 }, { sku: S[5].sku, qty: 1 }], customer: 'Marta González' },
    { key: `demo-${KSUF}-sale-0003`, method: 'mixed', store: centralId, items: [{ sku: S[6].sku, qty: 2 }, { sku: S[8].sku, qty: 2 }, { sku: S[9].sku, qty: 4 }], customer: 'Cliente eventual' },
    { key: `demo-${KSUF}-sale-0004`, method: 'cash', store: centralId, items: [{ sku: S[2].sku, qty: 3 }, { sku: S[3].sku, qty: 2 }], customer: 'Ernesto Rodríguez' },
    { key: `demo-${KSUF}-sale-0005`, method: 'cash', store: vedadoId, items: [{ sku: 'DEMO-V-ARZ-005', qty: 1 }, { sku: 'DEMO-V-JAB-090', qty: 4 }], customer: 'Cliente eventual' },
  ];
  const allProducts = [...PRODUCTS.central, ...PRODUCTS.vedado];
  const bySku = Object.fromEntries(allProducts.map(p => [p.sku, p]));

  // Historial de 14 días (2 ventas/día) — ventana de referencia del KPI
  // del dashboard (last7_daily_avg) y comparación de períodos.
  const allSkus = PRODUCTS.central.map(p => p.sku);
  const methods = ['cash', 'transfer', 'mixed'];
  for (let d = 1; d <= 14; d++) {
    for (let n = 0; n < 2; n++) {
      sales.push({
        key: `demo-${KSUF}-sale-h${String(d).padStart(2, '0')}${n}`, daysAgo: d,
        method: methods[(d + n) % 3], store: centralId,
        items: [
          { sku: allSkus[(d * 2 + n) % allSkus.length], qty: 1 + ((d + n) % 4) },
          { sku: allSkus[(d * 3 + n * 5 + 3) % allSkus.length], qty: 1 + ((d + n * 2) % 3) },
        ],
        customer: 'Cliente eventual',
      });
    }
  }

  let salesMade = 0;
  for (let i = 0; i < sales.length; i++) {
    const sale = sales[i];
    // pacing: el checkout limita a 30 req/min por usuario — pausa tras 26
    // para dejar margen a las llamadas previas que aún corren.
    if (i > 0 && i % 26 === 0) {
      console.log(`  … pacing rate-limit (${i}/${sales.length}) — 65s`);
      await new Promise(r => setTimeout(r, 65000));
    }
    const items = sale.items.map(it => ({
      product_id: productIds[it.sku], quantity: it.qty,
      price: bySku[it.sku].price, cost: bySku[it.sku].cost,
    }));
    const subtotal = items.reduce((a, i) => a + i.price * i.quantity, 0);
    const total = Math.round(subtotal * 100) / 100;
    const pay = sale.method === 'cash' ? { cash_amount: total, transfer_amount: 0, zelle_amount: 0 }
      : sale.method === 'transfer' ? { cash_amount: 0, transfer_amount: total, zelle_amount: 0 }
      : { cash_amount: Math.round(total * 0.5), transfer_amount: Math.round(total * 0.5), zelle_amount: 0 };
    const payload = {
      store_id: sale.store, seller_id: userId, payment_method: sale.method,
      discount_type: 'fixed', discount_value: 0, applied_taxes: [], tax_amount: 0,
      total_amount: total, subtotal, ...pay,
      sale_currency: 'CUP', sale_exchange_rate: 1,
      customer_name: sale.customer, idempotency_key: sale.key,
      ...(sale.daysAgo ? { operation_date: new Date(Date.now() - sale.daysAgo * 864e5 - 3 * 36e5).toISOString() } : {}),
      items,
    };
    const res = await fetch(`${BASE_URL}/api/pos/checkout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok || /idempot/i.test(JSON.stringify(body))) salesMade++;
    else console.log(`⚠ venta ${sale.key}: HTTP ${res.status}`);
  }
  console.log(`✓ ventas procesadas: ${salesMade}/${sales.length}`);

  // 9) contexto (gitignored)
  const ctx = { userId, tenantId, email: DEMO_EMAIL, password: DEMO_PASS, token, stores: storeIds, createdAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(ctx, null, 2));
  console.log('\n=== CONTEXTO GUARDADO:', OUT, '===');
  console.log(`Tiendas: ${STORES.map(s => s.name).join(' · ')}`);
}

const IMG = {
  'DEMO-ARZ-005': 'arroz.webp',
  'DEMO-ACE-001': 'aceite.webp',
  'DEMO-CAF-250': 'cafe.webp',
  'DEMO-DET-900': 'detergente.webp',
  'DEMO-LEC-400': 'leche.webp',
  'DEMO-FRJ-001': 'frijol.webp',
};

provision().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
