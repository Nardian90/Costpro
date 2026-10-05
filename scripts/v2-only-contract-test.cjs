/**
 * V2-ONLY CONTRACT TEST (FINALIZE-V2 — estático, sin credenciales live)
 *
 * Estado FINAL: V1 fue físicamente eliminado de la base (migración
 * 20261005140000_drop_v1_sale_devolution.sql) y del código. Este guard
 * detecta cualquier resurrección:
 *
 *   1. Re-CREATE de `reverse_transaction` V1 en migraciones post-retiro (H5-B1).
 *   2. Re-CREATE de `create_sale` / `create_devolution` / `fn_process_sale` /
 *      `fn_process_receipt` / `reverse_adjustment` V1 en migraciones
 *      posteriores al drop FINALIZE-V2.
 *   3. Mapa único RPC_MAP en /api/reverse (sin RPC_MAP_V1/V2 ni FEATURES).
 *   4. CERO callers de create_sale/create_devolution V1 en src/.
 *   5. /api/pos/checkout y usePOSCheckout sin flag (V2 único camino online).
 *   6. /api/devolutions siempre create_devolution_v2 con idempotencia.
 *   7. sync offline usa create_sale_v2 (nunca V1).
 *
 * Exit codes: 0 = PASS · 1 = violación de contrato V2-only
 * Uso: node scripts/v2-only-contract-test.cjs
 */
const fs = require('fs');
const path = require('path');

let failures = 0;
function check(name, ok, detail) {
  const tag = ok ? '✅' : '❌';
  console.log(`${tag} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

function read(p) { return fs.readFileSync(path.join(__dirname, '..', p), 'utf8'); }

// 1) V1 reverse_transaction no debe recrearse en migraciones POSTERIORES al drop H5-B1
const DROP_TS = '20260903030000'; // w9_h5b1_retire_reverse_transaction_v1
const migDir = path.join(__dirname, '..', 'supabase', 'migrations');
const offenders = fs.readdirSync(migDir)
  .filter(f => f.endsWith('.sql') && f.slice(0, 14) > DROP_TS) // solo post-retiro
  .map(f => {
    const src = fs.readFileSync(path.join(migDir, f), 'utf8');
    return /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.reverse_transaction\s*\(/i.test(src) && !/reverse_transaction_v2/i.test(src) ? f : null;
  })
  .filter(Boolean);
check('no re-CREATE de reverse_transaction V1 en migraciones post-retiro (H5-B1)', offenders.length === 0,
  offenders.length ? offenders.join(', ') : 'drop H5-B1 intacto');

// 2) FINALIZE-V2: ninguna migración posterior al drop puede re-CREATE las V1
const FINALIZE_TS = '20261005140000'; // drop_v1_sale_devolution
const V1_NAMES = ['create_sale', 'create_devolution', 'fn_process_sale', 'fn_process_receipt', 'reverse_adjustment'];
const v1Recreators = fs.readdirSync(migDir)
  .filter(f => f.endsWith('.sql') && f.slice(0, 14) > FINALIZE_TS)
  .map(f => {
    const src = fs.readFileSync(path.join(migDir, f), 'utf8');
    const hits = V1_NAMES.filter(n =>
      new RegExp(`CREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${n}\\s*\\(`, 'i').test(src));
    return hits.length ? `${f}: ${hits.join(',')}` : null;
  })
  .filter(Boolean);
check('no re-CREATE de funciones V1 (create_sale/devolution/fn_process_*/reverse_adjustment) post-FINALIZE-V2',
  v1Recreators.length === 0, v1Recreators.length ? v1Recreators.join(' | ') : 'superficie V1 muerta');

// 3) Mapa único en /api/reverse (V1/V2 colapsados, sin flag)
const reverseRoute = read('src/app/api/reverse/route.ts');
const m = reverseRoute.match(/RPC_MAP[^=]*=\s*\{[\s\S]*?\n\};/);
check('mapa único RPC_MAP existe en /api/reverse', !!m && /const RPC_MAP:/.test(reverseRoute));
check('RPC_MAP_V1 y RPC_MAP_V2 eliminados', !/const RPC_MAP_V1/.test(reverseRoute) && !/const RPC_MAP_V2/.test(reverseRoute));
if (m) {
  check('RPC_MAP.transaction resuelve a reverse_transaction_v2 (H5-B1)',
    /transaction:\s*\{\s*rpc:\s*'reverse_transaction_v2'/.test(m[0]));
  check('RPC_MAP.receipt resuelve a reverse_receipt_v2 (REM-V2-3)',
    /receipt:\s*\{\s*rpc:\s*'reverse_receipt_v2'/.test(m[0]));
  check('RPC_MAP.adjustment resuelve a reverse_inventory_adjustment_v2 (REM-V2-3)',
    /adjustment:\s*\{\s*rpc:\s*'reverse_inventory_adjustment_v2'/.test(m[0]));
  check('ningún entry del mapa resuelve a reverse_receipt V1',
    !/rpc:\s*'reverse_receipt'/.test(m[0]));
  check('ningún entry del mapa resuelve a reverse_adjustment V1',
    !/rpc:\s*'reverse_adjustment'/.test(m[0]));
}
check('/api/reverse sin FEATURES (flag eliminado)',
  !/import\('@\/config\/features'\)/.test(reverseRoute) && !/FEATURES\./.test(reverseRoute));

// 4) CERO callers V1 de create_sale/create_devolution en src/
const walk = (dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test)\./.test(e.name)) acc.push(p);
  }
  return acc;
};
const srcRoot = path.join(__dirname, '..', 'src');
const v1Callers = walk(srcRoot).filter(f => {
  const s = fs.readFileSync(f, 'utf8');
  return /rpc\(\s*'create_sale'/.test(s) || /rpcName = 'create_sale'/.test(s)
      || /rpc\(\s*'create_devolution'/.test(s);
}).map(f => path.relative(path.join(__dirname, '..'), f));
check('cero callers de create_sale/create_devolution V1 en src/', v1Callers.length === 0,
  v1Callers.length ? 'RESUCITADOS (revisar): ' + v1Callers.join(', ') : 'superficie V1 sin callers');

// 4.b) FINALIZE-V2: flags eliminados del producto
check('src/config/features.ts eliminado (sin flags de migración)',
  !fs.existsSync(path.join(__dirname, '..', 'src', 'config', 'features.ts')));

// 5) POS checkout online siempre V2 (sin flag, sin path V1)
const posCheckoutHook = read('src/components/views/terminal/views/pos/usePOSCheckout.ts');
check('usePOSCheckout usa siempre /api/pos/checkout (sin shouldUseV2Checkout ni createSale)',
  /fetch\('\/api\/pos\/checkout'/.test(posCheckoutHook)
  && !/shouldUseV2Checkout/.test(posCheckoutHook)
  && !/await createSale\(/.test(posCheckoutHook));
const useTx = read('src/hooks/api/useTransactions.ts');
check('useCreateSale sin RPC V1 online (solo enqueue offline)',
  !/rpcName = 'create_sale'/.test(useTx));

// 6) /api/devolutions camino único
const devRoute = read('src/app/api/devolutions/route.ts');
check('/api/devolutions siempre create_devolution_v2 (sin flag ni fallback V1)',
  /rpc\('create_devolution_v2'/.test(devRoute)
  && !/FEATURES\./.test(devRoute)
  && !/'create_devolution'/.test(devRoute.replace(/create_devolution_v2/g, '')));

// 7) sync offline usa create_sale_v2 (nunca V1)
const syncBatch = read('src/app/api/sync/batch/route.ts');
check('sync offline usa create_sale_v2 (nunca V1)', /create_sale_v2/.test(syncBatch) && !/rpc\('create_sale'/.test(syncBatch));

// 8) REM-V2-1 P-2/P-3 — callers migrados (intactos tras FINALIZE-V2)
const useSalesCatalogSrc = read('src/components/views/terminal/views/pos/useSalesCatalog.ts');
check('useSalesCatalog despacha online a /api/pos/checkout (P-2, path V2 canónico)',
  /fetch\('\/api\/pos\/checkout'/.test(useSalesCatalogSrc));
const docActionsSrc = read('src/hooks/api/useDocumentActions.ts');
check('useInvertDocument ya NO invoca rpc perform_inventory_adjustment (P-3, composite cliente retirado)',
  !/rpc\(\s*'perform_inventory_adjustment'/.test(docActionsSrc));
check('useInvertDocument despacha recepciones a /api/reverse (P-3, boundary B-10)',
  /apiFetch\('\/api\/reverse'/.test(docActionsSrc));

console.log('─'.repeat(60));
if (failures > 0) { console.log(`❌ V2-ONLY CONTRACT: ${failures} violación(es)`); process.exit(1); }
console.log('✅ V2-ONLY CONTRACT: PASS (FINALIZE-V2 — V1 eliminado, V2 único camino)');
