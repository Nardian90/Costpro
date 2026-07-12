/**
 * Update RSS feeds: remove non-Spanish, add Spanish/Cuba-focused sources.
 * GESTION-RSS-MIPYMES-CUBA (2026-07-13)
 *
 * Estrategia:
 * 1. DELETE 7 feeds en inglés (Wired, The Verge, Reuters×2, HBR, SME News, Investing.com)
 * 2. KEEP 8 feeds en español (BCC, FMI-es, BM-es, OMC-es, CEPAL, CIAT, Gaceta, BBC Mundo)
 * 3. INSERT nuevas fuentes en español:
 *    - Medios cubanos (nacionales + independientes)
 *    - Medios internacionales en español (economía/negocios)
 *    - Organismos multilaterales en español
 */
const fs = require('fs');

const envContent = fs.readFileSync('/home/z/my-project/.env', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const projectRef = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];

// ── URLs a eliminar (no son en español) ──
const urlsToRemove = [
  'https://www.wired.com/feed/category/business/latest/rss',
  'https://www.theverge.com/rss/index.xml',
  'https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best',
  'https://www.investing.com/rss/news_25.rss',
  'https://hbr.org/feeds/latest.rss',
  'https://www.smenews.lat/rss',
  'https://www.reutersagency.com/feed/?best-topics=political-general&post_type=best&region=central-america-south',
];

// ── Nuevas fuentes en español (Cuba + MiPymes) ──
// (name, url, category) — categorías válidas:
// economia_finanzas, comercio_exterior, tributacion_fiscal, legislacion,
// tecnologia, mercados, educacion_negocios, regional_latam
const newFeeds = [
  // ── Medios cubanos nacionales ──
  ['Granma (Cuba)',                'https://www.granma.cu/feed',                      'regional_latam'],
  ['Cubadebate',                   'https://www.cubadebate.cu/feed/',                 'regional_latam'],
  ['Juventud Rebelde',             'https://www.juventudrebelde.cu/feed',             'regional_latam'],
  ['OnCuba News',                  'https://oncubanews.com/feed/',                    'regional_latam'],
  ['El Toque',                     'https://eltoque.com/feed',                        'economia_finanzas'],
  ['14ymedio',                     'https://www.14ymedio.com/feed',                   'regional_latam'],
  ['Diario de Cuba',               'https://diariodecuba.com/feed',                   'regional_latam'],
  ['ADN Cuba',                     'https://adncuba.com/feed',                        'regional_latam'],

  // ── Medios internacionales en español (economía/negocios) ──
  ['El País - Economía',           'https://feeds.elpais.com/mrss/s/pages/elpais/economia.html', 'economia_finanzas'],
  ['Expansión',                    'https://www.expansion.com/rss/portada.xml',       'mercados'],
  ['Cinco Días',                   'https://cincodias.elpais.com/rss/portada.xml',    'mercados'],
  ['El Economista (España)',       'https://www.eleconomista.es/rss/portada.xml',     'mercados'],
  ['América Economía',             'https://www.americaeconomia.com/rss.xml',         'educacion_negocios'],

  // ── Organismos multilaterales en español ──
  ['BID - Noticias (Esp)',         'https://www.iadb.org/es/rss.xml',                 'comercio_exterior'],
  ['OIT - Noticias (Esp)',         'https://www.ilo.org/es/rss/news.xml',            'legislacion'],
  ['OPS - Noticias (Esp)',         'https://www.paho.org/es/rss.xml',                 'regional_latam'],
];

async function runQuery(sql) {
  const r = await fetch('https://api.supabase.com/v1/projects/' + projectRef + '/database/query', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.SUPABASE_ACCESS_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  return { status: r.status, body: await r.text() };
}

(async () => {
  console.log('=== Paso 1: Eliminar feeds en inglés ===');
  for (const url of urlsToRemove) {
    const sql = `DELETE FROM public.rss_feeds WHERE url = '${url.replace(/'/g, "''")}';`;
    const res = await runQuery(sql);
    console.log(`  ${res.status === 201 ? '✓' : '✗'} ${url.substring(0, 60)}...`);
    if (res.status !== 201) console.log(`     ${res.body.substring(0, 200)}`);
  }

  console.log('\n=== Paso 2: Insertar nuevas fuentes en español ===');
  for (const [name, url, category] of newFeeds) {
    const sql = `INSERT INTO public.rss_feeds (name, url, is_active, category)
                 VALUES ('${name.replace(/'/g, "''")}', '${url.replace(/'/g, "''")}', true, '${category}')
                 ON CONFLICT (url) DO UPDATE SET
                   name = EXCLUDED.name,
                   category = EXCLUDED.category;`;
    const res = await runQuery(sql);
    console.log(`  ${res.status === 201 ? '✓' : '✗'} [${category}] ${name}`);
    if (res.status !== 201) console.log(`     ${res.body.substring(0, 200)}`);
  }

  console.log('\n=== Paso 3: Verificación final ===');
  const sql = `SELECT name, url, category, is_active FROM public.rss_feeds ORDER BY category, name;`;
  const res = await runQuery(sql);
  if (res.status === 201) {
    // The query returns rows as JSON in the response body
    // Try to parse — the Management API returns the rows directly
    try {
      const rows = JSON.parse(res.body);
      console.log(`Total feeds: ${rows.length}`);
      const byCat = {};
      for (const r of rows) {
        const c = r.category || 'sin_categoria';
        if (!byCat[c]) byCat[c] = [];
        byCat[c].push(r.name);
      }
      for (const [cat, names] of Object.entries(byCat)) {
        console.log(`\n[${cat}] (${names.length}):`);
        for (const n of names) console.log(`  - ${n}`);
      }
    } catch (e) {
      console.log('Status:', res.status, 'Body:', res.body.substring(0, 500));
    }
  } else {
    console.log('Status:', res.status, 'Body:', res.body.substring(0, 500));
  }
})();
