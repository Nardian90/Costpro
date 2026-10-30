/**
 * CP-CAT-MAESTRO-003 — Helper de consulta SQL vía Management API oficial.
 * Uso: node scripts/m003-query.mjs "<SQL>"
 * Solo lectura salvo que se pase --write explícitamente.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const env = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
for (const l of env.split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];

const sql = process.argv[2];
if (!sql) { console.error('Usage: node scripts/m003-query.mjs "<sql>"'); process.exit(1); }

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const text = await res.text();
console.log('HTTP', res.status);
if (!res.ok) {
  console.error(text.slice(0, 2000));
  process.exit(1);
}
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text.slice(0, 3000));
}
