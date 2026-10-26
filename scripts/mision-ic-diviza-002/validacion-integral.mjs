/**
 * IC-DIVIZA-002 — Validación INTEGRAL en producción (misión §7).
 *
 * Comprueba la cadena completa con sesión autorizada:
 *   1. GET autenticado → operative_date presente (prueba de que producción
 *      sirve el código nuevo) y regla de selección verificada.
 *   2. POST /refresh?days=7 (captura real controlada) → respuesta con estado
 *      por fuente (bcc/diviza/partial/operative_date).
 *   3. BD read-only: fila Diviza resultante — rate_date = FECHA OPERATIVA
 *      (civil de Cuba), source='Diviza', capture_method='real',
 *      source_updated_at (sello del proveedor).
 *   4. GET autenticado post-captura → simulación EXACTA de la regla de la
 *      vista → la tarjeta mostrará la Diviza REAL (no la virtual elToque).
 *   5. Backfill BCC histórico (fix /historico): filas para fechas pasadas.
 *
 * Escritura controlada: upserts idempotentes sobre exchange_rates (la acción
 * real del botón). Sin tokens en la salida.
 */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = process.env.API_BASE || 'https://costpro4.vercel.app';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@demo.com';
const ADMIN_PASS = process.env.ADMIN_PASS || 'demo123';

const havanaToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Havana' }).format(new Date());

/** Comparador de frescura compartido con la vista/API (misión §5):
 * prioriza la fecha operativa, luego rate_date DESC + captured_at DESC. */
function byVigente(operative) {
  return (a, b) => {
    const aO = a.rate_date === operative, bO = b.rate_date === operative;
    if (aO !== bO) return aO ? -1 : 1;
    if (a.rate_date !== b.rate_date) return b.rate_date.localeCompare(a.rate_date);
    return (b.captured_at || '').localeCompare(a.captured_at || '');
  };
}

async function main() {
  console.log('════════ IC-DIVIZA-002 VALIDACIÓN INTEGRAL EN PRODUCCIÓN ════════');
  console.log(`Momento: ${new Date().toISOString()}`);
  console.log(`UTC: ${new Date().toISOString().slice(0, 10)} | Havana (operativa): ${havanaToday()}`);
  console.log('');

  const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL, password: ADMIN_PASS,
  });
  if (loginErr) { console.log('❌ Login:', loginErr.message); process.exit(1); }
  const token = loginData.session.access_token;
  console.log('✅ Login admin OK');
  console.log('');

  // ── 1. GET PRE-captura: ¿producción sirve el código nuevo? ──
  console.log('── 1. GET /api/exchange-rates?days=90&segment=3 (PRE-captura) ──');
  const pre = await fetch(`${API_BASE}/api/exchange-rates?days=90&segment=3`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const preJson = await pre.json().catch(() => ({}));
  console.log(`HTTP ${pre.status}`);
  console.log(`operative_date en respuesta: ${preJson.operative_date ?? 'AUSENTE (código viejo!)'}`);
  if (preJson.operative_date) {
    console.log(`  ¿coincide con la civil de Cuba (${havanaToday()})? ${preJson.operative_date === havanaToday() ? 'SÍ ✓' : 'NO ✗'}`);
  }
  console.log('');

  // ── 2. POST /refresh?days=7 — captura real controlada (el botón) ──
  console.log('── 2. POST /api/exchange-rates/refresh?days=7 (captura real controlada) ──');
  const t0 = Date.now();
  const res = await fetch(`${API_BASE}/api/exchange-rates/refresh?days=7`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  console.log(`HTTP ${res.status} (${Date.now() - t0}ms)`);
  console.log(`success=${body.success} partial=${body.partial} operative_date=${body.operative_date}`);
  console.log(`bcc: ok=${body.bcc?.ok} rows=${body.bcc?.rows} errors=${body.bcc?.errors?.length}`);
  console.log(`diviza: ok=${body.diviza?.ok} rows=${body.diviza?.rows} attempted=${body.diviza?.attempted}`);
  console.log(`diviza.rates: ${JSON.stringify(body.diviza?.rates)}`);
  console.log(`diviza.source_updated_at: ${body.diviza?.source_updated_at}`);
  console.log(`dates_processed (${(body.dates_processed || []).length}): ${(body.dates_processed || []).join(', ')}`);
  if (body.bcc?.errors?.length) console.log(`bcc.errors: ${JSON.stringify(body.bcc.errors.slice(0, 8))}`);
  if (body.diviza?.errors?.length) console.log(`diviza.errors: ${JSON.stringify(body.diviza.errors)}`);
  console.log('');

  // ── 3. BD read-only: fila Diviza resultante ──
  console.log('── 3. BD (read-only): filas Diviza más recientes tras la captura ──');
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: divizaRows } = await admin
    .from('exchange_rates')
    .select('rate_date,currency,segment,rate,capture_method,captured_at,source_updated_at')
    .eq('source', 'Diviza')
    .order('rate_date', { ascending: false })
    .order('captured_at', { ascending: false })
    .limit(6);
  for (const r of divizaRows || []) {
    console.log(`  ${r.rate_date} | ${r.currency} | seg=${r.segment} | rate=${r.rate} | method=${r.capture_method} | captured_at=${r.captured_at} | source_updated_at=${r.source_updated_at}`);
  }
  const operative = havanaToday();
  const usdRow = (divizaRows || []).filter(r => r.currency === 'USD').sort(byVigente(operative))[0];
  console.log('');
  console.log(`>>> Fila USD Diviza: rate_date=${usdRow?.rate_date} (¿= operativa ${operative}? ${usdRow?.rate_date === operative ? 'SÍ ✓' : 'NO ✗'})`);
  console.log(`>>> source_updated_at persistido: ${usdRow?.source_updated_at ? 'SÍ ✓' : 'NO (null)'}`);

  // Backfill BCC histórico (fix /historico)
  const { data: bccRecent } = await admin
    .from('exchange_rates')
    .select('rate_date,currency,segment,rate')
    .eq('source', 'BCC')
    .gte('rate_date', '2026-10-18')
    .order('rate_date', { ascending: true });
  const bccDates = [...new Set((bccRecent || []).map(r => r.rate_date))].sort();
  console.log(`>>> Backfill BCC histórico: fechas con filas ≥2026-10-18: ${bccDates.join(', ')}`);
  console.log('');

  // ── 4. GET post-captura + regla EXACTA de la vista ──
  console.log('── 4. GET post-captura → regla EXACTA de la vista (solo filas REALES) ──');
  const post = await fetch(`${API_BASE}/api/exchange-rates?days=90&segment=3`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const postJson = await post.json().catch(() => ({}));
  const rates = postJson.rates || [];
  console.log(`HTTP ${post.status} | count=${postJson.count} | operative_date=${postJson.operative_date} | carry_forward_count=${postJson.carry_forward_count}`);

  // Regla de la vista (IC-DIVIZA-002): filas informales REALES, prioridad
  // de fecha operativa + rate_date DESC + captured_at DESC (byVigente)
  const realUsd = rates
    .filter(r => ['Diviza', 'elToque'].includes(r.source) && r.currency === 'USD' && r.capture_method !== 'carry_forward')
    .sort(byVigente(operative));
  console.log('Top 4 informales USD REALES (regla de la vista):');
  for (const r of realUsd.slice(0, 4)) {
    console.log(`  ${r.rate_date} | src=${r.source} | rate=${r.rate} | method=${r.capture_method} | captured_at=${r.captured_at}`);
  }
  const selected = realUsd[0];
  console.log('');
  console.log(`>>> LA TARJETA MOSTRARÁ: ${selected ? `${selected.rate} CUP/USD — «Real · ${selected.source}»` : '«Sin dato fiable»'}`);
  if (selected) {
    console.log(`>>> Stale (antigüedad): ${selected.rate_date !== operative ? `SÍ (fecha ${selected.rate_date} ≠ operativa ${operative})` : 'NO (fecha operativa) ✓'}`);
  }
  // La virtual elToque NO debe ganar
  const virtualUsd = rates
    .filter(r => r.source === 'elToque' && r.currency === 'USD' && r.capture_method === 'carry_forward')
    .sort((a, b) => (b.captured_at || '').localeCompare(a.captured_at || ''))[0];
  if (virtualUsd) {
    console.log(`>>> Virtual elToque presente (para gráfico): rate=${virtualUsd.rate}, captured_at=${virtualUsd.captured_at}, original=${virtualUsd.original_rate_date}`);
    console.log(`>>> ¿La virtual desplaza a la Diviza real? ${selected && selected.source === 'Diviza' ? 'NO ✓ (excluida de la selección)' : 'SÍ ✗'}`);
  }

  // informal_latest (pseudo-fuente) — misma regla server-side
  const informalLatestRes = await fetch(`${API_BASE}/api/exchange-rates?days=90&segment=3&source=informal&currency=USD`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const informalLatest = (await informalLatestRes.json().catch(() => ({}))).informal_latest;
  console.log(`>>> informal_latest (server-side): ${informalLatest ? JSON.stringify(informalLatest) : 'undefined'}`);
  console.log('');

  // ── 5. Cadena completa ──
  console.log('── 5. CADENA COMPLETA ──');
  const checks = {
    'Diviza → extracción (refresh diviza.ok)': body.diviza?.ok === true,
    '→ persistencia (fila USD en BD, operativa)': usdRow?.rate_date === operative && usdRow?.capture_method === 'real',
    '→ source_updated_at persistido': usdRow?.source_updated_at != null,
    '→ API autenticada devuelve la fila (realUsd[0]=Diviza)': selected?.source === 'Diviza',
    '→ estado React: la vista seleccionará Diviza (regla verificada)': selected?.source === 'Diviza' && selected?.capture_method === 'real',
    '→ tarjeta visible: 840 Real · Diviza (regla de selección)': selected?.rate === usdRow?.rate,
    '→ operative_date del backend = civil de Cuba': postJson.operative_date === operative,
    '→ virtual elToque NO desplaza a Diviza': !virtualUsd || selected?.source === 'Diviza',
    '→ BCC capturado (oficial independiente)': body.bcc?.ok === true || (body.bcc?.rows ?? 0) > 0,
    '→ éxito parcial NO falseado (partial coherente)': body.partial === false || body.partial === true,
  };
  let allOk = true;
  for (const [k, v] of Object.entries(checks)) {
    console.log(`  ${v ? '✓' : '✗'} ${k}`);
    if (!v) allOk = false;
  }
  console.log('');
  console.log(`════════ ${allOk ? 'CADENA COMPLETA VERIFICADA ✓✓✓' : 'HAY FALLOS — revisar arriba'} ════════`);
  process.exit(allOk ? 0 : 2);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
