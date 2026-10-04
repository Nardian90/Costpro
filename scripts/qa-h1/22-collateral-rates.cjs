/**
 * FASE H1 — §10/§13 SUPERFICIE COLATERAL: fuentes de tasa de cambio
 * (store_exchange_rates / exchange_rates — jerarquía y protección)
 */
const { rest, fixtures, login, q, createSuite, brief } = require('./lib.cjs');

const S = createSuite('ER — Colateral fuentes de tasa', '22-collateral-rates');

(async () => {
  const fx = fixtures();
  const tokA = (await login('qa.h1.a@costpro.test', fx.pass_a)).token;
  const tokB = (await login('qa.h1.b@costpro.test', fx.pass_b)).token;

  // fuente de tienda escribible por clerk (H5.4 deep-dive)
  await S.test('T-ER-001', 'ER — clerk (USER_A) reescribe la tasa de confianza de SU tienda',
    'DENIED — la fuente server-side de tasas no es escribible por clerk',
    async () => {
      const r = await rest('PATCH', `/rest/v1/store_exchange_rates?store_id=eq.${fx.store_a}&currency=eq.USD`, tokA, { rate: 0.5 });
      const writable = r.status === 204 || r.status === 200;
      if (writable) await q(`UPDATE public.store_exchange_rates SET rate=400 WHERE store_id='${fx.store_a}' AND currency='USD';`);
      return {
        status: writable ? 'FAIL' : 'PASS',
        current: `PATCH store_exchange_rates por clerk → ${r.status}`,
        evidence: writable
          ? 'policy "Users can manage own store rates" (ALL, roles=public, USING profiles.store_id match): CUALQUIER miembro —incl. clerk— puede poner la tasa de confianza en 0.5 y esperar una venta que la consuma. La fuente NO es de confianza si el checkout la adopta (prerequisito del fix H5).'
          : 'fuente protegida contra clerk',
      };
    });

  // cross-store sobre la fuente de tienda
  await S.test('T-ER-002', 'ER — USER_B (STORE_B) reescribe la tasa de STORE_A',
    'DENIED',
    async () => {
      const r = await rest('PATCH', `/rest/v1/store_exchange_rates?store_id=eq.${fx.store_a}&currency=eq.USD`, tokB, { rate: 1 });
      const writable = r.status === 204 || r.status === 200;
      if (writable) await q(`UPDATE public.store_exchange_rates SET rate=400 WHERE store_id='${fx.store_a}' AND currency='USD';`);
      return {
        status: writable ? 'FAIL' : 'PASS',
        current: `PATCH cross-store → ${r.status}`,
        evidence: 'el scoping per-store de la policy bloquea a no-miembros',
      };
    });

  // fuente global protegida
  await S.test('T-ER-003', 'ER — usuario autenticado NO escribe exchange_rates (global)',
    'DENIED (policy service_role-only para INSERT/UPDATE)',
    async () => {
      const ins = await rest('POST', '/rest/v1/exchange_rates', tokA, {
        rate_date: '2026-10-04', currency: 'USD', source: 'qa-er', rate: 1,
      });
      if (ins.status === 201) await q(`DELETE FROM public.exchange_rates WHERE source='qa-er';`);
      const denied = ins.status === 403 || ins.status === 401;
      return {
        status: denied ? 'PASS' : 'FAIL',
        current: `INSERT exchange_rates → ${ins.status} ${JSON.stringify(ins.body).slice(0, 100)}`,
        evidence: 'exchange_rates_insert/update son service_role-only: la fuente global está protegida',
      };
    });

  // anon sobre ambas fuentes
  await S.test('T-ER-004', 'ER — anon no lee ni escribe fuentes de tasa',
    'DENIED ambos',
    async () => {
      const rd = await rest('GET', '/rest/v1/exchange_rates?select=id&limit=1', 'anon');
      const ra = await rest('GET', '/rest/v1/store_exchange_rates?select=id&limit=1', 'anon');
      const wa = await rest('POST', '/rest/v1/exchange_rates', 'anon', { rate_date: '2026-10-04', currency: 'USD', source: 'qa-anon', rate: 1 });
      if (wa.status === 201) await q(`DELETE FROM public.exchange_rates WHERE source='qa-anon';`);
      const denied = (rd.status === 403 || rd.status === 401 || (Array.isArray(rd.body) && rd.body.length === 0))
        && (ra.status === 403 || ra.status === 401 || (Array.isArray(ra.body) && ra.body.length === 0))
        && (wa.status !== 201);
      return {
        status: denied ? 'PASS' : 'FAIL',
        current: `read global→${rd.status} read store→${ra.status} write→${wa.status}`,
        evidence: 'RLS deny-by-default para anon en ambas fuentes',
      };
    });

  S.finish();
})().catch(e => { console.error('❌ suite ER:', e); process.exit(1); });
