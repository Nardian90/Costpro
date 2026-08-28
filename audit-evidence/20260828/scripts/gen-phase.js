#!/usr/bin/env node
/* gen-phase.js — genera archivo SQL de una fase desde statements.json + mapa de líneas.
 * Uso: node gen-phase.js <A|B> <outfile> [indices-coma (retry)] [skip|only <section>] */
const fs = require('fs');
const [phase, outfile, idxArg, mode, section] = process.argv.slice(2);
const stmts = JSON.parse(fs.readFileSync('/home/z/my-project/download/auditoria-multitienda/RECOVERY-20260828/PRODUCTION-SCHEMA-SNAPSHOT/statements.json', 'utf8'));
let sel = stmts.map((s, i) => ({ ...s, i })).filter(s => s.phase === phase);
if (idxArg) { const set = new Set(idxArg.split(',').map(Number)); sel = sel.filter(s => set.has(s.i)); }
if (mode === 'skip') sel = sel.filter(s => s.section !== section);
if (mode === 'only') sel = sel.filter(s => s.section === section);
let text = '', line = 1, map = [];
for (const s of sel) {
  if (line === 1) { text += `-- phase ${phase}\n`; line = 2; }
  map.push({ i: s.i, start: line + 1, end: line + s.sql.split('\n').length, section: s.section });
  text += '\n' + s.sql + '\n';
  line += 1 + s.sql.split('\n').length;
}
fs.writeFileSync(outfile, text);
fs.writeFileSync(outfile + '.map.json', JSON.stringify(map));
console.log(`${outfile}: ${sel.length} stmts, ${line} líneas`);
