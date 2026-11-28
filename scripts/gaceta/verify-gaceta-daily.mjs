#!/usr/bin/env node
/**
 * ADN-011-WATCHDOG — Auditor read-only del Diario Contable (/gaceta).
 * ============================================================================
 * MISIÓN: vigilar que el publicador programado (Z.ai Schedule «El Diario
 * Contable») publica a diario en `gaceta_posts`, y que la superficie pública
 * (vista public_gaceta_v) refleja la edición del día. SIN escribir: este
 * script es 100% read-only (SELECT por REST). La reparación del hueco la
 * ejecuta el agente del schedule de auditoría (nivel 3) o el propio watchdog
 * (nivel 2), NUNCA este script.
 *
 * Patrón: scripts de verificación re-ejecutables del repo (verifica-*.mjs),
 * evidencia E1 (salida literal en stdout), cero secretos en el output.
 *
 * Uso (credenciales por entorno, nunca hardcode):
 *   set -a; source .env; set +a
 *   node scripts/gaceta/verify-gaceta-daily.mjs
 *   node scripts/gaceta/verify-gaceta-daily.mjs --verbose
 *
 * Salida: código de salida 0 = publicación al día; 2 = hueco detectado
 * (sin edición del día en La Habana); 3 = error de entorno/conectividad.
 * Huecos listados en stdout con fechas exactas para su reparación.
 */

const TZ_EDICION = 'America/Havana'; // la publicación es cubana (ADN-011)
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wthkddeleylijmonclxg.supabase.co';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const VERBOSE = process.argv.includes('--verbose');

function usageEnv() {
  console.error('[verify-gaceta-daily] Faltan variables: NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno.');
  process.exit(3);
}
if (!ANON) usageEnv();

/** Fecha de "hoy" y de los últimos N días en hora de La Habana (YYYY-MM-DD). */
function habanaDate(offsetDays = 0) {
  const d = new Date(Date.now() - offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_EDICION, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
  return parts; // en-CA produce YYYY-MM-DD
}

async function fetchEdiciones(limit = 40) {
  const res = await fetch(
    `${URL_BASE}/rest/v1/public_gaceta_v?select=fecha,slug,tipo,titular&order=fecha.desc&limit=${limit}`,
    { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }
  );
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    console.error(`[verify-gaceta-daily] REST public_gaceta_v HTTP ${res.status}: ${body}`);
    process.exit(3);
  }
  return res.json();
}

function esDiaPublicado(filas, fecha) {
  return filas.some((f) => f.fecha === fecha);
}

async function main() {
  const filas = await fetchEdiciones();
  const hoy = habanaDate(0);
  const publicadas = new Set(filas.map((f) => f.fecha));

  console.log(`[verify-gaceta-daily] Ediciones visibles en public_gaceta_v: ${filas.length}`);
  if (VERBOSE) for (const f of filas.slice(0, 10)) console.log(`  ${f.fecha} | ${f.tipo} | ${f.titular.slice(0, 60)}`);

  // 1) Edición de HOY (criterio duro: al menos una nota del día en La Habana)
  const hayHoy = esDiaPublicado(filas, hoy);

  // 2) Huecos de los últimos 7 días (días sin ninguna nota publicada)
  const huecos = [];
  for (let i = 1; i <= 7; i++) {
    const f = habanaDate(i);
    if (!publicadas.has(f)) huecos.push(f);
  }

  // 3) ¿Cuántos días seguidos lleva sin publicar? (última fecha publicada)
  const ultima = filas.length ? filas[0].fecha : null;

  console.log(`[verify-gaceta-daily] Hoy (La Habana): ${hoy}`);
  console.log(`[verify-gaceta-daily] Edición de hoy publicada: ${hayHoy ? 'SÍ' : 'NO'}`);
  console.log(`[verify-gaceta-daily] Última fecha publicada: ${ultima ?? '(ninguna)'}`);
  console.log(`[verify-gaceta-daily] Huecos últimos 7 días: ${huecos.length ? huecos.join(', ') : '(ninguno)'}`);

  if (hayHoy && huecos.length === 0) {
    console.log('[verify-gaceta-daily] RESULTADO: OK — publicación diaria al día.');
    process.exit(0);
  }
  if (!hayHoy) {
    console.log(`[verify-gaceta-daily] RESULTADO: HUECO — falta la edición de hoy ${hoy} (el publicador del Diario Contable no ha publicado).`);
    if (huecos.length) console.log(`[verify-gaceta-daily] Además hay ${huecos.length} día(s) anterior(es) sin edición: ${huecos.join(', ')}`);
    process.exit(2);
  }
  // hoy publicado pero con huecos anteriores
  console.log(`[verify-gaceta-daily] RESULTADO: HUECO — hoy está publicado pero faltan días previos: ${huecos.join(', ')}`);
  process.exit(2);
}

main().catch((e) => {
  console.error(`[verify-gaceta-daily] Error inesperado: ${e.message}`);
  process.exit(3);
});
