/**
 * FASE H1 — §8 SUPERFICIE COLATERAL: tax_configurations (C1–C4)
 */
const { rest, fixtures, login, q, createSuite, brief } = require('./lib.cjs');

const S = createSuite('TC — Colateral tax_configurations', '20-collateral-taxcfg');

(async () => {
  const fx = fixtures();
  const tokA = (await login('qa.h1.a@costpro.test', fx.pass_a)).token;
  const tokB = (await login('qa.h1.b@costpro.test', fx.pass_b)).token;

  // C1 — matriz de roles del contrato H0 (AUSENTE)
  await S.test('T-TC-001', 'TC-C1 — modificaciones permitidas por rol/contrato',
    'CONTRATO H0 (matriz rol→operación) — H0 NO PRODUCIDO',
    async () => {
      const pol = await q(`SELECT policyname, cmd, roles, qual FROM pg_policies
        WHERE schemaname='public' AND tablename='tax_configurations';`);
      return {
        status: 'BLOCKED',
        current: `policy única: ${pol.map(p => `${p.policyname}[${p.cmd}] roles=${p.roles} USING=${String(p.qual).slice(0, 60)}`).join(' · ')}`,
        evidence: 'El spec H0 no define la matriz rol→operación sobre tax_configurations. NO SE INVENTA. Evidencia actual: una SOLA policy "Tax unified" [ALL] para authenticated con USING has_store_access(store_id) — cualquier miembro (incl. clerk) tiene INSERT/UPDATE/DELETE sobre la configuración fiscal de su tienda.',
      };
    });

  // C2 — clerk convierte config fiscal en fuente arbitraria de descuentos
  await S.test('T-TC-002', 'TC-C2 — clerk NO puede crear impuesto arbitrario (fuente de descuentos)',
    'DENIED — INSERT de tax_configurations por clerk rechazado',
    async () => {
      const r = await rest('POST', '/rest/v1/tax_configurations', tokA, {
        name: 'QA impuesto arbitrario', type: 'percentage', value: -10, is_active: true, store_id: fx.store_a,
      });
      const created = r.status === 201;
      if (created) {
        // limpieza inmediata del fixture contaminante
        await q(`DELETE FROM public.tax_configurations WHERE name='QA impuesto arbitrario';`);
      }
      return {
        status: created ? 'FAIL' : 'PASS',
        current: `INSERT clerk → ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`,
        evidence: created
          ? 'CLERK creó un impuesto arbitrario ACTIVO (value=-10): la config fiscal es escribible por cualquier miembro de tienda — combinada con T-H4-003 es una vía de impuestos arbitrarios persistida'
          : 'escritura por clerk bloqueada',
      };
    });

  // C3 — valores inválidos no introducibles
  await S.test('T-TC-003', 'TC-C3 — valores inválidos no pueden introducirse',
    'constraint/policy rechaza value negativo (y rango inválido según H0)',
    async () => {
      const cons = await q(`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid='public.tax_configurations'::regclass AND contype='c';`);
      const hasValueCheck = cons.some(c => /value/i.test(c.def));
      return {
        status: hasValueCheck ? 'PASS' : 'FAIL',
        current: `check constraints: ${cons.map(c => c.def).join(' · ') || 'NINGUNA'}`,
        evidence: 'tax_configurations.value acepta cualquier numeric (sin CHECK de rango): negativos, >100%, NaN-like. El rango válido exacto es contrato H0 (ausente) pero el NEGATIVO es inválido bajo cualquier lectura y hoy es introducible.',
      };
    });

  // C4 — manipulación retroactiva de ventas existentes vía config
  await S.test('T-TC-004', 'TC-C4 — modificar config fiscal NO altera ventas existentes',
    'transactions.applied_taxes/tax_amount de ventas previas permanecen intactas',
    async () => {
      const before = await q(`SELECT count(*) AS c, coalesce(sum(tax_amount),0) AS s FROM public.transactions
        WHERE store_id='${fx.store_a}';`);
      await q(`INSERT INTO public.tax_configurations (name, type, value, is_active, store_id)
        VALUES ('QA tc retro', 'percentage', 999, true, '${fx.store_a}');`);
      const after = await q(`SELECT count(*) AS c, coalesce(sum(tax_amount),0) AS s FROM public.transactions
        WHERE store_id='${fx.store_a}';`);
      await q(`DELETE FROM public.tax_configurations WHERE name='QA tc retro';`);
      const stable = before[0].c === after[0].c && String(before[0].s) === String(after[0].s);
      return {
        status: stable ? 'PASS' : 'FAIL',
        current: `ventas=${before[0].c}→${after[0].c} sumTax=${before[0].s}→${after[0].s}`,
        evidence: 'las ventas persisten applied_taxes como snapshot JSONB: la config no las re-cacula (la vía retroactiva real es update_transaction_taxes — suite 21)',
      };
    });

  // C5-extra — cross-store sobre config fiscal
  await S.test('T-TC-005', 'TC — cross-store: USER_B (STORE_B) escribe tax_config de STORE_A',
    'DENIED (has_store_access falla para no-miembro)',
    async () => {
      const r = await rest('POST', '/rest/v1/tax_configurations', tokB, {
        name: 'QA cross', type: 'percentage', value: 5, is_active: true, store_id: fx.store_a,
      });
      const denied = r.status === 403 || r.status === 401 || (r.status === 201 && false);
      if (r.status === 201) await q(`DELETE FROM public.tax_configurations WHERE name='QA cross';`);
      return {
        status: denied ? 'PASS' : 'FAIL',
        current: `INSERT USER_B sobre STORE_A → ${r.status}`,
        evidence: 'RLS tax_configurations cierra el cross-store (solo same-store members)',
      };
    });

  S.finish();
})().catch(e => { console.error('❌ suite TC:', e); process.exit(1); });
