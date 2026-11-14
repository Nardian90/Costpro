// ============================================================================
// M050a — CP-FIN-VALUATION-RECTIFICATION-RELEASE-GATE-004 · FASE 0:
// PROBE DE ENTORNO: canal read-only producción + BD E2E aislada (sentinela).
// READ-ONLY en producción (Management API /database/query, solo SELECT).
// Uso: node /home/z/my-project/scripts/m050a-rect004-fase0-probe.mjs
// ============================================================================
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const sha256 = (s) => createHash('sha256').update(typeof s === 'string' ? s : JSON.stringify(s)).digest('hex');

const OUT = {
  mision: 'CP-FIN-VALUATION-RECTIFICATION-RELEASE-GATE-004',
  fase: '0 — probe de entorno (recuperación)',
  generado: new Date().toISOString(),
  produccion: {},
  e2e_aislada: {},
};

// ── 1. PRODUCCIÓN: Management API, SELECT mínimo (solo salud del canal) ────
{
  const TOKEN = env.SUPABASE_ACCESS_TOKEN;
  const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
  if (ref !== 'wthkddeleylijmonclxg') { console.error('GUARD: no es producción'); process.exit(2); }
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'SELECT current_database() AS db, now() AS ts, current_setting(\'server_version\') AS pgver' }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`producción HTTP ${res.status}: ${text.slice(0, 300)}`);
  const rows = JSON.parse(text || '[]');
  OUT.produccion = { canal: 'Management API /database/query', ref, resultado: rows[0], hash_sha256: sha256(rows) };
  console.log('[PROD read-only OK]', JSON.stringify(rows[0]));
}

// ── 2. BD E2E AISLADA: sentinela por REST + SQL directo (pooler IPv4) ────────
{
  const BASE = 'https://lguovmvrozxgssupkwpf.supabase.co';
  const KEY = env.E2E_SUPABASE_SERVICE_ROLE_KEY;
  if (!KEY) throw new Error('FALTA E2E_SUPABASE_SERVICE_ROLE_KEY');
  // REST: RPC sentinela
  const r = await fetch(`${BASE}/rest/v1/rpc/e2e_is_isolated_db`, {
    method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: '{}' });
  const t = await r.text();
  OUT.e2e_aislada.rest_sentinela = { http: r.status, cuerpo: t.trim() };
  console.log('[E2E REST sentinela]', r.status, t.trim());
  // SQL directo por pooler IPv4
  const dbUrl = env.E2E_SUPABASE_DB_URL; // postgres://postgres:PW@db.lguov...:5432/postgres
  const pw = decodeURIComponent(dbUrl.match(/:\/\/[^:]+:([^@]+)@/)[1]);
  const pg = (await import('pg')).default;
  const pool = new pg.Pool({ host: 'aws-0-us-east-1.pooler.supabase.com', port: 6543, database: 'postgres',
    user: 'postgres.lguovmvrozxgssupkwpf', password: pw, ssl: { rejectUnauthorized: false }, max: 2 });
  const c = await pool.connect();
  const { rows } = await c.query('SELECT e2e_is_isolated_db() AS sentinela, current_database() AS db, now() AS ts');
  c.release(); await pool.end();
  OUT.e2e_aislada.sql = { sentinela: rows[0].sentinela, db: rows[0].db, ts: rows[0].ts, canal: 'pooler IPv4 :6543' };
  OUT.e2e_aislada.hash_sha256 = sha256(rows);
  console.log('[E2E SQL sentinela]', JSON.stringify(rows[0]));
  if (rows[0].sentinela !== true) { console.error('SENTINELA FALSE — ABORTAR'); process.exit(3); }
  if (OUT.e2e_aislada.rest_sentinela.cuerpo !== 'true') { console.error('SENTINELA REST != true — ABORTAR'); process.exit(4); }
}

// ── 3. SANIDAD: el canal de producción NUNCA recibe escrituras de este script
OUT.declaracion = 'Este script no contiene ninguna sentencia de escritura (solo SELECT / RPC read-only).';
console.log('[FIN probe OK]');
mkdirSync('/home/z/my-project/scripts/out', { recursive: true });
writeFileSync('/home/z/my-project/scripts/out/m050a-fase0-probe.json', JSON.stringify(OUT, null, 2));
