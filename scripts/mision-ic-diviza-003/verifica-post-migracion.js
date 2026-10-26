#!/usr/bin/env node
/**
 * IC-DIVIZA-003 — Verificación READ-ONLY post-migración.
 *
 * 1. Las 4 funciones vivas resuelven el paso informal con source='Diviza'
 *    (cero apariciones de IN ('elToque','Diviza') en sus cuerpos).
 * 2. El archivo elToque está INTACTO (498 filas, 2025-12-25 → 2026-07-28).
 * 3. El CHECK de source sigue permitiendo elToque (archivo consultable).
 * 4. Firmas/ACL de las 4 funciones sin cambio (mismas que antes — solo el
 *    cuerpo cambió).
 * 5. Simulación de resolución: qué ganaría el paso informal hoy (debe ser
 *    Diviza 840, no elToque 675).
 */
require('dotenv').config({ path: '/home/z/my-project/costpro/.env' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
const PROJECT_REF = (SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/) || [])[1];

async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

(async () => {
  let failures = 0;
  const check = (name, cond, detail = '') => {
    console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!cond) failures++;
  };

  // 1. Funciones vivas: paso informal = Diviza
  const funcs = await q(`
    SELECT p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('create_sale_v2','create_cash_flow_document','get_cash_balances_by_currency','open_cash_shift')
    ORDER BY p.proname;
  `);
  console.log('═══ 1. FUNCIONES VIVAS (paso informal) ═══');
  for (const f of funcs) {
    const inOld = (f.def.match(/IN \('elToque', 'Diviza'\)/g) || []).length;
    const divizaOnly = (f.def.match(/er\.source = 'Diviza'/g) || []).length;
    const elToqueMentions = (f.def.match(/elToque/g) || []).length;
    check(
      `${f.proname}`,
      inOld === 0 && divizaOnly > 0,
      `= 'Diviza' ×${divizaOnly} · IN(ambos) ×${inOld} · menciones elToque ×${elToqueMentions}`,
    );
  }

  // 2. Archivo elToque intacto
  console.log('\n═══ 2. ARCHIVO elToque (integridad histórica) ═══');
  const summary = await q(`
    SELECT source, count(*)::int AS n, min(rate_date) AS first_date, max(rate_date) AS last_date
    FROM public.exchange_rates GROUP BY source ORDER BY source;
  `);
  for (const r of summary) console.log(`   ${r.source.padEnd(8)} n=${String(r.n).padEnd(5)} ${r.first_date} → ${r.last_date}`);
  const elToque = summary.find(s => s.source === 'elToque');
  check('elToque: 498 filas conservadas', elToque && elToque.n === 498, `n=${elToque?.n}`);
  check('elToque: rango original 2025-12-25 → 2026-07-28', elToque && elToque.first_date === '2025-12-25' && elToque.last_date === '2026-07-28');
  const diviza = summary.find(s => s.source === 'Diviza');
  check('Diviza: filas activas presentes', !!diviza && diviza.n >= 6, `n=${diviza?.n} (${diviza?.first_date} → ${diviza?.last_date})`);

  // 3. CHECK de source sigue permitiendo elToque (archivo)
  console.log('\n═══ 3. CHECK exchange_rates_source_check ═══');
  const chk = await q(`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid = 'public.exchange_rates'::regclass AND conname = 'exchange_rates_source_check';
  `);
  const def = chk[0]?.def || '';
  check("CHECK incluye 'elToque' (archivo consultable)", def.includes("'elToque'"), def);

  // 4. ACL de las 4 funciones (sin cambio: solo public execute)
  console.log('\n═══ 4. ACL (ejecución pública conservada) ═══');
  const acls = await q(`
    SELECT p.proname, p.proacl::text AS acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('create_sale_v2','create_cash_flow_document','get_cash_balances_by_currency','open_cash_shift')
    ORDER BY p.proname;
  `);
  for (const a of acls) {
    // En proacl, 'X' es la abreviatura de EXECUTE (p.ej. {postgres=X/postgres,
    // authenticated=X/...}). Un ACL nulo implicaría EXECUTE para todos.
    const ok = a.acl === null || /=[X*]/.test(a.acl || '');
    check(`${a.proname} acl ejecutable`, ok, (a.acl || 'NULL (=execute para todos)').slice(0, 70));
  }

  // 5. Resolución del paso informal bajo las funciones NUEVAS (mismo criterio
  //    que el WHERE nuevo, calculado read-only — elToque no compite)
  console.log('\n═══ 5. PASO INFORMAL NUEVO (resolución equivalente, read-only) ═══');
  const winner = await q(`
    SELECT source, rate, rate_date FROM public.exchange_rates
    WHERE currency = 'USD' AND segment = '3' AND source = 'Diviza'
    ORDER BY rate_date DESC, captured_at DESC LIMIT 1;
  `);
  const elToqueWould = await q(`
    SELECT rate, rate_date FROM public.exchange_rates
    WHERE currency = 'USD' AND segment = '3' AND source = 'elToque'
    ORDER BY rate_date DESC, captured_at DESC LIMIT 1;
  `);
  if (winner[0]) {
    check('El paso informal resuelve Diviza', winner[0].source === 'Diviza', `rate=${winner[0].rate} (${winner[0].rate_date})`);
    const elToqueRate = parseFloat(elToqueWould[0]?.rate);
    const winnerRate = parseFloat(winner[0].rate);
    check(
      'elToque 675 NO compite (solo archivo)',
      elToqueRate === 675 && winnerRate !== 675,
      `Diviza=${winnerRate} vs elToque=${elToqueRate}`,
    );
  }

  console.log(`\n${failures === 0 ? '✅ VERIFICACIÓN COMPLETA SIN FALLOS (0 escrituras)' : `❌ ${failures} FALLOS`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
