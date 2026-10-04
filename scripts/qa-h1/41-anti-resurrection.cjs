/**
 * FASE H1 — §16 ANTI-RESURRECTION TESTS
 *
 * Fallan si reaparece: create_sale( como caller legítimo, USE_V2_CHECKOUT=false
 * o equivalente, grants peligrosos PUBLIC/anon → create_sale_v2, restauración
 * de grants V1 en migraciones/reconciliadores/scripts/tests/seeds/CI.
 */
const { q, createSuite } = require('./lib.cjs');
const fs = require('fs');
const path = require('path');

const S = createSuite('AR — Anti-resurrección', '41-anti-resurrection');
const REPO = path.join(__dirname, '..', '..');

function walk(dir, acc = [], filter = /\.(ts|tsx|cjs|mjs|js|sql|yml|yaml|json|sh)$/) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && !['node_modules', '.next', '.git', 'audit-evidence', 'download'].includes(e.name)) walk(p, acc, filter);
    else if (filter.test(e.name)) acc.push(p);
  }
  return acc;
}

(async () => {
  // AR-1: callers legítimos de create_sale(
  await S.test('T-AR-001', 'AR — ningún caller legítimo de create_sale( en producción',
    '0 archivos de PRODUCCIÓN (src + scripts activos, excluye tests) llaman a V1',
    async () => {
      const files = [...walk(path.join(REPO, 'src')), ...walk(path.join(REPO, 'scripts'), [], /\.(cjs|mjs|ts|js)$/)];
      const offenders = [];
      for (const f of files) {
        if (f.includes('qa-h1') || f.includes('v2-only-contract-test') || f.includes('test_live_e2e')) continue;
        if (/\.test\.|\.spec\./.test(f)) continue; // tests legacy: cubiertos por T-V1-004
        const s = fs.readFileSync(f, 'utf8');
        // llamada ejecutable real (no comentario ni mención documental)
        const lines = s.split('\n').filter(l => /rpc\(\s*['"`]create_sale['"`]|rpcName\s*=\s*['"]create_sale['"]/.test(l));
        if (lines.length) offenders.push(`${path.relative(REPO, f)} (${lines.length} línea(s))`);
      }
      return {
        status: offenders.length === 0 ? 'PASS' : 'FAIL',
        current: offenders.join(' · ') || '0 callers',
        evidence: 'censo de callers V1 en código de producción',
      };
    });

  // AR-2: USE_V2_CHECKOUT=false o equivalente
  await S.test('T-AR-002', 'AR — sin mecanismo de fallback V1 (USE_V2_CHECKOUT=false o equivalente)',
    '0 ocurrencias del flag de fallback en src/.env.example/CI',
    async () => {
      const targets = [
        'src/config/features.ts',
        '.env.example',
        '.github/workflows/ci.yml',
      ];
      const found = [];
      for (const t of targets) {
        const full = path.join(REPO, t);
        if (!fs.existsSync(full)) continue;
        if (/USE_V2_CHECKOUT/.test(fs.readFileSync(full, 'utf8'))) found.push(t);
      }
      // pilot stores = mecanismo equivalente de reactivación parcial
      const pilot = fs.existsSync(path.join(REPO, 'src/config/features.ts'))
        && /V2_CHECKOUT_PILOT_STORES/.test(fs.readFileSync(path.join(REPO, 'src/config/features.ts'), 'utf8'));
      return {
        status: found.length === 0 && !pilot ? 'PASS' : 'FAIL',
        current: `refs=${found.join(', ')} · pilot-mechanism=${pilot}`,
        evidence: 'el flag y su mecanismo piloto permiten reactivar V1 por configuración: deben eliminarse con el retiro',
      };
    });

  // AR-3: grants peligrosos sobre create_sale_v2 en migraciones
  await S.test('T-AR-003', 'AR — migraciones sin GRANT PUBLIC/anon → create_sale_v2',
    '0 migraciones con GRANT EXECUTE ... TO PUBLIC/anon sobre create_sale_v2',
    async () => {
      const migDir = path.join(REPO, 'supabase', 'migrations');
      const offenders = [];
      for (const f of fs.readdirSync(migDir)) {
        if (!f.endsWith('.sql')) continue;
        const s = fs.readFileSync(path.join(migDir, f), 'utf8');
        // una migración = un statement: basta co-presencia de grant V2 + TO PUBLIC/anon
        const grantsV2 = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.create_sale_v2/i.test(s);
        const toPublic = /TO\s+PUBLIC\b/i.test(s);
        const toAnon = /TO\s+anon\b/i.test(s);
        if (grantsV2 && (toPublic || toAnon)) offenders.push(f);
      }
      return {
        status: offenders.length === 0 ? 'PASS' : 'FAIL',
        current: offenders.join(', ') || '0 migraciones',
        evidence: offenders.length
          ? `${offenders.join(', ')}: RE-GRANTEAN PUBLIC→create_sale_v2 (patrón canónico F4). El reconciler de ACL es el mecanismo de resurrección del grant peligroso — debe reescribirse a REVOKE en el hardening`
          : 'sin grants peligrosos',
      };
    });

  // AR-4: LIVE DB sin grants peligrosos en V2
  await S.test('T-AR-004', 'AR — LIVE: create_sale_v2 sin EXECUTE para PUBLIC/anon (post-hardening gate)',
    'proacl LIVE sin =X ni anon=X (idem T-H1-002, gate de regresión)',
    async () => {
      const rows = await q(`SELECT COALESCE(array_to_string(proacl,','),'') AS acl FROM pg_proc p
        JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_sale_v2';`);
      const acl = rows[0].acl;
      return {
        status: (!/=X/.test(acl) && !/anon=X/.test(acl)) ? 'PASS' : 'FAIL',
        current: `ACL LIVE={${acl}}`,
        evidence: 'estado LIVE del grant (debe permanecer sin PUBLIC/anon tras el hardening)',
      };
    });

  // AR-5: reconciler no restaura V1 (futuro) — census histórico
  await S.test('T-AR-005', 'AR — census de restauración de grants V1 en scripts/tests/seeds/CI',
    '0 archivos (excluye migraciones históricas pre-drop) con GRANT V1',
    async () => {
      const dirs = ['scripts', 'supabase/security-contract', '.github/workflows', 'db', 'data'];
      const offenders = [];
      for (const d of dirs) {
        for (const f of walk(path.join(REPO, d), [], /\.(cjs|mjs|js|sql|yml|yaml|sh|ts)$/)) {
          if (f.includes('qa-h1')) continue;
          const s = fs.readFileSync(f, 'utf8');
          if (/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.create_sale(?!\w|_v2)/i.test(s)) {
            offenders.push(path.relative(REPO, f));
          }
        }
      }
      return {
        status: offenders.length === 0 ? 'PASS' : 'FAIL',
        current: offenders.join(', ') || '0 archivos',
        evidence: 'los reconcilers de ACL (patrón rem_inv_6 / F4) son el vector de resurrección: el PR-R1 debe auditarlos',
      };
    });

  // AR-6: security-contract.sql no canoniza PUBLIC en V2
  await S.test('T-AR-006', 'AR — contract-surface no canoniza PUBLIC→create_sale_v2',
    'supabase/security-contract/contract-surface.sql sin GRANT PUBLIC a create_sale_v2',
    async () => {
      const p = path.join(REPO, 'supabase/security-contract/contract-surface.sql');
      if (!fs.existsSync(p)) return { status: 'PASS', current: 'archivo ausente', evidence: 'sin superficie de contrato' };
      const s = fs.readFileSync(p, 'utf8');
      const grants = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.create_sale_v2[\s\S]{0,200}?TO\s+PUBLIC/i.test(s);
      return {
        status: grants ? 'FAIL' : 'PASS',
        current: `GRANT PUBLIC en contract-surface=${grants}`,
        evidence: 'la superficie de contrato certificada es lo que un replay limpio reproducirá: no debe contener el grant peligroso',
      };
    });

  S.finish();
})().catch(e => { console.error('❌ suite AR:', e); process.exit(1); });
