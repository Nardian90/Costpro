/**
 * Bundle Gate — anclaje de vistas protegidas a sus chunks compilados.
 *
 * En producción, Turbopack no conserva los paths de origen en los chunks
 * cliente (sin sourcemaps). Para determinar QUÉ chunk contiene una vista
 * protegida se usan literales del código fuente de la vista:
 *
 *   1. Se extraen candidatos (strings de ≥14 chars) del .tsx/.ts fuente.
 *   2. Un literal es "ancla única" si aparece en EXACTAMENTE 1 chunk.
 *   3. La vista queda anclada si ≥ `minAnchors` anclas únicas apuntan al
 *      mismo chunk. Si las anclas se reparten entre chunks, o no llegan al
 *      mínimo → no se puede anclar de forma fiable → BLOCKED para esa vista.
 *
 * Los literales de JSX/textos de UI sobreviven a la minificación, por lo que
 * el anclaje es estable entre releases; si una vista cambia tanto que pierde
 * sus anclas, el gate se bloquea (fail-safe) en lugar de dar PASS falso.
 */

const LITERAL_RE = /["']([^"'\n]{14,70})["']/g;

/**
 * Extrae literales candidatos de un archivo fuente.
 * @param {string} sourceCode
 * @returns {string[]}
 */
export function extractLiterals(sourceCode) {
  const out = new Set();
  let m;
  LITERAL_RE.lastIndex = 0;
  while ((m = LITERAL_RE.exec(sourceCode))) out.add(m[1]);
  return [...out];
}

/**
 * Ancla una vista a su chunk.
 * @param {string} sourceCode código fuente de la vista
 * @param {string[]} chunkFiles nombres de chunk
 * @param {(f: string) => string} readChunk código del chunk
 * @param {{minAnchors?: number}} opts
 * @returns {{ok: true, chunk: string, anchors: string[]} | {ok: false, reason: string}}
 */
export function anchorViewToChunk(sourceCode, chunkFiles, readChunk, opts = {}) {
  const minAnchors = opts.minAnchors ?? 3;
  const literals = extractLiterals(sourceCode);
  if (literals.length === 0) {
    return { ok: false, reason: 'No se extrajeron literales candidatos del código fuente de la vista.' };
  }
  const byChunk = new Map();
  for (const lit of literals) {
    let owners = 0;
    let last = null;
    for (const f of chunkFiles) {
      if (readChunk(f).includes(lit)) {
        owners++;
        last = f;
        if (owners > 1) break;
      }
    }
    if (owners === 1 && last) byChunk.set(last, (byChunk.get(last) || 0) + 1);
  }
  if (byChunk.size === 0) {
    return { ok: false, reason: 'Ningún literal del código fuente aparece de forma única en un chunk. ¿Cambió el bundler o la vista ya no se compila como chunk separado?' };
  }
  const sorted = [...byChunk.entries()].sort((a, b) => b[1] - a[1]);
  const [best, bestCount] = sorted[0];
  if (bestCount < minAnchors) {
    return { ok: false, reason: `Solo ${bestCount} ancla(s) única(s) apuntan al chunk más probable (${best}); se requieren ${minAnchors}.` };
  }
  // desambiguación: el segundo mejor no debe estar a ≤1 ancla del primero
  if (sorted.length > 1 && sorted[1][1] >= bestCount) {
    return { ok: false, reason: `Anclaje ambiguo: ${best} (${bestCount} anclas) vs ${sorted[1][0]} (${sorted[1][1]} anclas).` };
  }
  return { ok: true, chunk: best, anchors: sorted.slice(0, 5).map(([c, n]) => `${c} (${n})`) };
}
