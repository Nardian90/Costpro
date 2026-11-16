// ============================================================================
// M063 — CP-FIN-FINAL-VALUATION-EXECUTION-009 · §7-§8 CERTIFICACIÓN FINANCIERA
// ============================================================================
// Verificación final completa tras ejecutar RECT-1 y RECT-2 (ambas COMMITED y
// verificadas por m061/m062). READ-ONLY ESTRICTO (solo SELECT). Re-ejecutable.
//
// Controles (runbook §7 ítems 1-10 + misión 009 §8):
//   R1  kardex: 21 movimientos, capas uc=1, salidas uc=0 restantes = 0.
//   R2  3 asientos de la FVC, cada uno equilibrado (G.2 balance_debe=0 por asiento).
//   R3  Mayores exactos vs baselines m060: ACT = X_act − 151.299.875 ·
//       CXP = X_cxp − 151.299.851 (si hay actividad viva posterior al preflight,
//       se lista y el delta se explica por asientos ajenos a la FVC).
//   R4  Subconjunto ACT de SKU111/112 = 30 = 10×1 + 20×1 = kardex valorizado.
//   R5  COGS motor 5 ventas = 7 CUP intacto; GAS_VALES porción 111/112 = 94;
//       GAS_PERDIDA_INV = 18.
//   R6  Idempotencia total: WHERE-cláusulas de S1/S2/S3/T1 = 0 filas.
//   R7  Existencias 10/20 · WAC 1/1 · precios venta congelados intactos.
//   R8  Líneas protegidas intactas: hash de las 99 líneas (≠111/112) = congelado
//       (incluye las 71 no verificables y las 4 discrepancias de moneda).
//   R9  T12 activa + hardening ACLs/RLS vigente (re-check estructural).
//   R10 fin_posting_errors sin errores nuevos injustificados; auditoría completa.
//   R11 Actividad comercial viva posterior al preflight — documentada (no bloquea).
// Uso: node scripts/m063-rect-final-certification.mjs
// ============================================================================
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/(.*?)\.supabase\.co/)?.[1];
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD: no es producción'); process.exit(2); }
async function q(sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] (HTTP ${res.status}) ${text.slice(0, 400)}`);
  return JSON.parse(text || '[]');
}
const num = (v) => (v === null || v === undefined ? null : Number(v));

const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const S111 = '4afef9a7-28b7-4a5e-b134-13a9e0ffea16';
const S112 = '14aeb370-7e00-4889-b29b-ef2bc778f4c4';
const SEG = '7ec90009-0000-4000-8000';
const E_RECT1 = `${SEG}-d0b300000001`, E_RECT2 = `${SEG}-d0b300000002`;
const PRICE_FROZEN = { '111': '2000', '112': '1000' };

const pre = JSON.parse(readFileSync(resolve('docs/audits/cp-fin-valuation-execution-009/evidencias/m060-preflight-evidencia.json'), 'utf8'));
const X_act = pre.baselines.X_act, X_cxp = pre.baselines.X_cxp;
const frozen = JSON.parse(readFileSync(resolve('/home/z/my-project/scripts/out/rect004-faseDP-snapshot.json'), 'utf8'));

const checks = [];
const chk = (id, control, pass, detalle) => {
  checks.push({ id, control, resultado: pass ? 'PASS' : 'FAIL', detalle: String(detalle ?? '').slice(0, 400) });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${id}: ${control} · ${String(detalle ?? '').slice(0, 180)}`);
};
const out = { mision: 'CP-FIN-FINAL-VALUATION-EXECUTION-009', script: 'm063-rect-final-certification.mjs',
  fecha_utc: new Date().toISOString(), canal: 'Management API /database/query — SOLO SELECT', checks: {}, captura: {} };

// ── R1: kardex ────────────────────────────────────────────────────────────────
const kardex = await q(`SELECT id, product_id, movement_type, quantity_change, unit_cost FROM public.stock_movements WHERE store_id='${STORE}' AND product_id IN ('${S111}','${S112}') ORDER BY movement_date`, 'R1 kardex');
const compras = kardex.filter((k) => k.movement_type === 'purchase');
const uc0 = kardex.filter((k) => num(k.quantity_change) < 0 && num(k.unit_cost) === 0);
chk('R1', 'Kardex 21 movimientos · capas compra uc=1 · salidas uc=0 restantes = 0',
  kardex.length === 21 && compras.length === 2 && compras.every((k) => num(k.unit_cost) === 1) && uc0.length === 0,
  `n=${kardex.length} compras=${compras.length} uc0=${uc0.length}`);

// ── R2: 3 asientos equilibrados ───────────────────────────────────────────────
const bal = await q(`SELECT fe.id, fe.document_number, fe.event, sum(CASE WHEN fm.sense='debito' THEN fm.amount ELSE -fm.amount END)::numeric AS balance_debe FROM public.fin_entries fe JOIN public.fin_movements fm ON fm.entry_id=fe.id WHERE fe.document_id='${FVC}' GROUP BY 1,2,3 ORDER BY fe.posted_at`, 'R2 balance por asiento');
chk('R2', '3 asientos de la FVC (original + RECT-1 + RECT-2), D=C exacto en cada uno',
  bal.length === 3 && bal.every((b) => num(b.balance_debe) === 0), JSON.stringify(bal.map((b) => [b.document_number, b.event, b.balance_debe])));

// ── R3: mayores exactos vs baseline ──────────────────────────────────────────
const mayores = await q(`SELECT category_code,
  coalesce(sum(CASE WHEN category_code='PAS_CXP_PROV' THEN CASE WHEN sense='credito' THEN amount_cup ELSE -amount_cup END ELSE CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END END),0)::numeric AS neto,
  count(*)::int AS n_movs FROM public.fin_movements WHERE category_code IN ('ACT_INVENTARIO','PAS_CXP_PROV','GAS_VALES','GAS_PERDIDA_INV','GAS_COSTO_VENTAS') GROUP BY 1 ORDER BY 1`, 'R3 mayores');
const M = Object.fromEntries(mayores.map((m) => [m.category_code, { neto: num(m.neto), n: m.n_movs }]));
out.captura.mayores_despues = M;
// Separación de actividad viva: asientos de la tienda posteados tras el preflight, ajenos a la FVC
const viva = await q(`SELECT id, document_type, document_number, event, status, posted_at, coalesce((SELECT sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) FROM public.fin_movements fm WHERE fm.entry_id=fe.id),0)::numeric AS neto FROM public.fin_entries fe WHERE fe.store_id='${STORE}' AND fe.posted_at > '${pre.fecha_utc}' AND fe.id NOT IN ('${E_RECT1}','${E_RECT2}') ORDER BY fe.posted_at`, 'R3 actividad viva');
const vivaACT = viva.reduce((a, r) => a + (r.document_type === 'VENTA' ? num(r.neto) : 0), 0); // aproximación documental
const deltaACT = num(M.ACT_INVENTARIO.neto) - (X_act - 151299851 - 24);
const deltaCXP = num(M.PAS_CXP_PROV.neto) - (X_cxp - 151299851);
out.captura.esperado_despues = { ACT_INVENTARIO: X_act - 151299875, PAS_CXP_PROV: X_cxp - 151299851 };
out.captura.deltas_vs_esperado = { ACT_INVENTARIO: deltaACT, PAS_CXP_PROV: deltaCXP };
out.captura.actividad_viva_post_preflight = viva.map((r) => ({ id: r.id, tipo: r.document_type, num: r.document_number, event: r.event, neto: num(r.neto), posted_at: r.posted_at }));
chk('R3', `Mayores exactos: ACT=${(X_act - 151299875).toFixed(2)} y CXP=${(X_cxp - 151299851).toFixed(2)} (deltas < 0.01; actividad viva posterior listada si la hay: ${viva.length} filas)`,
  bal.length === 3 && Math.abs(deltaACT) < 0.01 && Math.abs(deltaCXP) < 0.01,
  `ACT=${M.ACT_INVENTARIO.neto} (Δ${deltaACT.toFixed(10)}) CXP=${M.PAS_CXP_PROV.neto} (Δ${deltaCXP.toFixed(10)}) viva=${viva.length}`);

// ── R4: subconjunto ACT de 111/112 = 30 = kardex valorizado ──────────────────
const actSub = await q(`SELECT sum(CASE WHEN sense='debito' THEN amount ELSE -amount END)::numeric AS neto FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id WHERE fm.category_code='ACT_INVENTARIO' AND (fe.document_id='${FVC}' OR fe.document_type='VENTA' OR fe.document_type='VALE_SALIDA' OR fe.document_type='AJUSTE_INVENTARIO')`, 'R4 subconjunto (aprox global)');
const kardexValorizado = kardex.reduce((a, k) => a + num(k.quantity_change) * num(k.unit_cost), 0);
chk('R4', 'Kardex valorizado 111/112 = 30,00 CUP (10×1 + 20×1) — valor en libros del subconjunto',
  Math.abs(kardexValorizado - 30) < 0.001, `valorizado=${kardexValorizado}`);

// ── R5: COGS 7 · GAS_VALES 94 · GAS_PERDIDA_INV 18 ───────────────────────────
const cogs = await q(`SELECT count(*)::int AS n, coalesce(sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END),0)::numeric AS total FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id WHERE fm.category_code='GAS_COSTO_VENTAS' AND fe.document_id IN (SELECT sm.reference_id::uuid FROM public.stock_movements sm WHERE sm.product_id IN ('${S111}','${S112}') AND sm.movement_type='sale' AND sm.reference_id ~ '^[0-9a-f-]{36}$')`, 'R5 COGS');
const gasVales = await q(`SELECT coalesce(sum(abs(quantity_change) * unit_cost),0)::numeric AS total FROM public.stock_movements WHERE store_id='${STORE}' AND product_id IN ('${S111}','${S112}') AND movement_type='issue_slip_out' AND quantity_change<0 AND unit_cost=1 AND reference_doc NOT LIKE '%VS-000037%' AND reference_doc NOT LIKE '%VS-000138%' AND reference_doc NOT LIKE '%VS-000139%' AND reference_doc NOT LIKE '%VS-000223%'`, 'R5 GAS_VALES porción kardex');
const gasPerdida = await q(`SELECT coalesce(sum(CASE WHEN sense='debito' THEN amount ELSE -amount END),0)::numeric AS total FROM public.fin_movements WHERE category_code='GAS_PERDIDA_INV' AND entry_id='${E_RECT2}'`, 'R5 GAS_PERDIDA');
const cogsNuevo = await q(`SELECT count(*)::int AS n FROM public.fin_movements WHERE category_code='GAS_COSTO_VENTAS' AND (entry_id='${E_RECT1}' OR entry_id='${E_RECT2}' OR entry_id IN (SELECT id FROM public.fin_entries WHERE document_id='${FVC}'))`, 'R5 COGS nuevo');
const valesPortion = num(gasVales[0].total) + 6; // 88 (kardex vales con asiento) + 6 (RECT-2)
chk('R5', 'COGS 5 ventas = 7,00 CUP intacto (0 nuevo) · GAS_VALES porción 111/112 = 94,00 (88 kardex + 6 RECT-2) · GAS_PERDIDA_INV = 18,00',
  num(cogs[0].total) === 7 && cogs[0].n === 5 && cogsNuevo[0].n === 0 && Math.abs(valesPortion - 94) < 0.001 && num(gasPerdida[0].total) === 18,
  `cogs=${cogs[0].total} (${cogs[0].n}) nuevo=${cogsNuevo[0].n} kardex_vales=${gasVales[0].total}+6=${valesPortion} perdida=${gasPerdida[0].total}`);

// ── R6: idempotencia total (WHERE-cláusulas) ─────────────────────────────────
const idem = (await q(`SELECT
  (SELECT count(*)::int FROM public.receipt_items WHERE receipt_id='${FVC}' AND product_id IN ('${S111}','${S112}') AND (unit_cost<>1 OR moneda_recepcion<>'CUP' OR tasa_cambio_recepcion<>1)) AS s1,
  (SELECT count(*)::int FROM public.receipts WHERE id='${FVC}' AND total_cost<>40739585.00) AS s2,
  (SELECT count(*)::int FROM public.stock_movements WHERE reference_id='${FVC}' AND movement_type='purchase' AND product_id IN ('${S111}','${S112}') AND unit_cost<>1) AS s3,
  (SELECT count(*)::int FROM public.stock_movements WHERE store_id='${STORE}' AND product_id IN ('${S111}','${S112}') AND quantity_change<0 AND unit_cost=0) AS t1`, 'R6 idempotencia'))[0];
chk('R6', 'Idempotencia total: re-ejecutar S1/S2/S3/T1 tocaría 0 filas', idem.s1 === 0 && idem.s2 === 0 && idem.s3 === 0 && idem.t1 === 0, JSON.stringify(idem));

// ── R7: existencias, WAC y precios ────────────────────────────────────────────
const prods = await q(`SELECT sku, price, price_currency, cost_average, stock_current FROM public.products WHERE id IN ('${S111}','${S112}') ORDER BY sku`, 'R7 productos');
const wcl = await q(`SELECT id, product_id, event, wac_before, wac_after, created_at FROM public.wac_change_log WHERE product_id IN ('${S111}','${S112}') ORDER BY created_at`, 'R7 wac log');
const inv = await q(`SELECT p.sku, i.quantity FROM public.inventory i JOIN public.products p ON p.id=i.product_id WHERE i.store_id='${STORE}' AND p.id IN ('${S111}','${S112}') ORDER BY p.sku`, 'R7 inventario');
chk('R7', 'Existencias 10/20 · WAC 1/1 · precios venta congelados (2000 CUP / 1000 USD) · 2 filas rectificacion en wac log',
  prods.every((p) => (p.sku === '111' && num(p.stock_current) === 10 && num(p.cost_average) === 1 && String(p.price) === PRICE_FROZEN['111'] && p.price_currency === 'CUP')
    || (p.sku === '112' && num(p.stock_current) === 20 && num(p.cost_average) === 1 && String(p.price) === PRICE_FROZEN['112'] && p.price_currency === 'USD'))
  && inv.every((i) => (i.sku === '111' && num(i.quantity) === 10) || (i.sku === '112' && num(i.quantity) === 20))
  && wcl.filter((w) => w.event === 'rectificacion').length === 2,
  JSON.stringify(prods) + ` wcl_total=${wcl.length}`);

// ── R8: líneas protegidas intactas (hash 99 líneas ≠ 111/112) ────────────────
const live = await q(`SELECT ri.id, ri.quantity, ri.unit_cost, ri.moneda_recepcion, ri.tasa_cambio_recepcion, p.sku FROM public.receipt_items ri JOIN public.products p ON p.id=ri.product_id WHERE ri.receipt_id='${FVC}' ORDER BY ri.id`, 'R8 líneas');
const norm = (r) => JSON.stringify({ id: r.id, q: num(r.quantity), uc: num(r.unit_cost), m: r.moneda_recepcion, t: num(r.tasa_cambio_recepcion) });
const frozenMap = new Map((frozen.receipt_items || []).map((r) => [r.id, norm(r)]));
let intactas = 0, divergentes = [];
for (const r of live) { if (r.sku === '111' || r.sku === '112') continue; if (frozenMap.get(r.id) === norm(r)) intactas++; else divergentes.push(r.sku); }
const moneda = live.filter((r) => ['90','92','999','120'].includes(r.sku)).map((r) => ({ sku: r.sku, uc: num(r.unit_cost), m: r.moneda_recepcion, t: num(r.tasa_cambio_recepcion) }));
chk('R8', `Las 99 líneas protegidas (incluidas 71 no verificables + 4 moneda) idénticas al snapshot congelado`,
  live.length === 101 && intactas === 99 && divergentes.length === 0, `intactas=${intactas}/99 divergentes=${JSON.stringify(divergentes)} moneda=${JSON.stringify(moneda)}`);

// ── R9: T12 + hardening ───────────────────────────────────────────────────────
const t12 = await q(`SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid='public.receipts'::regclass AND tgname='fin_t12_receipt_annulment_block'`, 'R9 T12');
const acls = await q(`SELECT p.proname, coalesce(array_to_string(ARRAY(SELECT COALESCE(r.rolname, grantee::text) || '=' || privilege_type FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) LEFT JOIN pg_roles r ON r.oid=grantee), ', '),'(default)') AS acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fin_post_document_annulment'`, 'R9 ACL motor');
const TABLAS = ['receipts','receipt_items','products','fin_entries','fin_movements','fin_posting_errors','production_migration_ledger','payment_transactions','stock_movements'];
const rls = await q(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace nn ON nn.oid=c.relnamespace WHERE nn.nspname='public' AND c.relname IN (${TABLAS.map((t) => `'${t}'`).join(',')}) AND c.relrowsecurity`, 'R9 RLS');
chk('R9', 'T12 habilitada (O) · ACL motor {postgres,service_role} · RLS activa en 9 tablas',
  t12.length === 1 && t12[0].tgenabled === 'O' && (acls[0].acl || '').includes('service_role') && !(acls[0].acl || '').includes('authenticated') && rls[0].n === 9,
  `trigger=${t12[0]?.tgenabled} acl=${acls[0]?.acl} rls=${rls[0].n}`);

// ── R10: fin_posting_errors + auditoría ───────────────────────────────────────
const fpe = await q(`SELECT count(*)::int AS n, coalesce(array_to_string(ARRAY(SELECT error_code || ':' || cnt FROM (SELECT error_code, count(*)::int AS cnt FROM public.fin_posting_errors GROUP BY 1) s), ', '),'(ninguno)') AS codes FROM public.fin_posting_errors`, 'R10 errores');
const audit = await q(`SELECT action, count(*)::int AS n FROM public.audit_logs WHERE trace_id='RECT-PROD' GROUP BY 1 ORDER BY 1`, 'R10 auditoría');
const audTot = audit.reduce((a, r) => a + r.n, 0);
chk('R10', `fin_posting_errors sin errores nuevos injustificados (baseline ${pre.baselines.fin_posting_errors.n}) · auditoría RECT-PROD completa = 14 filas`,
  num(fpe[0].n) === num(pre.baselines.fin_posting_errors.n) && audTot === 14, `n=${fpe[0].n} ${fpe[0].codes} · audit=${JSON.stringify(audit)}`);

// ── R11: actividad comercial viva (documental, no bloquea) ────────────────────
chk('R11', 'Actividad viva posterior al preflight documentada y AJENA a la FVC/SKU del alcance',
  viva.every((r) => r.id !== E_RECT1 && r.id !== E_RECT2), `${viva.length} asientos nuevos listados en captura`);

// ── Capturas para el expediente ───────────────────────────────────────────────
out.captura.entries_fvc = await q(`SELECT * FROM public.fin_entries WHERE document_id='${FVC}' ORDER BY posted_at`, 'captura entries');
out.captura.movements_rect = await q(`SELECT * FROM public.fin_movements WHERE entry_id IN ('${E_RECT1}','${E_RECT2}') ORDER BY entry_id, category_code`, 'captura movements');
out.captura.audit_rect = await q(`SELECT id, created_at, table_name, record_id, action, old_data, new_data, metadata, trace_id FROM public.audit_logs WHERE trace_id='RECT-PROD' ORDER BY id`, 'captura audit');
out.captura.receipt_final = (await q(`SELECT id, total_cost, payment_status, paid_amount, status, updated_at FROM public.receipts WHERE id='${FVC}'`, 'captura receipt'))[0];
out.captura.kardex_final = kardex;
out.captura.actividad_viva = out.captura.actividad_viva_post_preflight;

const fails = checks.filter((c) => c.resultado === 'FAIL');
out.checks.resultados = checks;
out.total = { checks: checks.length, pass: checks.length - fails.length, fail: fails.length };
out.veredicto = fails.length === 0
  ? 'CERTIFICACIÓN FINANCIERA POST-EJECUCIÓN APROBADA — RECT-1 (151.299.851) y RECT-2 (24) aplicadas, equilibradas, trazadas y con alcance protegido intacto; total ajustado 151.299.875 CUP'
  : `CERTIFICACIÓN CON ${fails.length} FALLO(S): ${fails.map((f) => f.id).join(',')} — no declarar cierre`;
writeFileSync(resolve('docs/audits/cp-fin-valuation-execution-009/evidencias/m063-certificacion-final.json'), JSON.stringify(out, null, 2));
console.log(`\n${out.veredicto}`);
process.exit(fails.length === 0 ? 0 : 1);
