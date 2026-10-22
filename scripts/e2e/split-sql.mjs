/**
 * CP-INFRA-011 — Splitter SQL compartido (única fuente de verdad).
 * Usado por scripts/e2e/build-migrations-replay.mjs y
 * scripts/e2e/reset-remote-e2e-db.mjs.
 *
 * Divide un script SQL en sentencias conservando el texto VERBATIM:
 *  - respeta cuerpos dollar-quoted ($$, $function$, $body$…);
 *  - respeta strings '…' (con '' escapado) y "…";
 *  - respeta comentarios de línea (-- …) y de bloque (/* … *​/);
 *  - los comentarios que preceden a una sentencia forman parte de ella;
 *  - se descartan SOLO fragmentos que son exclusivamente comentarios/espacios.
 * Corrección documentada 2026-10-22: una versión anterior descartaba por error
 * sentencias que comenzaban con comentario (7 fragmentos del baseline).
 */
export function splitSqlStatements(sql) {
  const out = [];
  let cur = '';
  let i = 0;
  let inS = false, inD = false, inLine = false, inBlock = false, dollar = null;
  const n = sql.length;
  while (i < n) {
    if (dollar) {
      if (sql.startsWith(dollar, i)) { cur += dollar; i += dollar.length; dollar = null; continue; }
      cur += sql[i]; i++; continue;
    }
    const c = sql[i];
    const c2 = sql.slice(i, i + 2);
    if (inLine) { if (c === '\n') inLine = false; cur += c; i++; continue; }
    if (inBlock) { if (c2 === '*/') { inBlock = false; cur += '*/'; i += 2; continue; } cur += c; i++; continue; }
    if (inS) { if (c === "'") { if (sql[i + 1] === "'") { cur += "''"; i += 2; continue; } inS = false; } cur += c; i++; continue; }
    if (inD) { if (c === '"') inD = false; cur += c; i++; continue; }
    if (c2 === '--') { inLine = true; cur += c2; i += 2; continue; }
    if (c2 === '/*') { inBlock = true; cur += c2; i += 2; continue; }
    if (c === "'") { inS = true; cur += c; i++; continue; }
    if (c === '"') { inD = true; cur += c; i++; continue; }
    if (c === '$') {
      const m = sql.slice(i).match(/^\$([A-Za-z_]*)\$/);
      if (m) { dollar = m[0]; cur += m[0]; i += m[0].length; continue; }
    }
    if (c === ';') {
      cur += ';';
      const t = cur.trim();
      if (t.replace(/--[^\n]*/g, '').trim() !== '') out.push(t);
      cur = '';
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  const t = cur.trim();
  if (t && t.replace(/--[^\n]*/g, '').trim() !== '') out.push(t);
  return out;
}
