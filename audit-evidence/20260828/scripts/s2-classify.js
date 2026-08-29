#!/usr/bin/env node
/* s2-classify.js — clasifica el diff S2-vs-prod en adiciones / modificaciones / eliminaciones por dimensión */
const fs = require('fs');
const diff = fs.readFileSync('/tmp/fp-s2.diff', 'utf8').split('\n').filter(Boolean);
const prod = fs.readFileSync('/tmp/fp-prod.txt', 'utf8').split('\n').filter(Boolean);
const prodSet = new Set(prod);
const labOnly = [], prodOnly = [];
for (const l of diff) {
  if (l.startsWith('> ')) labOnly.push(l.slice(2));
  else if (l.startsWith('< ')) prodOnly.push(l.slice(2));
}
const dim = (r) => r.split('\x1f')[0];
// emparejar modificaciones: misma clave primaria (dim + campos clave antes del payload variable)
function keyOf(row) {
  const [d, ...f] = row.split('\x1f');
  switch (d) {
    case 'F6': return 'F6' + f[0];                       // firma
    case 'F9F': return 'F9F' + f.slice(0, 2).join('|');  // func+grantee
    case 'F9R': return 'F9R' + f.slice(0, 3).join('|');
    case 'F8': return 'F8' + f.slice(0, 2).join('|');    // tabla+policy
    case 'F3': return 'F3' + f.slice(0, 3).join('|');    // tabla+col+ordinal
    case 'F4': return 'F4' + f.slice(0, 2).join('|');
    case 'F5': return f[1] ? 'F5' + f[0].split('|')[0] : d; // indexdef completa como key no; usar def
    default: return row;
  }
}
const out = { added: {}, modified: {}, removed: {} };
const prodByKey = new Map(prodOnly.map(r => [keyOf(r), r]));
const matchedProd = new Set();
for (const r of labOnly) {
  const k = keyOf(r);
  if (prodByKey.has(k)) { (out.modified[dim(r)] ||= []).push({ key: k, prod: prodByKey.get(k), lab: r }); matchedProd.add(k); }
  else (out.added[dim(r)] ||= []).push(r);
}
for (const r of prodOnly) if (!matchedProd.has(keyOf(r))) (out.removed[dim(r)] ||= []).push(r);
const cnt = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.length]));
console.log('ADICIONES (repo-ahead):', JSON.stringify(cnt(out.added)));
console.log('MODIFICACIONES:', JSON.stringify(cnt(out.modified)));
console.log('ELIMINACIONES vs prod:', JSON.stringify(cnt(out.removed)));
fs.writeFileSync('/tmp/s2-classified.json', JSON.stringify(out, null, 1));
// ejemplos notables
console.log('\n== funciones modificadas (cuerpo/firma) ==');
for (const m of (out.modified.F6 || []).slice(0, 12)) console.log(' ', m.key, '\n   prod-md5:', m.prod.split('\x1f')[2], '\n   lab -md5:', m.lab.split('\x1f')[2]);
console.log('\n== columnas añadidas por replay (repo-ahead) ==');
for (const a of (out.added.F3 || []).slice(0, 15)) console.log(' ', a.split('\x1f').slice(0, 4).join(' | '));
console.log('\n== tablas nuevas (F1) ==');
for (const a of (out.added.F1 || [])) console.log(' ', a.split('\x1f').slice(0, 2).join(' | '));
for (const r of (out.removed.F1 || [])) console.log('  ELIMINADA:', r.split('\x1f').slice(0, 2).join(' | '));
console.log('\n== triggers nuevos/eliminados ==');
for (const a of (out.added.F7 || [])) console.log('  +', a.split('\x1f')[1]?.slice(0, 110));
for (const r of (out.removed.F7 || [])) console.log('  -', r.split('\x1f')[1]?.slice(0, 110));
