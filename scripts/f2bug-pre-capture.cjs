#!/usr/bin/env node
/**
 * f2bug-pre-capture.cjs — REM-R2-F2BUG-FIX · PRE-captura (SELECT-only)
 *
 * Ciclo separado aprobado por el propietario: fix de 1 línea para F2-BUG
 * (42883 operator does not exist: transfer_status = text en get_transfers,
 * preexistente, documentado en 04_R2-REMEDIATION-EXECUTION.md §5).
 *
 * 1. Captura fresca LIVE de get_transfers (def + meta) + deps
 *    (has_store_access, is_admin) + enum transfer_status + tipo real de
 *    transfers.status vía Management API.
 * 2. Drift-check: get_transfers LIVE == congelado POST-R2
 *    (04_exec-consolidated.json → post_capture.funcs.get_transfers[0]).
 *    → Byte-igual esperado. Si hay drift: STOP (exit 5).
 * 3. Deps → /tmp/r2-dep/{is_admin,has_store_access}.sql (staging byte-exacto).
 * 4. Output → /home/z/my-project/scripts/f2bug-pre-live.json
 *
 * CERO escrituras en producción.
 */
const fs = require('fs');

const env = {};
for (const line of fs.readFileSync('/home/z/my-project/Costpro/.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const PROJECT_REF = env.NEXT_PUBLIC_SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)[1];
const TOKEN = env.SUPABASE_ACCESS_TOKEN;

console.log(`ALCANCE: PRODUCCIÓN LIVE ref=${PROJECT_REF} — SOLO SELECT (read-only)`);

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const t = await r.text();
  if (!r.ok) { console.error('QUERY FAILED:', r.status, t.slice(0, 400)); process.exit(4); }
  return JSON.parse(t);
}

const FN_SQL = (name, args) => `
  SELECT p.proname AS name,
    pg_get_functiondef(p.oid) AS def,
    array_to_string(p.proacl, ',') AS acl,
    p.prosecdef AS secdef,
    p.provolatile AS volatility,
    p.proconfig AS config,
    pg_get_userbyid(p.proowner) AS owner,
    p.proargnames AS argnames,
    pg_get_function_arguments(p.oid) AS args_full,
    pg_get_function_result(p.oid) AS rettype,
    p.pronargs AS nargs,
    to_regprocedure('${name}(${args})')::regprocedure::text AS signature
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = '${name}';`;

(async () => {
  // 1) get_transfers + deps
  const cap = { project_ref: PROJECT_REF, at: new Date().toISOString(), scope: 'F2-BUG PRE (SELECT-only)' };
  const gt = await q(FN_SQL('get_transfers', 'uuid,timestamptz,timestamptz,text,integer'));
  if (gt.length !== 1) { console.error('get_transfers: filas inesperadas', gt.length); process.exit(4); }
  cap.get_transfers = gt[0];

  cap.deps = {};
  for (const [name, args] of [['has_store_access', 'uuid'], ['is_admin', '']]) {
    const r = await q(FN_SQL(name, args));
    if (r.length !== 1) { console.error(`${name}: filas inesperadas`, r.length); process.exit(4); }
    cap.deps[name] = r[0];
  }

  // 2) tipo real de transfers.status + labels del enum
  const col = await q(`
    SELECT t.typname AS column_type, t.typtype AS kind, cn.nspname AS schema
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid AND c.relname = 'transfers'
    JOIN pg_namespace cn ON cn.oid = c.relnamespace AND cn.nspname = 'public'
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE a.attname = 'status' AND NOT a.attisdropped;`);
  cap.transfers_status_column = col;
  const enumName = col[0] && col[0].column_type;
  const labels = await q(`
    SELECT enumlabel FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = '${enumName}' AND t.typtype = 'e'
    ORDER BY enumsortorder;`);
  cap.transfer_status_labels = labels.map(x => x.enumlabel);
  console.log(`transfers.status → ${enumName} (kind=${col[0].kind}); labels=${JSON.stringify(cap.transfer_status_labels)}`);

  // 3) drift-check vs congelado POST-R2
  const frozen = JSON.parse(fs.readFileSync(
    '/home/z/my-project/Costpro/audit-evidence/R2-SECDEF-READ-SURFACE/04_exec-consolidated.json', 'utf8'));
  const fr = frozen.post_capture.funcs['get_transfers']['0'];
  // proconfig puede serializarse como literal text[] de PostgreSQL
  // ('{"search_path=public, pg_temp"}' — llaves, elemento con coma entrecomillado)
  // o como array JSON nativo (API actual). Normalizar ambos a array canónico.
  const normConfig = (c) => {
    if (Array.isArray(c)) return JSON.stringify(c);
    if (typeof c === 'string') {
      const s = c.trim();
      if (s.startsWith('[')) { try { const v = JSON.parse(s); if (Array.isArray(v)) return JSON.stringify(v); } catch {} }
      if (s.startsWith('{') && s.endsWith('}')) {
        const inner = s.slice(1, -1);
        const parts = inner.match(/"(?:[^"\\]|\\.)*"|[^,]+/g) || [];
        return JSON.stringify(parts.map(p => p.trim().replace(/^"|"$/g, '')));
      }
      return s;
    }
    return JSON.stringify(c);
  };
  const checks = {
    def_equal: cap.get_transfers.def.replace(/\s+$/, '') === fr.def.replace(/\s+$/, ''),
    acl_equal: cap.get_transfers.acl === fr.acl,
    secdef_equal: cap.get_transfers.secdef === fr.secdef,
    volatility_equal: cap.get_transfers.volatility === fr.volatility,
    config_equal: normConfig(cap.get_transfers.config) === normConfig(fr.config),
    owner_equal: cap.get_transfers.owner === fr.owner,
    args_full_equal: cap.get_transfers.args_full === fr.args_full,
    rettype_equal: cap.get_transfers.rettype === fr.rettype,
  };
  cap.drift_check = checks;
  console.log('DRIFT-CHECK vs congelado POST-R2:', JSON.stringify(checks, null, 1));
  if (Object.values(checks).some(v => !v)) {
    fs.writeFileSync('/home/z/my-project/scripts/f2bug-pre-live.json', JSON.stringify(cap, null, 1));
    console.error('STOP: drift detectado — el LIVE no coincide con el estado congelado POST-R2 (exit 5)');
    process.exit(5);
  }
  const guardProbe = ['has_store_access(p_store_id)', "auth.role() <> 'service_role'", '42501', 'ERR_UNAUTHORIZED_STORE'];
  cap.guard_present = guardProbe.map(p => ({ probe: p, present: cap.get_transfers.def.includes(p) }));
  if (cap.guard_present.some(g => !g.present)) {
    console.error('STOP: guard R2 NO presente en el cuerpo LIVE (exit 6)');
    process.exit(6);
  }

  // 4) deps para staging byte-exacto
  fs.mkdirSync('/tmp/r2-dep', { recursive: true });
  for (const [name, args] of [['has_store_access', 'uuid'], ['is_admin', '']]) {
    fs.writeFileSync(`/tmp/r2-dep/${name}.sql`, cap.deps[name].def.replace(/\r?\n$/, '') + '\n');
  }
  fs.writeFileSync('/home/z/my-project/scripts/f2bug-pre-live.json', JSON.stringify(cap, null, 1));
  console.log('OK: PRE capturado sin drift, guard R2 presente, deps staging escritas en /tmp/r2-dep/');
})().catch(e => { console.error('FATAL:', e); process.exit(2); });
