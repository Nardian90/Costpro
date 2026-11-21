#!/usr/bin/env node
/**
 * m110-recon-final.mjs — CP-FIN-110: conciliación FINAL de verificación
 * (read-only, re-ejecutable) tras GEN-3 activa.
 *
 * Verifica los criterios de cierre §9 de la misión contra producción:
 *   A) Matriz completa de cuentas (esperadas: cajas/TE/inventario/anticipos
 *      conciliados al céntimo; 34 vales costo-cero fuera del pendiente).
 *   B) Ecuación del Estado de Situación (activos = pasivos + patrimonio).
 *   C) Resultado del período sin duplicar patrimonio.
 *   D) 0 movimientos sin respaldo · 0 documentos pendientes materiales.
 * Uso: ALLOW_PROD=read-only SUPABASE_ACCESS_TOKEN=... node scripts/m110-recon-final.mjs
 */
import { writeFileSync } from 'node:fs';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD_REF = 'wthkddeleylijmonclxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const OUT = '/home/z/my-project/scripts/out/m110-audit';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const AS_OF = '2026-11-21', FROM = '2026-11-01', TO = '2026-11-21';
if (!TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido'); process.exit(2); }

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 700)}`);
  return JSON.parse(text);
}
let PASS = 0, FAIL = 0;
const check = (name, cond, extra) => {
  if (cond) { PASS++; console.log(`  ✓ ${name}${extra !== undefined ? ' — ' + extra : ''}`); }
  else { FAIL++; console.log(`  ✗ FALLO: ${name}${extra !== undefined ? ' — ' + extra : ''}`); }
};

async function main() {
  assertNotProduction({ mode: 'read', projectRef: PROD_REF, context: 'm110-recon-final.mjs' });

  const reconRows = await runSql(`SELECT public.fin_get_reconciliation('${STORE}', DATE '${AS_OF}', DATE '${FROM}', DATE '${TO}', NULL) AS r;`);
  const r = reconRows[0].r;
  writeFileSync(`${OUT}/m110-recon-final.json`, JSON.stringify(r, null, 1));
  console.log('Resumen:', JSON.stringify(r.resumen));
  console.log('Ejecución:', r.ejecucion.generacion.code, r.ejecucion.metodologia_version);

  const by = Object.fromEntries(r.cuentas.map(c => [c.cuenta, c]));
  const N = (x) => x === null ? null : Number(x);
  const row = (code) => ({ op: N(by[code].valor_operacional), cont: N(by[code].valor_contable), dif: N(by[code].diferencia), estado: by[code].estado, calidad: by[code].calidad });

  console.log('\n== Cuentas críticas ==');
  for (const code of ['ACT_EFECTIVO_CUP', 'ACT_EFECTIVO_USD', 'ACT_TRANSF_EXTERIOR', 'ACT_INVENTARIO', 'ACT_CXC', 'PAS_ANTICIPOS_CLI', 'ING_SERVICIOS_PREST', 'GAS_COSTO_VENTAS', 'ACT_BANCOS', 'ACT_OTROS_CORR', 'PAS_CXP_PROV']) {
    const x = row(code);
    console.log(`${code}: op=${x.op} cont=${x.cont} dif=${x.dif} ${x.estado}/${x.calidad}`);
  }

  check('ACT_EFECTIVO_CUP conciliado (esperado op=1673850)', row('ACT_EFECTIVO_CUP').op === 1673850 && row('ACT_EFECTIVO_CUP').estado === 'CONCILIADO', row('ACT_EFECTIVO_CUP').dif);
  check('ACT_EFECTIVO_USD conciliado (esperado op=23884450)', row('ACT_EFECTIVO_USD').op === 23884450 && row('ACT_EFECTIVO_USD').estado === 'CONCILIADO', row('ACT_EFECTIVO_USD').dif);
  check('ACT_TRANSF_EXTERIOR conciliado (esperado op=16595876)', row('ACT_TRANSF_EXTERIOR').op === 16595876 && row('ACT_TRANSF_EXTERIOR').estado === 'CONCILIADO', row('ACT_TRANSF_EXTERIOR').dif);
  check('ACT_INVENTARIO conciliado (esperado 594747.87 = WAC vivo)', Math.abs(row('ACT_INVENTARIO').dif) <= 0.01, row('ACT_INVENTARIO').dif);
  check('PAS_ANTICIPOS_CLI conciliado (anticipos 16227626)', Math.abs(row('PAS_ANTICIPOS_CLI').dif) <= 0.01, `op=${row('PAS_ANTICIPOS_CLI').op}`);
  check('GAS_COSTO_VENTAS dif 0.00 (política per-venta)', Math.abs(row('GAS_COSTO_VENTAS').dif) <= 0.001, row('GAS_COSTO_VENTAS').dif);
  check('documentos_pendientes = 0 (34 vales costo-cero reclasificados)', Number(r.resumen.documentos_pendientes) === 0, r.resumen.documentos_pendientes);
  check('movimientos_sin_respaldo = 0', Number(r.resumen.movimientos_sin_respaldo) === 0);
  check('sin estado DIFERENCIA en toda la matriz', Number(r.resumen.diferencias) === 0);
  const alerts = r.cuentas.filter(c => c.estado === 'ALERTA');
  check('sin ALERTA en toda la matriz', alerts.length === 0, alerts.map(a => a.cuenta).join(','));

  // Estado de Situación
  const bsRows = await runSql(`SELECT public.fin_get_balance_sheet('${STORE}', DATE '${AS_OF}', NULL) AS bs;`);
  const bs = bsRows[0].bs;
  writeFileSync(`${OUT}/m110-balance-final.json`, JSON.stringify(bs, null, 1));
  console.log('\n== Estado de Situación ==');
  console.log('Ecuación:', JSON.stringify(bs.ecuacion));
  check('ACTIVOS = PASIVOS + PATRIMONIO (≤0.01)', bs.ecuacion.equilibrado === true, `dif=${bs.ecuacion.diferencia}`);
  check('activos ~ 52752813.86 (52.75M tras correcciones)', Math.abs(Number(bs.ecuacion.activos) - 52752813.86) < 0.02, bs.ecuacion.activos);
  check('resultado del período incluido una sola vez', Number(bs.resultado_acumulado) !== Number(bs.resultado_periodo), `acum=${bs.resultado_acumulado}`);

  const incRows = await runSql(`SELECT public.fin_get_income_statement('${STORE}', DATE '${FROM}', DATE '${TO}', NULL) AS i;`);
  writeFileSync(`${OUT}/m110-income-final.json`, JSON.stringify(incRows[0].i, null, 1));
  console.log('Ingresos período:', JSON.stringify(incRows[0].i.resumen || incRows[0].i.total_ingresos || 'ver archivo'));

  console.log(`\nRESULTADO: ${PASS} PASS / ${FAIL} FAIL`);
  process.exit(FAIL === 0 ? 0 : 1);
}

main().catch(err => { console.error('FALLO:', err.message); process.exit(1); });
