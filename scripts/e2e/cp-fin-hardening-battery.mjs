// scripts/e2e/cp-fin-hardening-battery.mjs — Batería de contrato CP-FIN-REM-001 PR-A
// (F2/F3/F4/F5/TR) contra la BD E2E AISLADA (CostproE2E).
// ============================================================================
// MECANISMO (lección CP-INFRA-011 + sesión E2E de create_sale_v2): TODO se
// ejecuta en UNA SOLA llamada multi-sentencia transaccional BEGIN ... ROLLBACK.
// Los DDL (CREATE TRIGGER/CREATE POLICY/CREATE OR REPLACE FUNCTION) son
// transaccionales: la base queda EXACTAMENTE igual al final (cero residuos).
//
// Aislamiento (equivalente SQL del guard e2e/fixtures/assert-isolated-db de
// CP-INFRA-011): se verifica la centinela public.e2e_is_isolated_db() = true
// DENTRO de la propia transacción y el REF está fijado fail-closed al proyecto
// CostproE2E; si algo no cuadra, la batería ABORTA sin ejecutar nada.
//
// Estructura: fixtures → demostración PRE (vulnerabilidades reales) →
// migraciones M1..M6 (BEGIN/COMMIT despojados) → casos POST → rollbacks R6..R1
// → aserciones RESTORE (vuelve al estado vulnerable) → BATTERY-PASS → ROLLBACK.
// Sin PII: usuarios/tiendas/fixtures sintéticos con UUIDs generados en runtime.
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const ROOT = new URL('../../', import.meta.url).pathname; // raíz del repo
const REF = 'lguovmvrozxgssupkwpf'; // CostproE2E — FALLA CERRADA: único destino posible
const env = {};
for (const line of readFileSync(`${ROOT}.env`, 'utf8').split('\n')) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const token = env.E2E_SUPABASE_ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN;
if (!token) { console.error('FATAL: token ausente'); process.exit(1); }

const MIG = `${ROOT}supabase/migrations`;
const ROLL = `${ROOT}supabase/rollbacks`;
const OUT = `${ROOT}audit-evidence/CP-FIN-REVIEW-001`;

// ── UUIDs de fixtures (estables dentro de la corrida) ──
const U = {
  clerk: randomUUID(), encargado: randomUUID(), manager: randomUUID(), adminT: randomUUID(),
  adminG: randomUUID(), superU: randomUUID(), user0: randomUUID(), tenant2: randomUUID(),
};
const S1 = randomUUID(), S2 = randomUUID(), S3 = randomUUID();
const G_act = randomUUID(), G_sup = randomUUID();
const RG = randomUUID(), RS = randomUUID();
const E1 = randomUUID(), E_A = randomUUID(), E_Ac = randomUUID(), E_B = randomUUID(), E_B2 = randomUUID();
const E_orig = randomUUID(), E_rev = randomUUID(), E_3m = randomUUID(), E_3r = randomUUID();
const E_sup = randomUUID(), R_sup = randomUUID(), E_act2 = randomUUID(), R_act = randomUUID();
const E_sacri = randomUUID(), E_S2 = randomUUID(), E3 = randomUUID();
const RC1 = randomUUID(), RC2 = randomUUID();
const G2_act = randomUUID();

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '').trim();

const M = ['20261128153000_cp_fin_f2_book_read_management.sql',
  '20261128153100_cp_fin_f2_rpc_management_gate.sql',
  '20261128153200_cp_fin_f3_rule_scope_guard.sql',
  '20261128153300_cp_fin_f4_ledger_append_only.sql',
  '20261128153400_cp_fin_f5_reversal_fixes.sql',
  '20261128153500_cp_infra_021_truncate_fin_payroll.sql'].map(f => strip(`${MIG}/${f}`));
const R = ['20261128153500_rollback_cp_infra_021.sql',
  '20261128153400_rollback_cp_fin_f5.sql',
  '20261128153300_rollback_cp_fin_f4.sql',
  '20261128153200_rollback_cp_fin_f3.sql',
  '20261128153100_rollback_cp_fin_f2_rpc.sql',
  '20261128153000_rollback_cp_fin_f2.sql'].map(f => strip(`${ROLL}/${f}`));

// Helpers de composición
const asUser = (u, role = 'authenticated') =>
  `SET LOCAL ROLE ${role};\nSET LOCAL request.jwt.claims TO '{"sub":"${u}","role":"${role}"}';`;
const asPostgres = `SET LOCAL ROLE postgres;\nSET LOCAL request.jwt.claims TO '{}';`;
const asService = `SET LOCAL ROLE service_role;\nSET LOCAL request.jwt.claims TO '{"role":"service_role"}';`;
const asAnon = `SET LOCAL ROLE anon;\nSET LOCAL request.jwt.claims TO '{"role":"anon"}';`;
// Caso expect-exception (captura SQLERRM y SQLSTATE; el marcador puede estar en el
// mensaje o ser un SQLSTATE como 42501)
const expectErr = (id, stmt, marker) => `
DO $${id}$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    ${stmt}
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('${marker}' in v_err) = 0 AND coalesce(v_state,'') <> '${marker}') THEN
    RAISE EXCEPTION 'CASE ${id} FAILED: se esperaba ${marker}, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $${id}$;`;
// Caso expect-éxito con aserción adicional opcional
const expectOk = (id, stmt, extra = '') => `
DO $${id}$
BEGIN
  ${stmt}
  ${extra}
END $${id}$;`;
// Caso expect-silencio-RLS (0 filas tocadas, sin error)
const expectZeroRows = (id, stmt) => `
DO $${id}$
DECLARE v_n int := 0;
BEGIN
  ${stmt}
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'CASE ${id} FAILED: RLS debía denegar en silencio (0 filas), tocó %', v_n; END IF;
END $${id}$;`;

const sql = `
BEGIN;

DO $guard$
BEGIN
  IF NOT public.e2e_is_isolated_db() THEN
    RAISE EXCEPTION 'BATTERY-PRECOND: la BD destino NO es la aislada (centinela false) — ABORT';
  END IF;
END $guard$;

-- ═══ FIXTURES (todo se revierte al final) ══════════════════════════════════
INSERT INTO auth.users (id, email) VALUES
  ('${U.clerk}','bat-clerk@cpfin.invalid'),
  ('${U.encargado}','bat-encargado@cpfin.invalid'),
  ('${U.manager}','bat-manager@cpfin.invalid'),
  ('${U.adminT}','bat-admint@cpfin.invalid'),
  ('${U.adminG}','bat-adming@cpfin.invalid'),
  ('${U.superU}','bat-super@cpfin.invalid'),
  ('${U.user0}','bat-user@cpfin.invalid'),
  ('${U.tenant2}','bat-tenant2@cpfin.invalid');

INSERT INTO public.stores (id, name) VALUES ('${S1}','BAT-FIN S1'), ('${S2}','BAT-FIN S2'), ('${S3}','BAT-FIN S3');

INSERT INTO public.user_store_memberships (user_id, store_id, role, status) VALUES
  ('${U.clerk}','${S1}','clerk','active'),
  ('${U.encargado}','${S1}','encargado','active'),
  ('${U.manager}','${S1}','manager','active'),
  ('${U.adminT}','${S1}','admin','active'),
  ('${U.tenant2}','${S2}','admin','active');

-- El trigger de Supabase crea el profile al insertar el usuario; se AJUSTA el rol
-- (DESPUÉS de las memberships: validate_active_store exige membership activa)
UPDATE public.profiles SET active_store_id='${S1}' WHERE id IN ('${U.clerk}','${U.encargado}','${U.manager}','${U.adminT}');
UPDATE public.profiles SET active_store_id='${S2}' WHERE id='${U.tenant2}';
UPDATE public.profiles SET role='admin' WHERE id='${U.adminG}';
UPDATE public.profiles SET role='superadmin' WHERE id='${U.superU}';

INSERT INTO public.fin_posting_generations (id, store_id, code, status) VALUES
  ('${G_act}','${S1}','GEN-BAT','active'),
  ('${G_sup}','${S1}','GEN-SUP','superseded');

INSERT INTO public.fin_rule_versions (id, document_type, store_id, movements, version) VALUES
  ('${RG}','VENTA',NULL,'[]'::jsonb,1),
  ('${RS}','VENTA','${S1}','[]'::jsonb,2);

INSERT INTO public.fin_posting_errors (store_id, document_type, event, error_code, error_detail) VALUES
  (NULL,'VENTA','reconocimiento','BAT-GLOBAL','fixture global'),
  ('${S1}','VENTA','reconocimiento','BAT-STORE','fixture tienda');

-- Asientos y movimientos de fixtures
INSERT INTO public.fin_entries (id, store_id, document_type, document_number, event, economic_date, generation_id, status) VALUES
  ('${E1}','${S1}','VENTA','BAT-E1','reconocimiento','2026-11-01',NULL,'posted'),
  ('${E_A}','${S1}','VENTA','BAT-EA','reconocimiento','2026-11-01','${G_act}','posted'),
  ('${E_B}','${S1}','VENTA','BAT-EB','reconocimiento','2026-11-01',NULL,'posted'),
  ('${E_B2}','${S1}','VENTA','BAT-EB2','reconocimiento','2026-11-01','${G_act}','posted'),
  ('${E_orig}','${S1}','VENTA','BAT-EOR','reconocimiento','2026-11-01','${G_act}','posted'),
  ('${E_rev}','${S1}','VENTA','BAT-ERE','anulacion','2026-11-02','${G_act}','posted'),
  ('${E_3m}','${S1}','VENTA','BAT-E3M','reconocimiento','2026-11-01','${G_act}','posted'),
  ('${E_3r}','${S1}','VENTA','BAT-E3R','anulacion','2026-11-02','${G_act}','posted'),
  ('${E_sup}','${S1}','RECEPCION','BAT-ES','reconocimiento','2026-11-01','${G_sup}','posted'),
  ('${R_sup}','${S1}','RECEPCION','BAT-RS','anulacion','2026-11-02','${G_sup}','posted'),
  ('${E_act2}','${S1}','RECEPCION','BAT-EA2','reconocimiento','2026-11-01','${G_act}','posted'),
  ('${R_act}','${S1}','RECEPCION','BAT-RA','anulacion','2026-11-02','${G_act}','posted'),
  ('${E_sacri}','${S1}','VENTA','BAT-ESAC','reconocimiento','2026-11-01',NULL,'posted'),
  ('${E_S2}','${S2}','VENTA','BAT-ES2','reconocimiento','2026-11-01',NULL,'posted'),
  ('${E3}','${S3}','VENTA','BAT-E3','reconocimiento','2026-11-01',NULL,'posted');

UPDATE public.fin_entries SET reversal_of='${E_orig}' WHERE id='${E_rev}';
UPDATE public.fin_entries SET reversal_of='${E_3m}' WHERE id='${E_3r}';
UPDATE public.fin_entries SET reversal_of='${E_sup}' WHERE id='${R_sup}';
UPDATE public.fin_entries SET reversal_of='${E_act2}' WHERE id='${R_act}';
UPDATE public.fin_entries SET document_id='${RC1}' WHERE id IN ('${E_sup}','${R_sup}');
UPDATE public.fin_entries SET document_id='${RC2}' WHERE id IN ('${E_act2}','${R_act}');

INSERT INTO public.fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date) VALUES
  ('${randomUUID()}','${E_sacri}','${S1}','ACT_EFECTIVO_CUP','debito',10,'CUP',1,'2026-11-01'),
  ('${randomUUID()}','${E1}','${S1}','ACT_EFECTIVO_CUP','debito',10,'CUP',1,'2026-11-01'),
  ('${randomUUID()}','${E_A}','${S1}','ACT_EFECTIVO_CUP','debito',10,'CUP',1,'2026-11-01'),
  ('${randomUUID()}','${E_B}','${S1}','ACT_EFECTIVO_CUP','debito',10,'CUP',1,'2026-11-01'),
  ('${randomUUID()}','${E_B2}','${S1}','ACT_EFECTIVO_CUP','debito',10,'CUP',1,'2026-11-01'),
  ('${randomUUID()}','${E_S2}','${S2}','ACT_EFECTIVO_CUP','debito',10,'CUP',1,'2026-11-01'),
  ('${randomUUID()}','${E3}','${S3}','ACT_EFECTIVO_CUP','debito',10,'CUP',1,'2026-11-01'),
  -- F5: original 100 USD × 2 = 200 CUP; reversión parcial 40 USD × 2 = 80 CUP → residual CUP 120
  ('${randomUUID()}','${E_orig}','${S1}','ACT_EFECTIVO_USD','debito',100,'USD',2,'2026-11-01'),
  ('${randomUUID()}','${E_rev}','${S1}','ACT_EFECTIVO_USD','credito',40,'USD',2,'2026-11-02'),
  -- F5 multimoneda: original 100 USD × 2 = 200 CUP; reversión 30 EUR × 1.1 = 33 CUP → residual 167
  ('${randomUUID()}','${E_3m}','${S1}','ACT_EFECTIVO_USD','debito',100,'USD',2,'2026-11-01'),
  ('${randomUUID()}','${E_3r}','${S1}','ACT_EFECTIVO_USD','credito',30,'EUR',1.1,'2026-11-02'),
  -- T12: superseded 100 CUP / reversión 40 CUP (residual 60); activa idem
  ('${randomUUID()}','${E_sup}','${S1}','ACT_EFECTIVO_CUP','debito',100,'CUP',1,'2026-11-01'),
  ('${randomUUID()}','${R_sup}','${S1}','ACT_EFECTIVO_CUP','credito',40,'CUP',1,'2026-11-02'),
  ('${randomUUID()}','${E_act2}','${S1}','ACT_EFECTIVO_CUP','debito',100,'CUP',1,'2026-11-01'),
  ('${randomUUID()}','${R_act}','${S1}','ACT_EFECTIVO_CUP','credito',40,'CUP',1,'2026-11-02');

INSERT INTO public.receipts (id, store_id, status) VALUES ('${RC1}','${S1}','pending'), ('${RC2}','${S1}','pending');

-- G2_act para S2 se crea AQUÍ (después de los INSERT de entradas): E_S2 nació
-- con generation_id NULL porque al insertarse S2 no tenía generación activa
-- (el BEFORE INSERT fin_trg_entries_generation solo rellena si existe).
INSERT INTO public.fin_posting_generations (id, store_id, code, status) VALUES
  ('${G2_act}','${S2}','GEN-BAT','active');

-- ═══ DEMOSTRACIÓN PRE (vulnerabilidades reales del estado vigente) ═════════
${asUser(U.clerk)}
DO $pre1$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.fin_entries WHERE store_id='${S1}';
  IF v_n < 1 THEN RAISE EXCEPTION 'PRE-1 FAILED: el clerk debería ver el libro (estado vulnerable)'; END IF;
END $pre1$;
DO $pre2$
DECLARE ok boolean;
BEGIN
  SELECT public.fin_get_dashboard('${S1}','2026-01-01','2026-12-31') IS NOT NULL INTO ok;
  IF NOT ok THEN RAISE EXCEPTION 'PRE-2 FAILED: dashboard nulo para clerk (estado vulnerable)'; END IF;
END $pre2$;
${asPostgres}
DO $pre3$
DECLARE v_r numeric;
BEGIN
  SELECT public.fin_entry_reversal_residual('${E_orig}') INTO v_r;
  IF v_r <> 60 THEN RAISE EXCEPTION 'PRE-3 FAILED: residual previo debería ser 60 (bug m.amount), obtuve %', v_r; END IF;
END $pre3$;
${expectErr('pre4', `UPDATE public.receipts SET status='voided' WHERE id='${RC1}';`, 'ERR_PARTIAL_REVERSAL_PENDING')}
${asUser(U.adminT)}
${expectOk('pre5', `UPDATE public.fin_rule_versions SET store_id='${S1}' WHERE id='${RG}';`, `IF NOT FOUND THEN RAISE EXCEPTION 'PRE-5 FAILED: la reasignación de regla global DEBÍA ser posible (vulnerabilidad)'; END IF;`)}
${asPostgres}
UPDATE public.fin_rule_versions SET store_id=NULL WHERE id='${RG}';
${expectOk('pre6', `UPDATE public.fin_entries SET description='hackeado' WHERE id='${E1}';`, `IF NOT FOUND THEN RAISE EXCEPTION 'PRE-6 FAILED'; END IF;`)}
${expectOk('pre7', `UPDATE public.fin_movements SET amount=5 WHERE entry_id='${E_sacri}';`, `IF NOT FOUND THEN RAISE EXCEPTION 'PRE-7 FAILED'; END IF;`)}
${expectOk('pre8', `DELETE FROM public.fin_movements WHERE entry_id='${E_sacri}';`, `IF NOT FOUND THEN RAISE EXCEPTION 'PRE-8 FAILED'; END IF;`)}
${expectOk('pre9', `TRUNCATE public.fin_posting_errors;`)}
INSERT INTO public.fin_posting_errors (store_id, document_type, event, error_code, error_detail) VALUES
  (NULL,'VENTA','reconocimiento','BAT-GLOBAL','fixture global'),
  ('${S1}','VENTA','reconocimiento','BAT-STORE','fixture tienda');
UPDATE public.receipts SET status='pending' WHERE id='${RC1}';

-- ═══ MIGRACIONES M1..M6 (transaccionales dentro de la batería) ═════════════
${M.join('\n\n')}

-- ═══ CASOS POST ════════════════════════════════════════════════════════════
-- F2-1..F2-8: matriz SELECT RLS (propia tienda / otra tienda)
${asUser(U.clerk)}
DO $f2c$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.fin_entries WHERE store_id='${S1}';
  IF v <> 0 THEN RAISE EXCEPTION 'F2-1 FAILED: clerk vio % asientos (debía 0)', v; END IF;
  SELECT count(*) INTO v FROM public.fin_movements WHERE store_id='${S1}';
  IF v <> 0 THEN RAISE EXCEPTION 'F2-1b FAILED: clerk vio % movimientos', v; END IF;
  SELECT count(*) INTO v FROM public.fin_opening_balances WHERE store_id='${S1}';
  IF v <> 0 THEN RAISE EXCEPTION 'F2-1c FAILED'; END IF;
  SELECT count(*) INTO v FROM public.fin_posting_errors;
  IF v <> 0 THEN RAISE EXCEPTION 'F2-1d FAILED: clerk vio % errores (globales+tienda)', v; END IF;
END $f2c$;
${asUser(U.user0)}
DO $f2u$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.fin_entries WHERE store_id='${S1}';
  IF v <> 0 THEN RAISE EXCEPTION 'F2-2 FAILED: usuario sin membresía vio %', v; END IF;
END $f2u$;
${asUser(U.encargado)}
DO $f2e$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.fin_entries WHERE store_id='${S1}';
  IF v < 1 THEN RAISE EXCEPTION 'F2-3 FAILED: encargado no ve su tienda'; END IF;
END $f2e$;
${asUser(U.manager)}
DO $f2m$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.fin_entries WHERE store_id='${S1}';
  IF v < 1 THEN RAISE EXCEPTION 'F2-4 FAILED: manager no ve su tienda'; END IF;
  SELECT count(*) INTO v FROM public.fin_posting_errors WHERE store_id='${S1}';
  IF v < 1 THEN RAISE EXCEPTION 'F2-4b FAILED: manager no ve errores de tienda'; END IF;
  SELECT count(*) INTO v FROM public.fin_posting_errors WHERE store_id IS NULL;
  IF v <> 0 THEN RAISE EXCEPTION 'F2-4c FAILED: manager vio % errores globales', v; END IF;
END $f2m$;
${asUser(U.adminT)}
DO $f2a$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.fin_entries WHERE store_id='${S1}';
  IF v < 1 THEN RAISE EXCEPTION 'F2-5 FAILED: admin de tienda no ve'; END IF;
END $f2a$;
${asUser(U.adminG)}
DO $f2g$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.fin_entries WHERE store_id='${S1}';
  IF v < 1 THEN RAISE EXCEPTION 'F2-6 FAILED: admin global no ve S1'; END IF;
  SELECT count(*) INTO v FROM public.fin_entries WHERE store_id='${S2}';
  IF v < 1 THEN RAISE EXCEPTION 'F2-6b FAILED: admin global no ve S2'; END IF;
  SELECT count(*) INTO v FROM public.fin_posting_errors;
  IF v <> 2 THEN RAISE EXCEPTION 'F2-6c FAILED: admin global debe ver 2 errores, ve %', v; END IF;
END $f2g$;
${asUser(U.tenant2)}
DO $f2t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.fin_entries WHERE store_id='${S1}';
  IF v <> 0 THEN RAISE EXCEPTION 'F2-7 FAILED: otro tenant vio % asientos de S1', v; END IF;
  SELECT count(*) INTO v FROM public.fin_entries WHERE store_id='${S2}';
  IF v < 1 THEN RAISE EXCEPTION 'F2-7b FAILED: admin de S2 no ve SU tienda'; END IF;
END $f2t$;
${asAnon}
${expectErr('f2n', `SELECT count(*) FROM public.fin_entries WHERE store_id='${S1}';`, 'permission denied')}

-- F2-RPC: gate de gestión por LLAMADA DIRECTA
${asUser(U.clerk)}
${expectErr('f2rpc1', `SELECT public.fin_get_dashboard('${S1}','2026-01-01','2026-12-31');`, 'ERR_UNAUTHORIZED')}
${asUser(U.manager)}
${expectOk('f2rpc2', `PERFORM public.fin_get_dashboard('${S1}','2026-01-01','2026-12-31');`)}
${asUser(U.encargado)}
${expectOk('f2rpc3', `PERFORM public.fin_get_income_statement('${S1}','2026-01-01','2026-12-31');`)}
${asService}
${expectErr('f2rpc4', `SELECT public.fin_get_balance_sheet('${S1}','2026-11-28',NULL);`, 'ERR_UNAUTHORIZED')}
${expectOk('f2rpc5', `PERFORM public.fin_get_balance_sheet('${S1}','2026-11-28','${U.manager}'::uuid);`)}
${asPostgres}
DO $f2rpc6$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname='fin_get_reconciliation' AND array_to_string(proacl, ',') LIKE '%authenticated%';
  IF v_n <> 0 THEN RAISE EXCEPTION 'F2-RPC-6 FAILED: fin_get_reconciliation NO debe ampliarse a authenticated'; END IF;
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname='fin_get_category_detail' AND array_to_string(proacl, ',') LIKE '%authenticated%';
  IF v_n <> 0 THEN RAISE EXCEPTION 'F2-RPC-6b FAILED'; END IF;
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname='fin_get_dashboard' AND array_to_string(proacl, ',') LIKE '%authenticated%';
  IF v_n <> 1 THEN RAISE EXCEPTION 'F2-RPC-6c FAILED: fin_get_dashboard perdió EXECUTE authenticated'; END IF;
END $f2rpc6$;

-- F3: ámbito de reglas (RLS deniega en silencio 0 filas; el trigger aborta)
${asUser(U.adminT)}
${expectZeroRows('f3a', `UPDATE public.fin_rule_versions SET store_id='${S1}' WHERE id='${RG}';`)}
${asPostgres}
${expectErr('f3b', `UPDATE public.fin_rule_versions SET store_id='${S1}' WHERE id='${RG}';`, 'ERR_FIN_RULE_SCOPE_IMMUTABLE')}
${expectErr('f3c', `UPDATE public.fin_rule_versions SET store_id='${S1}', notes='multi' WHERE id='${RG}';`, 'ERR_FIN_RULE_SCOPE_IMMUTABLE')}
${expectOk('f3d', `UPDATE public.fin_rule_versions SET notes='admin-global-ok' WHERE id='${RG}';`, `IF NOT FOUND THEN RAISE EXCEPTION 'F3-d FAILED'; END IF;`)}
${asUser(U.adminT)}
${expectOk('f3e', `UPDATE public.fin_rule_versions SET notes='admin-tienda-ok' WHERE id='${RS}';`, `IF NOT FOUND THEN RAISE EXCEPTION 'F3-e FAILED'; END IF;`)}
${asUser(U.manager)}
${expectZeroRows('f3f', `UPDATE public.fin_rule_versions SET notes='x' WHERE id='${RS}';`)}

-- F4: solo-adición
${asPostgres}
${expectErr('f4a', `UPDATE public.fin_entries SET description='hack' WHERE id='${E1}';`, 'ERR_FIN_INMUTABLE')}
${expectErr('f4b', `UPDATE public.fin_entries SET economic_date='2026-01-01' WHERE id='${E1}';`, 'ERR_FIN_INMUTABLE')}
${expectErr('f4c', `DELETE FROM public.fin_entries WHERE id='${E1}';`, 'ERR_FIN_INMUTABLE')}
${expectErr('f4d', `UPDATE public.fin_movements SET amount=5 WHERE entry_id='${E_orig}';`, 'ERR_FIN_INMUTABLE')}
${expectErr('f4e', `DELETE FROM public.fin_movements WHERE entry_id='${E_orig}';`, 'ERR_FIN_INMUTABLE')}
${expectErr('f4f', `UPDATE public.fin_entries SET status='reversed' WHERE id='${E1}';`, 'ERR_FIN_INMUTABLE')}
-- (A) válida: contraasiento insertado antes en la MISMA transacción
INSERT INTO public.fin_entries (id, store_id, document_type, document_number, event, economic_date, generation_id, status, reversal_of)
VALUES ('${E_Ac}','${S1}','VENTA','BAT-EAC','anulacion','2026-11-01','${G_act}','posted','${E_A}');
${expectOk('f4g', `UPDATE public.fin_entries SET status='reversed' WHERE id='${E_A}';`, `IF NOT FOUND THEN RAISE EXCEPTION 'F4-g FAILED'; END IF;`)}
${expectErr('f4h', `UPDATE public.fin_entries SET status='posted' WHERE id='${E_A}';`, 'ERR_FIN_INMUTABLE')}
-- (B) relleno válido de generación + variantes bloqueadas
${expectOk('f4i', `UPDATE public.fin_entries SET generation_id='${G2_act}' WHERE id='${E_S2}';`, `IF NOT FOUND THEN RAISE EXCEPTION 'F4-i FAILED'; END IF;`)}
${expectErr('f4j', `UPDATE public.fin_entries SET generation_id=NULL WHERE id='${E_S2}';`, 'ERR_FIN_INMUTABLE')}
${expectErr('f4k', `UPDATE public.fin_entries SET generation_id='${G_sup}' WHERE id='${E_S2}';`, 'ERR_FIN_INMUTABLE')}
${expectErr('f4l', `UPDATE public.fin_entries SET generation_id='${G_sup}' WHERE id='${E_B2}';`, 'ERR_FIN_INMUTABLE')}
-- Rectificación controlada por fin_rectification_apply (crea + repara + audita)
DO $f4r$
DECLARE v_out jsonb;
BEGIN
  SELECT public.fin_rectification_apply('${S1}','BAT-RECT-001','VENTA','2026-11-01','rect bat',
    '[{"categoria":"ACT_EFECTIVO_CUP","sentido":"debito","amount":10},{"categoria":"ACT_EFECTIVO_CUP","sentido":"credito","amount":10}]'::jsonb,
    NULL,'${U.manager}',false) INTO v_out;
  IF (v_out->>'status') IS DISTINCT FROM 'creada' THEN RAISE EXCEPTION 'F4-r1 FAILED: %', v_out; END IF;
  SELECT public.fin_rectification_apply('${S1}','BAT-RECT-001','VENTA','2026-11-01','rect bat rep',
    '[{"categoria":"ACT_EFECTIVO_CUP","sentido":"debito","amount":20},{"categoria":"ACT_EFECTIVO_CUP","sentido":"credito","amount":20}]'::jsonb,
    NULL,'${U.manager}',true) INTO v_out;
  IF (v_out->>'status') IS DISTINCT FROM 'reparada' THEN RAISE EXCEPTION 'F4-r2 FAILED: %', v_out; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE action='FIN_MAINTENANCE_ENTRY_RECTIFIED') THEN
    RAISE EXCEPTION 'F4-r3 FAILED: sin auditoría del bypass de entrada'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE action='FIN_MAINTENANCE_MOVEMENTS_REPLACED') THEN
    RAISE EXCEPTION 'F4-r4 FAILED: sin auditoría del bypass de movimientos'; END IF;
END $f4r$;
-- Bypass manual (FRENO, no candado — documentado): asiento equivocado o columna
-- equivocada NO pasan; asiento correcto + columnas permitidas SÍ pasa (y audita).
SET LOCAL costpro.fin_maintenance='on';
SET LOCAL costpro.fin_rectification_entry='${E1}';
${expectErr('f4s', `UPDATE public.fin_entries SET economic_date='2026-01-01' WHERE id='${E1}';`, 'ERR_FIN_INMUTABLE')}
SET LOCAL costpro.fin_rectification_entry='${E_B2}';
${expectErr('f4t', `UPDATE public.fin_entries SET description='otro-asiento' WHERE id='${E1}';`, 'ERR_FIN_INMUTABLE')}
${expectOk('f4u', `UPDATE public.fin_entries SET description='manual-permitido' WHERE id='${E_B2}';`, `IF NOT FOUND THEN RAISE EXCEPTION 'F4-u FAILED'; END IF;`)}
SET LOCAL costpro.fin_maintenance='off';
SET LOCAL costpro.fin_rectification_entry='';
-- Cascada de borrado duro de tienda: bloqueada por FK de audit_logs
-- (barrera PREEXISTENTE que actúa ANTES que el trigger F4); la barrera propia
-- del libro se demuestra directamente en f4v2 (DELETE del asiento de S3).
${expectErr('f4v', `DELETE FROM public.stores WHERE id='${S3}';`, '23503')}
${expectErr('f4v2', `DELETE FROM public.fin_entries WHERE id='${E3}';`, 'ERR_FIN_INMUTABLE')}
${expectOk('f4w', `PERFORM public.soft_delete_store('${S3}','${U.manager}');`)}

-- F5: residual en CUP + T12 por generación activa
DO $f5a$
DECLARE v_r numeric;
BEGIN
  SELECT public.fin_entry_reversal_residual('${E_orig}') INTO v_r;
  IF v_r <> 120 THEN RAISE EXCEPTION 'F5-1 FAILED: esperaba 120 CUP, obtuve %', v_r; END IF;
  SELECT public.fin_entry_reversal_residual('${E_3m}') INTO v_r;
  IF v_r <> 167 THEN RAISE EXCEPTION 'F5-2 FAILED: multimoneda esperaba 167, obtuve %', v_r; END IF;
END $f5a$;
${expectOk('f5b', `UPDATE public.receipts SET status='voided' WHERE id='${RC1}';`, `IF NOT FOUND THEN RAISE EXCEPTION 'F5-3 FAILED'; END IF;`)}
${expectErr('f5c', `UPDATE public.receipts SET status='voided' WHERE id='${RC2}';`, 'ERR_PARTIAL_REVERSAL_PENDING')}

-- TR: freno de TRUNCATE
${expectErr('tr1', `TRUNCATE public.fin_posting_errors;`, 'ERR_TRUNCATE_BLOQUEADO')}
SET LOCAL costpro.allow_truncate='on';
${expectOk('tr2', `TRUNCATE public.fin_posting_errors;`)}
SET LOCAL costpro.allow_truncate='off';
DO $tr3$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_trigger t
   JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
   JOIN pg_namespace ns ON ns.oid=c.relnamespace
  WHERE ns.nspname='public' AND p.proname='block_truncate' AND t.tgenabled='A'
    AND c.relname IN ('fin_account_mapping','fin_categories','fin_document_types','fin_entries','fin_metric_catalog','fin_movements','fin_opening_balances','fin_posting_errors','fin_posting_generations','fin_reconciliation_config','fin_reconciliation_snapshots','fin_rule_versions','payroll_item_concepts','payroll_items','payrolls','worker_salary_rates');
  IF v_n <> 16 THEN RAISE EXCEPTION 'TR-3 FAILED: %/16 frenos ENABLE ALWAYS', v_n; END IF;
END $tr3$;

-- ═══ ROLLBACKS R6..R1 ═════════════════════════════════════════════════════
${R.join('\n\n')}

-- ═══ ASERCIONES RESTORE (estado vulnerable de vuelta = rollback correcto) ══
${asPostgres}
DO $rs1$
DECLARE v text; v_r numeric;
BEGIN
  SELECT qual INTO v FROM pg_policies WHERE policyname='fin_entries_select';
  IF position('has_store_access' in coalesce(v,'')) = 0 THEN RAISE EXCEPTION 'RS-1 FAILED: política no restaurada'; END IF;
  SELECT prosrc INTO v FROM pg_proc WHERE proname='fin_get_balance_sheet';
  IF position('has_store_access_as' in v) = 0 THEN RAISE EXCEPTION 'RS-2 FAILED: RPC sin patrón previo'; END IF;
  SELECT public.fin_entry_reversal_residual('${E_orig}') INTO v_r;
  IF v_r <> 60 THEN RAISE EXCEPTION 'RS-3 FAILED: residual previo % (esperado 60)', v_r; END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
             JOIN pg_proc p ON p.oid=t.tgfoid
             WHERE p.proname IN ('fin_entries_immutable_guard','fin_movements_immutable_guard')) THEN
    RAISE EXCEPTION 'RS-4 FAILED: triggers de inmutabilidad siguen presentes'; END IF;
  SELECT count(*) INTO v_r FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace ns ON ns.oid=c.relnamespace
  WHERE ns.nspname='public' AND p.proname='block_truncate' AND c.relname='fin_posting_errors';
  IF v_r <> 0 THEN RAISE EXCEPTION 'RS-5 FAILED: freno TRUNCATE no retirado'; END IF;
END $rs1$;
${expectErr('rs6', `UPDATE public.receipts SET status='voided' WHERE id='${RC2}';`, 'ERR_PARTIAL_REVERSAL_PENDING')}
-- (RC1 fue anulada en f5b; RC2 sigue pending: bajo el estado previo la
-- reversión parcial de la generación ACTIVA bloquea — comportamiento viejo restaurado)
${asUser(U.clerk)}
DO $rs7$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.fin_entries WHERE store_id='${S1}';
  IF v < 1 THEN RAISE EXCEPTION 'RS-7 FAILED: la política amplia no volvió'; END IF;
END $rs7$;

SELECT 'BATTERY-PASS' AS verdict;

ROLLBACK;
`;

writeFileSync(`${OUT}/cp-fin-hardening-battery.sql`, sql);
console.log(`Batería compuesta: ${sql.length} chars (${OUT}/cp-fin-hardening-battery.sql)`);

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const text = await res.text();
writeFileSync(`${OUT}/cp-fin-hardening-battery-result.json`, text);
if (res.status === 200 || res.status === 201) {
  const j = JSON.parse(text);
  console.log('RESULTADO:', JSON.stringify(j).slice(0, 400));
  const verdict = Array.isArray(j) ? (j[j.length-1]?.verdict || j[0]?.verdict) : j?.r;
  console.log(verdict === 'BATTERY-PASS' ? 'BATTERY-PASS ✔ (37+ casos PRE/POST/RESTORE en verde)' : `Resultado inesperado: ${JSON.stringify(j).slice(0, 300)}`);
} else {
  console.error(`HTTP ${res.status}:`, text.slice(0, 2000));
  process.exit(2);
}
