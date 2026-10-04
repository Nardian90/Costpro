/**
 * FASE H1 — §15 V1 RETIREMENT READINESS (gates para PR-R1)
 *
 * Estos checks son GATES: hoy deben FALLAR (V1 aún vivo). El implementador del
 * hardening NO puede cerrar el retiro de V1 mientras cualquier gate esté en FAIL.
 */
const { q, createSuite } = require('./lib.cjs');
const fs = require('fs');
const path = require('path');

const S = createSuite('V1 — Retirement readiness gates', '40-v1-retirement');
const REPO = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');

function walkSrc(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkSrc(p, acc);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) acc.push(p);
  }
  return acc;
}

(async () => {
  // GATE 1: ACL LIVE de V1 sin authenticated
  await S.test('T-V1-001', 'V1-GATE — ACL LIVE: create_sale SIN EXECUTE para authenticated',
    'proacl de create_sale sin authenticated=X ni anon=X ni PUBLIC',
    async () => {
      const rows = await q(`SELECT COALESCE(array_to_string(proacl,','),'') AS acl FROM pg_proc p
        JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_sale';`);
      const acl = rows[0].acl;
      const bad = /authenticated=X/.test(acl) || /anon=X/.test(acl) || /=X/.test(acl);
      return {
        status: bad ? 'FAIL' : 'PASS',
        current: `ACL LIVE V1 = {${acl}}`,
        evidence: 'V1 sigue ejecutable por authenticated: prerequisiteio de DROP no cumplido',
      };
    });

  // GATE 2: callers de producción = 0
  await S.test('T-V1-002', 'V1-GATE — callers de producción de create_sale = 0',
    '0 referencias ejecutables a rpc create_sale / rpcName=create_sale en src (excluye tests)',
    async () => {
      const files = walkSrc(path.join(REPO, 'src'));
      const callers = [];
      for (const f of files) {
        const s = fs.readFileSync(f, 'utf8');
        if (/rpc\(\s*['"`]create_sale['"`]/.test(s) || /rpcName\s*=\s*['"]create_sale['"]/.test(s)) {
          callers.push(path.relative(REPO, f));
        }
      }
      return {
        status: callers.length === 0 ? 'PASS' : 'FAIL',
        current: `callers=${callers.length}: ${callers.join(', ')}`,
        evidence: 'useTransactions.ts mantiene rpcName=create_sale (registro V1 permitido por el contract test actual) y usePOSCheckout.ts conserva el else-branch V1 — el censo debe llegar a 0',
      };
    });

  // GATE 3: USE_V2_CHECKOUT=false references = 0
  await S.test('T-V1-003', 'V1-GATE — referencias a fallback USE_V2_CHECKOUT=false = 0',
    'ni features.ts ni hooks conservan el camino V1 (flag, else-branch, pilot stores)',
    async () => {
      const feats = read('src/config/features.ts');
      const hook = read('src/components/views/terminal/views/pos/usePOSCheckout.ts');
      const flagExists = /USE_V2_CHECKOUT/.test(feats);
      const v1Path = /Path v1|createSale\(/.test(hook);
      const refs = [];
      if (flagExists) refs.push('src/config/features.ts (flag)');
      if (v1Path) refs.push('usePOSCheckout.ts (path v1)');
      return {
        status: refs.length === 0 ? 'PASS' : 'FAIL',
        current: `refs=${refs.join(' · ')}`,
        evidence: 'el mecanismo de fallback V1 sigue presente: cualquier despliegue con NEXT_PUBLIC_USE_V2_CHECKOUT=false reactiva V1',
      };
    });

  // GATE 4: tests legacy V1 = 0
  await S.test('T-V1-004', 'V1-GATE — tests legacy de V1 = 0',
    'ningún test de integración/unidad depende de create_sale V1',
    async () => {
      const testFiles = [];
      const dirs = ['src/__tests__', 'src/lib/__tests__'];
      for (const d of dirs) {
        const full = path.join(REPO, d);
        if (!fs.existsSync(full)) continue;
        for (const f of fs.readdirSync(full)) {
          if (!/\.test\.(ts|tsx)$/.test(f)) continue;
          const s = fs.readFileSync(path.join(full, f), 'utf8');
          if (/rpc\(\s*['"`]create_sale['"`]|create_sale\(/.test(s) && !/create_sale_v2/.test(s)) {
            testFiles.push(`${d}/${f}`);
          } else if (/useTransactions|createSale/.test(s) && /create_sale(?!_v2)/.test(s)) {
            testFiles.push(`${d}/${f} (referencia)`);
          }
        }
      }
      return {
        status: testFiles.length === 0 ? 'PASS' : 'FAIL',
        current: `tests legacy=${testFiles.length}: ${testFiles.join(', ')}`,
        evidence: 'iteration-11-1.test.ts / iteration-11-2.test.ts ejercitan V1: deben migrarse o eliminarse con V1',
      };
    });

  // GATE 5: allow-list del contract test prohíbe V1
  await S.test('T-V1-005', 'V1-GATE — contract allow-list de V2-ONLY prohíbe V1',
    'v2-only-contract-test.cjs con allow-list VACÍA (allowedV1Checkout = [])',
    async () => {
      const s = read('scripts/v2-only-contract-test.cjs');
      const allowsV1 = /allowedV1Checkout\s*=\s*\[[^\]]*useTransactions[^\]]*\]/.test(s);
      const requiresPresence = /useTransactions mantiene rpc create_sale/.test(s);
      return {
        status: !allowsV1 && !requiresPresence ? 'PASS' : 'FAIL',
        current: `allow-list con useTransactions=${allowsV1} · exige presencia V1=${requiresPresence}`,
        evidence: 'el contract test actual PERMITE (e incluso exige) el caller V1 — debe invertirse a prohibición total',
      };
    });

  // GATE 6: E2E usa V2
  await S.test('T-V1-006', 'V1-GATE — E2E de checkout usa exclusivamente V2',
    'specs E2E de venta no dependen de V1 ni del flag',
    async () => {
      const e2eDir = path.join(REPO, 'e2e');
      const offenders = [];
      for (const f of fs.readdirSync(e2eDir)) {
        if (!/\.spec\.ts$/.test(f)) continue;
        const s = fs.readFileSync(path.join(e2eDir, f), 'utf8');
        if (/USE_V2_CHECKOUT|create_sale(?!_v2)/.test(s)) offenders.push(f);
      }
      return {
        status: offenders.length === 0 ? 'PASS' : 'FAIL',
        current: `specs con dependencia V1/flag=${offenders.length}: ${offenders.join(', ') || 'ninguno'}`,
        evidence: 'requisito: los E2E de venta deben hablar solo con /api/pos/checkout (V2)',
      };
    });

  // GATE 7: reconciler ACL no resucita V1
  await S.test('T-V1-007', 'V1-GATE — reconcilers/migraciones no resucitan grants de V1',
    'ningún archivo post-retiro hace GRANT EXECUTE sobre create_sale (V1)',
    async () => {
      const migDir = path.join(REPO, 'supabase', 'migrations');
      const offenders = [];
      for (const f of fs.readdirSync(migDir)) {
        if (!f.endsWith('.sql')) continue;
        const s = fs.readFileSync(path.join(migDir, f), 'utf8');
        const grantsV1 = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.create_sale\s*\(/i.test(s)
          || /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.create_sale(?!\w)/i.test(s);
        if (grantsV1) offenders.push(f);
      }
      // NOTA: pre-retiro estos grants son históricos; el gate se activa al DROP.
      return {
        status: offenders.length === 0 ? 'PASS' : 'FAIL',
        current: `migraciones con GRANT V1=${offenders.length}: ${offenders.join(', ') || 'ninguna'}`,
        evidence: offenders.length
          ? 'existen grants históricos de V1 en migraciones: al ejecutar el DROP (PR-R1) ninguna migración posterior puede re-grantear; el reconciler F4 (20260927000002) ya demostró el patrón de resurrección con PUBLIC→V2'
          : 'sin resurrección de grants V1 en migraciones',
      };
    });

  // GATE 8: V1 removable (dependencias DB)
  await S.test('T-V1-008', 'V1-GATE — create_sale es removible (sin dependientes DB)',
    '0 objetos DB dependen de create_sale (pg_depend) y 0 llamadas internas desde otras funciones',
    async () => {
      const deps = await q(`SELECT count(*) AS c FROM pg_depend d
        JOIN pg_proc p ON p.oid = d.objid
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='create_sale' AND d.deptype != 'n';`);
      const callers = await q(`SELECT count(*) AS c FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname <> 'create_sale'
          AND position('create_sale(' in pg_get_functiondef(p.oid)) > 0
          AND position('create_sale_v2' in pg_get_functiondef(p.oid)) = 0;`);
      return {
        status: Number(deps[0].c) === 0 && Number(callers[0].c) === 0 ? 'PASS' : 'FAIL',
        current: `pg_depend no-n=${deps[0].c} · funciones llamantes=${callers[0].c}`,
        evidence: 'verificación de removabilidad (DROP sin cascada)',
      };
    });

  S.finish();
})().catch(e => { console.error('❌ suite V1:', e); process.exit(1); });
