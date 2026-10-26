/**
 * IC-DIVIZA-002 — Reproducción REAL del botón «Actualizar BD (7 días)».
 *
 * Llama POST /api/exchange-rates/refresh?days=7 con sesión admin autenticada
 * (exactamente lo que hace el botón) y registra:
 *   - Respuesta HTTP completa + JSON
 *   - Desglose por fuente (BCC vs Diviza) del resultado
 *   - La fila Diviza resultante en BD (read-only después de la captura)
 *   - Lo que la vista SELECCIONARÍA con la respuesta del GET autenticado
 *
 * Escritura controlada: solo upserts idempotentes sobre exchange_rates
 * (la acción real del botón que la misión pide reproducir).
 */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = process.env.API_BASE || 'https://costpro4.vercel.app';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@demo.com';
const ADMIN_PASS = process.env.ADMIN_PASS || 'demo123';

async function main() {
  console.log('════════ IC-DIVIZA-002 REPRODUCCIÓN DEL BOTÓN «ACTUALIZAR BD (7 DÍAS)» ════════');
  console.log(`Momento: ${new Date().toISOString()} | UTC: ${new Date().toISOString().slice(0, 10)} | Havana: ${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Havana' }).format(new Date())}`);
  console.log('');

  const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL, password: ADMIN_PASS,
  });
  if (loginErr || !loginData?.session?.access_token) {
    console.log('❌ Login falló:', loginErr?.message);
    process.exit(1);
  }
  const token = loginData.session.access_token;
  console.log('✅ Login admin OK');
  console.log('');

  // ── 1. POST /api/exchange-rates/refresh?days=7 (lo que hace el botón) ──
  console.log('── POST /api/exchange-rates/refresh?days=7 ──');
  const t0 = Date.now();
  const res = await fetch(`${API_BASE}/api/exchange-rates/refresh?days=7`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const elapsed = Date.now() - t0;
  const body = await res.json().catch(() => ({}));
  console.log(`HTTP ${res.status} (${elapsed}ms)`);
  console.log('JSON completo:');
  console.log(JSON.stringify(body, null, 2).slice(0, 3000));

  // Desglose por fuente
  const captured = body.details || [];
  const bcc = captured.filter(c => c.source === 'BCC');
  const diviza = captured.filter(c => c.source === 'Diviza');
  const eltoque = captured.filter(c => c.source === 'elToque');
  console.log('');
  console.log(`Desglose: BCC=${bcc.length} filas | Diviza=${diviza.length} filas | elToque=${eltoque.length} filas`);
  console.log(`dates_processed (${(body.dates_processed || []).length}): ${(body.dates_processed || []).join(', ')}`);
  console.log(`errors (${(body.errors || []).length}):`);
  for (const e of body.errors || []) console.log(`  - ${e}`);
  console.log(`¿La respuesta distingue BCC ok/fallo y Diviza ok/fallo explícitamente? ${'bcc' in body || 'diviza' in body || 'sources' in body ? 'SÍ' : 'NO — solo success genérico + errors[]'}`);
  console.log('');

  // ── 2. BD read-only: fila Diviza más reciente tras la captura ──
  console.log('── BD tras la captura (read-only): Diviza más reciente ──');
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: divizaRows } = await admin
    .from('exchange_rates')
    .select('rate_date,currency,segment,rate,capture_method,captured_at,source')
    .eq('source', 'Diviza')
    .order('rate_date', { ascending: false })
    .order('captured_at', { ascending: false })
    .limit(4);
  for (const r of divizaRows || []) {
    console.log(`  ${r.rate_date} | ${r.currency} | seg=${r.segment} | rate=${r.rate} | method=${r.capture_method} | captured_at=${r.captured_at}`);
  }
  // Conteo por fecha para detectar duplicados
  const dates = {};
  for (const r of divizaRows || []) dates[r.rate_date] = (dates[r.rate_date] || 0) + 1;
  console.log('  conteo por fecha (top 4):', JSON.stringify(dates));
  console.log('');

  // ── 3. GET autenticado + simulación EXACTA de la selección de la vista ──
  console.log('── GET /api/exchange-rates?days=90&segment=3 → selección de la vista ──');
  const getRes = await fetch(`${API_BASE}/api/exchange-rates?days=90&segment=3`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const getJson = await getRes.json().catch(() => ({}));
  const rates = getJson.rates || [];
  const usdInformalRates = rates
    .filter(r => ['Diviza', 'elToque'].includes(r.source) && r.currency === 'USD')
    .sort((a, b) => {
      if (a.rate_date !== b.rate_date) return b.rate_date.localeCompare(a.rate_date);
      return (b.captured_at || '').localeCompare(a.captured_at || '');
    });
  console.log(`HTTP ${getRes.status} | USD informal filas: ${usdInformalRates.length}`);
  console.log('Top 5 (regla actual de la vista):');
  for (const r of usdInformalRates.slice(0, 5)) {
    console.log(`  ${r.rate_date} | src=${r.source} | rate=${r.rate} | method=${r.capture_method} | captured_at=${r.captured_at}`);
  }
  const selected = usdInformalRates[0];
  console.log('');
  console.log(`>>> LA TARJETA MUESTRA: ${selected ? `${selected.rate} CUP/USD (${selected.source}, ${selected.capture_method})` : '«Sin dato fiable»'}`);
  console.log(`>>> LO QUE DEBERÍA MOSTRAR: fila Diviza real más reciente = ${divizaRows?.[0]?.rate ?? '—'} CUP/USD (Diviza, real)`);
  const mismatch = !selected || selected.source !== 'Diviza' || selected.capture_method === 'carry_forward';
  console.log(`>>> ¿RUPTURA API→React confirmada? ${mismatch ? 'SÍ — la selección desplaza Diviza con filas virtuales' : 'no'}`);

  console.log('');
  console.log('════════ FIN REPRODUCCIÓN ════════');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
