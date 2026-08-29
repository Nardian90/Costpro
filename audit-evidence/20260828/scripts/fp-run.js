#!/usr/bin/env node
/* fp-run.js — divide fingerprint.sql en statements (sin comentarios), los ejecuta
 * contra prod (vía snap-lib q) o lab (psql), y emite líneas canónicas ordenadas.
 * Uso: node fp-run.js prod <out.txt>   |   node fp-run.js lab <out.txt> */
const fs = require('fs');
const { execSync } = require('child_process');
const MODE = process.argv[2], OUT = process.argv[3];
const SNAP = '/home/z/my-project/download/auditoria-multitienda/RECOVERY-20260828/PRODUCTION-SCHEMA-SNAPSHOT';

const sql = fs.readFileSync('/home/z/my-project/scripts/fingerprint.sql', 'utf8')
  .split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
const stmts = sql.split(';').map(s => s.trim()).filter(s => /select/i.test(s));

if (MODE === 'prod') {
  const lines = [];
  stmts.forEach((st, i) => {
    const slug = `fp-${String(i).padStart(2, '0')}`;
    fs.writeFileSync(`/tmp/${slug}.sql`, st + ';');
    execSync(`source /home/z/my-project/scripts/snap-lib.sh && q ${slug} /tmp/${slug}.sql`,
      { shell: '/bin/bash', stdio: ['ignore', 'pipe', 'inherit'] });
    const j = JSON.parse(fs.readFileSync(`${SNAP}/extraction-raw/${slug}.response.json`, 'utf8'));
    for (const r of j) lines.push(r.line);
  });
  fs.writeFileSync(OUT, lines.sort().join('\n') + '\n');
  console.log(`prod: ${stmts.length} stmts, ${lines.length} líneas`);
} else {
  fs.writeFileSync('/tmp/fp-lab.sql', sql);
  const out = execSync(
    `LD_LIBRARY_PATH=/home/z/my-project/harness/client/usr/lib/postgresql/17/lib:/home/z/my-project/harness/client/usr/lib/x86_64-linux-gnu /home/z/my-project/harness/client/usr/lib/postgresql/17/bin/psql -h 127.0.0.1 -p 5433 -U postgres -d costpro_audit_v3 -q -At -c 'SET search_path = public, extensions' -f /tmp/fp-lab.sql`,
    { shell: '/bin/bash', maxBuffer: 256 * 1024 * 1024 });
  const lines = out.toString().split('\n').filter(l => l.startsWith('F'));
  fs.writeFileSync(OUT, lines.sort().join('\n') + '\n');
  console.log(`lab: ${stmts.length} stmts, ${lines.length} líneas`);
}
