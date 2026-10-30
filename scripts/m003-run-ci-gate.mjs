/**
 * CP-CAT-MAESTRO-003 — Ejecuta CADA sentencia de ci-gate-checks.sql por
 * separado (la Management API solo devuelve el último resultset de un batch,
 * lo que ocultaría hallazgos). Produce el mismo formato psql -t -A -F '|'.
 */
import { readFileSync, writeFileSync } from 'fs';

const raw = readFileSync('.env', 'utf8');
const env = {};
for (const l of raw.split('\n')) { const i = l.indexOf('='); if (i > 0 && !l.startsWith('#')) env[l.slice(0, i)] = l.slice(i + 1); }
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
const sql = readFileSync('scripts/ci-gate-checks.sql', 'utf8');

// divide por ';' a nivel superior (los checks no usan dollar-quoting con ;)
const stmts = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);

const lines = [];
let errors = 0;
let executed = 0;
for (const st of stmts) {
  // quita TODAS las líneas de comentario de la sentencia
  const body = st.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').trim();
  if (!/^SELECT/i.test(body)) continue;
  executed++;
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: body + ';' }),
  });
  if (!res.ok) {
    console.error('FALLO sentencia:', body.slice(0, 80), '→', res.status);
    errors++;
    continue;
  }
  const rows = await res.json();
  for (const r of rows) lines.push(Object.values(r).join('|'));
}
console.log('sentencias ejecutadas:', executed, '| errores:', errors, '| filas halladas:', lines.length);
writeFileSync('/tmp/ci-gate-results.txt', lines.join('\n') + '\n');
process.exit(errors ? 1 : 0);
