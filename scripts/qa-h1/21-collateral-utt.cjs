/**
 * FASE H1 — §9 SUPERFICIE COLATERAL: update_transaction_taxes (C5–C10)
 *                        + superficie adyacente descubierta: adjust_total_amount
 *
 * Hechos LIVE (ground truth verificado):
 *  - update_transaction_taxes: SECDEF, ACL {authenticated}; chequeo de rol GLOBAL
 *    (is_admin | has_role('manager') | has_role('encargado')) SIN scoping de tienda.
 *  - El trigger protect_transactions_total_amount (PT008) hace INMUTABLE
 *    total_amount salvo para el rol costpro_transaction_adjuster (usado por
 *    adjust_total_amount). El trigger SÍ detiene la reescritura del total, pero
 *    NO protege tax_amount / applied_taxes, que la función reescribe tal cual
 *    los recibe (sin recálculo, sin invariante total=subtotal−desc+tax).
 *  - adjust_total_amount: SECDEF, ACL {authenticated}; exige is_admin() GLOBAL
 *    + motivo + new_total >= 0 + invariante pagos; audit completo. Superficie
 *    mejor endurecida, pero sin scoping de tienda (cualquier admin global).
 */
const { rpc, fixtures, login, q, createSuite, brief } = require('./lib.cjs');

const S = createSuite('UTT — Colateral update_transaction_taxes', '21-collateral-utt');

(async () => {
  const fx = fixtures();
  const tokA = (await login('qa.h1.a@costpro.test', fx.pass_a)).token;
  const tokB = (await login('qa.h1.b@costpro.test', fx.pass_b)).token;
  const tokEnc = (await login('qa.h1.enc@costpro.test', fx.pass_enc)).token;

  // fixture: ventas legítimas
  const mkSale = (store, seller, product, price, tok) => rpc('create_sale_v2', {
    p_store_id: store, p_seller_id: seller,
    p_items: [{ product_id: product, quantity: 1, price_at_sale: price }],
    p_payment_method: 'cash', p_discount_type: 'fixed', p_discount_value: 0,
    p_applied_taxes: [], p_tax_amount: 0, p_total_amount: price, p_subtotal: price,
    p_cash_amount: price, p_sale_currency: 'CUP', p_sale_exchange_rate: 1,
    p_idempotency_key: `qa-utt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  }, tok);
  const rA = await mkSale(fx.store_a, fx.user_a, fx.product_a, 100, tokA);
  const rB = await mkSale(fx.store_b, fx.user_b, fx.product_b, 200, tokB);
  if (rA.status !== 200 || rB.status !== 200) throw new Error(`fixtures fallaron: ${brief(rA)} / ${brief(rB)}`);
  const txA = rA.body.transaction_id;
  const txB = rB.body.transaction_id;

  // C5 — contrato de autorización exacto (H0 ausente)
  await S.test('T-UTT-001', 'UTT-C5 — quién puede ejecutar update_transaction_taxes',
    'CONTRATO H0 de autorización exacta — H0 NO PRODUCIDO (FAIL SPEC COVERAGE)',
    async () => {
      const acl = await q(`SELECT COALESCE(array_to_string(proacl,','),'') AS acl FROM pg_proc p
        JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='update_transaction_taxes';`);
      return {
        status: 'BLOCKED',
        current: `ACL={${acl[0].acl}} · cuerpo: is_admin() OR has_role('manager') OR has_role('encargado') — roles GLOBALES`,
        evidence: 'FAIL SPEC COVERAGE: H0 no define el contrato de autorización de update_transaction_taxes. Descubrimiento documentado: ACL=authenticated; autorización por rol GLOBAL de profiles (admin/encargado/manager) SIN scoping de tienda y SIN token/motivo. H0 debe fijar: quién, en qué tiendas, en qué estados.',
      };
    });

  // C6 — clerk sobre venta cerrada
  await S.test('T-UTT-002', 'UTT-C6 — clerk NO puede modificar una venta cerrada',
    'DENIED para USER_A (clerk)',
    async () => {
      const r = await rpc('update_transaction_taxes', {
        p_transaction_id: txA, p_applied_taxes: [], p_tax_amount: 1, p_total_amount: 100,
      }, tokA);
      const denied = r.status >= 400 || r.body === false;
      return {
        status: denied ? 'PASS' : 'FAIL',
        current: `clerk → HTTP ${r.status} ${String(r.body).slice(0, 80)}`,
        evidence: denied ? 'chequeo de rol global bloquea al clerk' : 'clerk modificó la venta',
      };
    });

  // C7 — campos financieros sin recálculo (tax/applied; total protegido por trigger)
  await S.test('T-UTT-003', 'UTT-C7 — tax_amount/applied_taxes reescritos SIN recálculo server-side',
    'los campos tributarios persistidos deben derivarse server-side con invariante total=subtotal−desc+tax',
    async () => {
      const r = await rpc('update_transaction_taxes', {
        p_transaction_id: txB, p_applied_taxes: [{ type: 'percentage', value: 999 }],
        p_tax_amount: 777, p_total_amount: 200, // total intacto → trigger no interviene
      }, tokEnc);
      const t = await q(`SELECT tax_amount, applied_taxes, total_amount, subtotal FROM public.transactions WHERE id='${txB}';`);
      const accepted = r.status === 200 || r.body === true;
      const inconsistent = accepted && Number(t[0].tax_amount) === 777 && Number(t[0].total_amount) === 200 && Number(t[0].subtotal) === 200;
      return {
        status: inconsistent ? 'FAIL' : (accepted ? 'FAIL' : 'PASS'),
        current: accepted
          ? `ACEPTADA: tax_amount=${t[0].tax_amount} applied=${JSON.stringify(t[0].applied_taxes)} con subtotal=${t[0].subtotal} total=${t[0].total_amount} (invariante rota: 200≠200−0+777)`
          : `denegada: ${brief(r)}`,
        evidence: accepted
          ? 'update_transaction_taxes persiste los valores cliente tal cual (999%, 777) sin recálculo ni invariante — el registro financiero queda internamente inconsistente; total_amount solo se salva por el trigger PT008'
          : 'sin reescritura',
      };
    });

  // C8 — evasión de supervisor vía reescritura del total
  await S.test('T-UTT-004', 'UTT-C8 — reescribir el total post-venta para evadir supervisor',
    'el total NO puede reescribirse por esta vía (política de supervisor intacta)',
    async () => {
      const r = await rpc('update_transaction_taxes', {
        p_transaction_id: txB, p_applied_taxes: [], p_tax_amount: 0, p_total_amount: 5,
      }, tokEnc);
      const t = await q(`SELECT total_amount FROM public.transactions WHERE id='${txB}';`);
      const blocked = Number(t[0].total_amount) === 200; // no cambió
      return {
        status: blocked ? 'PASS' : 'FAIL',
        current: `intento total 200→5 → HTTP ${r.status} · total persistido=${t[0].total_amount}`,
        evidence: blocked
          ? 'DENEGADO por defense-in-depth: el trigger protect_transactions_total_amount (PT008) hace inmutable el total fuera de adjust_total_amount — la función en SÍ lo habría escrito (no valida nada); la protección es del trigger, no del RPC'
          : 'total reescrito — evasión de supervisor',
      };
    });

  // C9 — transacción de otra tienda (campos tributarios)
  await S.test('T-UTT-005', 'UTT-C9 — encargado de STORE_B modifica campos de transacción de STORE_A',
    'DENIED — scoping de tienda obligatorio',
    async () => {
      const r = await rpc('update_transaction_taxes', {
        p_transaction_id: txA, p_applied_taxes: [{ type: 'fixed', value: 55 }],
        p_tax_amount: 55, p_total_amount: 100, // total intacto
      }, tokEnc);
      const t = await q(`SELECT tax_amount, store_id FROM public.transactions WHERE id='${txA}';`);
      const modified = Number(t[0].tax_amount) === 55;
      return {
        status: modified ? 'FAIL' : 'PASS',
        current: modified
          ? `ACEPTADA: transacción de STORE_A (${t[0].store_id}) con tax_amount=55 escrito por encargado GLOBAL de STORE_B`
          : `denegada: HTTP ${r.status}`,
        evidence: modified
          ? 'SECDEF + rol global SIN membresía de tienda: escritura cross-store sobre campos tributarios (RLS de transactions no protege: la función corre como postgres)'
          : 'scoping presente',
      };
    });

  // C10 — estado/justificación (H0 ausente)
  await S.test('T-UTT-006', 'UTT-C10 — modificación sin estado/justificación permitida',
    'CONTRATO H0 de estados/justificación — H0 NO PRODUCIDO (FAIL SPEC COVERAGE)',
    async () => {
      const t = await q(`SELECT status FROM public.transactions WHERE id='${txB}';`);
      return {
        status: 'BLOCKED',
        current: `tx status=${t[0].status} (completed) modificada en C7 · la función no consulta status ni exige motivo`,
        evidence: 'FAIL SPEC COVERAGE: H0 no define estados permitidos ni justificación para la modificación tributaria post-venta. Evidencia: venta completed modificada sin estado/motivo alguno.',
      };
    });

  // Superficie adyacente: adjust_total_amount (descubierta por PT008)
  await S.test('T-UTT-007', 'UTT — adjust_total_amount: clerk denegado (superficie adyacente)',
    'ERR_UNAUTHORIZED para no-admin',
    async () => {
      const r = await rpc('adjust_total_amount', {
        p_transaction_id: txA, p_new_total: 90, p_reason: 'QA intento clerk',
      }, tokA);
      const denied = r.status >= 400 || r.body === false;
      return {
        status: denied ? 'PASS' : 'FAIL',
        current: `clerk → HTTP ${r.status} ${String(r.body).slice(0, 80)}`,
        evidence: denied ? 'is_admin() fail-closed para clerk' : 'clerk ajustó el total',
      };
    });

  await S.test('T-UTT-008', 'UTT — adjust_total_amount: encargado GLOBAL denegado (asimetría documentada)',
    'ERR_UNAUTHORIZED (solo admin global) — contraste con update_transaction_taxes que SÍ lo permite',
    async () => {
      const r = await rpc('adjust_total_amount', {
        p_transaction_id: txB, p_new_total: 190, p_reason: 'QA intento encargado',
      }, tokEnc);
      const denied = r.status >= 400 || r.body === false;
      return {
        status: denied ? 'PASS' : 'FAIL',
        current: `encargado global → HTTP ${r.status} ${String(r.body).slice(0, 80)}`,
        evidence: denied
          ? 'adjust_total_amount exige is_admin() estricto: más estrecho que update_transaction_taxes (que acepta manager/encargado globales). Asimetría de privilegios documentada para H0.'
          : 'encargado ajustó total',
      };
    });

  S.finish();
})().catch(e => { console.error('❌ suite UTT:', e); process.exit(1); });
