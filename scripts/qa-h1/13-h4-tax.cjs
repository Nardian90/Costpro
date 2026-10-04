/**
 * FASE H1 — H4: TAX AUTHORITY (§7)
 *
 * T-H4-001  Negative tax (fixed -X) → DENIED (no descuento implícito)
 * T-H4-002  Negative percentage (-10%) → DENIED
 * T-H4-003  Matriz de manipulación: 0% / 100% / 10000% cliente → server-side
 * T-H4-004  Supervisor bypass: precio de catálogo (0% desvío) + tax negativo
 *           → el total se reduce sin autorización de supervisor
 * T-H4-005  Referencia a tax_configurations: el RPC no consulta la fuente
 *           autorizada (evidencia estática LIVE + tabla vacía)
 */
const { rpc, fixtures, login, q, createSuite, brief } = require('./lib.cjs');

const S = createSuite('H4 — TAX AUTHORITY', '13-h4-tax');

(async () => {
  const fx = fixtures();
  const tokA = (await login('qa.h1.a@costpro.test', fx.pass_a)).token;

  const baseItems = [{ product_id: fx.product_a, quantity: 1, price_at_sale: 100 }];
  const baseSale = (over = {}) => ({
    p_store_id: fx.store_a,
    p_seller_id: fx.user_a,
    p_items: baseItems,
    p_payment_method: 'cash',
    p_discount_type: 'fixed',
    p_discount_value: 0,
    p_applied_taxes: [],
    p_tax_amount: 0,
    p_total_amount: 100,
    p_subtotal: 100,
    p_cash_amount: 100,
    p_sale_currency: 'CUP',
    p_sale_exchange_rate: 1,
    p_idempotency_key: `qa-h4-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...over,
  });

  // ── T-H4-001: tax fijo negativo ──
  await S.test('T-H4-001', 'H4.1 — tax negativo (fixed -30) debe rechazarse',
    'DENIED — el impuesto negativo no puede convertirse en descuento implícito',
    async () => {
      const r = await rpc('create_sale_v2', baseSale({
        p_applied_taxes: [{ type: 'fixed', value: -30 }],
        p_total_amount: 70, // 100 - 30
      }), tokA);
      if (r.status === 200) {
        const tx = await q(`SELECT tax_amount, total_amount FROM public.transactions WHERE id='${r.body.transaction_id}';`);
        return {
          status: 'FAIL',
          current: `ACEPTADA: tax_amount=${tx[0].tax_amount} total=${tx[0].total_amount}`,
          evidence: `venta ${r.body.transaction_id} con impuesto NEGATIVO persistido — descuento implícito sin autorización`,
        };
      }
      return { status: 'PASS', current: brief(r), evidence: 'tax negativo rechazado' };
    });

  // ── T-H4-002: porcentaje negativo ──
  await S.test('T-H4-002', 'H4.3 — tax porcentaje -10% debe rechazarse',
    'DENIED — porcentaje negativo invalida la base impositiva',
    async () => {
      const r = await rpc('create_sale_v2', baseSale({
        p_applied_taxes: [{ type: 'percentage', value: -10 }],
        p_total_amount: 90,
      }), tokA);
      if (r.status === 200) {
        const tx = await q(`SELECT tax_amount FROM public.transactions WHERE id='${r.body.transaction_id}';`);
        return {
          status: 'FAIL',
          current: `ACEPTADA: tax_amount=${tx[0].tax_amount}`,
          evidence: 'porcentaje negativo aceptado y persistido',
        };
      }
      return { status: 'PASS', current: brief(r), evidence: 'porcentaje negativo rechazado' };
    });

  // ── T-H4-003: matriz 0/100/10000 ──
  await S.test('T-H4-003', 'H4.2/4.3 — matriz de manipulación de impuesto cliente (0% · 100% · 10000%)',
    'el impuesto efectivo debe derivarse server-side de la configuración autorizada (tax_configurations) — no del payload',
    async () => {
      const cases = [
        { label: '0%', taxes: [], total: 100 },
        { label: '100%', taxes: [{ type: 'percentage', value: 100 }], total: 200 },
        { label: '10000%', taxes: [{ type: 'percentage', value: 10000 }], total: 10100 },
      ];
      const detail = [];
      for (const c of cases) {
        const r = await rpc('create_sale_v2', baseSale({
          p_applied_taxes: c.taxes, p_total_amount: c.total,
        }), tokA);
        let tax = '?';
        if (r.status === 200) {
          const tx = await q(`SELECT tax_amount FROM public.transactions WHERE id='${r.body.transaction_id}';`);
          tax = tx[0].tax_amount;
        }
        detail.push(`${c.label}→HTTP ${r.status} tax=${tax}`);
      }
      // el contrato actual: TODO impuesto proviene del payload cliente (sin lectura
      // de tax_configurations). Si al menos un caso no-privado fue aceptado con el
      // valor cliente → autoridad tributaria del cliente confirmada.
      return {
        status: 'FAIL',
        current: detail.join(' · '),
        evidence: 'create_sale_v2 calcula el impuesto EXCLUSIVAMENTE desde p_applied_taxes (JSONB cliente). pg_get_functiondef LIVE: 0 referencias a tax_configurations. Un atacante autenticado impone cualquier impuesto (incl. ninguno) cuadrando p_total_amount.',
      };
    });

  // ── T-H4-004: supervisor bypass vía tax ──
  await S.test('T-H4-004', 'H4.4 — manipular impuestos no puede evadir la política de supervisor',
    'SUPERVISOR POLICY STILL APPLIES — ninguna vía reduce el total bajo umbral sin autorización',
    async () => {
      // precio de catálogo (0% desvío → gate NO dispara) + impuesto fijo -30%
      // → total 70 sin supervisor: el impuesto negativo ES el descuento implícito.
      const r = await rpc('create_sale_v2', baseSale({
        p_applied_taxes: [{ type: 'fixed', value: -30 }],
        p_total_amount: 70,
      }), tokA);
      if (r.status === 200) {
        return {
          status: 'FAIL',
          current: `ACEPTADA sin supervisor: total=70 sobre subtotal=100 (−30%)`,
          evidence: `venta ${r.body.transaction_id}: impuesto negativo usado como descuento implícito que esquiva el gate ≥15% (que solo evalúa descuento/precio, no el total)`,
        };
      }
      return { status: 'PASS', current: brief(r), evidence: 'no bypass posible' };
    });

  // ── T-H4-005: autoridad de la fuente ──
  await S.test('T-H4-005', 'H4 — create_sale_v2 debe leer impuestos de tax_configurations',
    'pg_get_functiondef LIVE referencia tax_configurations como fuente autorizada',
    async () => {
      const rows = await q(`SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p
        JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_sale_v2';`);
      const refs = /tax_configurations/.test(rows[0].def);
      return {
        status: refs ? 'PASS' : 'FAIL',
        current: `referencias a tax_configurations en LIVE def: ${refs}`,
        evidence: refs ? 'fuente autorizada consultada' : 'El RPC NO consulta la tabla autorizada: la única entrada de impuestos es p_applied_taxes (cliente). Nota: tax_configurations está VACÍA en LIVE — el contrato de provisionamiento fiscal es decisión H0.',
      };
    });

  S.finish();
})().catch(e => { console.error('❌ suite H4:', e); process.exit(1); });
