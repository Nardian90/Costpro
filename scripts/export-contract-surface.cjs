/**
 * export-contract-surface.cjs — REM-INV-5: LIVE contract-surface snapshot generator.
 *
 * IMPORTANT: requires SUPABASE_ACCESS_TOKEN (production credential). NEVER run in CI.
 * Run manually (or in a credentialed audit session) to re-certify the contract surface:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ACCESS_TOKEN=<pat> \
 *     node scripts/export-contract-surface.cjs
 *
 * Writes supabase/security-contract/contract-surface.sql containing the VERBATIM
 * pg_get_functiondef() of every SECURITY DEFINER write function in public (the exact
 * surface that scripts/security-contract-test.cjs checks against LIVE), each preceded
 * by a machine-readable proacl comment. scripts/security-contract-test-static.cjs
 * replays this snapshot in CI (no secrets) — Layer A of the static contract.
 */
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
if (!SUPABASE_URL || !ACCESS_TOKEN) {
  console.error('❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_ACCESS_TOKEN (nunca ejecutar en CI)');
  process.exit(2);
}
const projectRef = SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)[1];

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const t = await r.text();
  if (!r.ok) { console.error('QUERY FAILED:', r.status, t.slice(0, 300)); process.exit(4); }
  return JSON.parse(t);
}

(async () => {
  const rows = await q(`
    SELECT
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS args,
      pg_get_functiondef(p.oid) AS def,
      COALESCE(p.proacl, ARRAY[]::aclitem[]) AS acl,
      pg_get_userbyid(p.proowner) AS owner
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) ~ '(INSERT|UPDATE|DELETE)\\s+(INTO|public\\.)'
    ORDER BY p.proname;
  `);
  if (!Array.isArray(rows) || rows.length === 0) { console.error('census empty — aborting'); process.exit(4); }

  // dedupe (Management API occasionally duplicates rows)
  const seen = new Set();
  const fns = [];
  for (const r of rows) {
    const k = `${r.function_name}|${r.args}`;
    if (seen.has(k)) continue;
    seen.add(k); fns.push(r);
  }

  const header = `-- =====================================================================
-- GENERATED FILE — DO NOT EDIT BY HAND
-- Generator : scripts/export-contract-surface.cjs
-- Captured  : ${new Date().toISOString()}
-- Project   : ${projectRef}
-- Functions : ${fns.length} (SECURITY DEFINER write functions, public schema)
-- Source    : same census query as scripts/security-contract-test.cjs (LIVE)
-- =====================================================================
-- scripts/security-contract-test-static.cjs (CI, no secrets) replays this
-- snapshot as Layer A of the security contract. Re-run the generator to
-- re-certify after authorized production changes.
-- =====================================================================
`;

  const blocks = fns.map((f) => {
    // proacl: the Management API serializes aclitem[] as a PG array literal
    // STRING ("{postgres=X/postgres,...}") — keep it verbatim (REM-INV-6: the
    // legacy JSON-array coercion always produced [] and inert ACL checks).
    const aclRaw = Array.isArray(f.acl) ? JSON.stringify(f.acl) : String(f.acl || '{}');
    return `-- @contract-function name=${f.function_name} args="${(f.args || '').replace(/"/g, "'")}" owner=${f.owner || 'postgres'} proacl=${aclRaw.includes(' ') && !aclRaw.startsWith('{') ? JSON.stringify(aclRaw) : aclRaw}\n${f.def}\n`;
  });

  const out = header + blocks.join('\n');
  const dir = path.join(__dirname, '..', 'supabase', 'security-contract');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'contract-surface.sql');
  fs.writeFileSync(file, out);
  const sha = require('crypto').createHash('sha256').update(out).digest('hex');
  console.log(`✅ contract-surface.sql written: ${fns.length} functions, sha256=${sha}`);
})();
