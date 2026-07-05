#!/usr/bin/env node
/**
 * Scraper de LotteryUSA para histórico de Florida Pick 3.
 * 
 * URL: https://www.lotteryusa.com/florida/pick-3/year (evening)
 * URL: https://www.lotteryusa.com/florida/midday-pick-3/year (midday)
 * 
 * Cada página devuelve ~50 sorteos (6 meses aprox, 2 sorteos por día)
 */
require('dotenv').config({ path: '/home/z/my-project/.env' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MONTHS = {
  'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
  'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
  'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12',
};

function parseDate(dateStr) {
  const match = dateStr.match(/(\w{3})\s+(\d+),\s*(\d{4})/);
  if (!match) return null;
  const [, monthAbbr, day, year] = match;
  const month = MONTHS[monthAbbr];
  if (!month) return null;
  return `${year}-${month}-${day.padStart(2, '0')}`;
}

function extractResults(html, defaultDrawTime) {
  const results = [];
  
  // Pattern: fecha seguida de 3 bolas
  const sectionRegex = /class="c-draw-card__draw-date-sub">([^<]+)<\/span>[\s\S]*?<li class="c-ball c-ball--sm">(\d)<\/li>\s*<li class="c-ball c-ball--sm">(\d)<\/li>\s*<li class="c-ball c-ball--sm">(\d)<\/li>/g;
  
  let match;
  while ((match = sectionRegex.exec(html)) !== null) {
    const dateStr = match[1].trim();
    const date = parseDate(dateStr);
    if (!date) continue;
    
    const nums = [parseInt(match[2]), parseInt(match[3]), parseInt(match[4])];
    
    // Detectar Midday/Evening en el contexto
    const contextEnd = Math.min(sectionRegex.lastIndex + 500, html.length);
    const context = html.slice(match.index, contextEnd);
    const isMidday = context.toLowerCase().includes('midday');
    
    results.push({
      date,
      draw_time: isMidday ? 'midday' : defaultDrawTime,
      result: nums,
      source: 'lotteryusa',
    });
  }
  
  return results;
}

async function scrapePage(url, drawTime) {
  console.log(`  ▶ ${url}`);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    
    if (!res.ok) {
      console.error(`  ❌ HTTP ${res.status}`);
      return [];
    }
    
    const html = await res.text();
    const results = extractResults(html, drawTime);
    console.log(`  ✅ ${results.length} resultados`);
    return results;
  } catch (e) {
    console.error(`  ❌ Error: ${e.message}`);
    return [];
  }
}

async function uploadToSupabase(results) {
  if (results.length === 0) return 0;
  
  const rows = results.map(r => ({
    draw_date: r.date,
    draw_time: r.draw_time,
    result: r.result,
    source: 'official',
    sync_method: 'web',
  }));
  
  console.log(`  ▶ Subiendo ${rows.length} a Supabase...`);
  
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
    console.error(`  ❌ Upload: HTTP ${res.status}: ${body.slice(0, 200)}`);
    return 0;
  }
  
  console.log(`  ✅ Subidos`);
  return rows.length;
}

async function main() {
  console.log('═══ Scraper Pick 3 — LotteryUSA (/year) ═══\n');
  
  const allResults = [];
  
  // 1. Evening — página principal + /year
  console.log('Evening Pick 3:');
  const eveningRecent = await scrapePage('https://www.lotteryusa.com/florida/pick-3/', 'evening');
  allResults.push(...eveningRecent);
  await new Promise(r => setTimeout(r, 1500));
  
  console.log('Evening /year:');
  const eveningYear = await scrapePage('https://www.lotteryusa.com/florida/pick-3/year', 'evening');
  allResults.push(...eveningYear);
  await new Promise(r => setTimeout(r, 1500));
  
  // 2. Midday — página principal + /year
  console.log('Midday Pick 3:');
  const middayRecent = await scrapePage('https://www.lotteryusa.com/florida/midday-pick-3/', 'midday');
  allResults.push(...middayRecent);
  await new Promise(r => setTimeout(r, 1500));
  
  console.log('Midday /year:');
  const middayYear = await scrapePage('https://www.lotteryusa.com/florida/midday-pick-3/year', 'midday');
  allResults.push(...middayYear);
  
  // Deduplicar
  const seen = new Set();
  const unique = allResults.filter(r => {
    const key = `${r.date}-${r.draw_time}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  // Ordenar por fecha descendente
  unique.sort((a, b) => b.date.localeCompare(a.date));
  
  console.log(`\n═══ Resumen ═══`);
  console.log(`Total extraído: ${allResults.length}`);
  console.log(`Únicos: ${unique.length}`);
  if (unique.length > 0) {
    console.log(`Rango: ${unique[unique.length-1].date} → ${unique[0].date}`);
    console.log(`Primeros 5:`);
    unique.slice(0, 5).forEach(r => console.log(`  ${r.date} ${r.draw_time}: ${r.result.join(', ')}`));
    console.log(`Últimos 5:`);
    unique.slice(-5).forEach(r => console.log(`  ${r.date} ${r.draw_time}: ${r.result.join(', ')}`));
    
    const uploaded = await uploadToSupabase(unique);
    console.log(`\nSubidos a DB: ${uploaded}`);
  } else {
    console.log('❌ No se extrajeron resultados');
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
