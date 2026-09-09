#!/usr/bin/env node
/**
 * REM-F4-06b SQL runner — ejecuta SQL contra Supabase vía Management API.
 * Lee credenciales del .env del repo SIN imprimirlas jamás.
 * Uso: node run_sql.cjs <archivo.sql> [archivo_salida.txt]
 * Modo matriz: soporta múltiples statements separados por "-- @statement: <nombre>"
 */
const fs = require('fs');

const repoEnv = fs.readFileSync('/home/z/my-project/Costpro/.env', 'utf8');
const env = {};
for (const line of repoEnv.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || '';
const ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN || '';
if (!SUPABASE_URL || !ACCESS_TOKEN) {
  console.error('Faltan credenciales en .env');
  process.exit(1);
}
const PROJECT_REF = SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)[1];
const URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

async function runSql(sql) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  return { status: res.status, text };
}

(async () => {
  const sqlFile = process.argv[2];
  const outFile = process.argv[3] || null;
  const raw = fs.readFileSync(sqlFile, 'utf8');
  // Dividir por marcadores "-- @statement: <nombre>" si existen
  const parts = raw.split(/^-- @statement: /m).slice(1);
  const blocks = parts.length
    ? parts.map((p) => {
        const nl = p.indexOf('\n');
        return { name: p.slice(0, nl).trim(), sql: p.slice(nl + 1).trim() };
      })
    : [{ name: 'single', sql: raw }];

  let out = `# SQL RUN — ${new Date().toISOString()}\n# file: ${sqlFile}\n# endpoint: Management API query (project ${PROJECT_REF.replace(/./g, '*')})\n`;
  let failed = false;
  for (const b of blocks) {
    out += `\n===== STATEMENT: ${b.name} =====\n`;
    try {
      const { status, text } = await runSql(b.sql);
      out += `HTTP ${status}\n`;
      let pretty = text;
      try {
        const j = JSON.parse(text);
        pretty = JSON.stringify(j, null, 2);
        if (Array.isArray(j) && j.length && j[0] && j[0].error) failed = true;
        if (j && j.error) failed = true;
      } catch (e) { /* texto plano */ }
      if (status >= 400) failed = true;
      out += pretty + '\n';
    } catch (e) {
      failed = true;
      out += `RUNNER ERROR: ${e.message}\n`;
    }
  }
  out += `\n===== RUN RESULT: ${failed ? 'FAILED' : 'OK'} =====\n`;
  if (outFile) {
    fs.writeFileSync(outFile, out);
    console.log(`written: ${outFile}`);
  }
  console.log(out);
  process.exit(failed ? 2 : 0);
})();
