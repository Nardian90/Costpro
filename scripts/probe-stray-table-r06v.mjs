/**
 * Sondeo read-only: tabla residual exchange_rates_backup_cpfx001
 * (CP-BRA-POST-CERTIFICATION-VALIDATION-001). Verifica existencia, estructura,
 * filas, RLS, grants y FKs en la BD AISLADA y en PRODUCCIÓN vía Management API
 * (endpoint SQL; el sandbox no resuelve db.*.supabase.co). Read-only, no imprime
 * credenciales. Re-ejecutable: re-verifica el hallazgo y su remediación.
 */
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
if (!TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN requerida');
const ISOLATED_REF = process.env.E2E_ALLOWED_REMOTE_REF || 'lguovmvrozxgssupkwpf';
const PROD_REF = 'wthkddeleylijmonclxg';
const T = 'exchange_rates_backup_cpfx001';

async function mq(ref, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Management API ${ref}: HTTP ${res.status} ${txt.slice(0, 200)}`);
  return JSON.parse(txt);
}

async function census(ref, label) {
  const meta = await mq(ref, `SELECT schemaname, tablename, tableowner FROM pg_tables WHERE tablename = '${T}'`);
  console.log(`[${label}] pg_tables:`, JSON.stringify(meta));
  if (!meta.length) { console.log(`[${label}] tabla NO existe`); return; }
  const cols = await mq(ref, `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${T}' ORDER BY ordinal_position`);
  console.log(`[${label}] columnas:`, cols.map(x => `${x.column_name}:${x.data_type}`).join(', ') || '(ninguna)');
  const r = await mq(ref, `SELECT count(*)::int AS n FROM "${T}"`);
  console.log(`[${label}] filas:`, r[0]?.n);
  const rls = await mq(ref, `SELECT relname, relrowsecurity FROM pg_class WHERE relname = '${T}'`);
  console.log(`[${label}] relrowsecurity:`, JSON.stringify(rls));
  const fks = await mq(ref, `SELECT conname, confrelid::regclass AS ref FROM pg_constraint WHERE confrelid = '${T}'::regclass OR conrelid = '${T}'::regclass`);
  console.log(`[${label}] constraints/FKs:`, fks.map(x => `${x.conname}→${x.ref}`).join(', ') || '(ninguna)');
  const grants = await mq(ref, `SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name='${T}' AND grantee IN ('anon','authenticated','public')`);
  console.log(`[${label}] grants anon/authenticated/public:`, grants.map(x => `${x.grantee}:${x.privilege_type}`).join(', ') || '(ninguno)');
}

await census(ISOLATED_REF, 'AISLADA');
await census(PROD_REF, 'PROD (solo lectura)');
