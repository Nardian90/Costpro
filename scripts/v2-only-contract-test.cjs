/**
 * V2-ONLY CONTRACT TEST (REM-V2-1 — FASE 14, estático, sin credenciales live)
 *
 * Detecta:
 *   1. Resurrección de `reverse_transaction` V1 en migraciones (fue DROP con guard H5-B1).
 *   2. Que `RPC_MAP_V1.transaction` siga resolviendo a `reverse_transaction_v2`
 *      (fallback neutralizado, patrón H5-B1).
 *   3. Nuevas llamadas cliente a RPCs V1 de checkout fuera del registro permitido
 *      (allow-list de callers V1 conocidos en el baseline 34f50a55).
 *   4. Que las rutas API que seleccionan RPC por flag sigan gated por FEATURES.USE_V2_*.
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

// 2) RPC_MAP_V1.transaction → reverse_transaction_v2 (fallback neutralizado)
const reverseRoute = read('src/app/api/reverse/route.ts');
const m = reverseRoute.match(/RPC_MAP_V1[^=]*=\s*\{[\s\S]*?\n\};/);
check('RPC_MAP_V1 existe en /api/reverse', !!m);
if (m) {
  check('RPC_MAP_V1.transaction resuelve a reverse_transaction_v2 (H5-B1)',
    /transaction:\s*\{\s*rpc:\s*'reverse_transaction_v2'/.test(m[0]));
}

// 3) Registro permitido de callers V1 de checkout (baseline 34f50a55)
const allowedV1Checkout = ['src/hooks/api/useTransactions.ts'];
const srcUseTx = read('src/hooks/api/useTransactions.ts');
check('useTransactions mantiene rpc create_sale (registro V1 permitido)', /rpcName = 'create_sale'/.test(srcUseTx));

const posCheckoutHook = read('src/components/views/terminal/views/pos/usePOSCheckout.ts');
check('POS principal usa shouldUseV2Checkout (V2 gated)', /shouldUseV2Checkout\(user\.activeStoreId\)/.test(posCheckoutHook));

const syncBatch = read('src/app/api/sync/batch/route.ts');
check('sync offline usa create_sale_v2 (nunca V1)', /create_sale_v2/.test(syncBatch) && !/rpc\('create_sale'/.test(syncBatch));

// Client-side directo a create_sale fuera del allow-list:
const walk = (dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test)\./.test(e.name)) acc.push(p);
  }
  return acc;
};
const srcRoot = path.join(__dirname, '..', 'src');
const v1CheckoutCallers = walk(srcRoot).filter(f => {
  const s = fs.readFileSync(f, 'utf8');
  return /rpc\(\s*'create_sale'/.test(s) || /rpcName = 'create_sale'/.test(s);
}).map(f => path.relative(path.join(__dirname, '..'), f));
const unexpected = v1CheckoutCallers.filter(f => !allowedV1Checkout.includes(f.replace(/\\/g, '/')));
check('callers de create_sale = allow-list', unexpected.length === 0,
  unexpected.length ? 'NUEVOS (revisar): ' + unexpected.join(', ') : v1CheckoutCallers.join(', '));

// 4) Rutas gated por flag
const devRoute = read('src/app/api/devolutions/route.ts');
check('/api/devolutions selecciona RPC por FEATURES.USE_V2_REVERSE',
  /FEATURES\.USE_V2_REVERSE\s*\?\s*'create_devolution_v2'\s*:\s*'create_devolution'/.test(devRoute));
check('/api/reverse selecciona mapa por FEATURES.USE_V2_REVERSE',
  /FEATURES\.USE_V2_REVERSE\s*\?\s*RPC_MAP_V2\s*:\s*RPC_MAP_V1/.test(reverseRoute));

console.log('─'.repeat(60));
if (failures > 0) { console.log(`❌ V2-ONLY CONTRACT: ${failures} violación(es)`); process.exit(1); }
console.log('✅ V2-ONLY CONTRACT: PASS (baseline REM-V2-1 consistente)');
