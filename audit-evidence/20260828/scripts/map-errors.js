#!/usr/bin/env node
/* map-errors.js — dado stderr de psql y el mapa de líneas, lista índices de statements con error.
 * Uso: node map-errors.js <psql-stderr-file> <map-file> <out-errors.json> */
const fs = require('fs');
const [errFile, mapFile, outFile] = process.argv.slice(2);
const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
const lines = fs.readFileSync(errFile, 'utf8').split('\n');
const base = mapFile.replace(/\.map\.json$/, '');
const failed = new Map(); // i -> [{line, msg}]
for (const ln of lines) {
  const m = ln.match(new RegExp(`^(?:psql:)?${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\d+):\\s*(?:ERROR|error):\\s*(.*)$`));
  if (!m) continue;
  const lineno = Number(m[1]);
  const st = map.find(s => lineno >= s.start && lineno <= s.end);
  if (!st) { console.error('WARN: línea sin statement:', ln); continue; }
  if (!failed.has(st.i)) failed.set(st.i, []);
  failed.get(st.i).push({ lineno, msg: m[2] });
}
const out = [...failed.entries()].map(([i, errs]) => ({ i, section: map.find(s => s.i === i).section, errs }));
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
console.log(`failed=${out.length} de ${map.length}`);
for (const f of out.slice(0, 15)) console.log(`  #${f.i} [${f.section}] ${f.errs[0].msg.slice(0, 110)}`);
