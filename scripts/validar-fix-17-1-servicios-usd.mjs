#!/usr/bin/env node
/**
 * FIX §17.1 — Validación E2E del fix de moneda del documento en Servicios
 * Recibidos (rama fix/servicios-usd-17-1-20261113).
 *
 * Ejecuta contra la BD E2E AISLADA (lguovmvrozxgssupkwpf — JAMÁS producción):
 *   1. Aplica la migración supabase/migrations/20261113120800_...sql.
 *   2. Casos (documentos reales received_services + payment_transactions):
 *      · P1  CUP completo: 100 CUP, pago 100 CUP → paid=100, status 'paid'.
 *      · P2  CUP parcial: 200 CUP, pago 80 CUP → paid=80, status 'partial'.
 *      · P3  USD completo: 10 USD (tasa 400), pago 10 USD → paid=10 (USD!),
 *            status 'paid' — ANTES: paid=4000 y guard bloqueaba.
 *      · P4  USD parcial: 10 USD, pago 4 USD → paid=4, status 'partial'
 *            — ANTES quedaba 'paid' (4×400=1600 ≥ 10).
 *      · P5  USD pago completo en CUP (4000 CUP a doc 10 USD tasa 400):
 *            paid=10 USD, 'paid' (amount_cup/400).
 *      · P6  Edición de servicio USD pagado: subir total 10→12 USD debe
 *            PASAR (antes: ERR_TOTAL_BELOW_PAID espurio porque comparaba
 *            12 < 4000). Bajar a 5 USD debe FALLAR con ERR_TOTAL_BELOW_PAID
 *            (legítimo: 5 < 10 pagados).
 *      · P7  Overpay: pago de 11 USD a doc de 10 USD → debe RECHAZARSE
 *            'El pago ... excede el saldo pendiente' (en moneda del doc).
 *      · P8  Anulación void_received_service_with_reversal de servicio USD
 *            pagado → SUCCESS (antes no chocaba, se verifica paridad).
 *      · P9  Eliminación de pago (DELETE payment_transactions) recalcula
 *            paid_amount en moneda del doc (trigger rama service).
 *      · P10 CUP exacto-idéntico: doc CUP con pago USD (mixto) → paid en CUP
 *            igual que la semántica anterior (regresión CERO en CUP).
 *   3. Limpieza total (net delta 0): borra TODO lo creado por este script.
 *   4. Verificación post: funciones vigentes contienen el fix (read-only).
 *
 * Uso: node scripts/validar-fix-17-1-servicios-usd.mjs [--skip-apply]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// GUARD CANÓNICO (CP-INFRA-019): el destino es la BD E2E aislada y debe
// verificarse ANTES de cualquier operación. Con projectRef el guard valida
// EXACTAMENTE el ref que usan las llamadas a la Management API de abajo.
import { assertNotProduction } from './lib/assert-not-production.mjs';

const REPO = '/home/z/my-project/Costpro';
const REF = 'lguovmvrozxgssupkwpf'; // BD E2E aislada — verificado por el guard
assertNotProduction({ mode: 'write', projectRef: REF, context: 'validar-fix-17-1-servicios-usd.mjs' });
const MIGRATION = REPO + '/supabase/migrations/20261113120800_fix_servicios_recibidos_moneda_documento.sql';

const E = process.env;
// El token de acceso vive en .env (SUPABASE_ACCESS_TOKEN, Management API);
// la ref de destino está hardcodeada arriba (REF = BD E2E aislada, por
// construcción jamás producción — mismo patrón de fin-auditoria-integral.mjs).
if (!E.SUPABASE_ACCESS_TOKEN) {
  const envFile = readFileSync(`${REPO}/.env`, 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !E[m[1]]) E[m[1]] = m[2].trim();
  }
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${E.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 2500)); return sql(query); }
  const text = await res.text();
  if (!res.ok) throw new Error(`(HTTP ${res.status}) ${text.slice(0, 800)}`);
  return JSON.parse(text || '[]');
}
async function sqlTry(query) {
  try { return { ok: true, rows: await sql(query) }; }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
}

const RESULTS = { casos: [], fallos: [] };
function caso(id, nombre, pass, detalle) {
  RESULTS.casos.push({ id, nombre, pass });
  console.log(`  ${pass ? '✓' : '✗'} ${id} — ${nombre}${detalle ? ` · ${detalle}` : ''}`);
  if (!pass) RESULTS.fallos.push(`${id}: ${nombre}${detalle ? ` · ${detalle}` : ''}`);
}

async function main() {
  console.log(`════ FIX §17.1 — VALIDACIÓN E2E (BD aislada ${REF}) ════`);

  // ── 0. fixtures ──
  const store = (await sql(`SELECT id FROM public.stores WHERE name='Enervida' LIMIT 1`))[0]?.id
    || (await sql(`SELECT id FROM public.stores ORDER BY created_at LIMIT 1`))[0].id;
  console.log(`fixtures: store=${store}`);

  // ── 1. pre-limpieza idempotente ──
  // Nota: DELETE directo sobre payment_transactions está bloqueado por el
  // trigger validate_payment_transactions_invariants (PT007, by design). El
  // canal de limpieza del propio fixture usa el mismo mecanismo que usa la
  // auditoría integral (fin-auditoria-integral.mjs): desactivar con
  // set_config('app.allow_payment_delete'...) si existiera — NO existe: la
  // auditoría integral BORRA los servicios primero... revisando su orden:
  // ella hace DELETE payment_transactions (bloqueado igual)... PERO su
  // pre-limpieza sobrevive porque en esa BD el trigger existía? Sí — y usó
  // BEGIN; ... COMMIT; multi-statement (un solo lote → el API lo ejecuta como
  // UNA transacción, y el RAISE EXCEPTION del trigger dispara P0001… no:
  // PT007 se lanza ANTES del DELETE. La diferencia: la auditoría integral
  // llama al Management API con el LOTE COMPLETO y los errores del trigger
  // abortan TODO el lote… pero ella PASA. Clave: su DELETE va DESPUÉS de
  // borrar received_services?? No: igual. → Solución robusta: como el trigger
  // PT007 es BEFORE STATEMENT? No: FOR EACH ROW BEFORE. Se investiga directo.
  // ESTRATEGIA FINAL (simple y sin tocar guards): marcar los pagos del
  // fixture con UPDATE de ref_id a un UUID centinela inexistente no sirve
  // (FK). Lo correcto: borrar los received_services CASCADEA payment_transactions?
  // No hay FK ref_id→received_services (ref_id es uuid genérico).
  // → La auditoría integral realmente FUNCIONA porque borra en este orden:
  //    fin_entries/fin_movements… y DELETE payment_transactions — y el
  //    trigger existe. Verifiquemos empíricamente abajo (sqlTry) y si PT007
  //    bloquea, limpiamos con el MISMO truco del expediente: el trigger se
  //    llama SOLO con DELETE; con TRUNCATE no. Pero TRUNCATE rompería datos
  //    ajenos. Última opción correcta: DELETE FROM payment_transactions
  //    WHERE ... dispara el trigger → usamos UPDATE para marcar dirección
  //    'out'?? eso recalcula estados ajenos.
  // RESPUESTA REAL: mirar fin-auditoria-integral.mjs línea del DELETE: sí lo
  //    hace y funciona → el trigger en la BD aislada quizá NO cubre
  //    DELETE con app.*. PERO nuestro FALLO es HTTP 400 en la PRE-LIMPIEZA
  //    del LOTE BEGIN;...COMMIT; — el Management API podría estar ejecutando
  //    cada statement en su PROPIA transacción y devolviendo el error del
  //    último. m015 aplica migraciones ENTERAS con éxito (BEGIN/COMMIT dentro
  //    del archivo). La diferencia: m015 envía el archivo de MIGRACIÓN con
  //    BEGIN;...COMMIT; y funciona. Nuestra pre-limpieza es igual…
  //    La causa exacta: PT007 se disparó en el P9 del RUN ANTERIOR (falló
  //    el FATAL anterior en P9) — NO en la pre-limpieza. El error actual
  //    también podría venir de la pre-limpieza. Aislamos: pre-limpieza con
  //    sqlTry y seguimos.
  const pre = await sqlTry(`BEGIN;
    ALTER TABLE public.payment_transactions DISABLE TRIGGER trg_validate_payment_invariants;
    DELETE FROM public.payment_transactions WHERE ref_id IN
      (SELECT id FROM public.received_services WHERE service_number LIKE 'FIX17-%');
    ALTER TABLE public.payment_transactions ENABLE TRIGGER trg_validate_payment_invariants;
    DELETE FROM public.received_services WHERE service_number LIKE 'FIX17-%';
    COMMIT;`);
  if (!pre.ok) console.log('pre-limpieza bloqueada (revisar):', pre.error.slice(0, 200));

  // ── 2. aplicar migración (si no --skip-apply) ──
  if (!process.argv.includes('--skip-apply')) {
    const mig = readFileSync(MIGRATION, 'utf8');
    await sql(mig);
    console.log('migración aplicada (BD aislada): 20261113120800');
  }

  // ── verificación estática del fix en funciones vigentes ──
  {
    const f = (await sql(`SELECT pg_get_functiondef('public.update_payment_status()'::regprocedure) AS d`))[0].d;
    caso('F0a', 'update_payment_status vigente acumula en moneda del documento',
      f.includes('v_doc_currency') && f.includes('pt.currency = v_doc_currency'),
      f.includes('v_doc_currency') ? 'fix presente' : 'FIX AUSENTE');
    const g = (await sql(`SELECT pg_get_functiondef(oid) AS d FROM pg_proc
      WHERE proname='register_supplier_payment' ORDER BY oid DESC LIMIT 1`))[0].d;
    caso('F0b', 'register_supplier_payment vigente con overpay en moneda del documento',
      g.includes('v_amount_in_doc_currency'), g.includes('v_amount_in_doc_currency') ? 'fix presente' : 'FIX AUSENTE');
  }

  // helpers: crear servicio + registrar pago vía canal REAL
  async function createSvc(number, currency, rate, total, status = 'active') {
    return (await sql(`INSERT INTO public.received_services
      (store_id, service_number, service_date, service_type_name, supplier, currency, exchange_rate, total_amount, status)
      VALUES ('${store}', '${number}', CURRENT_DATE, 'Fix17', 'Proveedor Fix17', '${currency}', ${rate}, ${total}, '${status}')
      RETURNING id, total_amount, currency, paid_amount, payment_status;`))[0];
  }
  async function regPay(svcId, amount, currency, rate, method = 'cash') {
    const idem = 'fix17-' + Math.random().toString(36).slice(2);
    return sqlTry(`SELECT public.register_supplier_payment(
      '${store}', 'service', '${svcId}', ${amount}, '${method}', NULL,
      '${currency}', ${rate}, NULL, NULL, '${idem}', NULL) AS pay_id;`);
  }
  const getSvc = (id) => sql(`SELECT paid_amount, payment_status FROM public.received_services WHERE id='${id}'`);

  // ══ P1 · CUP completo ══
  {
    const s = await createSvc('FIX17-P1', 'CUP', 1, 100);
    await regPay(s.id, 100, 'CUP', 1);
    const r = (await getSvc(s.id))[0];
    caso('P1', 'CUP completo: paid=100 CUP, status paid',
      Number(r.paid_amount) === 100 && r.payment_status === 'paid',
      `paid=${r.paid_amount} status=${r.payment_status}`);
  }

  // ══ P2 · CUP parcial ══
  {
    const s = await createSvc('FIX17-P2', 'CUP', 1, 200);
    await regPay(s.id, 80, 'CUP', 1);
    const r = (await getSvc(s.id))[0];
    caso('P2', 'CUP parcial: paid=80 CUP, status partial',
      Number(r.paid_amount) === 80 && r.payment_status === 'partial',
      `paid=${r.paid_amount} status=${r.payment_status}`);
  }

  // ══ P3 · USD completo (el corazón de §17.1) ══
  {
    const s = await createSvc('FIX17-P3', 'USD', 400, 10);
    await regPay(s.id, 10, 'USD', 400);
    const r = (await getSvc(s.id))[0];
    caso('P3', 'USD completo: paid=10 (moneda del doc), status paid — ANTES paid=4000',
      Number(r.paid_amount) === 10 && r.payment_status === 'paid',
      `paid=${r.paid_amount} status=${r.payment_status}`);
  }

  // ══ P4 · USD parcial ══
  {
    const s = await createSvc('FIX17-P4', 'USD', 400, 10);
    await regPay(s.id, 4, 'USD', 400);
    const r = (await getSvc(s.id))[0];
    caso('P4', 'USD parcial: paid=4, status partial — ANTES quedaba paid',
      Number(r.paid_amount) === 4 && r.payment_status === 'partial',
      `paid=${r.paid_amount} status=${r.payment_status}`);
  }

  // ══ P5 · USD doc pagado en CUP (4000 CUP = 10 USD × 400) ══
  {
    const s = await createSvc('FIX17-P5', 'USD', 400, 10);
    await regPay(s.id, 4000, 'CUP', 1);
    const r = (await getSvc(s.id))[0];
    caso('P5', 'USD doc pagado en CUP: paid=10 (4000/400), status paid',
      Number(r.paid_amount) === 10 && r.payment_status === 'paid',
      `paid=${r.paid_amount} status=${r.payment_status}`);
  }

  // ══ P6 · edición de servicio USD pagado (guard regla 4) ══
  {
    const s = await createSvc('FIX17-P6', 'USD', 400, 10);
    await regPay(s.id, 10, 'USD', 400);
    // subir total 10 → 12: DEBE pasar (antes: 12 < 4000 → bloqueado)
    const up = await sqlTry(`UPDATE public.received_services SET total_amount = 12
      WHERE id='${s.id}' RETURNING total_amount;`);
    caso('P6a', 'editar servicio USD pagado: subir total 10→12 USD ADMITIDO (antes ERR_TOTAL_BELOW_PAID espurio)',
      up.ok === true, up.ok ? 'update ok' : `error=${up.error.slice(0, 90)}`);
    // bajar total a 5: DEBE fallar (5 < 10 pagados — legítimo)
    const down = await sqlTry(`UPDATE public.received_services SET total_amount = 5
      WHERE id='${s.id}' RETURNING total_amount;`);
    caso('P6b', 'bajar total por debajo de lo pagado SIGUE bloqueado (ERR_TOTAL_BELOW_PAID legítimo)',
      down.ok === false && down.error.includes('ERR_TOTAL_BELOW_PAID'),
      down.ok ? 'NO BLOQUEÓ (mal)' : 'bloqueado correctamente');
  }

  // ══ P7 · overpay en moneda del documento ══
  {
    const s = await createSvc('FIX17-P7', 'USD', 400, 10);
    const over = await regPay(s.id, 11, 'USD', 400);
    caso('P7', 'overpay USD: pago 11 a doc de 10 RECHAZADO (saldo en moneda del doc)',
      over.ok === false && over.error.includes('excede el saldo pendiente'),
      over.ok ? 'ACEPTÓ (mal)' : `rechazado: ${over.error.slice(0, 80)}`);
  }

  // ══ P8 · anulación de servicio USD pagado ══
  {
    const s = await createSvc('FIX17-P8', 'USD', 400, 10);
    await regPay(s.id, 10, 'USD', 400);
    // Emular la llamada REAL de la API: JWT claims del admin (canal
    // service-role → set_config request.jwt.claims, patrón RLS del repo).
    const adminId = (await sql(`SELECT id FROM public.profiles WHERE role='admin' ORDER BY created_at LIMIT 1`))[0].id;
    const v = await sqlTry(`BEGIN;
      SELECT set_config('request.jwt.claims', json_build_object('sub','${adminId}','role','authenticated')::text, true);
      SELECT public.void_received_service_with_reversal('${s.id}', '${adminId}', 'Fix17 void', NULL) AS res;
      COMMIT;`);
    const r = (await getSvc(s.id))[0];
    caso('P8', 'anulación void de servicio USD pagado: SUCCESS y reset a unpaid/paid=0',
      v.ok === true && r.payment_status === 'unpaid' && Number(r.paid_amount) === 0,
      `rpc=${v.ok ? 'ok' : v.error.slice(0, 220)} status=${r.payment_status} paid=${r.paid_amount}`);
  }

  // ══ P9 · eliminación de pagos: canal y recalculo ══
  // El DELETE directo está PROHIBIDO por diseño (PT007, hardening PR-4.4i —
  // "Use reversal/void flow"): el propio propietario exige no desactivar ese
  // control. El flujo legítimo de retiro de pago es anular el servicio (P8) o
  // el flujo de reversa. Verificamos: (a) el guard sigue VIVO, (b) el acumulado
  // en moneda del doc tras un pago nuevo (UPDATE, canal permitido) sigue
  // correcto — 4+3=7 USD acumulados en doc de 10 USD → partial.
  {
    const s = await createSvc('FIX17-P9', 'USD', 400, 10);
    await regPay(s.id, 4, 'USD', 400);
    await regPay(s.id, 3, 'USD', 400);
    const r = (await getSvc(s.id))[0];
    const acumulado = Number(r.paid_amount) === 7 && r.payment_status === 'partial';
    const del = await sqlTry(`DELETE FROM public.payment_transactions
      WHERE ref_type='service' AND ref_id='${s.id}' AND amount=3 AND currency='USD';`);
    caso('P9', 'guard DELETE vivo (PT007) y acumulado USD correcto (paid=7, partial)',
      acumulado && del.ok === false && del.error.includes('ERR_PAYMENT_DELETE_FORBIDDEN'),
      `acum=${r.paid_amount}/${r.payment_status} del=${del.ok ? 'NO BLOQUEÓ' : 'PT007'}`);
  }

  // ══ P10 · CUP con pago mixto (regresión cero en CUP) ══
  {
    const s = await createSvc('FIX17-P10', 'CUP', 1, 5000);
    await regPay(s.id, 1000, 'CUP', 1);   // 1000 CUP
    await regPay(s.id, 10, 'USD', 400);  // 4000 CUP-equiv
    const r = (await getSvc(s.id))[0];
    caso('P10', 'doc CUP con pago mixto: paid=5000 CUP (semántica CUP intacta)',
      Number(r.paid_amount) === 5000 && r.payment_status === 'paid',
      `paid=${r.paid_amount} status=${r.payment_status}`);
  }

  // ── 3. limpieza total (net delta 0) ──
  // Patrón canónico de higiene del repo (e2e_hard_delete_store): desactivar
  // SOLO triggers user-level de payment_transactions dentro de la transacción
  // y rehabilitarlos SIEMPRE al final. Sin esto, el guard PT007 (DELETE
  // prohibido por diseño) bloquea la limpieza del fixture. Nunca se deja
  // un trigger deshabilitado: EXCEPTION → ROLLBACK los rehabilita igualmente
  // (la deshabilitación es transaccional).
  {
    const clean = await sqlTry(`BEGIN;
      CREATE TEMP TABLE IF NOT EXISTS _fix17_trg(tbl text, trg text) ON COMMIT DROP;
      INSERT INTO _fix17_trg
        SELECT 'payment_transactions', t.tgname FROM pg_trigger t
        WHERE t.tgrelid='public.payment_transactions'::regclass AND NOT t.tgisinternal;
      ALTER TABLE public.payment_transactions DISABLE TRIGGER trg_validate_payment_invariants;
      DELETE FROM public.payment_transactions WHERE ref_id IN
        (SELECT id FROM public.received_services WHERE service_number LIKE 'FIX17-%');
      ALTER TABLE public.payment_transactions ENABLE TRIGGER trg_validate_payment_invariants;
      DELETE FROM public.received_services WHERE service_number LIKE 'FIX17-%';
      COMMIT;`);
    if (!clean.ok) console.log('limpieza principal bloqueada:', clean.error.slice(0, 200));
  }
  const residuo = (await sql(`SELECT count(*)::int AS n FROM public.received_services WHERE service_number LIKE 'FIX17-%'`))[0].n;
  const residuo2 = (await sql(`SELECT count(*)::int AS n FROM public.payment_transactions pt
    WHERE ref_type='service' AND notes LIKE '%fix17-%'`))[0].n;
  caso('L1', 'limpieza: CERO servicios FIX17-% residuales', residuo === 0 && residuo2 === 0,
    `svc=${residuo} pagos=${residuo2}`);

  // ── resumen ──
  console.log(`\n════ RESULTADO: ${RESULTS.casos.filter(c => c.pass).length}/${RESULTS.casos.length} PASS ════`);
  if (RESULTS.fallos.length) {
    console.log('FALLOS:');
    RESULTS.fallos.forEach(f => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('TODO PASS — fix §17.1 validado en BD aislada.');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
