/**
 * IC-DIVIZA-002 — Diagnóstico READ-ONLY del estado de la tasa informal.
 *
 * Fase 1 (este script): captura el estado ANTES de pulsar el botón.
 *   1. Login Supabase (admin) → JWT
 *   2. GET /api/exchange-rates?days=90&segment=3 (producción, autenticado)
 *   3. Consulta REST read-only: filas informales + BCC más recientes
 *   4. Fetch directo de cubadivisas.com (solo lectura externa) + parse
 *   5. Análisis de fechas: UTC vs America/Havana vs rate_date almacenado
 *
 * NO escribe nada en Supabase. No expone tokens (solo prefijos).
 */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = process.env.API_BASE || 'https://costpro4.vercel.app';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@demo.com";
const ADMIN_PASS = process.env.ADMIN_PASS || "demo123";

const pad = n => String(n).padStart(2, '0');

/** Fecha civil de Cuba (America/Havana) en formato YYYY-MM-DD. */
function havanaCivilDate(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Havana', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(now); // en-CA → YYYY-MM-DD
}

async function main() {
  console.log('════════ IC-DIVIZA-002 DIAGNÓSTICO READ-ONLY ════════');
  console.log(`Momento: ${new Date().toISOString()}`);
  console.log(`UTC civil date:      ${new Date().toISOString().slice(0, 10)}`);
  console.log(`Havana civil date:   ${havanaCivilDate()}`);
  console.log(`API_BASE: ${API_BASE}`);
  console.log('');

  // ── 1. Login ──
  const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL, password: ADMIN_PASS,
  });
  if (loginErr || !loginData?.session?.access_token) {
    console.log('❌ Login falló:', loginErr?.message);
    process.exit(1);
  }
  const token = loginData.session.access_token;
  console.log(`✅ Login OK (rol: ${loginData.user.role ?? 'n/a'}, email: ${loginData.user.email})`);
  console.log('');

  // ── 2. GET /api/exchange-rates autenticado (lo mismo que hace la vista) ──
  console.log('── GET /api/exchange-rates?days=90&segment=3 (autenticado) ──');
  const getRes = await fetch(`${API_BASE}/api/exchange-rates?days=90&segment=3`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`HTTP ${getRes.status}`);
  const getJson = await getRes.json().catch(() => ({}));
  const rates = getJson.rates || [];
  console.log(`count=${getJson.count} carry_forward_count=${getJson.carry_forward_count}`);
  const informalRows = rates.filter(r => ['Diviza', 'elToque'].includes(r.source));
  console.log(`Filas informales en respuesta (todas las monedas): ${informalRows.length}`);
  const sortedInformal = [...informalRows].sort((a, b) => {
    if (a.rate_date !== b.rate_date) return b.rate_date.localeCompare(a.rate_date);
    return (b.captured_at || '').localeCompare(a.captured_at || '');
  });
  console.log('Top 6 informales (rate_date DESC, captured_at DESC):');
  for (const r of sortedInformal.slice(0, 6)) {
    console.log(`  ${r.rate_date} | ${r.currency} | src=${r.source} | seg=${r.segment} | rate=${r.rate} | method=${r.capture_method} | captured_at=${r.captured_at} | orig_date=${r.original_rate_date ?? '—'}`);
  }
  // El USD informal más fresco — exactamente lo que la tarjeta debe mostrar
  const usdInformal = sortedInformal.find(r => r.currency === 'USD');
  console.log(`USD informal MÁS FRESCO (regla de la vista): ${usdInformal ? JSON.stringify({
    rate: usdInformal.rate, rate_date: usdInformal.rate_date, source: usdInformal.source,
    capture_method: usdInformal.capture_method, captured_at: usdInformal.captured_at,
  }) : 'NINGUNO'}`);
  // Simular la comparación de carry-forward de la vista (usa toISOString → UTC)
  const clientTodayUTC = new Date().toISOString().slice(0, 10);
  if (usdInformal) {
    console.log(`Vista diría: informalIsCarryForward = ${usdInformal.rate_date !== clientTodayUTC} (rate_date=${usdInformal.rate_date} vs todayStr(UTC)=${clientTodayUTC})`);
  }
  // carry_forward_dates
  if (Array.isArray(getJson.carry_forward_dates) && getJson.carry_forward_dates.length) {
    console.log('carry_forward_dates:', JSON.stringify(getJson.carry_forward_dates));
  }
  console.log('');

  // ── 3. BD read-only: filas más recientes por fuente ──
  console.log('── Supabase REST (read-only): exchange_rates recientes ──');
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: dbInformal, error: dbErr } = await admin
    .from('exchange_rates')
    .select('rate_date,currency,source,segment,rate,capture_method,captured_at')
    .in('source', ['Diviza', 'elToque'])
    .order('rate_date', { ascending: false })
    .order('captured_at', { ascending: false })
    .limit(10);
  if (dbErr) console.log('❌ consulta BD:', dbErr.message);
  else {
    console.log('Top 10 informales en BD:');
    for (const r of dbInformal) {
      console.log(`  ${r.rate_date} | ${r.currency} | src=${r.source} | seg=${r.segment} | rate=${r.rate} | method=${r.capture_method} | captured_at=${r.captured_at}`);
    }
  }
  const { data: dbBcc } = await admin
    .from('exchange_rates')
    .select('rate_date,currency,source,segment,rate,captured_at')
    .eq('source', 'BCC')
    .order('rate_date', { ascending: false })
    .order('captured_at', { ascending: false })
    .limit(6);
  console.log('Top 6 BCC en BD:');
  for (const r of dbBcc || []) {
    console.log(`  ${r.rate_date} | ${r.currency} | seg=${r.segment} | rate=${r.rate} | captured_at=${r.captured_at}`);
  }
  // ¿Hay filas con rate_date FUTURO respecto a Cuba o respecto a UTC?
  const { data: allRecent } = await admin
    .from('exchange_rates')
    .select('rate_date,source,currency,rate,captured_at')
    .gte('rate_date', '2026-10-24')
    .order('rate_date', { ascending: false });
  const utcToday = new Date().toISOString().slice(0, 10);
  const havToday = havanaCivilDate();
  const futureVsUTC = (allRecent || []).filter(r => r.rate_date > utcToday);
  const futureVsHavana = (allRecent || []).filter(r => r.rate_date > havToday);
  console.log(`Filas con rate_date > UTC-today (${utcToday}): ${futureVsUTC.length}`);
  for (const r of futureVsUTC) console.log(`  ⚠️  ${r.rate_date} | ${r.source} | ${r.currency} | rate=${r.rate}`);
  console.log(`Filas con rate_date > Havana-today (${havToday}): ${futureVsHavana.length}`);
  for (const r of futureVsHavana) console.log(`  ⚠️  ${r.rate_date} | ${r.source} | ${r.currency} | rate=${r.rate}`);
  console.log('');

  // ── 4. Diviza en vivo (solo lectura externa) ──
  console.log('── Diviza (cubadivisas.com) fetch directo read-only ──');
  try {
    const res = await fetch('https://cubadivisas.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-CU,es;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(12000),
    });
    console.log(`HTTP ${res.status}`);
    const html = await res.text();
    const block = html.match(/<script[^>]*type=["']application\/json["'][^>]*id=["']conv-data["'][^>]*>([\s\S]*?)<\/script>/i);
    if (block) {
      const data = JSON.parse(block[1].trim());
      console.log('informal:', JSON.stringify(data.informal));
    } else {
      console.log('❌ sin bloque conv-data');
    }
    const text = html.replace(/<[^>]+>/g, ' ');
    const upd = text.match(/Actualizado\s+el\s+[^<]{5,140}/i);
    console.log(`sello de fuente: ${upd ? upd[0] : 'NO ENCONTRADO'}`);
  } catch (e) {
    console.log('❌ fetch Diviza falló:', e.message);
  }

  console.log('');
  console.log('════════ FIN DIAGNÓSTICO READ-ONLY ════════');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
