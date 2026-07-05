#!/usr/bin/env node
/**
 * Carga el seed data de Pick3 en la tabla pick3_history de Supabase.
 * Esto resuelve el problema de "no carga histórico" — la tabla está vacía.
 */
require('dotenv').config({ path: '/home/z/my-project/.env' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Faltan variables de entorno');
  process.exit(1);
}

// Seed data (copiada de seedData.ts)
const SEED_DATA = [
  { date: '2026-03-24', draw_time: 'midday', result: [1, 5, 8] },
  { date: '2026-03-23', draw_time: 'evening', result: [2, 3, 2] },
  { date: '2026-03-23', draw_time: 'midday', result: [9, 6, 4] },
  { date: '2026-03-22', draw_time: 'evening', result: [5, 7, 6] },
  { date: '2026-03-22', draw_time: 'midday', result: [5, 5, 5] },
  { date: '2026-03-21', draw_time: 'evening', result: [8, 6, 4] },
  { date: '2026-03-21', draw_time: 'midday', result: [4, 8, 2] },
  { date: '2026-03-20', draw_time: 'evening', result: [7, 9, 1] },
  { date: '2026-03-20', draw_time: 'midday', result: [5, 2, 7] },
  { date: '2026-03-19', draw_time: 'evening', result: [1, 4, 0] },
  { date: '2026-03-19', draw_time: 'midday', result: [6, 8, 5] },
  { date: '2026-03-18', draw_time: 'evening', result: [9, 3, 1] },
  { date: '2026-03-18', draw_time: 'midday', result: [2, 7, 4] },
  { date: '2026-03-17', draw_time: 'evening', result: [0, 0, 8] },
  { date: '2026-03-17', draw_time: 'midday', result: [5, 1, 3] },
  { date: '2026-03-16', draw_time: 'evening', result: [7, 9, 2] },
  { date: '2026-03-16', draw_time: 'midday', result: [4, 2, 6] },
  { date: '2026-03-15', draw_time: 'evening', result: [8, 5, 0] },
  { date: '2026-03-15', draw_time: 'midday', result: [3, 4, 7] },
  { date: '2026-03-14', draw_time: 'evening', result: [1, 6, 9] },
  { date: '2026-03-14', draw_time: 'midday', result: [6, 0, 1] },
  { date: '2026-03-13', draw_time: 'evening', result: [9, 8, 3] },
  { date: '2026-03-13', draw_time: 'midday', result: [3, 7, 5] },
  { date: '2026-03-12', draw_time: 'evening', result: [4, 1, 8] },
  { date: '2026-03-12', draw_time: 'midday', result: [0, 9, 6] },
  { date: '2026-03-11', draw_time: 'evening', result: [7, 5, 2] },
  { date: '2026-03-11', draw_time: 'midday', result: [8, 3, 1] },
  { date: '2026-03-10', draw_time: 'evening', result: [2, 4, 9] },
  { date: '2026-03-10', draw_time: 'midday', result: [6, 6, 0] },
  { date: '2026-03-09', draw_time: 'evening', result: [1, 0, 7] },
  { date: '2026-03-09', draw_time: 'midday', result: [9, 5, 3] },
  { date: '2026-03-08', draw_time: 'evening', result: [3, 8, 4] },
  { date: '2026-03-08', draw_time: 'midday', result: [7, 2, 6] },
  { date: '2026-03-07', draw_time: 'evening', result: [5, 9, 1] },
  { date: '2026-03-07', draw_time: 'midday', result: [4, 4, 8] },
  { date: '2026-03-06', draw_time: 'evening', result: [0, 7, 3] },
  { date: '2026-03-06', draw_time: 'midday', result: [8, 1, 5] },
  { date: '2026-03-05', draw_time: 'evening', result: [6, 2, 9] },
  { date: '2026-03-05', draw_time: 'midday', result: [3, 0, 4] },
  { date: '2026-03-04', draw_time: 'evening', result: [9, 8, 7] },
  { date: '2026-03-04', draw_time: 'midday', result: [1, 5, 2] },
];

async function main() {
  console.log(`▶ Cargando ${SEED_DATA.length} registros en pick3_history...`);

  const rows = SEED_DATA.map(r => ({
    draw_date: r.date,
    draw_time: r.draw_time,
    result: r.result,
    source: 'official',
    sync_method: 'seed',
  }));

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/pick3_history?on_conflict=draw_date,draw_time`,
    {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    console.error(`❌ HTTP ${res.status}: ${body}`);
    process.exit(1);
  }

  console.log(`✅ ${SEED_DATA.length} registros cargados en pick3_history`);
  console.log('   sync_method: seed (no serán sobrescritos por web scraper)');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
