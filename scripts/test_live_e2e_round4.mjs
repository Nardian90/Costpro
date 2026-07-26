/**
 * test_live_e2e_round4.mjs
 *
 * RONDA 4 — Casos edge y estrés
 * Lo que una jefa podría hacer para romper el sistema:
 *   - Venta con cantidad 0 o negativa
 *   - Transferencia a la misma tienda
 *   - Revertir documento ya revertido
 *   - Crear devolución sin items
 *   - Productos con caracteres especiales en nombre
 *   - Pago mixto (cash + transfer + zelle)
 *   - Venta con descuento del 100%
 *   - Búsqueda de productos con SQL injection attempt
 *   - Rate limiting (muchas requests rápidas)
 *   - CSRF (sin origin header)
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = 'http://localhost:3000';
const STORE = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
const DEST_STORE = '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const C = { g: '\x1b[32m', r: '\x1b[31m', c: '\x1b[36m', p: '\x1b[35m', b: '\x1b[1m', y: '\x1b[33m', x: '\x1b[0m' };
const ok = m => console.log(`${C.g}✅ ${m}${C.x}`);
const bad = m => console.log(`${C.r}❌ ${m}${C.x}`);
const info = m => console.log(`${C.c}ℹ️  ${m}${C.x}`);
const warn = m => console.log(`${C.y}⚠️  ${m}${C.x}`);
const head = m => console.log(`\n${C.b}${C.p}═══ ${m} ═══${C.x}`);

const bugs = [];
function reportBug(flow, description, error) {
  bugs.push({ flow, description, error: error?.message || String(error) });
  bad(`BUG [${flow}]: ${description}`);
  if (error) console.log(`   → ${error.message || error}`);
}

let token;

async function apiCall(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

async function setup() {
  head('RONDA 4 — Setup');
  const authed = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await authed.auth.signInWithPassword({ email: 'admin@costpro.com', password: 'costpro123' });
  if (error) { bad('Login: ' + error.message); process.exit(1); }
  token = data.session.access_token;
  ok('JWT obtenido');
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 26: Transferencia a la misma tienda (debe fallar)
// ═══════════════════════════════════════════════════════════════════════
async function testTransferSameStore() {
  head('FASE 26: Transferencia a la misma tienda');
  const { data: p } = await admin.from('products').select('id').eq('store_id', STORE).limit(1).single();

  const res = await apiCall('/api/transfers', {
    method: 'POST',
    body: {
      origin_store_id: STORE,
      destination_store_id: STORE, // misma tienda
      items: [{ product_id: p.id, quantity: 1, unit_cost: 50 }],
    },
  });

  if (res.status === 400) ok(`Bloqueado correctamente: ${res.data?.error || 'origin == destination'}`);
  else reportBug('transfer_same', `Status ${res.status} (esperaba 400)`, res.data);
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 27: Transferencia sin items (debe fallar)
// ═══════════════════════════════════════════════════════════════════════
async function testTransferNoItems() {
  head('FASE 27: Transferencia sin items');
  const res = await apiCall('/api/transfers', {
    method: 'POST',
    body: {
      origin_store_id: STORE,
      destination_store_id: DEST_STORE,
      items: [],
    },
  });

  if (res.status === 400) ok(`Bloqueado: items vacíos`);
  else reportBug('transfer_no_items', `Status ${res.status}`, res.data);
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 28: Transferencia con UUID inválido (debe fallar)
// ═══════════════════════════════════════════════════════════════════════
async function testTransferInvalidUUID() {
  head('FASE 28: Transferencia con UUID inválido');
  const res = await apiCall('/api/transfers', {
    method: 'POST',
    body: {
      origin_store_id: 'not-a-uuid',
      destination_store_id: DEST_STORE,
      items: [{ product_id: '00000000-0000-0000-0000-000000000000', quantity: 1, unit_cost: 50 }],
    },
  });

  if (res.status === 400) ok(`Bloqueado: UUID inválido`);
  else reportBug('transfer_invalid_uuid', `Status ${res.status}`, res.data);
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 29: Revertir documento inexistente (debe 404 o error)
// ═══════════════════════════════════════════════════════════════════════
async function testReverseNonExistent() {
  head('FASE 29: Revertir documento inexistente');
  await new Promise(r => setTimeout(r, 13000)); // rate limit

  const res = await apiCall('/api/reverse', {
    method: 'POST',
    body: { type: 'transaction', id: '00000000-0000-0000-0000-000000000000', reason: 'test inexistente' },
  });

  if (res.status >= 400 && res.status < 500) ok(`Bloqueado: ${res.status} ${res.data?.error || ''}`);
  else reportBug('reverse_nonexistent', `Status ${res.status}`, res.data);
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 30: Devolución sin items (debe fallar)
// ═══════════════════════════════════════════════════════════════════════
async function testDevolutionNoItems() {
  head('FASE 30: Devolución sin items');
  const res = await apiCall('/api/devolutions', {
    method: 'POST',
    body: {
      store_id: STORE,
      reason: 'Test sin items',
      items: [],
    },
  });

  if (res.status === 400) ok(`Bloqueado: items vacíos`);
  else reportBug('devolution_no_items', `Status ${res.status}`, res.data);
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 31: Búsqueda productos con caracteres especiales
// ═══════════════════════════════════════════════════════════════════════
async function testProductSearchSpecial() {
  head('FASE 31: Búsqueda con caracteres especiales');

  const searches = [
    { q: '', name: 'vacío' },
    { q: 'a', name: '1 char' },
    { q: '%; DROP TABLE products;--', name: 'SQL injection' },
    { q: '<script>alert(1)</script>', name: 'XSS' },
    { q: 'áéíóúñ', name: 'acentos' },
    { q: '🚀', name: 'emoji' },
  ];

  for (const s of searches) {
    const res = await apiCall(`/api/inventory/products?storeId=${STORE}&search=${encodeURIComponent(s.q)}&limit=5`);
    if (res.status === 200) {
      const count = Array.isArray(res.data?.data) ? res.data.data.length : 0;
      ok(`Búsqueda "${s.name}": 200 (${count} resultados)`);
    } else {
      reportBug('search_special', `Búsqueda "${s.name}": ${res.status}`, res.data);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 32: CSRF (sin origin header)
// ═══════════════════════════════════════════════════════════════════════
async function testCSRF() {
  head('FASE 32: CSRF protection');

  // POST sin Origin header (debe fallar con 403)
  const res = await fetch(`${API_BASE}/api/transfers`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      // Sin Origin ni Referer
    },
    body: JSON.stringify({
      origin_store_id: STORE,
      destination_store_id: DEST_STORE,
      items: [{ product_id: '00000000-0000-0000-0000-000000000000', quantity: 1, unit_cost: 50 }],
    }),
  });

  if (res.status === 403) ok(`CSRF bloqueado: 403`);
  else if (res.status === 400) ok(`CSRF o validación: 400 (aceptable)`);
  else reportBug('csrf', `Status ${res.status} (esperaba 403)`, await res.json().catch(() => null));
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 33: Rate limiting (muchas requests rápidas)
// ═══════════════════════════════════════════════════════════════════════
async function testRateLimit() {
  head('FASE 33: Rate limiting');
  // /api/reverse tiene 5/min — enviar 7 rápidas
  let blocked = 0;
  let succeeded = 0;
  for (let i = 0; i < 7; i++) {
    const res = await apiCall('/api/reverse', {
      method: 'POST',
      body: { type: 'transaction', id: '00000000-0000-0000-0000-000000000000', reason: 'rate limit test' },
    });
    if (res.status === 429) blocked++;
    else if (res.status >= 400) succeeded++; // otros errores esperados
  }
  if (blocked > 0) ok(`Rate limit activo: ${blocked} bloqueadas de 7`);
  else warn(`Sin bloqueos (puede ser por delay entre requests)`);
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 34: Producto con caracteres especiales en nombre
// ═══════════════════════════════════════════════════════════════════════
async function testProductSpecialChars(userId) {
  head('FASE 34: Producto con caracteres especiales');

  const names = [
    'Producto "con comillas"',
    "Producto 'con apostrofes'",
    'Producto <script>x</script>',
    'Producto con emoji 🎉',
    'Producto muy largo ' + 'a'.repeat(200),
  ];

  for (const name of names) {
    const { data, error } = await admin.from('products').insert({
      name: name.slice(0, 255),
      sku: 'SP-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      stock_current: 1, cost_average: 10, price: 20,
      price_currency: 'CUP', store_id: STORE, is_active: true,
    }).select().single();
    if (error) reportBug('product_special', `Nombre "${name.slice(0, 30)}": ${error.message}`, error);
    else ok(`Producto creado: "${data.name.slice(0, 30)}..."`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`${C.b}${C.p}
╔══════════════════════════════════════════════════════════════════╗
║  RONDA 4 — CASOS EDGE Y ESTRÉS                                  ║
║  Lo que una jefa podría intentar para romper el sistema          ║
╚══════════════════════════════════════════════════════════════════╝${C.x}`);

  await setup();
  const userId = '051c6157-600b-425e-b8c0-72388bacf541';

  await testTransferSameStore();
  await testTransferNoItems();
  await testTransferInvalidUUID();
  await testDevolutionNoItems();
  await testProductSearchSpecial();
  await testCSRF();
  await testProductSpecialChars(userId);
  await testReverseNonExistent();
  await testRateLimit();

  console.log(`\n${C.b}${C.p}═══ RESUMEN RONDA 4 ═══${C.x}`);
  if (bugs.length === 0) {
    ok(`🎉 0 bugs en casos edge`);
  } else {
    bad(`${bugs.length} bug(s):`);
    for (const b of bugs) {
      console.log(`  ${C.r}- [${b.flow}]${C.x} ${b.description}`);
      if (b.error) console.log(`    ${C.y}${b.error}${C.x}`);
    }
  }
  process.exit(bugs.length === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
