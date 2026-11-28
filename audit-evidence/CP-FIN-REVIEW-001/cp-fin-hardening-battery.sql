
BEGIN;

DO $guard$
BEGIN
  IF NOT public.e2e_is_isolated_db() THEN
    RAISE EXCEPTION 'BATTERY-PRECOND: la BD destino NO es la aislada (centinela false) — ABORT';
  END IF;
END $guard$;

-- ═══ FIXTURES (todo se revierte al final) ══════════════════════════════════
INSERT INTO auth.users (id, email) VALUES
  ('08b08515-be1a-49f8-ab92-884d55eec42d','bat-clerk@cpfin.invalid'),
  ('0e274ac0-084c-4c9b-a784-6c1a4ee3379e','bat-encargado@cpfin.invalid'),
  ('efeb3464-18ef-402c-b908-9a22793bff0b','bat-manager@cpfin.invalid'),
  ('1e516186-fee3-4b72-83cd-3b51e7204e2e','bat-admint@cpfin.invalid'),
  ('755d4dc3-a22e-46b7-af57-429731e49664','bat-adming@cpfin.invalid'),
  ('e9c3be77-53da-49ec-abb1-fe5362627975','bat-super@cpfin.invalid'),
  ('1ccbeefa-13b0-4591-8e87-bf63e26fac1c','bat-user@cpfin.invalid'),
  ('e624583c-f850-48bb-b13e-71bb27c1fedb','bat-tenant2@cpfin.invalid');

INSERT INTO public.stores (id, name) VALUES ('83ad8cc2-e75a-443f-a61d-9ee6a5020107','BAT-FIN S1'), ('dfe323c3-c980-43aa-8e82-092a4936ae1c','BAT-FIN S2'), ('7d773d03-8171-4e66-8846-378057691aa2','BAT-FIN S3');

INSERT INTO public.user_store_memberships (user_id, store_id, role, status) VALUES
  ('08b08515-be1a-49f8-ab92-884d55eec42d','83ad8cc2-e75a-443f-a61d-9ee6a5020107','clerk','active'),
  ('0e274ac0-084c-4c9b-a784-6c1a4ee3379e','83ad8cc2-e75a-443f-a61d-9ee6a5020107','encargado','active'),
  ('efeb3464-18ef-402c-b908-9a22793bff0b','83ad8cc2-e75a-443f-a61d-9ee6a5020107','manager','active'),
  ('1e516186-fee3-4b72-83cd-3b51e7204e2e','83ad8cc2-e75a-443f-a61d-9ee6a5020107','admin','active'),
  ('e624583c-f850-48bb-b13e-71bb27c1fedb','dfe323c3-c980-43aa-8e82-092a4936ae1c','admin','active');

-- El trigger de Supabase crea el profile al insertar el usuario; se AJUSTA el rol
-- (DESPUÉS de las memberships: validate_active_store exige membership activa)
UPDATE public.profiles SET active_store_id='83ad8cc2-e75a-443f-a61d-9ee6a5020107' WHERE id IN ('08b08515-be1a-49f8-ab92-884d55eec42d','0e274ac0-084c-4c9b-a784-6c1a4ee3379e','efeb3464-18ef-402c-b908-9a22793bff0b','1e516186-fee3-4b72-83cd-3b51e7204e2e');
UPDATE public.profiles SET active_store_id='dfe323c3-c980-43aa-8e82-092a4936ae1c' WHERE id='e624583c-f850-48bb-b13e-71bb27c1fedb';
UPDATE public.profiles SET role='admin' WHERE id='755d4dc3-a22e-46b7-af57-429731e49664';
UPDATE public.profiles SET role='superadmin' WHERE id='e9c3be77-53da-49ec-abb1-fe5362627975';

INSERT INTO public.fin_posting_generations (id, store_id, code, status) VALUES
  ('1cacc862-ce22-4031-bd40-df108a9a1a14','83ad8cc2-e75a-443f-a61d-9ee6a5020107','GEN-BAT','active'),
  ('2beeb3d7-185c-4851-b599-852b291caa2c','83ad8cc2-e75a-443f-a61d-9ee6a5020107','GEN-SUP','superseded');

INSERT INTO public.fin_rule_versions (id, document_type, store_id, movements, version) VALUES
  ('db1195f2-aebf-43d7-9b4c-8efcb6143305','VENTA',NULL,'[]'::jsonb,1),
  ('935ab06a-df11-459d-a753-fd2a14bf70af','VENTA','83ad8cc2-e75a-443f-a61d-9ee6a5020107','[]'::jsonb,2);

INSERT INTO public.fin_posting_errors (store_id, document_type, event, error_code, error_detail) VALUES
  (NULL,'VENTA','reconocimiento','BAT-GLOBAL','fixture global'),
  ('83ad8cc2-e75a-443f-a61d-9ee6a5020107','VENTA','reconocimiento','BAT-STORE','fixture tienda');

-- Asientos y movimientos de fixtures
INSERT INTO public.fin_entries (id, store_id, document_type, document_number, event, economic_date, generation_id, status) VALUES
  ('0dd5d10b-b880-4e44-aad9-471d0603d441','83ad8cc2-e75a-443f-a61d-9ee6a5020107','VENTA','BAT-E1','reconocimiento','2026-11-01',NULL,'posted'),
  ('20f9ba1d-c1d7-4f90-8c9d-aa7f89984838','83ad8cc2-e75a-443f-a61d-9ee6a5020107','VENTA','BAT-EA','reconocimiento','2026-11-01','1cacc862-ce22-4031-bd40-df108a9a1a14','posted'),
  ('3fa68b0e-6e2e-48c2-8b6e-01dd1241fd35','83ad8cc2-e75a-443f-a61d-9ee6a5020107','VENTA','BAT-EB','reconocimiento','2026-11-01',NULL,'posted'),
  ('0e33aba4-a79f-408b-ae68-4c3b790f90cc','83ad8cc2-e75a-443f-a61d-9ee6a5020107','VENTA','BAT-EB2','reconocimiento','2026-11-01','1cacc862-ce22-4031-bd40-df108a9a1a14','posted'),
  ('664cc579-d6a3-44ae-9c65-6cff711288b2','83ad8cc2-e75a-443f-a61d-9ee6a5020107','VENTA','BAT-EOR','reconocimiento','2026-11-01','1cacc862-ce22-4031-bd40-df108a9a1a14','posted'),
  ('dbba3d5b-89da-49e9-a87c-14f9bb354e56','83ad8cc2-e75a-443f-a61d-9ee6a5020107','VENTA','BAT-ERE','anulacion','2026-11-02','1cacc862-ce22-4031-bd40-df108a9a1a14','posted'),
  ('b3620925-6291-4c35-9a0e-a3ff4eb8ae16','83ad8cc2-e75a-443f-a61d-9ee6a5020107','VENTA','BAT-E3M','reconocimiento','2026-11-01','1cacc862-ce22-4031-bd40-df108a9a1a14','posted'),
  ('d4aab811-2656-4935-95d4-c5f9689d9c31','83ad8cc2-e75a-443f-a61d-9ee6a5020107','VENTA','BAT-E3R','anulacion','2026-11-02','1cacc862-ce22-4031-bd40-df108a9a1a14','posted'),
  ('9146aa2c-0860-4586-b04f-5f35a1fd7539','83ad8cc2-e75a-443f-a61d-9ee6a5020107','RECEPCION','BAT-ES','reconocimiento','2026-11-01','2beeb3d7-185c-4851-b599-852b291caa2c','posted'),
  ('fcf089e2-4f3c-4e25-94ac-6044cfc77e51','83ad8cc2-e75a-443f-a61d-9ee6a5020107','RECEPCION','BAT-RS','anulacion','2026-11-02','2beeb3d7-185c-4851-b599-852b291caa2c','posted'),
  ('64513ca2-a578-408c-8e24-aa1f7438baa7','83ad8cc2-e75a-443f-a61d-9ee6a5020107','RECEPCION','BAT-EA2','reconocimiento','2026-11-01','1cacc862-ce22-4031-bd40-df108a9a1a14','posted'),
  ('fc2ad4c0-7832-407e-b2bf-7d7e7eb60fd7','83ad8cc2-e75a-443f-a61d-9ee6a5020107','RECEPCION','BAT-RA','anulacion','2026-11-02','1cacc862-ce22-4031-bd40-df108a9a1a14','posted'),
  ('8e959167-b706-4910-af6d-b2c3c7df5d1e','83ad8cc2-e75a-443f-a61d-9ee6a5020107','VENTA','BAT-ESAC','reconocimiento','2026-11-01',NULL,'posted'),
  ('1a69f12e-eea9-46b7-9d87-846e7942d501','dfe323c3-c980-43aa-8e82-092a4936ae1c','VENTA','BAT-ES2','reconocimiento','2026-11-01',NULL,'posted'),
  ('e48a0251-8f33-4191-8126-eabf1dc85e53','7d773d03-8171-4e66-8846-378057691aa2','VENTA','BAT-E3','reconocimiento','2026-11-01',NULL,'posted');

UPDATE public.fin_entries SET reversal_of='664cc579-d6a3-44ae-9c65-6cff711288b2' WHERE id='dbba3d5b-89da-49e9-a87c-14f9bb354e56';
UPDATE public.fin_entries SET reversal_of='b3620925-6291-4c35-9a0e-a3ff4eb8ae16' WHERE id='d4aab811-2656-4935-95d4-c5f9689d9c31';
UPDATE public.fin_entries SET reversal_of='9146aa2c-0860-4586-b04f-5f35a1fd7539' WHERE id='fcf089e2-4f3c-4e25-94ac-6044cfc77e51';
UPDATE public.fin_entries SET reversal_of='64513ca2-a578-408c-8e24-aa1f7438baa7' WHERE id='fc2ad4c0-7832-407e-b2bf-7d7e7eb60fd7';
UPDATE public.fin_entries SET document_id='f6d5de22-7015-47fe-a91e-bf9d1c956da5' WHERE id IN ('9146aa2c-0860-4586-b04f-5f35a1fd7539','fcf089e2-4f3c-4e25-94ac-6044cfc77e51');
UPDATE public.fin_entries SET document_id='aab2041a-a164-49c9-b32e-60b375b451a0' WHERE id IN ('64513ca2-a578-408c-8e24-aa1f7438baa7','fc2ad4c0-7832-407e-b2bf-7d7e7eb60fd7');

INSERT INTO public.fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date) VALUES
  ('dfeaf7b5-0b22-4bdc-9451-311dae63db55','8e959167-b706-4910-af6d-b2c3c7df5d1e','83ad8cc2-e75a-443f-a61d-9ee6a5020107','ACT_EFECTIVO_CUP','debito',10,'CUP',1,'2026-11-01'),
  ('e7994d04-7183-41fe-9ab3-8e889b5c71a3','0dd5d10b-b880-4e44-aad9-471d0603d441','83ad8cc2-e75a-443f-a61d-9ee6a5020107','ACT_EFECTIVO_CUP','debito',10,'CUP',1,'2026-11-01'),
  ('315afdbf-eb87-4ca0-88dd-68b53c20ad30','20f9ba1d-c1d7-4f90-8c9d-aa7f89984838','83ad8cc2-e75a-443f-a61d-9ee6a5020107','ACT_EFECTIVO_CUP','debito',10,'CUP',1,'2026-11-01'),
  ('b3fe6837-c858-4040-b18d-bf4034aa50f8','3fa68b0e-6e2e-48c2-8b6e-01dd1241fd35','83ad8cc2-e75a-443f-a61d-9ee6a5020107','ACT_EFECTIVO_CUP','debito',10,'CUP',1,'2026-11-01'),
  ('0a562453-1781-4a2c-8922-f945013293f6','0e33aba4-a79f-408b-ae68-4c3b790f90cc','83ad8cc2-e75a-443f-a61d-9ee6a5020107','ACT_EFECTIVO_CUP','debito',10,'CUP',1,'2026-11-01'),
  ('34d53a08-a1d5-4399-8381-d65809a80a02','1a69f12e-eea9-46b7-9d87-846e7942d501','dfe323c3-c980-43aa-8e82-092a4936ae1c','ACT_EFECTIVO_CUP','debito',10,'CUP',1,'2026-11-01'),
  ('75816519-3efa-4919-8478-c14335c5ab87','e48a0251-8f33-4191-8126-eabf1dc85e53','7d773d03-8171-4e66-8846-378057691aa2','ACT_EFECTIVO_CUP','debito',10,'CUP',1,'2026-11-01'),
  -- F5: original 100 USD × 2 = 200 CUP; reversión parcial 40 USD × 2 = 80 CUP → residual CUP 120
  ('5021e61e-b722-4e44-8287-6fff55a43387','664cc579-d6a3-44ae-9c65-6cff711288b2','83ad8cc2-e75a-443f-a61d-9ee6a5020107','ACT_EFECTIVO_USD','debito',100,'USD',2,'2026-11-01'),
  ('719b230f-11e1-4324-b7cd-4859a38e3564','dbba3d5b-89da-49e9-a87c-14f9bb354e56','83ad8cc2-e75a-443f-a61d-9ee6a5020107','ACT_EFECTIVO_USD','credito',40,'USD',2,'2026-11-02'),
  -- F5 multimoneda: original 100 USD × 2 = 200 CUP; reversión 30 EUR × 1.1 = 33 CUP → residual 167
  ('515efd17-dd5d-4324-b31e-e111eac1d127','b3620925-6291-4c35-9a0e-a3ff4eb8ae16','83ad8cc2-e75a-443f-a61d-9ee6a5020107','ACT_EFECTIVO_USD','debito',100,'USD',2,'2026-11-01'),
  ('0f33d470-0c0f-4d48-869d-69119d760cb5','d4aab811-2656-4935-95d4-c5f9689d9c31','83ad8cc2-e75a-443f-a61d-9ee6a5020107','ACT_EFECTIVO_USD','credito',30,'EUR',1.1,'2026-11-02'),
  -- T12: superseded 100 CUP / reversión 40 CUP (residual 60); activa idem
  ('6cfe130f-3b38-4015-94db-37e90349419c','9146aa2c-0860-4586-b04f-5f35a1fd7539','83ad8cc2-e75a-443f-a61d-9ee6a5020107','ACT_EFECTIVO_CUP','debito',100,'CUP',1,'2026-11-01'),
  ('3994b3f0-af30-4835-850b-3f17d10a33ee','fcf089e2-4f3c-4e25-94ac-6044cfc77e51','83ad8cc2-e75a-443f-a61d-9ee6a5020107','ACT_EFECTIVO_CUP','credito',40,'CUP',1,'2026-11-02'),
  ('b76d1dfa-4ef9-47d2-90ad-e24600d6f795','64513ca2-a578-408c-8e24-aa1f7438baa7','83ad8cc2-e75a-443f-a61d-9ee6a5020107','ACT_EFECTIVO_CUP','debito',100,'CUP',1,'2026-11-01'),
  ('5ca81888-342e-4cc3-8ec7-bbd05b8bd933','fc2ad4c0-7832-407e-b2bf-7d7e7eb60fd7','83ad8cc2-e75a-443f-a61d-9ee6a5020107','ACT_EFECTIVO_CUP','credito',40,'CUP',1,'2026-11-02');

INSERT INTO public.receipts (id, store_id, status) VALUES ('f6d5de22-7015-47fe-a91e-bf9d1c956da5','83ad8cc2-e75a-443f-a61d-9ee6a5020107','pending'), ('aab2041a-a164-49c9-b32e-60b375b451a0','83ad8cc2-e75a-443f-a61d-9ee6a5020107','pending');

-- G2_act para S2 se crea AQUÍ (después de los INSERT de entradas): E_S2 nació
-- con generation_id NULL porque al insertarse S2 no tenía generación activa
-- (el BEFORE INSERT fin_trg_entries_generation solo rellena si existe).
INSERT INTO public.fin_posting_generations (id, store_id, code, status) VALUES
  ('7c698678-6a1c-4cd5-9acf-aed5d3b9cf70','dfe323c3-c980-43aa-8e82-092a4936ae1c','GEN-BAT','active');

-- ═══ DEMOSTRACIÓN PRE (vulnerabilidades reales del estado vigente) ═════════
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"08b08515-be1a-49f8-ab92-884d55eec42d","role":"authenticated"}';
DO $pre1$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.fin_entries WHERE store_id='83ad8cc2-e75a-443f-a61d-9ee6a5020107';
  IF v_n < 1 THEN RAISE EXCEPTION 'PRE-1 FAILED: el clerk debería ver el libro (estado vulnerable)'; END IF;
END $pre1$;
DO $pre2$
DECLARE ok boolean;
BEGIN
  SELECT public.fin_get_dashboard('83ad8cc2-e75a-443f-a61d-9ee6a5020107','2026-01-01','2026-12-31') IS NOT NULL INTO ok;
  IF NOT ok THEN RAISE EXCEPTION 'PRE-2 FAILED: dashboard nulo para clerk (estado vulnerable)'; END IF;
END $pre2$;
SET LOCAL ROLE postgres;
SET LOCAL request.jwt.claims TO '{}';
DO $pre3$
DECLARE v_r numeric;
BEGIN
  SELECT public.fin_entry_reversal_residual('664cc579-d6a3-44ae-9c65-6cff711288b2') INTO v_r;
  IF v_r <> 60 THEN RAISE EXCEPTION 'PRE-3 FAILED: residual previo debería ser 60 (bug m.amount), obtuve %', v_r; END IF;
END $pre3$;

DO $pre4$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    UPDATE public.receipts SET status='voided' WHERE id='f6d5de22-7015-47fe-a91e-bf9d1c956da5';
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('ERR_PARTIAL_REVERSAL_PENDING' in v_err) = 0 AND coalesce(v_state,'') <> 'ERR_PARTIAL_REVERSAL_PENDING') THEN
    RAISE EXCEPTION 'CASE pre4 FAILED: se esperaba ERR_PARTIAL_REVERSAL_PENDING, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $pre4$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"1e516186-fee3-4b72-83cd-3b51e7204e2e","role":"authenticated"}';

DO $pre5$
BEGIN
  UPDATE public.fin_rule_versions SET store_id='83ad8cc2-e75a-443f-a61d-9ee6a5020107' WHERE id='db1195f2-aebf-43d7-9b4c-8efcb6143305';
  IF NOT FOUND THEN RAISE EXCEPTION 'PRE-5 FAILED: la reasignación de regla global DEBÍA ser posible (vulnerabilidad)'; END IF;
END $pre5$;
SET LOCAL ROLE postgres;
SET LOCAL request.jwt.claims TO '{}';
UPDATE public.fin_rule_versions SET store_id=NULL WHERE id='db1195f2-aebf-43d7-9b4c-8efcb6143305';

DO $pre6$
BEGIN
  UPDATE public.fin_entries SET description='hackeado' WHERE id='0dd5d10b-b880-4e44-aad9-471d0603d441';
  IF NOT FOUND THEN RAISE EXCEPTION 'PRE-6 FAILED'; END IF;
END $pre6$;

DO $pre7$
BEGIN
  UPDATE public.fin_movements SET amount=5 WHERE entry_id='8e959167-b706-4910-af6d-b2c3c7df5d1e';
  IF NOT FOUND THEN RAISE EXCEPTION 'PRE-7 FAILED'; END IF;
END $pre7$;

DO $pre8$
BEGIN
  DELETE FROM public.fin_movements WHERE entry_id='8e959167-b706-4910-af6d-b2c3c7df5d1e';
  IF NOT FOUND THEN RAISE EXCEPTION 'PRE-8 FAILED'; END IF;
END $pre8$;

DO $pre9$
BEGIN
  TRUNCATE public.fin_posting_errors;
  
END $pre9$;
INSERT INTO public.fin_posting_errors (store_id, document_type, event, error_code, error_detail) VALUES
  (NULL,'VENTA','reconocimiento','BAT-GLOBAL','fixture global'),
  ('83ad8cc2-e75a-443f-a61d-9ee6a5020107','VENTA','reconocimiento','BAT-STORE','fixture tienda');
UPDATE public.receipts SET status='pending' WHERE id='f6d5de22-7015-47fe-a91e-bf9d1c956da5';

-- ═══ MIGRACIONES M1..M6 (transaccionales dentro de la batería) ═════════════
-- ============================================================================
-- Migration: 20261128153000_cp_fin_f2_book_read_management.sql
-- Misión:    CP-FIN-REM-001 — PR-A F2 (lectura del libro solo para gestión)
-- Fecha:     2026-11-28
-- ============================================================================
-- F2 — SELECT SOLO PARA GESTIÓN FINANCIERA (fin_entries, fin_movements,
--       fin_opening_balances, fin_posting_errors).
--
-- Estado previo revalidado EN VIVO 2026-11-28 (audit-evidence/CP-FIN-REVIEW-001/
-- revalida-20261128-policies.json):
--   fin_entries/fin_movements/fin_opening_balances SELECT:
--     USING (is_admin() OR has_store_access(store_id))  → cualquier miembro
--     activo (clerk incluido) lee el libro contable de su tienda.
--   fin_posting_errors SELECT/UPDATE:
--     USING ((store_id IS NULL) OR is_admin() OR has_store_access(...)) →
--     cualquier miembro ve y actualiza incluso errores GLOBALES.
--
-- Semántica NUEVA (espejo de can_manage_store_as — la misma que usa la app):
--   Permitido: admin global/superadmin (is_admin()), admin de tienda, manager
--   de tienda, encargado de tienda. Backend privilegiado (service_role) no
--   pasa por RLS (bypassrls de plataforma).
--   Denegado: clerk, usuario operativo, almacenero, costo, sin membresía,
--   otro tenant, anon.
--   fin_posting_errors con store_id NULL: SOLO is_admin() (globales).
--
-- No se modifica: políticas INSERT (motor), UPDATE de fin_opening_balances
-- (ya admin de tienda), ni ninguna política de fin_categories /
-- fin_document_types / fin_metric_catalog / fin_reconciliation_config /
-- fin_account_mapping / fin_posting_generations / fin_reconciliation_snapshots
-- (hallazgos N2/N3 reportados, fuera del alcance enumerado por la misión).
--
-- Idempotente: DROP+CREATE de las 5 políticas. Fail-closed: aborta si faltan
-- tablas/helpers o si el estado previo no es el esperado.
-- Rollback: supabase/rollbacks/20261128153000_rollback_cp_fin_f2.sql
-- ============================================================================


do $$
declare
  v_tablas text[];
  v_faltan text[];
  v_qual_previo text;
begin
  v_tablas := array['fin_entries','fin_movements','fin_opening_balances','fin_posting_errors'];
  select array_agg(t) into v_faltan
    from unnest(v_tablas) t
   where to_regclass('public.' || t) is null;
  if coalesce(array_length(v_faltan, 1), 0) > 0 then
    raise exception 'CP-FIN-F2 PRECOND: tablas ausentes: %', array_to_string(v_faltan, ', ')
      using errcode = 'P0001';
  end if;
  if to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.has_store_role(uuid, text[])') is null then
    raise exception 'CP-FIN-F2 PRECOND: helpers is_admin()/has_store_role() ausentes'
      using errcode = 'P0001';
  end if;
  -- Fail-closed contra deriva: el estado previo debe ser el descrito arriba.
  select qual into v_qual_previo from pg_policies
   where schemaname='public' and tablename='fin_entries' and policyname='fin_entries_select';
  if v_qual_previo is null or position('has_store_access' in v_qual_previo) = 0 then
    raise exception 'CP-FIN-F2 PRECOND: fin_entries_select no tiene el predicado amplio esperado (¿deriva?): %', coalesce(v_qual_previo, 'POLICY AUSENTE')
      using errcode = 'P0001';
  end if;
end $$;

-- ── fin_entries: SELECT solo gestión ────────────────────────────────────────
DROP POLICY IF EXISTS fin_entries_select ON public.fin_entries;
CREATE POLICY fin_entries_select ON public.fin_entries
  FOR SELECT TO authenticated
  USING (is_admin() OR has_store_role(store_id, ARRAY['admin','manager','encargado']));

-- ── fin_movements: SELECT solo gestión ──────────────────────────────────────
DROP POLICY IF EXISTS fin_movements_select ON public.fin_movements;
CREATE POLICY fin_movements_select ON public.fin_movements
  FOR SELECT TO authenticated
  USING (is_admin() OR has_store_role(store_id, ARRAY['admin','manager','encargado']));

-- ── fin_opening_balances: SELECT solo gestión ───────────────────────────────
DROP POLICY IF EXISTS fin_opening_select ON public.fin_opening_balances;
CREATE POLICY fin_opening_select ON public.fin_opening_balances
  FOR SELECT TO authenticated
  USING (is_admin() OR has_store_role(store_id, ARRAY['admin','manager','encargado']));

-- ── fin_posting_errors: SELECT — globales SOLO admin; tienda solo gestión ──
DROP POLICY IF EXISTS fin_post_err_select ON public.fin_posting_errors;
CREATE POLICY fin_post_err_select ON public.fin_posting_errors
  FOR SELECT TO authenticated
  USING (
    (store_id IS NULL AND is_admin())
    OR (store_id IS NOT NULL AND (is_admin()
        OR has_store_role(store_id, ARRAY['admin','manager','encargado'])))
  );

-- ── fin_posting_errors: UPDATE — globales SOLO admin; tienda solo admin ────
DROP POLICY IF EXISTS fin_post_err_update ON public.fin_posting_errors;
CREATE POLICY fin_post_err_update ON public.fin_posting_errors
  FOR UPDATE TO authenticated
  USING (
    (store_id IS NULL AND is_admin())
    OR (store_id IS NOT NULL AND (is_admin()
        OR has_store_role(store_id, ARRAY['admin'])))
  )
  WITH CHECK (
    (store_id IS NULL AND is_admin())
    OR (store_id IS NOT NULL AND (is_admin()
        OR has_store_role(store_id, ARRAY['admin'])))
  );

COMMENT ON TABLE public.fin_entries IS
  'CP-FIN: asientos económicos (una fila por documento+evento+pago). anulacion = asiento compensatorio enlazado vía reversal_of (nunca UPDATE del importe). [CP-FIN-REM-001 F2 2026-11-28: SELECT solo roles de gestión (admin/manager/encargado de la tienda o admin global); clerk/usuario operativo ya no leen el libro.]';
COMMENT ON TABLE public.fin_movements IS
  'CP-FIN: líneas de partida doble. Inmutables una vez emitidas (las correcciones son asientos compensatorios). [CP-FIN-REM-001 F2 2026-11-28: SELECT solo roles de gestión.]';

-- Verificación post (fail-closed): 5 políticas con predicado de gestión.
do $$
declare
  v_n int;
begin
  select count(*) into v_n from pg_policies
   where schemaname='public' and policyname in
     ('fin_entries_select','fin_movements_select','fin_opening_select',
      'fin_post_err_select','fin_post_err_update')
     and (qual like '%has_store_role%' or qual like '%is_admin()%');
  if v_n <> 5 then
    raise exception 'CP-FIN-F2 POSTCHECK: esperadas 5 políticas endurecidas, encontradas %', v_n
      using errcode = 'P0001';
  end if;
end $$;

-- ============================================================================
-- Migration: 20261128153100_cp_fin_f2_rpc_management_gate.sql
-- Misión:    CP-FIN-REM-001 — PR-A F2 (RPC fin_get_*: semántica de gestión)
-- Fecha:     2026-11-28
-- ============================================================================
-- F2 — Las 6 RPC de informes contables usan has_store_access_as (cualquier
-- membresía activa: un clerk pasa) y el patrón abierto
-- `IF v_caller IS NOT NULL AND NOT (...)` que SALTA la comprobación si
-- v_caller es NULL. Revalidado en vivo 2026-11-28 (revalida-20261128-def-*).
--
-- Cambio por RPC (firmas y resultados intactos):
--   · v_caller: service_role → p_user_id OBLIGATORIO (validado por la ruta);
--     authenticated → auth.uid(). v_caller NULL → ERR_UNAUTHORIZED.
--   · Gate incondicional: is_admin_check(v_caller) OR
--     can_manage_store_as(v_caller, p_store_id)  → admin global/superadmin,
--     admin/manager/encargado de la tienda. clerk/usuario operativo denegado.
--   · can_manage_store_as solo se invoca INTERNAMENTE (SECURITY DEFINER):
--     NO se concede EXECUTE del helper a authenticated.
--   · ACL intacto: 4 RPC ejecutables por authenticated+service_role;
--     fin_get_category_detail y fin_get_reconciliation solo service_role.
--
-- Fail-closed: DO-guard exige que cada función exista y contenga el patrón
-- viejo (aborta ante cualquier deriva del catálogo).
-- Rollback: supabase/rollbacks/20261128153100_rollback_cp_fin_f2_rpc.sql
-- ============================================================================


do $$
declare
  v_n int;
begin
  select count(*) into v_n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname in
     ('fin_get_balance_sheet','fin_get_income_statement','fin_get_dashboard',
      'fin_get_category_detail','fin_get_document_types_status','fin_get_reconciliation');
  if v_n <> 6 then
    raise exception 'CP-FIN-F2-RPC PRECOND: esperadas 6 RPC fin_get_*, encontradas %', v_n
      using errcode = 'P0001';
  end if;
end $$;


-- ── fin_get_balance_sheet ──
CREATE OR REPLACE FUNCTION public.fin_get_balance_sheet(p_store_id uuid, p_as_of date, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN p_user_id ELSE auth.uid() END;
  v_rows jsonb; v_activos numeric := 0; v_pasivos numeric := 0; v_patrim numeric := 0;
  v_ing numeric := 0; v_gas numeric := 0;
  v_primer_doc date; v_primera_apertura date; v_resultado numeric;
  v_gen uuid := public.fin_active_generation(p_store_id);
BEGIN
  IF v_caller IS NULL OR NOT (public.is_admin_check(v_caller)
     OR public.can_manage_store_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.sort_order), '[]'::jsonb),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'activo'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'pasivo'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'patrimonio'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'ingreso'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'gasto'), 0)
    INTO v_rows, v_activos, v_pasivos, v_patrim, v_ing, v_gas
  FROM (
    SELECT c.code, c.name, c.clase, c.grupo, c.sort_order,
           round(CASE WHEN c.clase IN ('activo', 'gasto')
                 THEN sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END)
                 ELSE sum(CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END)
               END, 2) AS saldo,
           count(DISTINCT m.entry_id) AS movimientos
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    JOIN public.fin_categories c ON c.code = m.category_code
    WHERE m.store_id = p_store_id AND m.economic_date <= p_as_of
      AND e.generation_id IS NOT DISTINCT FROM v_gen
    GROUP BY c.code, c.name, c.clase, c.grupo, c.sort_order
    HAVING round(CASE WHEN c.clase IN ('activo', 'gasto')
                 THEN sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END)
                 ELSE sum(CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END)
               END, 2) <> 0
  ) s;

  v_resultado := round(v_ing - v_gas, 2);
  SELECT min(economic_date) INTO v_primer_doc
  FROM public.fin_entries
  WHERE store_id = p_store_id AND event <> 'apertura'
    AND generation_id IS NOT DISTINCT FROM v_gen;
  SELECT min(economic_date) INTO v_primera_apertura
  FROM public.fin_entries
  WHERE store_id = p_store_id AND event = 'apertura'
    AND generation_id IS NOT DISTINCT FROM v_gen;

  RETURN jsonb_build_object(
    'as_of', p_as_of,
    'generacion', (SELECT jsonb_build_object('id', id, 'code', code)
                   FROM public.fin_posting_generations WHERE id = v_gen),
    'categorias', v_rows,
    'total_activos', round(v_activos, 2),
    'total_pasivos', round(v_pasivos, 2),
    'patrimonio_movimientos', round(v_patrim, 2),
    'resultado_acumulado', v_resultado,
    'patrimonio_total', round(v_patrim + v_resultado, 2),
    'ecuacion', jsonb_build_object(
      'activos', round(v_activos, 2),
      'pasivos_mas_patrimonio', round(v_pasivos + v_patrim + v_resultado, 2),
      'diferencia', round(v_activos - (v_pasivos + v_patrim + v_resultado), 2),
      'equilibrado', abs(v_activos - (v_pasivos + v_patrim + v_resultado)) <= 0.01),
    'completitud', jsonb_build_object(
      'sin_apertura', v_primer_doc IS NOT NULL AND v_primera_apertura IS NULL,
      'apertura_tardia', v_primer_doc IS NOT NULL AND v_primera_apertura IS NOT NULL
                         AND v_primer_doc < v_primera_apertura,
      'primer_documento', v_primer_doc,
      'primera_apertura', v_primera_apertura));
END $function$;

-- ── fin_get_income_statement ──
CREATE OR REPLACE FUNCTION public.fin_get_income_statement(p_store_id uuid, p_from date, p_to date, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN p_user_id ELSE auth.uid() END;
  v_rows jsonb;
  v_ing_op numeric := 0; v_ing_aj numeric := 0; v_costo numeric := 0;
  v_gastos numeric := 0; v_ing_noop numeric := 0; v_gas_noop numeric := 0;
  v_gen uuid := public.fin_active_generation(p_store_id);
BEGIN
  IF v_caller IS NULL OR NOT (public.is_admin_check(v_caller)
     OR public.can_manage_store_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.sort_order), '[]'::jsonb),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'ingreso_operacional'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'ajuste_ingreso'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'costo_venta'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'gasto_operacional'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'ingreso_no_operacional'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'gasto_no_operacional'), 0)
    INTO v_rows, v_ing_op, v_ing_aj, v_costo, v_gastos, v_ing_noop, v_gas_noop
  FROM (
    SELECT c.code, c.name, c.grupo, c.sort_order,
           round(sum(CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END), 2) AS saldo,
           count(DISTINCT m.entry_id) AS documentos
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    JOIN public.fin_categories c ON c.code = m.category_code
    WHERE m.store_id = p_store_id AND m.economic_date BETWEEN p_from AND p_to
      AND c.clase IN ('ingreso', 'gasto')
      AND e.generation_id IS NOT DISTINCT FROM v_gen
    GROUP BY c.code, c.name, c.grupo, c.sort_order
    HAVING round(sum(CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END), 2) <> 0
  ) s;

  RETURN jsonb_build_object(
    'desde', p_from, 'hasta', p_to,
    'categorias', v_rows,
    'ingresos_operacionales', round(v_ing_op, 2),
    'ajustes_ingresos', round(v_ing_aj, 2),
    'ingresos_netos', round(v_ing_op + v_ing_aj, 2),
    'costo_ventas', round(v_costo, 2),
    'utilidad_bruta', round(v_ing_op + v_ing_aj + v_costo, 2),
    'gastos_operacionales', round(v_gastos, 2),
    'resultado_operativo', round(v_ing_op + v_ing_aj + v_costo + v_gastos, 2),
    'ingresos_no_operacionales', round(v_ing_noop, 2),
    'gastos_no_operacionales', round(v_gas_noop, 2),
    'resultado_neto', round(v_ing_op + v_ing_aj + v_costo + v_gastos + v_ing_noop + v_gas_noop, 2));
END $function$;

-- ── fin_get_dashboard ──
CREATE OR REPLACE FUNCTION public.fin_get_dashboard(p_store_id uuid, p_from date, p_to date, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN p_user_id ELSE auth.uid() END;
  v_ings numeric := 0; v_costo numeric := 0; v_gastos numeric := 0;
  v_efectivo_cup numeric := 0; v_efectivo_usd numeric := 0; v_bancos numeric := 0;
  v_exterior numeric := 0;
  v_cxc numeric := 0; v_cxp numeric := 0; v_nomina numeric := 0; v_retenc numeric := 0;
  v_inv numeric := 0; v_series jsonb; v_top jsonb;
  v_sin_cfg int; v_errores int; v_desbalance numeric;
  v_gen uuid := public.fin_active_generation(p_store_id);
BEGIN
  IF v_caller IS NULL OR NOT (public.is_admin_check(v_caller)
     OR public.can_manage_store_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Resultado del período
  SELECT
    coalesce(sum(CASE WHEN c.clase = 'ingreso'
      THEN CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN c.grupo = 'costo_venta'
      THEN CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN c.clase = 'gasto' AND c.grupo <> 'costo_venta'
      THEN CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0)
    INTO v_ings, v_costo, v_gastos
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  JOIN public.fin_categories c ON c.code = m.category_code
  WHERE m.store_id = p_store_id AND m.economic_date BETWEEN p_from AND p_to
    AND e.generation_id IS NOT DISTINCT FROM v_gen;

  -- Saldos de balance a la fecha final
  SELECT
    coalesce(sum(CASE WHEN m.category_code = 'ACT_EFECTIVO_CUP' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'ACT_EFECTIVO_USD' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'ACT_BANCOS' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'ACT_TRANSF_EXTERIOR' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'ACT_CXC' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code IN ('PAS_CXP_PROV', 'PAS_SERV_PEND') THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'PAS_NOMINA_PEND' THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'PAS_RETENCIONES' THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0)
    INTO v_efectivo_cup, v_efectivo_usd, v_bancos, v_exterior, v_cxc, v_cxp, v_nomina, v_retenc
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE m.store_id = p_store_id AND m.economic_date <= p_to
    AND e.generation_id IS NOT DISTINCT FROM v_gen;

  -- Valor de inventario (en vivo, del motor de valoración real)
  SELECT coalesce(round(sum(p.stock_current * coalesce(p.cost_average, 0)), 2), 0) INTO v_inv
  FROM public.products p WHERE p.store_id = p_store_id;

  -- Series mensuales
  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.mes), '[]'::jsonb) INTO v_series
  FROM (
    SELECT to_char(date_trunc('month', m.economic_date), 'YYYY-MM') AS mes,
           round(sum(CASE WHEN c.clase = 'ingreso' THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 2) AS ingresos,
           round(sum(CASE WHEN c.clase = 'gasto' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 2) AS gastos
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    JOIN public.fin_categories c ON c.code = m.category_code
    WHERE m.store_id = p_store_id AND m.economic_date BETWEEN p_from AND p_to
      AND e.generation_id IS NOT DISTINCT FROM v_gen
    GROUP BY 1
  ) s;

  -- Top gastos
  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.total DESC), '[]'::jsonb) INTO v_top
  FROM (
    SELECT c.code, c.name, round(sum(m.amount_cup), 2) AS total
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    JOIN public.fin_categories c ON c.code = m.category_code
    WHERE m.store_id = p_store_id AND m.economic_date BETWEEN p_from AND p_to
      AND c.clase = 'gasto' AND m.sense = 'debito'
      AND e.generation_id IS NOT DISTINCT FROM v_gen
    GROUP BY c.code, c.name
    HAVING sum(m.amount_cup) > 0
    LIMIT 8
  ) s;

  SELECT count(*) INTO v_sin_cfg
  FROM public.fin_document_types dt
  WHERE dt.is_postable AND dt.is_active AND NOT EXISTS (
    SELECT 1 FROM public.fin_rule_versions rv
    WHERE rv.document_type = dt.code AND rv.status = 'active'
      AND (rv.store_id = p_store_id OR rv.store_id IS NULL));
  SELECT count(*) INTO v_errores
  FROM public.fin_posting_errors WHERE store_id = p_store_id AND resolved_at IS NULL;

  -- Identidad pura de partida doble (CP-FIN-002) sobre la generación activa
  SELECT coalesce(round(sum(
    CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END), 0), 0)
    INTO v_desbalance
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE m.store_id = p_store_id AND m.economic_date <= p_to
    AND e.generation_id IS NOT DISTINCT FROM v_gen;

  RETURN jsonb_build_object(
    'desde', p_from, 'hasta', p_to,
    'generacion', (SELECT jsonb_build_object('id', id, 'code', code)
                   FROM public.fin_posting_generations WHERE id = v_gen),
    'kpis', jsonb_build_object(
      'ingresos', round(v_ings, 2), 'costo_ventas', round(v_costo, 2),
      'gastos', round(v_gastos, 2),
      'utilidad_bruta', round(v_ings - v_costo, 2),
      'resultado_neto', round(v_ings - v_costo - v_gastos, 2),
      'efectivo_cup', round(v_efectivo_cup, 2), 'efectivo_usd', round(v_efectivo_usd, 2),
      'bancos', round(v_bancos, 2),
      'transfer_exterior', round(v_exterior, 2),
      'cuentas_por_cobrar', round(v_cxc, 2), 'cuentas_por_pagar', round(v_cxp, 2),
      'nomina_pendiente', round(v_nomina, 2), 'retenciones_pendientes', round(v_retenc, 2),
      'inventario_valor', v_inv),
    'series_mensuales', v_series,
    'top_gastos', v_top,
    'alertas', jsonb_build_object(
      'gastos_mayores_que_ingresos', v_gastos + v_costo > v_ings AND v_ings > 0,
      'desequilibrio_balance', abs(v_desbalance) > 0.01,
      'desequilibrio_monto', round(v_desbalance, 2),
      'tipos_sin_configurar', v_sin_cfg,
      'errores_contabilizacion', v_errores));
END $function$;

-- ── fin_get_category_detail ──
CREATE OR REPLACE FUNCTION public.fin_get_category_detail(p_store_id uuid, p_category text, p_from date, p_to date, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN p_user_id ELSE auth.uid() END;
  v_rows jsonb; v_total int;
  v_saldo_inicial numeric := 0; v_clase text;
  v_gen uuid := public.fin_active_generation(p_store_id);
BEGIN
  IF v_caller IS NULL OR NOT (public.is_admin_check(v_caller)
     OR public.can_manage_store_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT c.clase INTO v_clase FROM public.fin_categories c WHERE c.code = p_category;

  -- Saldo acumulado anterior al rango (naturaleza-aware, misma convención
  -- del mayor: activo/gasto → débito−crédito; resto → crédito−débito).
  SELECT round(coalesce(sum(
           CASE WHEN v_clase IN ('activo', 'gasto')
             THEN CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END
             ELSE CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END
           END), 0), 2)
    INTO v_saldo_inicial
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE m.store_id = p_store_id AND m.category_code = p_category
    AND m.economic_date < p_from
    AND e.generation_id IS NOT DISTINCT FROM v_gen;

  SELECT count(*) INTO v_total
  FROM public.fin_movements m JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE m.store_id = p_store_id AND m.category_code = p_category
    AND m.economic_date BETWEEN p_from AND p_to
    AND e.generation_id IS NOT DISTINCT FROM v_gen;
  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.economic_date DESC, s.posted_at DESC), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT m.id, m.entry_id, e.document_type, e.document_id, m.document_number,
           m.economic_date, e.event, m.sense, m.amount, m.amount_cup,
           m.currency, m.currency_origin, m.amount_origin, m.exchange_rate,
           m.description, e.posted_at
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    WHERE m.store_id = p_store_id AND m.category_code = p_category
      AND m.economic_date BETWEEN p_from AND p_to
      AND e.generation_id IS NOT DISTINCT FROM v_gen
    ORDER BY m.economic_date DESC, e.posted_at DESC
    LIMIT greatest(coalesce(p_limit, 50), 1) OFFSET greatest(coalesce(p_offset, 0), 0)
  ) s;
  RETURN jsonb_build_object(
    'categoria', p_category, 'total', v_total,
    'desde', p_from, 'hasta', p_to, 'movimientos', v_rows,
    'generacion', (SELECT jsonb_build_object('id', id, 'code', code)
                   FROM public.fin_posting_generations WHERE id = v_gen),
    'saldo_inicial', v_saldo_inicial,
    'clase', v_clase);
END $function$;

-- ── fin_get_document_types_status ──
CREATE OR REPLACE FUNCTION public.fin_get_document_types_status(p_store_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN p_user_id ELSE auth.uid() END;
  v_gen uuid := public.fin_active_generation(p_store_id);
BEGIN
  IF v_caller IS NULL OR NOT (public.is_admin_check(v_caller)
     OR public.can_manage_store_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(s) ORDER BY s.sort_order)
    FROM (
      SELECT dt.code, dt.name, dt.module, dt.source_table, dt.description,
             dt.trigger_status, dt.is_postable, dt.sort_order,
             (rv.id IS NOT NULL) AS configurado,
             rv.id AS rule_version_id, rv.version, rv.movements, rv.effective_from,
             (SELECT count(*) FROM public.fin_entries e
              WHERE e.document_type = dt.code AND e.store_id = p_store_id
                AND e.generation_id IS NOT DISTINCT FROM v_gen) AS asientos,
             (SELECT count(*) FROM public.fin_posting_errors pe
              WHERE pe.document_type = dt.code AND pe.store_id = p_store_id
                AND pe.resolved_at IS NULL) AS errores
      FROM public.fin_document_types dt
      LEFT JOIN public.fin_rule_versions rv
        ON rv.document_type = dt.code AND rv.status = 'active'
       AND rv.effective_from <= CURRENT_DATE
       AND (rv.store_id = p_store_id
            OR (rv.store_id IS NULL AND NOT EXISTS (
                  SELECT 1 FROM public.fin_rule_versions x
                  WHERE x.document_type = dt.code AND x.status = 'active'
                    AND x.store_id = p_store_id)))
      WHERE dt.is_active
    ) s
  ), '[]'::jsonb);
END $function$;

-- ── fin_get_reconciliation ──
CREATE OR REPLACE FUNCTION public.fin_get_reconciliation(p_store_id uuid, p_as_of date, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN p_user_id ELSE auth.uid() END;
  v_gen uuid := public.fin_active_generation(p_store_id);
  v_hist date := '1900-01-01';
  -- CP-FIN-REC-001/v2 (misión CP-FIN-110): cambios documentados frente a v1 —
  --   (a) detector de vales sin asiento excluye los de costo cero (sin efecto
  --       contable material: el motor prohíbe movimientos con importe <= 0);
  --   (b) detector de fallback USD restringido a ventas SIN filas en el riel
  --       de pagos (riel-primacía CP-FIN-002; el motor ya no puede divergir);
  --   (c) GAS_COSTO_VENTAS operacional redondea POR VENTA (misma convención
  --       de decimales del motor: round por documento, no global del período);
  --   (d) ACT_CXC restringido a órdenes COMPLETADAS con saldo (las draft no
  --       generan derecho de cobro contable);
  --   (e) PAS_ANTICIPOS_CLI pasa a CONCILIABLE (crédito de tienda + anticipos
  --       de órdenes no completadas);
  --   (f) ING_SERVICIOS_PREST pasa a CONCILIABLE (órdenes completadas del
  --       período — regla ORDEN_TRABAJO v1 del motor);
  --   (g) fuente production_orders en fuentes_actualizadas.
  -- Impacto histórico: ninguno sobre saldos; mejora exactitud de los puentes.
  -- CP-FIN-REC-001/v3 (misión POSTREVIEW-HARDENING-111, PR que resuelve la
  --   revisión de #1682) — cambios frente a v2:
  --   (h) órdenes RECONOCIBLES = status 'completed' O 'closed' CON
  --       completion_date (evidencia documental de finalización real): ACT_CXC,
  --       ING_SERVICIOS_PREST y PAS_ANTICIPOS_CLI usan el MISMO predicado que el
  --       pase 5 del build (P0-1); voided/reversed/closed-sin-evidencia siguen
  --       fuera y sus anticipos permanecen en el pasivo;
  --   (i) ACT_CXC: presupuesto convertido a CUP (budget_total × tasa
  --       documental) ANTES de restar los pagos acumulados en CUP (P0-2) y
  --       filtro de corte por coalesce(completion_date, order_date);
  --   (j) detector de fallback: mismo criterio semántico que fin_compute_metrics
  --       — sin cobro de EFECTIVO canónico (suma 0 por moneda), una fila de
  --       transferencia NO suprime el hallazgo (P0-3);
  --   (k) docs_pend/sin_resp cubren ORDEN_TRABAJO (reconocimiento y pagos).
  v_met_ver text := 'CP-FIN-REC-001/v3';
  v_res jsonb;
BEGIN
  IF v_caller IS NULL OR NOT (public.is_admin_check(v_caller)
     OR public.can_manage_store_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  WITH
  -- ── Inventario: estadísticas del maestro (valoración WAC del sistema) ──
  inv AS (
    SELECT count(*) AS productos_total,
           count(*) FILTER (WHERE p.stock_current > 0) AS con_stock,
           count(*) FILTER (WHERE p.stock_current = 0) AS stock_cero,
           count(*) FILTER (WHERE p.stock_current < 0) AS stock_negativo,
           round(coalesce(sum(p.stock_current), 0), 2) AS cantidad_total,
           round(coalesce(sum(p.stock_current * coalesce(p.cost_average, 0)), 0), 2) AS valor_wac,
           round(coalesce(sum(p.stock_current * coalesce(p.cost_price, 0)), 0), 2) AS valor_cost_price,
           CASE WHEN coalesce(sum(p.stock_current), 0) <> 0
             THEN round(coalesce(sum(p.stock_current * coalesce(p.cost_average, 0)), 0)
                        / sum(p.stock_current), 4) END AS costo_promedio_ponderado,
           count(*) FILTER (WHERE p.stock_current <> 0 AND coalesce(p.cost_average, 0) = 0) AS sin_costo,
           (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'sku', x.sku, 'nombre', x.name, 'existencia', x.stock_current,
                     'costo_promedio', x.cost_average, 'valor', x.valor) ORDER BY x.valor DESC), '[]'::jsonb)
            FROM (SELECT p2.sku, p2.name, p2.stock_current, p2.cost_average,
                         round(p2.stock_current * coalesce(p2.cost_average, 0), 2) AS valor
                  FROM public.products p2
                  WHERE p2.store_id = p_store_id AND p2.stock_current <> 0
                  ORDER BY valor DESC LIMIT 15) x) AS top_productos,
           (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'sku', x.sku, 'nombre', x.name, 'existencia', x.stock_current)
                    ORDER BY x.sku), '[]'::jsonb)
            FROM (SELECT p3.sku, p3.name, p3.stock_current
                  FROM public.products p3
                  WHERE p3.store_id = p_store_id AND p3.stock_current <> 0
                    AND coalesce(p3.cost_average, 0) = 0
                  ORDER BY p3.sku LIMIT 10) x) AS sin_costo_detalle
    FROM public.products p WHERE p.store_id = p_store_id
  ),
  -- Kardex: valor del último saldo por producto al corte (reconstrucción histórica)
  krd AS (
    SELECT round(coalesce(sum(k.balance_total_value), 0), 2) AS valor_kardex,
           count(*) AS productos_con_kardex,
           max(k.ultimo)::date AS ultima_fecha
    FROM (
      SELECT DISTINCT ON (ke.product_id) ke.product_id, ke.balance_total_value,
             max(ke.created_at) OVER () AS ultimo
      FROM public.kardex_entries ke
      WHERE ke.store_id = p_store_id AND ke.created_at::date <= p_as_of
      ORDER BY ke.product_id, ke.created_at DESC
    ) k
  ),
  -- Detector de ventas con fallback de liquidación USD (settlement/carve):
  -- su cobro contable (cob_cash_cup/cob_cash_usd_cup reescritos por el motor)
  -- puede divergir del riel de payment_transactions → calidad PARCIAL en cajas.
  fb AS (
    -- v2: SOLO ventas sin NINGUNA fila en el riel de pagos (era pre-riel) cuya
    -- reconstrucción física (settlement/carve) contenga USD: son las únicas que
    -- el motor contabiliza con fuente distinta del riel y pueden divergir de él.
    SELECT count(*) AS n FROM public.transactions t
    WHERE t.store_id = p_store_id AND t.status = 'completed'
      AND t.created_at::date <= p_as_of
      -- CP-FIN-111 (P0-3): exactamente el criterio del fallback del motor —
      -- el fallback aplica cuando la venta NO tiene cobro de EFECTIVO en las
      -- monedas canónicas (suma por grupo = 0). La mera existencia de una fila
      -- de transferencia/zelle NO suprime el hallazgo (venta legacy con
      -- liquidación de efectivo + solo transferencia en el riel sigue
      -- detectándose); con cobro efectivo REAL en el riel no se detecta.
      AND NOT EXISTS (
        SELECT 1 FROM public.payment_transactions pt
        WHERE pt.ref_type = 'sale' AND pt.ref_id = t.id
          AND pt.payment_method = 'cash'
          AND coalesce(pt.direction, 'in') = 'in'
          AND lower(coalesce(pt.currency, 'cup')) IN ('cup', 'usd', 'eur', 'mlc')
        GROUP BY lower(coalesce(pt.currency, 'cup'))
        HAVING sum(pt.amount_cup) <> 0)
      AND (
        coalesce(t.cash_received_usd, 0) - coalesce(t.change_given_usd, 0) > 0
        OR EXISTS (
          SELECT 1 FROM public.transaction_items ti
          WHERE ti.transaction_id = t.id AND ti.cash_currency = 'USD'
            AND ti.currency = 'USD' AND coalesce(ti.cash_paid, 0) > 0))
  ),
  -- Cuentas financieras: flujos operacionales por (medios × moneda)
  cash AS (
    SELECT cur.*, (f ->> 'apertura')::numeric AS apertura, (f ->> 'flujos')::numeric AS flujos,
           (f ->> 'n_flujos')::bigint AS n_flujos, f -> 'desglose' AS desglose
    FROM (
      SELECT 'CUP' AS cur, public.fin_cash_flows_operacional(p_store_id, ARRAY['cash'], 'CUP', p_as_of) AS f
      UNION ALL SELECT 'USD', public.fin_cash_flows_operacional(p_store_id, ARRAY['cash'], 'USD', p_as_of)
      UNION ALL SELECT 'EUR', public.fin_cash_flows_operacional(p_store_id, ARRAY['cash'], 'EUR', p_as_of)
      UNION ALL SELECT 'MLC', public.fin_cash_flows_operacional(p_store_id, ARRAY['cash'], 'MLC', p_as_of)
      UNION ALL SELECT 'BANCOS', public.fin_cash_flows_operacional(p_store_id, ARRAY['transfer'], NULL, p_as_of)
      UNION ALL SELECT 'EXTERIOR', public.fin_cash_flows_operacional(p_store_id, ARRAY['external_transfer', 'zelle'], NULL, p_as_of)
    ) cur(cur, f)
  ),
  -- Documentos operacionales postables SIN asiento en la generación activa
  docs_pend AS (
    SELECT 'VENTA' AS tipo, count(*) AS n FROM public.transactions t
    WHERE t.store_id = p_store_id AND t.status = 'completed' AND t.created_at::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'VENTA'
                        AND e.document_id = t.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'DEVOLUCION_VENTA', count(*) FROM public.devolutions d
    WHERE d.store_id = p_store_id AND d.status = 'completed' AND d.processed_at::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'DEVOLUCION_VENTA'
                        AND e.document_id = d.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'RECEPCION', count(*) FROM public.receipts r
    WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'RECEPCION'
                        AND e.document_id = r.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'SERVICIO_RECIBIDO', count(*) FROM public.received_services s
    WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'SERVICIO_RECIBIDO'
                        AND e.document_id = s.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    -- v2: los vales de costo 0.00 no tienen efecto contable material (el motor
    -- prohíbe movimientos <= 0): no son documentos pendientes, son sin-asiento
    -- legítimo (clasificación CP-FIN-110 D5: 34 vales históricos costo cero).
    SELECT 'VALE_SALIDA', count(*) FROM public.issue_slips i
    WHERE i.store_id = p_store_id AND i.status = 'completed' AND i.created_at::date <= p_as_of
      AND coalesce(i.total_cost, 0) > 0
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'VALE_SALIDA'
                        AND e.document_id = i.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'AJUSTE_INVENTARIO', count(*) FROM public.inventory_adjustments a
    WHERE a.store_id = p_store_id AND a.status = 'confirmed' AND a.confirmed_at::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'AJUSTE_INVENTARIO'
                        AND e.document_id = a.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'COMISION', count(*) FROM public.commission_payments c
    WHERE c.store_id = p_store_id AND c.status = 'paid' AND c.paid_at::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'COMISION'
                        AND e.document_id = c.id AND e.event = 'pago'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'NOMINA', count(*) FROM public.payrolls n
    WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid') AND n.period_end <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'NOMINA'
                        AND e.document_id = n.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'FLUJO_CAJA', count(*) FROM public.cash_flow_documents cfd
    WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado' AND cfd.operation_date::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'FLUJO_CAJA'
                        AND e.document_id = cfd.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    -- CP-FIN-111 (P0-1/k): reconocimientos faltantes de órdenes RECONOCIBLES
    -- (mismo predicado que el pase 5 del build: completed, o closed con
    -- completion_date; voided/closed-sin-evidencia NO se exigen).
    SELECT 'ORDEN_TRABAJO', count(*) FROM public.production_orders o
    WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
      AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
      AND coalesce(o.completion_date, o.order_date) <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'ORDEN_TRABAJO'
                        AND e.document_id = o.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    -- Anticipos (pagos de órdenes service/work) sin asiento en la generación.
    SELECT 'ORDEN_TRABAJO', count(*) FROM public.payment_transactions pt
    JOIN public.production_orders po ON po.id = pt.ref_id
    WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
      AND coalesce(pt.direction, 'in') = 'in' AND po.order_type IN ('service', 'work')
      AND pt.payment_date::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'ORDEN_TRABAJO'
                        AND e.document_id = pt.ref_id AND e.event = 'pago'
                        AND e.payment_ref = pt.id
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
  ),
  -- Asientos cuyo documento de origen YA NO EXISTE en la tabla fuente
  sin_resp AS (
    SELECT e.document_type AS tipo, count(*) AS n
    FROM public.fin_entries e
    WHERE e.store_id = p_store_id AND e.generation_id IS NOT DISTINCT FROM v_gen
      AND e.document_id IS NOT NULL AND e.economic_date <= p_as_of
      AND (e.document_type = 'VENTA' AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = e.document_id)
        OR e.document_type = 'DEVOLUCION_VENTA' AND NOT EXISTS (SELECT 1 FROM public.devolutions d WHERE d.id = e.document_id)
        OR e.document_type = 'RECEPCION' AND NOT EXISTS (SELECT 1 FROM public.receipts r WHERE r.id = e.document_id)
        OR e.document_type = 'SERVICIO_RECIBIDO' AND NOT EXISTS (SELECT 1 FROM public.received_services s WHERE s.id = e.document_id)
        OR e.document_type = 'VALE_SALIDA' AND NOT EXISTS (SELECT 1 FROM public.issue_slips i WHERE i.id = e.document_id)
        OR e.document_type = 'AJUSTE_INVENTARIO' AND NOT EXISTS (SELECT 1 FROM public.inventory_adjustments a WHERE a.id = e.document_id)
        OR e.document_type = 'COMISION' AND NOT EXISTS (SELECT 1 FROM public.commission_payments c WHERE c.id = e.document_id)
        OR e.document_type = 'NOMINA' AND NOT EXISTS (SELECT 1 FROM public.payrolls n WHERE n.id = e.document_id)
        OR e.document_type = 'FLUJO_CAJA' AND NOT EXISTS (SELECT 1 FROM public.cash_flow_documents cfd WHERE cfd.id = e.document_id)
        OR e.document_type = 'ORDEN_TRABAJO' AND NOT EXISTS (SELECT 1 FROM public.production_orders o WHERE o.id = e.document_id))
    GROUP BY e.document_type
  ),
  -- ── Lado OPERACIONAL por cuenta (UNION: una fila por cuenta conciliable) ──
  op AS (
    -- ACT_INVENTARIO · valoración WAC del sistema (hoy) o kardex al corte (histórico)
    SELECT 'ACT_INVENTARIO' AS cuenta, false AS es_periodo, 10::int AS orden,
           CASE WHEN p_as_of < CURRENT_DATE THEN krd.valor_kardex ELSE inv.valor_wac END AS valor_op,
           inv.con_stock AS docs_op,
           (SELECT max(sm.created_at)::date FROM public.stock_movements sm WHERE sm.store_id = p_store_id) AS ultima_op,
           CASE WHEN inv.sin_costo > 0
                 OR inv.con_stock <> krd.productos_con_kardex
                 OR p_as_of < CURRENT_DATE
                THEN 'PARCIAL' ELSE 'COMPLETA' END::text AS calidad,
           CASE WHEN p_as_of < CURRENT_DATE
             THEN 'Valor según Kardex al corte (último saldo por producto): reconstrucción histórica documental.'
             ELSE 'Σ products.stock_current × cost_average (WAC — método de valoración del sistema). Fuente viva del maestro de productos.' END AS metodologia,
           ARRAY['products', 'kardex_entries', 'stock_movements']::text[] AS fuentes,
           jsonb_build_object(
             'productos_total', inv.productos_total, 'con_stock_positivo', inv.con_stock,
             'stock_cero', inv.stock_cero, 'stock_negativo', inv.stock_negativo,
             'cantidad_total', inv.cantidad_total, 'valor_wac', inv.valor_wac,
             'valor_cost_price', inv.valor_cost_price, 'valor_kardex', krd.valor_kardex,
             'costo_promedio_ponderado', inv.costo_promedio_ponderado,
             'productos_sin_costo', inv.sin_costo, 'sin_costo_detalle', inv.sin_costo_detalle,
             'top_productos', inv.top_productos,
             'diferencia_wac_kardex', round(inv.valor_wac - krd.valor_kardex, 2),
             'documentos_pendientes', coalesce((SELECT jsonb_object_agg(tipo, n) FROM (SELECT tipo, n FROM docs_pend WHERE n > 0 AND tipo IN ('VENTA','DEVOLUCION_VENTA','RECEPCION','VALE_SALIDA','AJUSTE_INVENTARIO')) z), '{}'::jsonb),
             'movimientos_sin_respaldo', coalesce((SELECT jsonb_object_agg(tipo, n) FROM (SELECT tipo, n FROM sin_resp WHERE tipo IN ('VENTA','DEVOLUCION_VENTA','RECEPCION','VALE_SALIDA','AJUSTE_INVENTARIO')) z), '{}'::jsonb),
             'nota_corte', CASE WHEN p_as_of < CURRENT_DATE THEN 'Corte histórico: el valor vivo del maestro refleja HOY; se usa el Kardex al corte como fuente primaria.' END) AS detalle
    FROM inv CROSS JOIN krd
    -- Cajas por moneda (medio = efectivo físico)
    UNION ALL
    SELECT 'ACT_EFECTIVO_' || c.cur, false, 11,
           c.apertura + c.flujos, c.n_flujos,
           (SELECT max(pt.payment_date)::date FROM public.payment_transactions pt
             WHERE pt.store_id = p_store_id AND pt.payment_method = 'cash'
               AND pt.currency = c.cur AND pt.payment_date::date <= p_as_of),
           CASE WHEN (c.cur IN ('CUP', 'USD') AND fb.n > 0) THEN 'PARCIAL' ELSE 'COMPLETA' END,
           'Apertura declarada + flujos operacionales de payment_transactions/comisiones/nóminas por (efectivo × ' || c.cur || '), en equivalente CUP (amount_cup). Réplica de la semántica de fechas del motor.',
           ARRAY['payment_transactions', 'cash_flow_documents', 'commission_payments', 'payrolls', 'fin_opening_balances']::text[],
           jsonb_build_object('apertura', c.apertura, 'flujos', c.flujos, 'desglose', c.desglose,
             'ventas_con_fallback_usd', fb.n,
             'documentos_pendientes', coalesce((SELECT jsonb_object_agg(tipo, n) FROM (SELECT tipo, n FROM docs_pend WHERE n > 0 AND tipo IN ('VENTA','DEVOLUCION_VENTA','FLUJO_CAJA','COMISION','NOMINA','RECEPCION','SERVICIO_RECIBIDO')) z), '{}'::jsonb))
    FROM cash c CROSS JOIN fb WHERE c.cur IN ('CUP', 'USD', 'EUR', 'MLC')
    -- Bancos (transferencias, cualquier moneda)
    UNION ALL
    SELECT 'ACT_BANCOS', false, 12,
           c.apertura + c.flujos, c.n_flujos,
           (SELECT max(pt.payment_date)::date FROM public.payment_transactions pt
             WHERE pt.store_id = p_store_id AND pt.payment_method = 'transfer'
               AND pt.payment_date::date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + flujos por transferencia (cualquier moneda) según mapeo canónico fin_account_mapping (transfer × * → ACT_BANCOS).',
           ARRAY['payment_transactions', 'fin_opening_balances']::text[],
           jsonb_build_object('apertura', c.apertura, 'flujos', c.flujos, 'desglose', c.desglose)
    FROM cash c WHERE c.cur = 'BANCOS'
    -- Transferencias del exterior (external_transfer + zelle heredado)
    UNION ALL
    SELECT 'ACT_TRANSF_EXTERIOR', false, 13,
           c.apertura + c.flujos, c.n_flujos,
           (SELECT max(pt.payment_date)::date FROM public.payment_transactions pt
             WHERE pt.store_id = p_store_id AND pt.payment_method IN ('external_transfer', 'zelle')
               AND pt.payment_date::date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + flujos Transf. Exterior (external_transfer canónico + zelle heredado normalizado), equivalente CUP.',
           ARRAY['payment_transactions', 'fin_opening_balances']::text[],
           jsonb_build_object('apertura', c.apertura, 'flujos', c.flujos, 'desglose', c.desglose)
    FROM cash c WHERE c.cur = 'EXTERIOR'
    -- Cuentas por cobrar: órdenes service/work RECONOCIBLES con saldo
    UNION ALL
    SELECT 'ACT_CXC', false, 14,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'ACT_CXC' AND ob.as_of_date <= p_as_of), 0)
           -- CP-FIN-111 (P0-2): unidades homogéneas — el presupuesto se
           -- convierte a CUP (budget_total × tasa documental) ANTES de restar
           -- los pagos acumulados en CUP (paid_amount). Ejemplo obligatorio:
           -- 100 USD @ 800 con 10 USD pagado (8.000 CUP) → CxC 72.000 CUP
           -- (la fórmula v2 restaba monedas distintas: daba 0).
           + coalesce((SELECT round(sum(greatest(o.budget_total
                * CASE WHEN coalesce(o.budget_currency, 'CUP') = 'CUP'
                            OR coalesce(o.budget_exchange_rate, 0) <= 0 THEN 1
                       ELSE o.budget_exchange_rate END
                - o.paid_amount, 0)), 2)
              FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
               AND coalesce(o.completion_date, o.order_date) <= p_as_of), 0),
           (SELECT count(*) FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
               AND coalesce(o.completion_date, o.order_date) <= p_as_of
               AND greatest(o.budget_total * CASE WHEN coalesce(o.budget_currency, 'CUP') = 'CUP'
                            OR coalesce(o.budget_exchange_rate, 0) <= 0 THEN 1
                       ELSE o.budget_exchange_rate END
                     - o.paid_amount, 0) > 0.01),
           (SELECT max(coalesce(o.completion_date, o.order_date)) FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
               AND coalesce(o.completion_date, o.order_date) <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ (budget_total × tasa documental − paid_amount) de órdenes service/work RECONOCIBLES (completed, o closed con completion_date — v3 P0-1), con el presupuesto convertido ANTES de restar los pagos (v3 P0-2: misma unidades CUP). Las draft/voided/closed-sin-evidencia no generan derecho contable; su anticipo vive en PAS_ANTICIPOS_CLI. Contrapartida del motor: regla ORDEN_TRABAJO v1 (línea ow-rec-cxc-d).',
           ARRAY['production_orders', 'fin_opening_balances']::text[],
           jsonb_build_object(
             'ordenes_pendientes', (SELECT count(*) FROM public.production_orders o
               WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
                 AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
                 AND coalesce(o.completion_date, o.order_date) <= p_as_of
                 AND greatest(o.budget_total * CASE WHEN coalesce(o.budget_currency, 'CUP') = 'CUP'
                            OR coalesce(o.budget_exchange_rate, 0) <= 0 THEN 1
                       ELSE o.budget_exchange_rate END
                     - o.paid_amount, 0) > 0.01),
             'anticipos_cobrados', coalesce((SELECT round(sum(pt.amount_cup), 2) FROM public.payment_transactions pt
               WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
                 AND coalesce(pt.direction, 'in') = 'in' AND pt.payment_date::date <= p_as_of), 0))
    -- Entregas de efectivo para depósito (ACT_OTROS_CORR · FLUJO_CAJA v2)
    UNION ALL
    SELECT 'ACT_OTROS_CORR', false, 15,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'ACT_OTROS_CORR' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(cfd.amount_cup), 2) FROM public.cash_flow_documents cfd
              WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
                AND cfd.doc_type = 'egreso' AND cfd.concept = 'entrega_efectivo'
                AND cfd.operation_date::date <= p_as_of), 0),
           (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept = 'entrega_efectivo'
               AND cfd.operation_date::date <= p_as_of),
           (SELECT max(cfd.operation_date)::date FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept = 'entrega_efectivo'
               AND cfd.operation_date::date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ entregas de efectivo confirmadas (cash_flow_documents egreso/entrega_efectivo → ACT_OTROS_CORR, regla FLUJO_CAJA v2).',
           ARRAY['cash_flow_documents', 'fin_opening_balances']::text[],
           jsonb_build_object('entregas_confirmadas', (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept = 'entrega_efectivo'
               AND cfd.operation_date::date <= p_as_of))
    -- Cuentas por pagar a proveedores: recepciones activas − pagos
    UNION ALL
    SELECT 'PAS_CXP_PROV', false, 30,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_CXP_PROV' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(x.total - x.pagos), 2) FROM (
                SELECT r.id,
                       (SELECT coalesce(sum(ri.quantity * ri.unit_cost * coalesce(NULLIF(ri.tasa_cambio_recepcion, 0), 1)), 0)
                          FROM public.receipt_items ri WHERE ri.receipt_id = r.id) AS total,
                       (SELECT coalesce(sum(pt.amount_cup), 0) FROM public.payment_transactions pt
                         WHERE pt.ref_type = 'receipt' AND pt.ref_id = r.id
                           AND coalesce(pt.direction, 'in') = 'in') AS pagos
                FROM public.receipts r
                WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of) x), 0),
           (SELECT count(*) FROM public.receipts r
             WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of),
           (SELECT max(r.reception_date) FROM public.receipts r
             WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ recepciones activas (Σ receipt_items qty×unit_cost×tasa) − pagos registrados (payment_transactions). Misma semántica de fecha del motor: el asiento de pago lleva la fecha del documento.',
           ARRAY['receipts', 'receipt_items', 'payment_transactions', 'fin_opening_balances']::text[],
           jsonb_build_object('recepciones_activas', (SELECT count(*) FROM public.receipts r
             WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of))
    -- Servicios pendientes de pago
    UNION ALL
    SELECT 'PAS_SERV_PEND', false, 31,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_SERV_PEND' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(x.total - x.pagos), 2) FROM (
                SELECT s.id,
                       CASE WHEN coalesce(s.currency, 'CUP') = 'CUP' OR coalesce(s.exchange_rate, 0) <= 0
                            THEN coalesce(s.total_amount, 0)
                            ELSE coalesce(s.total_amount, 0) * s.exchange_rate END AS total,
                       (SELECT coalesce(sum(pt.amount_cup), 0) FROM public.payment_transactions pt
                         WHERE pt.ref_type = 'service' AND pt.ref_id = s.id
                           AND coalesce(pt.direction, 'in') = 'in') AS pagos
                FROM public.received_services s
                WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of) x), 0),
           (SELECT count(*) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of),
           (SELECT max(s.service_date) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ servicios activos (total × tasa documental) − pagos registrados. Misma métrica del motor (fin_compute_metrics SERVICIO_RECIBIDO).',
           ARRAY['received_services', 'payment_transactions', 'fin_opening_balances']::text[],
           jsonb_build_object('servicios_activos', (SELECT count(*) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of))
    -- Nómina pendiente (confirmada, no pagada: neto)
    UNION ALL
    SELECT 'PAS_NOMINA_PEND', false, 32,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_NOMINA_PEND' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(n.total_net), 2) FROM public.payrolls n
              WHERE n.store_id = p_store_id AND n.status = 'confirmed' AND n.currency = 'CUP'
                AND n.period_end <= p_as_of), 0),
           (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status = 'confirmed' AND n.period_end <= p_as_of),
           (SELECT max(n.period_end) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status = 'confirmed' AND n.period_end <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ total_net de nóminas confirmadas (devengadas) no pagadas. El pago cancela la obligación (regla NOMINA v1: np-neto-d).',
           ARRAY['payrolls', 'fin_opening_balances']::text[],
           jsonb_build_object('nominas_confirmadas', (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status = 'confirmed' AND n.period_end <= p_as_of))
    -- Retenciones de nómina (pendientes de liquidación)
    UNION ALL
    SELECT 'PAS_RETENCIONES', false, 33,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_RETENCIONES' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(n.total_deductions), 2) FROM public.payrolls n
              WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
                AND n.currency = 'CUP' AND n.period_end <= p_as_of), 0),
           (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid') AND n.period_end <= p_as_of),
           (SELECT max(n.period_end) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid') AND n.period_end <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ total_deductions de nóminas confirmadas/pagadas (las retenciones permanecen hasta su liquidación — regla NOMINA v1).',
           ARRAY['payrolls', 'fin_opening_balances']::text[],
           jsonb_build_object('nominas_con_retenciones', (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid') AND n.period_end <= p_as_of))
    -- Crédito de tienda (store credit)
    UNION ALL
    SELECT 'PAS_ANTICIPOS_CLI', false, 36,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_ANTICIPOS_CLI' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(scl.amount), 2) FROM public.store_credit_ledger scl
              WHERE scl.store_id = p_store_id AND scl.created_at::date <= p_as_of), 0)
           -- v2: anticipos cobrados por órdenes service/work NO completadas (el
           -- dinero del cliente por trabajos aún no ejecutados: pasivo real). Las
           -- órdenes completadas consumen su anticipo en el reconocimiento
           -- (ow-rec-ant-d); un exceso sobre el presupuesto queda aquí.
           + coalesce((SELECT round(sum(pt.amount_cup), 2) FROM public.payment_transactions pt
              JOIN public.production_orders o ON o.id = pt.ref_id
              WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
                AND coalesce(pt.direction, 'in') = 'in'
                AND o.order_type IN ('service', 'work')
                AND NOT (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
                AND pt.payment_date::date <= p_as_of), 0)
           + coalesce((SELECT round(coalesce(sum(x.exc), 0), 2) FROM (
                SELECT greatest(sum(pt.amount_cup) - CASE WHEN coalesce(o.budget_currency, 'CUP') = 'CUP'
                            OR coalesce(o.budget_exchange_rate, 0) <= 0
                       THEN coalesce(o.budget_total, 0) ELSE o.budget_total * o.budget_exchange_rate END, 0) AS exc
                FROM public.production_orders o
                JOIN public.payment_transactions pt ON pt.ref_id = o.id
                     AND pt.ref_type IN ('production_order', 'work') AND coalesce(pt.direction, 'in') = 'in'
                WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
                  AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
                  AND coalesce(o.completion_date, o.order_date) <= p_as_of
                GROUP BY o.id) x), 0),
           (SELECT count(*) FROM public.store_credit_ledger scl
             WHERE scl.store_id = p_store_id AND scl.created_at::date <= p_as_of)
           + (SELECT count(*) FROM public.payment_transactions pt
              JOIN public.production_orders o ON o.id = pt.ref_id
              WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
                AND coalesce(pt.direction, 'in') = 'in'
                AND o.order_type IN ('service', 'work')
                AND NOT (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
                AND pt.payment_date::date <= p_as_of),
           (SELECT max(pt.payment_date)::date FROM public.payment_transactions pt
              JOIN public.production_orders o ON o.id = pt.ref_id
              WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
                AND coalesce(pt.direction, 'in') = 'in'
                AND o.order_type IN ('service', 'work')
                AND NOT (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
                AND pt.payment_date::date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ store_credit_ledger (crédito de tienda) + Σ anticipos de órdenes service/work NO completadas + excesos de anticipos sobre presupuesto de órdenes completadas (v2). Contrapartida del motor: regla ORDEN_TRABAJO v1 (anticipos → PAS_ANTICIPOS_CLI).',
           ARRAY['store_credit_ledger', 'payment_transactions', 'production_orders', 'fin_opening_balances']::text[],
           jsonb_build_object('creditos_emitidos', (SELECT count(*) FROM public.store_credit_ledger scl
             WHERE scl.store_id = p_store_id AND scl.amount > 0 AND scl.created_at::date <= p_as_of),
             'anticipos_pendientes', (SELECT coalesce(round(sum(pt.amount_cup), 2), 0) FROM public.payment_transactions pt
              JOIN public.production_orders o ON o.id = pt.ref_id
              WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
                AND coalesce(pt.direction, 'in') = 'in'
                AND o.order_type IN ('service', 'work')
                AND NOT (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
                AND pt.payment_date::date <= p_as_of),
             'ordenes_no_reconocibles', (SELECT count(*) FROM public.production_orders o
              WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
                AND NOT (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
                AND o.order_date <= p_as_of))
    -- ══ Cuentas de PERÍODO (mismo rango que el Estado de Rendimiento) ══
    -- Ingresos por ventas (neteo canónico v4: ventas − devoluciones)
    UNION ALL
    SELECT 'ING_VENTAS', true, 60,
           round(coalesce((SELECT sum(t.total_amount) FROM public.transactions t
               WHERE t.store_id = p_store_id AND t.status = 'completed'
                 AND t.created_at::date BETWEEN p_from AND p_to), 0)
               - coalesce((SELECT sum(d.total_amount) FROM public.devolutions d
               WHERE d.store_id = p_store_id AND d.status = 'completed'
                 AND d.processed_at::date BETWEEN p_from AND p_to), 0), 2),
           (SELECT count(*) FROM public.transactions t
             WHERE t.store_id = p_store_id AND t.status = 'completed'
               AND t.created_at::date BETWEEN p_from AND p_to)
           + (SELECT count(*) FROM public.devolutions d
             WHERE d.store_id = p_store_id AND d.status = 'completed'
               AND d.processed_at::date BETWEEN p_from AND p_to),
           (SELECT max(d.processed_at)::date FROM public.devolutions d
             WHERE d.store_id = p_store_id AND d.status = 'completed'
               AND d.processed_at::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ total_amount de ventas completadas − Σ devoluciones completadas del período (neteo canónico de la regla VENTA v4: d-ing-d debita ING_VENTAS).',
           ARRAY['transactions', 'devolutions']::text[],
           jsonb_build_object(
             'ventas_completadas', (SELECT count(*) FROM public.transactions t
               WHERE t.store_id = p_store_id AND t.status = 'completed'
                 AND t.created_at::date BETWEEN p_from AND p_to),
             'devoluciones', (SELECT count(*) FROM public.devolutions d
               WHERE d.store_id = p_store_id AND d.status = 'completed'
                 AND d.processed_at::date BETWEEN p_from AND p_to))
    -- Descuentos / diferencias de cobro
    UNION ALL
    -- Ingresos por servicios prestados (órdenes service/work completadas) — v2
    SELECT 'ING_SERVICIOS_PREST', true, 61,
           coalesce((SELECT round(sum(CASE WHEN coalesce(o.budget_currency, 'CUP') = 'CUP'
                            OR coalesce(o.budget_exchange_rate, 0) <= 0
                       THEN coalesce(o.budget_total, 0) ELSE o.budget_total * o.budget_exchange_rate END), 2)
              FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
               AND coalesce(o.completion_date, o.order_date) BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
               AND coalesce(o.completion_date, o.order_date) BETWEEN p_from AND p_to),
           (SELECT max(coalesce(o.completion_date, o.order_date)) FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
               AND coalesce(o.completion_date, o.order_date) BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ budget_total × tasa documental de órdenes service/work RECONOCIBLES del período, por fecha real de finalización (v3 P0-1: completed, o closed con completion_date — mismas que reconoce el pase 5 del build). Contrapartida del motor: regla ORDEN_TRABAJO v1 (línea ow-rec-ing-c).',
           ARRAY['production_orders']::text[],
           jsonb_build_object('ordenes_completadas', (SELECT count(*) FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
               AND coalesce(o.completion_date, o.order_date) BETWEEN p_from AND p_to))
    -- Descuentos / diferencias de cobro
    UNION ALL
    SELECT 'ING_DESCUENTOS', true, 66,
           round(coalesce((SELECT sum(pt.amount_cup)
               FROM public.payment_transactions pt
               JOIN public.transactions t ON t.id = pt.ref_id
              WHERE pt.store_id = p_store_id AND pt.ref_type = 'sale'
                AND coalesce(pt.direction, 'in') = 'in'
                AND t.status = 'completed'
                AND t.created_at::date BETWEEN p_from AND p_to), 0)
             - coalesce((SELECT sum(t.total_amount) FROM public.transactions t
               WHERE t.store_id = p_store_id AND t.status = 'completed'
                 AND t.created_at::date BETWEEN p_from AND p_to), 0), 2),
           (SELECT count(*) FROM public.transactions t
             WHERE t.store_id = p_store_id AND t.status = 'completed'
               AND t.created_at::date BETWEEN p_from AND p_to),
           NULL::date,
           CASE WHEN (SELECT fb2.n FROM fb fb2) > 0 THEN 'PARCIAL' ELSE 'COMPLETA' END,
           'Σ (cobrado − facturado) de las ventas del período (diferencia_cobro de la métrica del motor; presentación crédito−débito). Las ventas con fallback de liquidación USD pueden divergir del riel de pagos.',
           ARRAY['transactions', 'payment_transactions']::text[],
           jsonb_build_object('ventas_con_fallback_usd', (SELECT fb2.n FROM fb fb2))
    -- Costo de ventas (WAC congelado a la venta − costo devuelto)
    UNION ALL
    SELECT 'GAS_COSTO_VENTAS', true, 70,
           -- v2: redondeo POR VENTA/DEVOLUCIÓN (round por documento, idéntico al
           -- motor) — elimina la diferencia de precisión 0.01 del redondeo global
           -- del período sin ocultarla: ambas fuentes aplican la MISMA política.
           round(coalesce((SELECT sum(x.s)
               FROM (SELECT round(sum(ti.quantity * coalesce(NULLIF(ti.cost_at_sale, 0), p.cost_average, 0)), 2) AS s
                     FROM public.transaction_items ti
                     JOIN public.transactions t ON t.id = ti.transaction_id
                     LEFT JOIN public.products p ON p.id = ti.product_id
                    WHERE t.store_id = p_store_id AND t.status = 'completed'
                      AND t.created_at::date BETWEEN p_from AND p_to
                    GROUP BY t.id) x), 0)
             - coalesce((SELECT sum(x.s)
               FROM (SELECT round(sum(di.quantity * coalesce(NULLIF(oti.cost_at_sale, 0), p.cost_average, 0)), 2) AS s
                     FROM public.devolution_items di
                     JOIN public.devolutions d ON d.id = di.devolution_id
                     LEFT JOIN public.transaction_items oti
                       ON oti.transaction_id = d.original_transaction_id AND oti.product_id = di.product_id
                     LEFT JOIN public.products p ON p.id = di.product_id
                    WHERE d.store_id = p_store_id AND d.status = 'completed'
                      AND d.processed_at::date BETWEEN p_from AND p_to
                    GROUP BY d.id) x), 0), 2),
           (SELECT count(*) FROM public.transactions t
             WHERE t.store_id = p_store_id AND t.status = 'completed'
               AND t.created_at::date BETWEEN p_from AND p_to),
           NULL::date,
           'COMPLETA',
           'Σ qty×COALESCE(cost_at_sale, cost_average) de ventas completadas − costo devuelto de devoluciones (misma fórmula de fin_compute_metrics v5: costo_productos_cup y costo_devuelto_cup). El costo queda CONGELADO a la venta (DF-02): no se recalcula.',
           ARRAY['transaction_items', 'devolution_items', 'products']::text[],
           jsonb_build_object(
             'nota', 'COGS histórico congelado (cost_at_sale de la era de cada venta). La brecha frente al inventario vivo de la era FAC-VITALLCONS-001 está documentada en el expediente CP-FIN-003 §5.1.')
    -- Vales de salida (consumo interno)
    UNION ALL
    SELECT 'GAS_VALES', true, 74,
           coalesce((SELECT round(sum(i.total_cost), 2) FROM public.issue_slips i
              WHERE i.store_id = p_store_id AND i.status = 'completed'
                AND i.created_at::date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.issue_slips i
             WHERE i.store_id = p_store_id AND i.status = 'completed'
               AND i.created_at::date BETWEEN p_from AND p_to),
           (SELECT max(i.created_at)::date FROM public.issue_slips i
             WHERE i.store_id = p_store_id AND i.status = 'completed'
               AND i.created_at::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ total_cost de vales completados del período (métrica costo_cup del motor).',
           ARRAY['issue_slips']::text[],
           jsonb_build_object('vales_completados', (SELECT count(*) FROM public.issue_slips i
             WHERE i.store_id = p_store_id AND i.status = 'completed'
               AND i.created_at::date BETWEEN p_from AND p_to))
    -- Servicios recibidos (gasto)
    UNION ALL
    SELECT 'GAS_SERVICIOS', true, 71,
           coalesce((SELECT round(sum(CASE WHEN coalesce(s.currency, 'CUP') = 'CUP' OR coalesce(s.exchange_rate, 0) <= 0
                        THEN coalesce(s.total_amount, 0)
                        ELSE coalesce(s.total_amount, 0) * s.exchange_rate END), 2)
              FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active'
               AND s.service_date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active'
               AND s.service_date BETWEEN p_from AND p_to),
           (SELECT max(s.service_date) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active'
               AND s.service_date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ total×tasa de servicios recibidos activos del período (métrica total_cup del motor).',
           ARRAY['received_services']::text[],
           jsonb_build_object('servicios_activos', (SELECT count(*) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active'
               AND s.service_date BETWEEN p_from AND p_to))
    -- Comisiones pagadas
    UNION ALL
    SELECT 'GAS_COMISIONES', true, 73,
           coalesce((SELECT round(sum(CASE WHEN coalesce(c.currency, 'CUP') = 'CUP' OR coalesce(c.exchange_rate, 0) <= 0
                        THEN coalesce(c.final_amount, 0)
                        ELSE coalesce(c.final_amount, 0) * c.exchange_rate END), 2)
              FROM public.commission_payments c
             WHERE c.store_id = p_store_id AND c.status = 'paid'
               AND c.paid_at::date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.commission_payments c
             WHERE c.store_id = p_store_id AND c.status = 'paid'
               AND c.paid_at::date BETWEEN p_from AND p_to),
           (SELECT max(c.paid_at)::date FROM public.commission_payments c
             WHERE c.store_id = p_store_id AND c.status = 'paid'
               AND c.paid_at::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ final_amount×tasa de comisiones pagadas del período (métrica total_cup del motor; gasto y pago en el mismo evento).',
           ARRAY['commission_payments']::text[],
           jsonb_build_object('comisiones_pagadas', (SELECT count(*) FROM public.commission_payments c
             WHERE c.store_id = p_store_id AND c.status = 'paid'
               AND c.paid_at::date BETWEEN p_from AND p_to))
    -- Nóminas (gasto devengado)
    UNION ALL
    SELECT 'GAS_NOMINAS', true, 72,
           coalesce((SELECT round(sum(n.total_gross), 2) FROM public.payrolls n
              WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
                AND n.currency = 'CUP' AND n.period_end BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
               AND n.period_end BETWEEN p_from AND p_to),
           (SELECT max(n.period_end) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
               AND n.period_end BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ total_gross de nóminas confirmadas/pagadas del período (métrica total_gross_cup del motor).',
           ARRAY['payrolls']::text[],
           jsonb_build_object('nominas', (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
               AND n.period_end BETWEEN p_from AND p_to))
    -- Pérdidas de inventario (faltantes confirmados, valorados al WAC del momento)
    UNION ALL
    SELECT 'GAS_PERDIDA_INV', true, 75,
           coalesce((SELECT round(sum((-i.difference) * coalesce(NULLIF(w.wac, 0), p.cost_average, 0))
                 FILTER (WHERE i.difference < 0), 2)
              FROM public.inventory_adjustments a
              JOIN public.inventory_adjustment_items i ON i.adjustment_id = a.id
              JOIN public.products p ON p.id = i.product_id
              LEFT JOIN LATERAL (
                SELECT wcl.wac_after AS wac FROM public.wac_change_log wcl
                WHERE wcl.product_id = i.product_id AND wcl.store_id = a.store_id
                  AND wcl.created_at <= a.confirmed_at
                ORDER BY wcl.created_at DESC LIMIT 1) w ON true
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.inventory_adjustments a
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to),
           (SELECT max(a.confirmed_at)::date FROM public.inventory_adjustments a
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ faltantes (difference<0 × WAC del momento del ajuste según wac_change_log, fallback cost_average) de ajustes confirmados — métrica valor_faltante_cup del motor.',
           ARRAY['inventory_adjustments', 'inventory_adjustment_items', 'wac_change_log', 'products']::text[],
           jsonb_build_object('ajustes_confirmados', (SELECT count(*) FROM public.inventory_adjustments a
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to))
    -- Otros ingresos operacionales (sobrantes + ingresos de caja)
    UNION ALL
    SELECT 'ING_OTROS_OPER', true, 62,
           round(coalesce((SELECT sum(i.difference * coalesce(NULLIF(w.wac, 0), p.cost_average, 0))
                 FILTER (WHERE i.difference > 0)
              FROM public.inventory_adjustments a
              JOIN public.inventory_adjustment_items i ON i.adjustment_id = a.id
              JOIN public.products p ON p.id = i.product_id
              LEFT JOIN LATERAL (
                SELECT wcl.wac_after AS wac FROM public.wac_change_log wcl
                WHERE wcl.product_id = i.product_id AND wcl.store_id = a.store_id
                  AND wcl.created_at <= a.confirmed_at
                ORDER BY wcl.created_at DESC LIMIT 1) w ON true
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to), 0)
             + coalesce((SELECT sum(cfd.amount_cup) FROM public.cash_flow_documents cfd
              WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
                AND cfd.doc_type = 'ingreso'
                AND cfd.operation_date::date BETWEEN p_from AND p_to), 0), 2),
           (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'ingreso'
               AND cfd.operation_date::date BETWEEN p_from AND p_to),
           (SELECT max(cfd.operation_date)::date FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'ingreso'
               AND cfd.operation_date::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ sobrantes de inventario (WAC del momento) + ingresos de caja documentados del período (reglas AJUSTE_INVENTARIO v1 y FLUJO_CAJA v2: fc-in-c).',
           ARRAY['inventory_adjustments', 'inventory_adjustment_items', 'wac_change_log', 'cash_flow_documents']::text[],
           jsonb_build_object('ingresos_caja', coalesce((SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'ingreso'
               AND cfd.operation_date::date BETWEEN p_from AND p_to), 0))
    -- Otros gastos operacionales (egresos de caja ordinarios ≠ entrega_efectivo)
    UNION ALL
    SELECT 'GAS_OTROS_OPER', true, 81,
           coalesce((SELECT round(sum(cfd.amount_cup), 2) FROM public.cash_flow_documents cfd
              WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
                AND cfd.doc_type = 'egreso' AND cfd.concept <> 'entrega_efectivo'
                AND cfd.operation_date::date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept <> 'entrega_efectivo'
               AND cfd.operation_date::date BETWEEN p_from AND p_to),
           (SELECT max(cfd.operation_date)::date FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept <> 'entrega_efectivo'
               AND cfd.operation_date::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ egresos de caja ordinarios confirmados (concepto ≠ entrega_efectivo) del período — regla FLUJO_CAJA v2: fc-eg-d.',
           ARRAY['cash_flow_documents']::text[],
           jsonb_build_object('egresos_confirmados', (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept <> 'entrega_efectivo'
               AND cfd.operation_date::date BETWEEN p_from AND p_to))
  ),
  -- ── Lado CONTABLE (mayor de la generación activa, ventana por naturaleza) ──
  led AS (
    SELECT o.cuenta, o.es_periodo, o.orden, o.valor_op, o.docs_op, o.ultima_op,
           o.calidad, o.metodologia, o.fuentes, o.detalle,
           c.name AS nombre, c.clase, c.grupo, c.sort_order,
           CASE WHEN o.es_periodo THEN lper.saldo ELSE lcut.saldo END AS valor_contable,
           CASE WHEN o.es_periodo THEN lper.movimientos ELSE lcut.movimientos END AS movs,
           CASE WHEN o.es_periodo THEN lper.ultima_fecha ELSE lcut.ultima_fecha END AS ultima_cont
    FROM op o
    JOIN public.fin_categories c ON c.code = o.cuenta
    LEFT JOIN LATERAL (SELECT ls.saldo, ls.movimientos, ls.ultima_fecha
                         FROM public.fin_ledger_saldo(p_store_id, o.cuenta, v_gen, v_hist, p_as_of) ls) lcut ON true
    LEFT JOIN LATERAL (SELECT ls.saldo, ls.movimientos, ls.ultima_fecha
                         FROM public.fin_ledger_saldo(p_store_id, o.cuenta, v_gen, p_from, p_to) ls) lper ON true
  ),
  calc AS (
    SELECT l.*,
           round(l.valor_op - l.valor_contable, 2) AS diferencia,
           round(coalesce(cf.tolerancia, 0.01), 2) AS tolerancia,
           greatest(coalesce(cf.materialidad_min, 1), round(coalesce(cf.materialidad_pct, 0)
                 * greatest(abs(l.valor_op), abs(l.valor_contable)), 2)) AS materialidad
    FROM led l LEFT JOIN public.fin_reconciliation_config cf ON cf.category_code = l.cuenta
  ),
  final_rows AS (
    SELECT calc.cuenta, calc.nombre, calc.clase, calc.grupo, calc.sort_order,
           calc.es_periodo,
           CASE WHEN calc.es_periodo AND (p_from IS NULL OR p_to IS NULL) THEN NULL
                ELSE calc.valor_op END AS valor_operacional,
           calc.valor_contable,
           CASE WHEN calc.es_periodo AND (p_from IS NULL OR p_to IS NULL) THEN NULL
                ELSE calc.diferencia END AS diferencia,
           CASE WHEN abs(calc.valor_contable) > 0.005
             THEN round(abs(calc.valor_op - calc.valor_contable) / abs(calc.valor_contable) * 100, 2) END AS diferencia_pct,
           CASE
             WHEN calc.es_periodo AND (p_from IS NULL OR p_to IS NULL) THEN 'PENDIENTE'
             WHEN calc.calidad = 'SIN_FUENTE' THEN 'INCOMPLETO'
             WHEN abs(calc.diferencia) <= calc.tolerancia
               THEN CASE WHEN calc.calidad = 'PARCIAL' THEN 'INCOMPLETO' ELSE 'CONCILIADO' END
             WHEN abs(calc.diferencia) > calc.materialidad THEN 'ALERTA'
             ELSE 'DIFERENCIA'
           END AS estado,
           calc.tolerancia, calc.materialidad,
           calc.docs_op AS documentos_operacionales, calc.movs AS movimientos_contables,
           calc.ultima_op AS ultima_fecha_operacional, calc.ultima_cont AS ultima_fecha_contable,
           calc.calidad, calc.metodologia, calc.fuentes, calc.detalle,
           calc.orden
    FROM calc
    UNION ALL
    -- Resto del catálogo: SIN fuente operacional independiente (misión §5.3)
    SELECT c.code, c.name, c.clase, c.grupo, c.sort_order,
           (c.clase IN ('ingreso', 'gasto')) AS es_periodo,
           NULL::numeric AS valor_operacional,
           CASE WHEN c.clase IN ('ingreso', 'gasto') AND (p_from IS NULL OR p_to IS NULL) THEN NULL
                ELSE CASE WHEN c.clase IN ('ingreso', 'gasto')
                     THEN lper.saldo ELSE lcut.saldo END END AS valor_contable,
           NULL::numeric AS diferencia, NULL::numeric AS diferencia_pct,
           CASE WHEN c.clase IN ('ingreso', 'gasto') AND (p_from IS NULL OR p_to IS NULL)
             THEN 'PENDIENTE' ELSE 'NO_CONCILIABLE' END AS estado,
           NULL::numeric AS tolerancia, NULL::numeric AS materialidad,
           NULL::bigint AS documentos_operacionales,
           CASE WHEN c.clase IN ('ingreso', 'gasto') THEN lper.movimientos ELSE lcut.movimientos END AS movimientos_contables,
           NULL::date AS ultima_fecha_operacional,
           CASE WHEN c.clase IN ('ingreso', 'gasto') THEN lper.ultima_fecha ELSE lcut.ultima_fecha END AS ultima_fecha_contable,
           'SIN_FUENTE' AS calidad,
           'NO CONCILIABLE — FALTA FUENTE OPERACIONAL: ninguna tabla operativa independiente respalda esta cuenta (sin módulo documental que la genere).' AS metodologia,
           ARRAY[]::text[] AS fuentes,
           NULL::jsonb AS detalle,
           c.sort_order AS orden
    FROM public.fin_categories c
    LEFT JOIN LATERAL (SELECT ls.saldo, ls.movimientos, ls.ultima_fecha
                         FROM public.fin_ledger_saldo(p_store_id, c.code, v_gen, v_hist, p_as_of) ls) lcut ON true
    LEFT JOIN LATERAL (SELECT ls.saldo, ls.movimientos, ls.ultima_fecha
                         FROM public.fin_ledger_saldo(p_store_id, c.code, v_gen, p_from, p_to) ls) lper ON true
    WHERE c.is_active AND NOT EXISTS (SELECT 1 FROM op o WHERE o.cuenta = c.code)
  )
  SELECT jsonb_build_object(
    'ejecucion', jsonb_build_object(
      'calculado_en', now(),
      'fecha_corte', p_as_of,
      'desde', p_from, 'hasta', p_to,
      'generacion', (SELECT jsonb_build_object('id', id, 'code', code)
                     FROM public.fin_posting_generations WHERE id = v_gen),
      'metodologia_version', v_met_ver,
      'fuentes_actualizadas', jsonb_build_object(
        'products', (SELECT max(updated_at)::text FROM public.products WHERE store_id = p_store_id),
        'inventory', (SELECT max(updated_at)::text FROM public.inventory WHERE store_id = p_store_id),
        'stock_movements', (SELECT max(created_at)::text FROM public.stock_movements WHERE store_id = p_store_id),
        'kardex_entries', (SELECT max(created_at)::text FROM public.kardex_entries WHERE store_id = p_store_id),
        'payment_transactions', (SELECT max(created_at)::text FROM public.payment_transactions WHERE store_id = p_store_id),
        'transactions', (SELECT max(created_at)::text FROM public.transactions WHERE store_id = p_store_id),
        'receipts', (SELECT max(created_at)::text FROM public.receipts WHERE store_id = p_store_id),
        'received_services', (SELECT max(created_at)::text FROM public.received_services WHERE store_id = p_store_id),
        'issue_slips', (SELECT max(created_at)::text FROM public.issue_slips WHERE store_id = p_store_id),
        'production_orders', (SELECT max(updated_at)::text FROM public.production_orders WHERE store_id = p_store_id),
        'fin_entries', (SELECT max(posted_at)::text FROM public.fin_entries
                         WHERE store_id = p_store_id AND generation_id IS NOT DISTINCT FROM v_gen)),
      'convention', 'Diferencia = valor operacional − valor contable (naturaleza-aware).'),
    'resumen', jsonb_build_object(
      'conciliadas', count(*) FILTER (WHERE r.estado = 'CONCILIADO'),
      'diferencias', count(*) FILTER (WHERE r.estado = 'DIFERENCIA'),
      'alertas', count(*) FILTER (WHERE r.estado = 'ALERTA'),
      'incompletas', count(*) FILTER (WHERE r.estado = 'INCOMPLETO'),
      'no_conciliables', count(*) FILTER (WHERE r.estado = 'NO_CONCILIABLE'),
      'pendientes', count(*) FILTER (WHERE r.estado = 'PENDIENTE'),
      'documentos_pendientes', coalesce((SELECT sum(n) FROM docs_pend), 0),
      'movimientos_sin_respaldo', coalesce((SELECT sum(n) FROM sin_resp), 0)),
    'hallazgos', jsonb_build_object(
      'documentos_pendientes', coalesce((SELECT jsonb_agg(jsonb_build_object('tipo', tipo, 'pendientes', n)
                          ORDER BY tipo) FROM docs_pend WHERE n > 0), '[]'::jsonb),
      'movimientos_sin_respaldo', coalesce((SELECT jsonb_agg(jsonb_build_object('tipo', tipo, 'n', n)
                          ORDER BY tipo) FROM sin_resp), '[]'::jsonb),
      'ventas_con_fallback_usd', max(fb.n)),
    'cuentas', coalesce(jsonb_agg(row_to_json(r) ORDER BY r.orden), '[]'::jsonb))
  INTO v_res
  FROM final_rows r, fb;

  RETURN v_res;
END $function$;

-- ── ACL: normalización explícita (CREATE OR REPLACE conserva ACL previa; se
--    reafirma para dejar la huella certificada intacta) ──────────────────────
REVOKE ALL ON FUNCTION public.fin_get_balance_sheet(p_store_id uuid, p_as_of date, p_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_get_balance_sheet(p_store_id uuid, p_as_of date, p_user_id uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fin_get_income_statement(p_store_id uuid, p_from date, p_to date, p_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_get_income_statement(p_store_id uuid, p_from date, p_to date, p_user_id uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fin_get_dashboard(p_store_id uuid, p_from date, p_to date, p_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_get_dashboard(p_store_id uuid, p_from date, p_to date, p_user_id uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fin_get_category_detail(p_store_id uuid, p_category text, p_from date, p_to date, p_limit integer, p_offset integer, p_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_get_category_detail(p_store_id uuid, p_category text, p_from date, p_to date, p_limit integer, p_offset integer, p_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.fin_get_document_types_status(p_store_id uuid, p_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_get_document_types_status(p_store_id uuid, p_user_id uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fin_get_reconciliation(p_store_id uuid, p_as_of date, p_from date, p_to date, p_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_get_reconciliation(p_store_id uuid, p_as_of date, p_from date, p_to date, p_user_id uuid) TO service_role;

do $$
declare
  v_n int;
begin
  select count(*) into v_n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname in
     ('fin_get_balance_sheet','fin_get_income_statement','fin_get_dashboard',
      'fin_get_category_detail','fin_get_document_types_status','fin_get_reconciliation')
     and position('can_manage_store_as' in p.prosrc) > 0
     and position('has_store_access_as' in p.prosrc) = 0;
  if v_n <> 6 then
    raise exception 'CP-FIN-F2-RPC POSTCHECK: esperadas 6 RPC con gate de gestión, encontradas %', v_n
      using errcode = 'P0001';
  end if;
end $$;

-- ============================================================================
-- Migration: 20261128153200_cp_fin_f3_rule_scope_guard.sql
-- Misión:    CP-FIN-REM-001 — PR-A F3 (ámbito de fin_rule_versions)
-- Fecha:     2026-11-28
-- ============================================================================
-- F3 — REGLAS GLOBALES. Estado previo (revalidado en vivo 2026-11-28):
--   fin_rules_update: USING (store_id IS NULL OR has_store_access(store_id))
--   → un admin de tienda puede TOMAR una regla GLOBAL (USING pasa por NULL)
--   y reasignarla a su tienda (WITH CHECK pasa por su membresía): la altera
--   para TODOS. Sin trigger que impida cambiar store_id.
--
-- Cambio:
--   1) Política UPDATE: USING = WITH CHECK idénticos y estrictos:
--      global (store_id NULL) → is_admin(); tienda → has_store_role(admin).
--      Managers y encargados NO modifican reglas.
--   2) Trigger BEFORE UPDATE fin_rule_scope_guard: si NEW.store_id IS DISTINCT
--      FROM OLD.store_id → ERR_FIN_RULE_SCOPE_IMMUTABLE. El ámbito nunca se
--      reasigna (ni global→tienda ni tienda→tienda ni tienda→global).
--      Compatibilidad verificada en vivo: fin_activate_rule_version /
--      fin_deactivate_rule_version solo tocan status/deactivated_at.
--
-- Idempotente: DROP+CREATE policy; DROP+CREATE trigger.
-- Rollback: supabase/rollbacks/20261128153200_rollback_cp_fin_f3.sql
-- ============================================================================


do $$
declare
  v_qual text;
begin
  if to_regclass('public.fin_rule_versions') is null then
    raise exception 'CP-FIN-F3 PRECOND: fin_rule_versions ausente' using errcode = 'P0001';
  end if;
  if to_regprocedure('public.has_store_role(uuid, text[])') is null
     or to_regprocedure('public.is_admin()') is null then
    raise exception 'CP-FIN-F3 PRECOND: helpers ausentes' using errcode = 'P0001';
  end if;
  select qual into v_qual from pg_policies
   where schemaname='public' and tablename='fin_rule_versions' and policyname='fin_rules_update';
  if v_qual is null or position('has_store_access' in v_qual) = 0 then
    raise exception 'CP-FIN-F3 PRECOND: fin_rules_update no tiene el USING amplio esperado (¿deriva?): %', coalesce(v_qual, 'POLICY AUSENTE')
      using errcode = 'P0001';
  end if;
end $$;

-- 1) Política UPDATE estricta y simétrica
DROP POLICY IF EXISTS fin_rules_update ON public.fin_rule_versions;
CREATE POLICY fin_rules_update ON public.fin_rule_versions
  FOR UPDATE TO authenticated
  USING (
    (store_id IS NULL AND is_admin())
    OR (store_id IS NOT NULL AND has_store_role(store_id, ARRAY['admin']))
  )
  WITH CHECK (
    (store_id IS NULL AND is_admin())
    OR (store_id IS NOT NULL AND has_store_role(store_id, ARRAY['admin']))
  );

-- 2) Trigger: el ámbito de una versión de regla es inmutable
CREATE OR REPLACE FUNCTION public.fin_rule_scope_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN
    RAISE EXCEPTION 'ERR_FIN_RULE_SCOPE_IMMUTABLE: el ámbito (store_id) de una versión de regla es inmutable; no se puede reasignar entre global y tienda (registro %)', OLD.id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS fin_rule_scope_immutable ON public.fin_rule_versions;
CREATE TRIGGER fin_rule_scope_immutable
  BEFORE UPDATE ON public.fin_rule_versions
  FOR EACH ROW EXECUTE FUNCTION public.fin_rule_scope_guard();
ALTER TABLE public.fin_rule_versions ENABLE ALWAYS TRIGGER fin_rule_scope_immutable;

COMMENT ON FUNCTION public.fin_rule_scope_guard() IS
  'CP-FIN-REM-001 F3: impide reasignar el ámbito (store_id) de una versión de regla financiera. Global y tienda son ámbitos cerrados; la alteración de reglas globales es exclusiva del admin global.';

-- Postcheck fail-closed
do $$
declare
  v_qual text; v_trig int;
begin
  select qual into v_qual from pg_policies
   where schemaname='public' and tablename='fin_rule_versions' and policyname='fin_rules_update';
  select count(*) into v_trig from pg_trigger t
   join pg_class c on c.oid = t.tgrelid
   join pg_proc p on p.oid = t.tgfoid
  where c.relname = 'fin_rule_versions' and p.proname = 'fin_rule_scope_guard' and t.tgenabled = 'A';
  if v_qual not like '%has_store_role%' or v_trig <> 1 then
    raise exception 'CP-FIN-F3 POSTCHECK: política o trigger mal instalados (qual=%, triggers=%)', coalesce(v_qual,'NULL'), v_trig
      using errcode = 'P0001';
  end if;
end $$;

-- ============================================================================
-- Migration: 20261128153300_cp_fin_f4_ledger_append_only.sql
-- Misión:    CP-FIN-REM-001 — PR-A F4 (solo-adición del libro contable)
-- Fecha:     2026-11-28
-- ============================================================================
-- F4 — INMUTABILIDAD DEL LIBRO. Estado previo (revalidado en vivo 2026-11-28):
--   fin_entries/fin_movements SIN triggers de solo-adición (solo
--   fin_trg_entries_generation en INSERT). Cualquier UPDATE/DELETE directo era
--   posible para quien pasara RLS.
--
-- Reglas NUEVAS (fail-closed, ENABLE ALWAYS):
--   fin_entries:
--     · DELETE: bloqueado SIEMPRE (ni mantenimiento).
--     · UPDATE permitido SOLO en: (A) posted→reversed con contraasiento
--       enlazado (reversal_of=OLD.id ya insertado en la misma transacción;
--       única columna cambiada: status); (B) relleno de generation_id NULL →
--       generación ACTIVA de la MISMA tienda (única columna cambiada);
--       (C) mantenimiento controlado: SOLO columns movements_snapshot y
--       description del asiento rectificado por fin_rectification_apply.
--     · Todo lo demás → ERR_FIN_INMUTABLE.
--   fin_movements:
--     · UPDATE: bloqueado SIEMPRE (las correcciones económicas van por
--       asientos compensatorios).
--     · DELETE: SOLO bajo mantenimiento controlado del asiento rectificado.
--   MANTENIMIENTO CONTROLADO (único bypass, freno NO candado — cualquier sesión
--   con privilegios puede fijar el parámetro, por eso se exige (iii)+(iv)):
--     (i)   costpro.fin_maintenance='on' fijado con set_config(...,true)
--           (transaccional, nunca por defecto);
--     (ii)  lo fija EXCLUSIVAMENTE fin_rectification_apply;
--     (iii) el trigger exige costpro.fin_rectification_entry=<uuid> y solo
--           admite ESE asiento/filas (no existe registro de autorización
--           previa en la función — inspeccionado; se acota a la fila concreta
--           conforme a la misión 5.3-iii);
--     (iv)  CADA uso deja fila en audit_logs (FIN_MAINTENANCE_*, sin importes
--           ni SQLERRM — regla 0.12);
--     (v)   no existe RPC pública que active el bypass; app.restore_mode no se usa.
--   Compatibilidad revisada (prosrc en vivo): fin_post_document_annulment
--   (UPDATE solo status='reversed' tras insertar contraasiento → excepción A);
--   fin_generation_build / fin_apply_opening_balance (solo INSERT);
--   reset_store_data (no toca estas tablas); delete_received_service_draft
--   (no modifica asientos); soft_delete_store (borrado lógico, sin filas).
--   Cascada de borrado duro de tienda (stores→fin_entries): el trigger la
--   BLOQUEA (fail-closed) — comportamiento documentado.
--
-- Rollback: supabase/rollbacks/20261128153300_rollback_cp_fin_f4.sql
-- ============================================================================


do $$
declare
  v_tablas text[]; v_faltan text[]; v_rect text;
begin
  v_tablas := array['fin_entries','fin_movements'];
  select array_agg(t) into v_faltan from unnest(v_tablas) t
   where to_regclass('public.' || t) is null;
  if coalesce(array_length(v_faltan, 1), 0) > 0 then
    raise exception 'CP-FIN-F4 PRECOND: tablas ausentes: %', array_to_string(v_faltan, ', ')
      using errcode = 'P0001';
  end if;
  select prosrc into v_rect from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='fin_rectification_apply';
  if v_rect is null or position('DELETE FROM public.fin_movements WHERE entry_id = v_entry_id' in v_rect) = 0 then
    raise exception 'CP-FIN-F4 PRECOND: fin_rectification_apply ausente o sin el bloque de reparación esperado (deriva)'
      using errcode = 'P0001';
  end if;
end $$;

-- ── Trigger guard de fin_entries ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_entries_immutable_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public', 'pg_temp' AS $$
DECLARE
  v_maint boolean;
  v_rect_entry uuid;
BEGIN
  v_maint := coalesce(current_setting('costpro.fin_maintenance', true), 'off') = 'on';
  v_rect_entry := nullif(coalesce(current_setting('costpro.fin_rectification_entry', true), ''), '')::uuid;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ERR_FIN_INMUTABLE: DELETE sobre fin_entries bloqueado siempre (libro de solo-adición; entrada %); las correcciones van por asientos compensatorios y la reparación controlada por fin_rectification_apply', OLD.id
      USING ERRCODE = 'P0001';
  END IF;

  -- (A) posted→reversed: única columna cambiada = status, con contraasiento enlazado
  IF OLD.status = 'posted' AND NEW.status = 'reversed'
     AND (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status')
     AND EXISTS (SELECT 1 FROM public.fin_entries r WHERE r.reversal_of = OLD.id) THEN
    RETURN NEW;
  END IF;

  -- (B) relleno generation_id NULL → generación ACTIVA de la misma tienda
  IF OLD.generation_id IS NULL AND NEW.generation_id IS NOT NULL
     AND (to_jsonb(NEW) - 'generation_id') = (to_jsonb(OLD) - 'generation_id')
     AND NEW.generation_id = (SELECT g.id FROM public.fin_posting_generations g
                              WHERE g.store_id = NEW.store_id AND g.status = 'active' LIMIT 1) THEN
    RETURN NEW;
  END IF;

  -- (C) mantenimiento controlado: SOLO movements_snapshot y description del asiento rectificado
  IF v_maint AND v_rect_entry IS NOT NULL AND NEW.id = v_rect_entry
     AND (to_jsonb(NEW) - 'movements_snapshot' - 'description')
       = (to_jsonb(OLD) - 'movements_snapshot' - 'description') THEN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
    VALUES (NULL, 'FIN_MAINTENANCE_ENTRY_RECTIFIED', 'fin_entries', NEW.id,
            jsonb_build_object('motivo', 'fin_rectification_apply'),
            jsonb_build_object('motivo', 'fin_rectification_apply',
                               'columnas', to_jsonb(ARRAY['movements_snapshot','description']::text[])),
            NEW.store_id);
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'ERR_FIN_INMUTABLE: UPDATE de fin_entries solo admite (A) posted→reversed con contraasiento enlazado, (B) relleno de generation_id NULL→generación activa de la misma tienda o (C) reparación controlada de movements_snapshot/description (entrada %)', OLD.id
    USING ERRCODE = 'P0001';
END $$;

DROP TRIGGER IF EXISTS fin_trg_entries_immutable ON public.fin_entries;
CREATE TRIGGER fin_trg_entries_immutable
  BEFORE UPDATE OR DELETE ON public.fin_entries
  FOR EACH ROW EXECUTE FUNCTION public.fin_entries_immutable_guard();
ALTER TABLE public.fin_entries ENABLE ALWAYS TRIGGER fin_trg_entries_immutable;

-- ── Trigger guard de fin_movements ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_movements_immutable_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public', 'pg_temp' AS $$
DECLARE
  v_maint boolean;
  v_rect_entry uuid;
BEGIN
  v_maint := coalesce(current_setting('costpro.fin_maintenance', true), 'off') = 'on';
  v_rect_entry := nullif(coalesce(current_setting('costpro.fin_rectification_entry', true), ''), '')::uuid;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'ERR_FIN_INMUTABLE: UPDATE sobre fin_movements bloqueado siempre (entrada %); las correcciones económicas se hacen con asientos compensatorios', OLD.entry_id
      USING ERRCODE = 'P0001';
  END IF;

  -- DELETE: SOLO mantenimiento controlado del asiento rectificado (auditable)
  IF v_maint AND v_rect_entry IS NOT NULL AND OLD.entry_id = v_rect_entry THEN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
    VALUES (NULL, 'FIN_MAINTENANCE_MOVEMENTS_REPLACED', 'fin_movements', OLD.entry_id,
            jsonb_build_object('motivo', 'fin_rectification_apply'),
            jsonb_build_object('motivo', 'fin_rectification_apply', 'movimiento', OLD.id::text),
            OLD.store_id);
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'ERR_FIN_INMUTABLE: DELETE de fin_movements solo bajo reparación controlada de fin_rectification_apply (entrada %)', OLD.entry_id
    USING ERRCODE = 'P0001';
END $$;

DROP TRIGGER IF EXISTS fin_trg_movements_immutable ON public.fin_movements;
CREATE TRIGGER fin_trg_movements_immutable
  BEFORE UPDATE OR DELETE ON public.fin_movements
  FOR EACH ROW EXECUTE FUNCTION public.fin_movements_immutable_guard();
ALTER TABLE public.fin_movements ENABLE ALWAYS TRIGGER fin_trg_movements_immutable;

COMMENT ON FUNCTION public.fin_entries_immutable_guard() IS
  'CP-FIN-REM-001 F4: solo-adición del libro. DELETE nunca; UPDATE solo (A) posted→reversed con contraasiento, (B) relleno de generación activa o (C) rectificación controlada (auditable). El parámetro costpro.fin_maintenance es un FRENO, no un candado: cualquier sesión privilegiada puede fijarlo; por eso el bypass exige el asiento concreto (fin_rectification_entry) y deja fila en audit_logs.';
COMMENT ON FUNCTION public.fin_movements_immutable_guard() IS
  'CP-FIN-REM-001 F4: fin_movements inmutables. UPDATE nunca; DELETE solo reparación controlada (auditable) de fin_rectification_apply.';

-- ── fin_rectification_apply: apertura/cierre de la ventana (cambio mínimo) ─
CREATE OR REPLACE FUNCTION public.fin_rectification_apply(p_store_id uuid, p_document_number text, p_document_type text, p_economic_date date, p_description text, p_movements jsonb, p_generation_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_repair boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_gen uuid := coalesce(p_generation_id, public.fin_active_generation(p_store_id));
  v_entry_id uuid;
  v_expected int := jsonb_array_length(p_movements);
  v_debit numeric := 0; v_credit numeric := 0;
  v_n_mov int := 0; v_saldo numeric := 0;
  v_m jsonb; t jsonb; r record;
  v_audit uuid;
  v_count int;
  v_coherente boolean;
  v_antes int := 0;
BEGIN
  -- ACL pura (patrón fin_generation_build / fin_rectify_*): el canal de
  -- ejecución se restringe por GRANT a service_role (§4); sin chequeo interno
  -- de auth.role() — mismo diseño que el resto del motor.
  IF p_store_id IS NULL OR p_document_number IS NULL OR p_document_type IS NULL
     OR p_economic_date IS NULL OR p_movements IS NULL
     OR jsonb_typeof(p_movements) <> 'array' OR v_expected = 0 THEN
    RAISE EXCEPTION 'ERR_RECT_PARAMS_INVALIDOS: store/document_number/type/date/movements[] no vacíos';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_store_id) THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: tienda %', p_store_id;
  END IF;
  IF v_gen IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.fin_posting_generations g
       WHERE g.id = v_gen AND g.store_id = p_store_id
         AND g.status IN ('active', 'building', 'candidate')) THEN
    RAISE EXCEPTION 'ERR_GENERACION_NO_ENCONTRADA: generación destino % inválida para la tienda', v_gen;
  END IF;

  -- Serialización por (tienda, documento): idempotencia bajo concurrencia.
  PERFORM pg_advisory_xact_lock(hashtext('fin_rect:' || p_store_id::text || ':' || p_document_number));

  -- Validación estructural de movements — fail-closed ANTES de escribir nada.
  FOR v_m IN SELECT * FROM jsonb_array_elements(p_movements) LOOP
    IF v_m ->> 'categoria' IS NULL OR NOT EXISTS (
         SELECT 1 FROM public.fin_categories c
         WHERE c.code = v_m ->> 'categoria' AND c.is_active) THEN
      RAISE EXCEPTION 'ERR_CATEGORIA_INVALIDA: %', v_m ->> 'categoria';
    END IF;
    IF (v_m ->> 'sentido') NOT IN ('debito', 'credito') THEN
      RAISE EXCEPTION 'ERR_SENTIDO_INVALIDO: %', v_m ->> 'sentido';
    END IF;
    IF coalesce((v_m ->> 'amount')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'ERR_MONTO_INVALIDO: % (el motor prohíbe movimientos <= 0)', v_m ->> 'amount';
    END IF;
  END LOOP;

  -- Partida doble EXIGIDA para toda rectificación (validación previa).
  SELECT coalesce(sum(CASE WHEN m ->> 'sentido' = 'debito'  THEN round((m ->> 'amount')::numeric, 2) ELSE 0 END), 0),
         coalesce(sum(CASE WHEN m ->> 'sentido' = 'credito' THEN round((m ->> 'amount')::numeric, 2) ELSE 0 END), 0)
    INTO v_debit, v_credit
  FROM jsonb_array_elements(p_movements) m;
  IF abs(v_debit - v_credit) > 0.005 THEN
    RAISE EXCEPTION 'ERR_RECTIFICACION_DESQUILIBRADA: débitos=% créditos=%', v_debit, v_credit;
  END IF;

  -- Idempotencia completa: asiento previo en la generación destino.
  SELECT count(*) INTO v_count
  FROM public.fin_entries e
  WHERE e.store_id = p_store_id AND e.generation_id = v_gen
    AND e.document_number = p_document_number AND e.event = 'ajuste_manual';
  IF v_count > 1 THEN
    RAISE EXCEPTION 'ERR_RECTIFICACION_AMBIGUA: % asientos % en la generación %', v_count, p_document_number, v_gen;
  END IF;

  IF v_count = 1 THEN
    SELECT e.id INTO v_entry_id
    FROM public.fin_entries e
    WHERE e.store_id = p_store_id AND e.generation_id = v_gen
      AND e.document_number = p_document_number AND e.event = 'ajuste_manual';

    SELECT count(*),
           coalesce(round(sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END), 2), 0)
      INTO v_n_mov, v_saldo
    FROM public.fin_movements m WHERE m.entry_id = v_entry_id;
    v_antes := v_n_mov;

    -- Coherencia EXACTA: multiconjunto de movimientos (categoría|sentido|moneda|tasa|importe,
    -- serializado y ordenado) idéntico al esperado. NOTA: paréntesis explícitos —
    -- en PostgreSQL || enlaza más fuerte que ->>, y la cadena sin paréntesis
    -- se parsea como ((... || x) ->> 'sentido') → error text ->> unknown.
    -- P2-review 111: la moneda y la tasa ENTRAN en la firma — un reintento con
    -- mismos importes nominales pero distinta moneda/tasa NO es ya_completa
    -- (el saldo CUP real difiere; sin esto un par equilibrado conservaría el
    -- valor CUP equivocado sin reparación).
    SELECT
      (SELECT string_agg(m.category_code || '|' || m.sense || '|' || m.currency || '|' || round(m.exchange_rate, 6)::text || '|' || round(m.amount, 2)::text, ';'
               ORDER BY m.category_code, m.sense, m.currency, round(m.exchange_rate, 6), round(m.amount, 2))
         FROM public.fin_movements m WHERE m.entry_id = v_entry_id)
      =
      (SELECT string_agg((x ->> 'categoria') || '|' || (x ->> 'sentido') || '|' || coalesce(x ->> 'currency', 'CUP') || '|' || round(coalesce((x ->> 'exchange_rate')::numeric, 1), 6)::text || '|' || round((x ->> 'amount')::numeric, 2)::text, ';'
               ORDER BY x ->> 'categoria', x ->> 'sentido', coalesce(x ->> 'currency', 'CUP'), round(coalesce((x ->> 'exchange_rate')::numeric, 1), 6), round((x ->> 'amount')::numeric, 2))
         FROM jsonb_array_elements(p_movements) AS je(x))
    INTO v_coherente;

    IF v_n_mov >= 1 AND v_coherente AND abs(v_saldo) <= 0.005 THEN
      RETURN jsonb_build_object('status', 'ya_completa', 'entry_id', v_entry_id,
        'generation_id', v_gen, 'movimientos', v_n_mov, 'saldo', v_saldo);
    END IF;

    IF NOT coalesce(p_repair, false) THEN
      RAISE EXCEPTION 'ERR_RECTIFICACION_PARCIAL: asiento % con % movimientos (esperados %, saldo %) — complete o repare con p_repair = true', v_entry_id, v_n_mov, v_expected, v_saldo;
    END IF;

    -- Reparación CONTROLADA (misma transacción): movimientos reemplazados por
    -- los esperados; snapshot actualizado; traza de auditoría obligatoria.
    -- F4 (CP-FIN-REM-001): ventana de mantenimiento CONTROLADA — se abre SOLO
    -- para este asiento (set_config transaccional; el trigger la exige acotada
    -- por fin_rectification_entry y audita CADA uso en audit_logs).
    PERFORM set_config('costpro.fin_maintenance', 'on', true);
    PERFORM set_config('costpro.fin_rectification_entry', v_entry_id::text, true);
    DELETE FROM public.fin_movements WHERE entry_id = v_entry_id;
    UPDATE public.fin_entries
       SET movements_snapshot = p_movements, description = coalesce(p_description, description)
     WHERE id = v_entry_id;
    FOR t IN SELECT * FROM jsonb_array_elements(p_movements) LOOP
      INSERT INTO public.fin_movements (
        entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
        economic_date, document_number, description, currency_origin, amount_origin, traza)
      VALUES (
        v_entry_id, p_store_id, t ->> 'categoria', t ->> 'sentido', (t ->> 'amount')::numeric,
        coalesce(t ->> 'currency', 'CUP'), coalesce((t ->> 'exchange_rate')::numeric, 1),
        p_economic_date, p_document_number, coalesce(t ->> 'description', p_description),
        t ->> 'currency_origin', (t ->> 'amount_origin')::numeric, coalesce(t -> 'traza', '{}'::jsonb));
    END LOOP;
    SELECT count(*),
           coalesce(round(sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END), 2), 0)
      INTO v_n_mov, v_saldo
    FROM public.fin_movements m WHERE m.entry_id = v_entry_id;
    IF v_n_mov <> v_expected OR abs(v_saldo) > 0.005 THEN
      RAISE EXCEPTION 'ERR_RECTIFICACION_VERIFICACION: tras reparar quedan %/% movimientos (saldo %)', v_n_mov, v_expected, v_saldo;
    END IF;
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
    VALUES (p_user_id, 'SYSTEM_RECTIFICATION_REPAIRED', 'fin_entries', v_entry_id,
            jsonb_build_object('entrada', v_entry_id, 'movimientos_antes', v_antes),
            jsonb_build_object('entry_id', v_entry_id, 'documento', p_document_number,
                               'movimientos', v_expected, 'saldo', v_saldo),
            p_store_id) RETURNING id INTO v_audit;
    -- F4: cierre de la ventana de mantenimiento (higiene; la transacción es la barrera real)
    PERFORM set_config('costpro.fin_maintenance', 'off', true);
    PERFORM set_config('costpro.fin_rectification_entry', '', true);
    RETURN jsonb_build_object('status', 'reparada', 'entry_id', v_entry_id,
      'generation_id', v_gen, 'movimientos', v_n_mov, 'saldo', v_saldo, 'audit_id', v_audit);
  END IF;

  -- Creación ATÓMICA: asiento + TODOS los movimientos en la misma transacción.
  INSERT INTO public.fin_entries (
    store_id, document_type, document_id, document_number, event, payment_ref,
    economic_date, rule_version_id, movements_snapshot, description, created_by, generation_id)
  VALUES (
    p_store_id, p_document_type, NULL, p_document_number, 'ajuste_manual', NULL,
    p_economic_date, NULL, p_movements, p_description, p_user_id, v_gen)
  RETURNING id INTO v_entry_id;

  FOR t IN SELECT * FROM jsonb_array_elements(p_movements) LOOP
    INSERT INTO public.fin_movements (
      entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
      economic_date, document_number, description, currency_origin, amount_origin, traza)
    VALUES (
      v_entry_id, p_store_id, t ->> 'categoria', t ->> 'sentido', (t ->> 'amount')::numeric,
      coalesce(t ->> 'currency', 'CUP'), coalesce((t ->> 'exchange_rate')::numeric, 1),
      p_economic_date, p_document_number, coalesce(t ->> 'description', p_description),
      t ->> 'currency_origin', (t ->> 'amount_origin')::numeric, coalesce(t -> 'traza', '{}'::jsonb));
  END LOOP;

  -- Verificación de partida doble POST-inserción (fallo → revierte TODO).
  SELECT count(*),
         coalesce(round(sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END), 2), 0)
    INTO v_n_mov, v_saldo
  FROM public.fin_movements m WHERE m.entry_id = v_entry_id;
  IF v_n_mov <> v_expected OR abs(v_saldo) > 0.005 THEN
    RAISE EXCEPTION 'ERR_RECTIFICACION_VERIFICACION: %/% movimientos (saldo %) — transacción revertida', v_n_mov, v_expected, v_saldo;
  END IF;

  -- Documento de auditoría + verificación (misma transacción).
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
  VALUES (p_user_id, 'SYSTEM_RECTIFICATION_APPLIED', 'fin_entries', v_entry_id,
          jsonb_build_object('entrada', NULL),
          jsonb_build_object('entry_id', v_entry_id, 'documento', p_document_number,
                             'tipo', p_document_type, 'fecha_economica', p_economic_date,
                             'movimientos', v_expected, 'debitos', v_debit, 'creditos', v_credit),
          p_store_id) RETURNING id INTO v_audit;
  IF v_audit IS NULL THEN
    RAISE EXCEPTION 'ERR_AUDITORIA_FALTANTE: documento de auditoría no insertado';
  END IF;

  RETURN jsonb_build_object('status', 'creada', 'entry_id', v_entry_id,
    'generation_id', v_gen, 'movimientos', v_n_mov, 'saldo', v_saldo, 'audit_id', v_audit);
END $function$;

-- ── Postcheck fail-closed ──────────────────────────────────────────────────
do $$
declare
  v_n int; v_rect text;
begin
  select count(*) into v_n from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
   where p.proname in ('fin_entries_immutable_guard','fin_movements_immutable_guard')
     and t.tgenabled = 'A';
  if v_n <> 2 then
    raise exception 'CP-FIN-F4 POSTCHECK: esperados 2 triggers ENABLE ALWAYS, encontrados %', v_n
      using errcode = 'P0001';
  end if;
  select prosrc into v_rect from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='fin_rectification_apply';
  if position('costpro.fin_rectification_entry' in v_rect) = 0 then
    raise exception 'CP-FIN-F4 POSTCHECK: fin_rectification_apply sin ventana de mantenimiento'
      using errcode = 'P0001';
  end if;
end $$;

-- ============================================================================
-- Migration: 20261128153400_cp_fin_f5_reversal_fixes.sql
-- Misión:    CP-FIN-REM-001 — PR-A F5 (reversión residual y generación)
-- Fecha:     2026-11-28
-- ============================================================================
-- F5.A fin_entry_reversal_residual: sumaba m.amount (MONEDA ORIGINAL) en las
--      comparaciones débito-original vs crédito-reversión (y viceversa) → el
--      residual quedaba mal calculado con multimoneda. Ahora suma m.amount_cup
--      (las 4 sumas), manteniendo ambos sentidos, la tolerancia de 0,01 CUP
--      (aplicada por los llamadores), la semántica total/parcial y la
--      idempotencia de la función pura.
-- F5.B fin_t12_block_receipt_annulment: no filtraba por generación → una
--      reversión parcial existente SOLO en una generación SUPERSEDED bloqueaba
--      la anulación de la recepción. Ahora filtra por la generación activa
--      canónica fin_active_generation(NEW.store_id) con el tratamiento
--      documentado de NULL.
-- Regeneradas desde las definiciones vivas (base exacta; fail-closed contra
-- deriva en los DO-guards).
-- Rollback: supabase/rollbacks/20261128153400_rollback_cp_fin_f5.sql
-- ============================================================================


do $$
declare
  v_src text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='fin_entry_reversal_residual';
  if v_src is null or position('sum(m.amount)' in v_src) = 0 then
    raise exception 'CP-FIN-F5 PRECOND: fin_entry_reversal_residual ausente o ya migrada (deriva)'
      using errcode = 'P0001';
  end if;
  select prosrc into v_src from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='fin_t12_block_receipt_annulment';
  if v_src is null or position('fin_active_generation' in v_src) > 0 then
    raise exception 'CP-FIN-F5 PRECOND: fin_t12_block_receipt_annulment ausente o ya migrada (deriva)'
      using errcode = 'P0001';
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.fin_entry_reversal_residual(p_entry_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT GREATEST(
    abs(coalesce((SELECT sum(m.amount_cup) FROM public.fin_movements m
                   WHERE m.entry_id = p_entry_id AND m.sense = 'debito'), 0)
      - coalesce((SELECT sum(rm.amount_cup) FROM public.fin_entries r
                   JOIN public.fin_movements rm ON rm.entry_id = r.id
                  WHERE r.reversal_of = p_entry_id AND rm.sense = 'credito'), 0)),
    abs(coalesce((SELECT sum(m.amount_cup) FROM public.fin_movements m
                   WHERE m.entry_id = p_entry_id AND m.sense = 'credito'), 0)
      - coalesce((SELECT sum(rm.amount_cup) FROM public.fin_entries r
                   JOIN public.fin_movements rm ON rm.entry_id = r.id
                  WHERE r.reversal_of = p_entry_id AND rm.sense = 'debito'), 0))
  );
$function$;

CREATE OR REPLACE FUNCTION public.fin_t12_block_receipt_annulment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_entry uuid;
  v_residual numeric;
BEGIN
  -- Solo transiciones de anulación (estado previo vivo → voided/reversed).
  IF NEW.status NOT IN ('voided', 'reversed') OR OLD.status IN ('voided', 'reversed') THEN
    RETURN NEW;
  END IF;
  -- ¿Algún asiento posted (reconocimiento/pago) con reversión parcial enlazada?
  -- (las recepciones pending no tienen asientos → flujo ordinario intacto)
  SELECT e.id, public.fin_entry_reversal_residual(e.id)
    INTO v_entry, v_residual
  FROM public.fin_entries e
  WHERE e.document_type = 'RECEPCION' AND e.document_id = NEW.id
    AND e.status = 'posted' AND e.event IN ('reconocimiento', 'pago')
    -- F5.B (CP-FIN-REM-001): solo la generación ACTIVA de la tienda (tratamiento
    -- canónico de NULL: una recepción sin generación activa no tiene asientos
    -- vivos que bloquear). Una reversión parcial existente SOLO en una
    -- generación superseded ya no bloquea la anulación.
    AND e.generation_id IS NOT DISTINCT FROM public.fin_active_generation(NEW.store_id)
    AND EXISTS (SELECT 1 FROM public.fin_entries r WHERE r.reversal_of = e.id)
    AND public.fin_entry_reversal_residual(e.id) > 0.01
  LIMIT 1;
  IF v_entry IS NOT NULL THEN
    RAISE WARNING 'ERR_PARTIAL_REVERSAL_PENDING (intento bloqueado): recepción % con asiento % en reversión parcial y residual % CUP pendiente. Regularice el residual contable antes de anular (runbook RECT004 §regularización).',
      NEW.id, v_entry, v_residual;
    RAISE EXCEPTION 'ERR_PARTIAL_REVERSAL_PENDING: la recepción % tiene el asiento % con reversión parcial enlazada (residual % CUP sin compensar). Regularice primero el residual contable con un asiento explícito documentado (runbook RECT004 §regularización); después la anulación funcionará por el cauce ordinario.',
      NEW.id, v_entry, v_residual;
  END IF;
  RETURN NEW;
END;
$function$;

do $$
declare
  v_src text; v_n int;
begin
  select prosrc into v_src from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='fin_entry_reversal_residual';
  if position('amount_cup' in v_src) = 0 or position('sum(m.amount)' in v_src) > 0 then
    raise exception 'CP-FIN-F5 POSTCHECK: residual sin conversión CUP completa'
      using errcode = 'P0001';
  end if;
  select prosrc into v_src from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='fin_t12_block_receipt_annulment';
  if position('fin_active_generation(NEW.store_id)' in v_src) = 0 then
    raise exception 'CP-FIN-F5 POSTCHECK: T12 sin filtro de generación activa'
      using errcode = 'P0001';
  end if;
  select count(*) into v_n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='fin_entry_reversal_residual';
  if v_n <> 1 then
    raise exception 'CP-FIN-F5 POSTCHECK: sobrecargas inesperadas de fin_entry_reversal_residual (%)', v_n
      using errcode = 'P0001';
  end if;
end $$;

-- ============================================================================
-- Migration: 20261128153500_cp_infra_021_truncate_fin_payroll.sql
-- Misión:    CP-FIN-REM-001 — PR-A TR (freno de TRUNCATE para libro y nóminas)
-- Fecha:     2026-11-28
-- ============================================================================
-- TR — El freno CP-INFRA-020 cubría 34 tablas y NINGUNA de las fin_* ni de
--      nóminas (revalidado en vivo 2026-11-28: 34 triggers block_truncate,
--      0 sobre fin/payroll; service_role conserva TRUNCATE sobre
--      fin_movements por grants de plataforma).
--
-- Extensión: instala el MISMO freno (block_truncate + parámetro
-- costpro.allow_truncate + ENABLE ALWAYS) sobre las 16 tablas del libro y de
-- nóminas, reutilizando el instalador idempotente y fail-closed
-- cp_infra_020_install_breaker(text[]): si falta CUALQUIERA de las 16, ABORTA
-- sin instalar nada.
--
-- Decisiones documentadas:
--   · NO se revoca TRUNCATE a service_role: los grants vienen del
--     aprovisionamiento de plataforma (ALL a service_role) y no se puede
--     demostrar que NINGÚN flujo (interna de Supabase, cron futuro,
--     herramientas del propietario) lo use; el FRENO es la única barrera
--     (misión 5.4: "si no, deja el freno como única barrera y documéntalo").
--   · ENABLE ALWAYS no protege del superusuario ni del dueño de la tabla
--     (postgres) con session_replication_role=replica; y menos aún si el
--     bypass se fija a mano. Es un freno anti-borrado-masivo accidental,
--     no un candado criptográfico.
--   · 12 tablas fin_* + 4 de nóminas (payroll_item_concepts, payroll_items,
--     payrolls, worker_salary_rates).
--
-- Rollback: supabase/rollbacks/20261128153500_rollback_cp_infra_021.sql
-- ============================================================================


do $$
declare
  v_instaladas int;
  v_tablas text[] := array[
    'fin_account_mapping', 'fin_categories', 'fin_document_types', 'fin_entries',
    'fin_metric_catalog', 'fin_movements', 'fin_opening_balances', 'fin_posting_errors',
    'fin_posting_generations', 'fin_reconciliation_config', 'fin_reconciliation_snapshots',
    'fin_rule_versions',
    'payroll_item_concepts', 'payroll_items', 'payrolls', 'worker_salary_rates'
  ];
begin
  if to_regprocedure('public.cp_infra_020_install_breaker(text[])') is null then
    raise exception 'CP-INFRA-021 PRECOND: instalador cp_infra_020_install_breaker(text[]) ausente'
      using errcode = 'P0001';
  end if;
  v_instaladas := public.cp_infra_020_install_breaker(v_tablas);
  if v_instaladas <> 16 then
    raise exception 'CP-INFRA-021 PRECOND: esperadas 16 tablas protegidas, instaladas %', v_instaladas
      using errcode = 'P0001';
  end if;
  raise notice 'CP-INFRA-021: % triggers de freno instalados con ENABLE ALWAYS', v_instaladas;
end $$;

-- Verificación fail-closed: exactamente 16 triggers nuevos, todos tgenabled='A'
do $$
declare
  v_n int; v_a int;
begin
  select count(*), count(*) filter (where t.tgenabled = 'A')
    into v_n, v_a
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and p.proname = 'block_truncate'
     and c.relname in ('fin_account_mapping','fin_categories','fin_document_types',
        'fin_entries','fin_metric_catalog','fin_movements','fin_opening_balances',
        'fin_posting_errors','fin_posting_generations','fin_reconciliation_config',
        'fin_reconciliation_snapshots','fin_rule_versions','payroll_item_concepts',
        'payroll_items','payrolls','worker_salary_rates');
  if v_n <> 16 or v_a <> 16 then
    raise exception 'CP-INFRA-021 POSTCHECK: esperados 16/16 triggers ENABLE ALWAYS, encontrados %/%', v_n, v_a
      using errcode = 'P0001';
  end if;
  raise notice 'CP-INFRA-021 POSTCHECK OK: 16/16 triggers ENABLE ALWAYS';
end $$;

-- ═══ CASOS POST ════════════════════════════════════════════════════════════
-- F2-1..F2-8: matriz SELECT RLS (propia tienda / otra tienda)
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"08b08515-be1a-49f8-ab92-884d55eec42d","role":"authenticated"}';
DO $f2c$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.fin_entries WHERE store_id='83ad8cc2-e75a-443f-a61d-9ee6a5020107';
  IF v <> 0 THEN RAISE EXCEPTION 'F2-1 FAILED: clerk vio % asientos (debía 0)', v; END IF;
  SELECT count(*) INTO v FROM public.fin_movements WHERE store_id='83ad8cc2-e75a-443f-a61d-9ee6a5020107';
  IF v <> 0 THEN RAISE EXCEPTION 'F2-1b FAILED: clerk vio % movimientos', v; END IF;
  SELECT count(*) INTO v FROM public.fin_opening_balances WHERE store_id='83ad8cc2-e75a-443f-a61d-9ee6a5020107';
  IF v <> 0 THEN RAISE EXCEPTION 'F2-1c FAILED'; END IF;
  SELECT count(*) INTO v FROM public.fin_posting_errors;
  IF v <> 0 THEN RAISE EXCEPTION 'F2-1d FAILED: clerk vio % errores (globales+tienda)', v; END IF;
END $f2c$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"1ccbeefa-13b0-4591-8e87-bf63e26fac1c","role":"authenticated"}';
DO $f2u$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.fin_entries WHERE store_id='83ad8cc2-e75a-443f-a61d-9ee6a5020107';
  IF v <> 0 THEN RAISE EXCEPTION 'F2-2 FAILED: usuario sin membresía vio %', v; END IF;
END $f2u$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"0e274ac0-084c-4c9b-a784-6c1a4ee3379e","role":"authenticated"}';
DO $f2e$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.fin_entries WHERE store_id='83ad8cc2-e75a-443f-a61d-9ee6a5020107';
  IF v < 1 THEN RAISE EXCEPTION 'F2-3 FAILED: encargado no ve su tienda'; END IF;
END $f2e$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"efeb3464-18ef-402c-b908-9a22793bff0b","role":"authenticated"}';
DO $f2m$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.fin_entries WHERE store_id='83ad8cc2-e75a-443f-a61d-9ee6a5020107';
  IF v < 1 THEN RAISE EXCEPTION 'F2-4 FAILED: manager no ve su tienda'; END IF;
  SELECT count(*) INTO v FROM public.fin_posting_errors WHERE store_id='83ad8cc2-e75a-443f-a61d-9ee6a5020107';
  IF v < 1 THEN RAISE EXCEPTION 'F2-4b FAILED: manager no ve errores de tienda'; END IF;
  SELECT count(*) INTO v FROM public.fin_posting_errors WHERE store_id IS NULL;
  IF v <> 0 THEN RAISE EXCEPTION 'F2-4c FAILED: manager vio % errores globales', v; END IF;
END $f2m$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"1e516186-fee3-4b72-83cd-3b51e7204e2e","role":"authenticated"}';
DO $f2a$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.fin_entries WHERE store_id='83ad8cc2-e75a-443f-a61d-9ee6a5020107';
  IF v < 1 THEN RAISE EXCEPTION 'F2-5 FAILED: admin de tienda no ve'; END IF;
END $f2a$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"755d4dc3-a22e-46b7-af57-429731e49664","role":"authenticated"}';
DO $f2g$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.fin_entries WHERE store_id='83ad8cc2-e75a-443f-a61d-9ee6a5020107';
  IF v < 1 THEN RAISE EXCEPTION 'F2-6 FAILED: admin global no ve S1'; END IF;
  SELECT count(*) INTO v FROM public.fin_entries WHERE store_id='dfe323c3-c980-43aa-8e82-092a4936ae1c';
  IF v < 1 THEN RAISE EXCEPTION 'F2-6b FAILED: admin global no ve S2'; END IF;
  SELECT count(*) INTO v FROM public.fin_posting_errors;
  IF v <> 2 THEN RAISE EXCEPTION 'F2-6c FAILED: admin global debe ver 2 errores, ve %', v; END IF;
END $f2g$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"e624583c-f850-48bb-b13e-71bb27c1fedb","role":"authenticated"}';
DO $f2t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.fin_entries WHERE store_id='83ad8cc2-e75a-443f-a61d-9ee6a5020107';
  IF v <> 0 THEN RAISE EXCEPTION 'F2-7 FAILED: otro tenant vio % asientos de S1', v; END IF;
  SELECT count(*) INTO v FROM public.fin_entries WHERE store_id='dfe323c3-c980-43aa-8e82-092a4936ae1c';
  IF v < 1 THEN RAISE EXCEPTION 'F2-7b FAILED: admin de S2 no ve SU tienda'; END IF;
END $f2t$;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims TO '{"role":"anon"}';

DO $f2n$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    SELECT count(*) FROM public.fin_entries WHERE store_id='83ad8cc2-e75a-443f-a61d-9ee6a5020107';
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('permission denied' in v_err) = 0 AND coalesce(v_state,'') <> 'permission denied') THEN
    RAISE EXCEPTION 'CASE f2n FAILED: se esperaba permission denied, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $f2n$;

-- F2-RPC: gate de gestión por LLAMADA DIRECTA
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"08b08515-be1a-49f8-ab92-884d55eec42d","role":"authenticated"}';

DO $f2rpc1$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    SELECT public.fin_get_dashboard('83ad8cc2-e75a-443f-a61d-9ee6a5020107','2026-01-01','2026-12-31');
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('ERR_UNAUTHORIZED' in v_err) = 0 AND coalesce(v_state,'') <> 'ERR_UNAUTHORIZED') THEN
    RAISE EXCEPTION 'CASE f2rpc1 FAILED: se esperaba ERR_UNAUTHORIZED, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $f2rpc1$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"efeb3464-18ef-402c-b908-9a22793bff0b","role":"authenticated"}';

DO $f2rpc2$
BEGIN
  PERFORM public.fin_get_dashboard('83ad8cc2-e75a-443f-a61d-9ee6a5020107','2026-01-01','2026-12-31');
  
END $f2rpc2$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"0e274ac0-084c-4c9b-a784-6c1a4ee3379e","role":"authenticated"}';

DO $f2rpc3$
BEGIN
  PERFORM public.fin_get_income_statement('83ad8cc2-e75a-443f-a61d-9ee6a5020107','2026-01-01','2026-12-31');
  
END $f2rpc3$;
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims TO '{"role":"service_role"}';

DO $f2rpc4$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    SELECT public.fin_get_balance_sheet('83ad8cc2-e75a-443f-a61d-9ee6a5020107','2026-11-28',NULL);
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('ERR_UNAUTHORIZED' in v_err) = 0 AND coalesce(v_state,'') <> 'ERR_UNAUTHORIZED') THEN
    RAISE EXCEPTION 'CASE f2rpc4 FAILED: se esperaba ERR_UNAUTHORIZED, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $f2rpc4$;

DO $f2rpc5$
BEGIN
  PERFORM public.fin_get_balance_sheet('83ad8cc2-e75a-443f-a61d-9ee6a5020107','2026-11-28','efeb3464-18ef-402c-b908-9a22793bff0b'::uuid);
  
END $f2rpc5$;
SET LOCAL ROLE postgres;
SET LOCAL request.jwt.claims TO '{}';
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
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"1e516186-fee3-4b72-83cd-3b51e7204e2e","role":"authenticated"}';

DO $f3a$
DECLARE v_n int := 0;
BEGIN
  UPDATE public.fin_rule_versions SET store_id='83ad8cc2-e75a-443f-a61d-9ee6a5020107' WHERE id='db1195f2-aebf-43d7-9b4c-8efcb6143305';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'CASE f3a FAILED: RLS debía denegar en silencio (0 filas), tocó %', v_n; END IF;
END $f3a$;
SET LOCAL ROLE postgres;
SET LOCAL request.jwt.claims TO '{}';

DO $f3b$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    UPDATE public.fin_rule_versions SET store_id='83ad8cc2-e75a-443f-a61d-9ee6a5020107' WHERE id='db1195f2-aebf-43d7-9b4c-8efcb6143305';
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('ERR_FIN_RULE_SCOPE_IMMUTABLE' in v_err) = 0 AND coalesce(v_state,'') <> 'ERR_FIN_RULE_SCOPE_IMMUTABLE') THEN
    RAISE EXCEPTION 'CASE f3b FAILED: se esperaba ERR_FIN_RULE_SCOPE_IMMUTABLE, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $f3b$;

DO $f3c$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    UPDATE public.fin_rule_versions SET store_id='83ad8cc2-e75a-443f-a61d-9ee6a5020107', notes='multi' WHERE id='db1195f2-aebf-43d7-9b4c-8efcb6143305';
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('ERR_FIN_RULE_SCOPE_IMMUTABLE' in v_err) = 0 AND coalesce(v_state,'') <> 'ERR_FIN_RULE_SCOPE_IMMUTABLE') THEN
    RAISE EXCEPTION 'CASE f3c FAILED: se esperaba ERR_FIN_RULE_SCOPE_IMMUTABLE, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $f3c$;

DO $f3d$
BEGIN
  UPDATE public.fin_rule_versions SET notes='admin-global-ok' WHERE id='db1195f2-aebf-43d7-9b4c-8efcb6143305';
  IF NOT FOUND THEN RAISE EXCEPTION 'F3-d FAILED'; END IF;
END $f3d$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"1e516186-fee3-4b72-83cd-3b51e7204e2e","role":"authenticated"}';

DO $f3e$
BEGIN
  UPDATE public.fin_rule_versions SET notes='admin-tienda-ok' WHERE id='935ab06a-df11-459d-a753-fd2a14bf70af';
  IF NOT FOUND THEN RAISE EXCEPTION 'F3-e FAILED'; END IF;
END $f3e$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"efeb3464-18ef-402c-b908-9a22793bff0b","role":"authenticated"}';

DO $f3f$
DECLARE v_n int := 0;
BEGIN
  UPDATE public.fin_rule_versions SET notes='x' WHERE id='935ab06a-df11-459d-a753-fd2a14bf70af';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'CASE f3f FAILED: RLS debía denegar en silencio (0 filas), tocó %', v_n; END IF;
END $f3f$;

-- F4: solo-adición
SET LOCAL ROLE postgres;
SET LOCAL request.jwt.claims TO '{}';

DO $f4a$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    UPDATE public.fin_entries SET description='hack' WHERE id='0dd5d10b-b880-4e44-aad9-471d0603d441';
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('ERR_FIN_INMUTABLE' in v_err) = 0 AND coalesce(v_state,'') <> 'ERR_FIN_INMUTABLE') THEN
    RAISE EXCEPTION 'CASE f4a FAILED: se esperaba ERR_FIN_INMUTABLE, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $f4a$;

DO $f4b$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    UPDATE public.fin_entries SET economic_date='2026-01-01' WHERE id='0dd5d10b-b880-4e44-aad9-471d0603d441';
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('ERR_FIN_INMUTABLE' in v_err) = 0 AND coalesce(v_state,'') <> 'ERR_FIN_INMUTABLE') THEN
    RAISE EXCEPTION 'CASE f4b FAILED: se esperaba ERR_FIN_INMUTABLE, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $f4b$;

DO $f4c$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    DELETE FROM public.fin_entries WHERE id='0dd5d10b-b880-4e44-aad9-471d0603d441';
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('ERR_FIN_INMUTABLE' in v_err) = 0 AND coalesce(v_state,'') <> 'ERR_FIN_INMUTABLE') THEN
    RAISE EXCEPTION 'CASE f4c FAILED: se esperaba ERR_FIN_INMUTABLE, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $f4c$;

DO $f4d$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    UPDATE public.fin_movements SET amount=5 WHERE entry_id='664cc579-d6a3-44ae-9c65-6cff711288b2';
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('ERR_FIN_INMUTABLE' in v_err) = 0 AND coalesce(v_state,'') <> 'ERR_FIN_INMUTABLE') THEN
    RAISE EXCEPTION 'CASE f4d FAILED: se esperaba ERR_FIN_INMUTABLE, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $f4d$;

DO $f4e$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    DELETE FROM public.fin_movements WHERE entry_id='664cc579-d6a3-44ae-9c65-6cff711288b2';
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('ERR_FIN_INMUTABLE' in v_err) = 0 AND coalesce(v_state,'') <> 'ERR_FIN_INMUTABLE') THEN
    RAISE EXCEPTION 'CASE f4e FAILED: se esperaba ERR_FIN_INMUTABLE, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $f4e$;

DO $f4f$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    UPDATE public.fin_entries SET status='reversed' WHERE id='0dd5d10b-b880-4e44-aad9-471d0603d441';
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('ERR_FIN_INMUTABLE' in v_err) = 0 AND coalesce(v_state,'') <> 'ERR_FIN_INMUTABLE') THEN
    RAISE EXCEPTION 'CASE f4f FAILED: se esperaba ERR_FIN_INMUTABLE, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $f4f$;
-- (A) válida: contraasiento insertado antes en la MISMA transacción
INSERT INTO public.fin_entries (id, store_id, document_type, document_number, event, economic_date, generation_id, status, reversal_of)
VALUES ('2f078a17-1f76-44ef-8516-84a5c0138658','83ad8cc2-e75a-443f-a61d-9ee6a5020107','VENTA','BAT-EAC','anulacion','2026-11-01','1cacc862-ce22-4031-bd40-df108a9a1a14','posted','20f9ba1d-c1d7-4f90-8c9d-aa7f89984838');

DO $f4g$
BEGIN
  UPDATE public.fin_entries SET status='reversed' WHERE id='20f9ba1d-c1d7-4f90-8c9d-aa7f89984838';
  IF NOT FOUND THEN RAISE EXCEPTION 'F4-g FAILED'; END IF;
END $f4g$;

DO $f4h$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    UPDATE public.fin_entries SET status='posted' WHERE id='20f9ba1d-c1d7-4f90-8c9d-aa7f89984838';
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('ERR_FIN_INMUTABLE' in v_err) = 0 AND coalesce(v_state,'') <> 'ERR_FIN_INMUTABLE') THEN
    RAISE EXCEPTION 'CASE f4h FAILED: se esperaba ERR_FIN_INMUTABLE, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $f4h$;
-- (B) relleno válido de generación + variantes bloqueadas

DO $f4i$
BEGIN
  UPDATE public.fin_entries SET generation_id='7c698678-6a1c-4cd5-9acf-aed5d3b9cf70' WHERE id='1a69f12e-eea9-46b7-9d87-846e7942d501';
  IF NOT FOUND THEN RAISE EXCEPTION 'F4-i FAILED'; END IF;
END $f4i$;

DO $f4j$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    UPDATE public.fin_entries SET generation_id=NULL WHERE id='1a69f12e-eea9-46b7-9d87-846e7942d501';
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('ERR_FIN_INMUTABLE' in v_err) = 0 AND coalesce(v_state,'') <> 'ERR_FIN_INMUTABLE') THEN
    RAISE EXCEPTION 'CASE f4j FAILED: se esperaba ERR_FIN_INMUTABLE, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $f4j$;

DO $f4k$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    UPDATE public.fin_entries SET generation_id='2beeb3d7-185c-4851-b599-852b291caa2c' WHERE id='1a69f12e-eea9-46b7-9d87-846e7942d501';
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('ERR_FIN_INMUTABLE' in v_err) = 0 AND coalesce(v_state,'') <> 'ERR_FIN_INMUTABLE') THEN
    RAISE EXCEPTION 'CASE f4k FAILED: se esperaba ERR_FIN_INMUTABLE, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $f4k$;

DO $f4l$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    UPDATE public.fin_entries SET generation_id='2beeb3d7-185c-4851-b599-852b291caa2c' WHERE id='0e33aba4-a79f-408b-ae68-4c3b790f90cc';
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('ERR_FIN_INMUTABLE' in v_err) = 0 AND coalesce(v_state,'') <> 'ERR_FIN_INMUTABLE') THEN
    RAISE EXCEPTION 'CASE f4l FAILED: se esperaba ERR_FIN_INMUTABLE, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $f4l$;
-- Rectificación controlada por fin_rectification_apply (crea + repara + audita)
DO $f4r$
DECLARE v_out jsonb;
BEGIN
  SELECT public.fin_rectification_apply('83ad8cc2-e75a-443f-a61d-9ee6a5020107','BAT-RECT-001','VENTA','2026-11-01','rect bat',
    '[{"categoria":"ACT_EFECTIVO_CUP","sentido":"debito","amount":10},{"categoria":"ACT_EFECTIVO_CUP","sentido":"credito","amount":10}]'::jsonb,
    NULL,'efeb3464-18ef-402c-b908-9a22793bff0b',false) INTO v_out;
  IF (v_out->>'status') IS DISTINCT FROM 'creada' THEN RAISE EXCEPTION 'F4-r1 FAILED: %', v_out; END IF;
  SELECT public.fin_rectification_apply('83ad8cc2-e75a-443f-a61d-9ee6a5020107','BAT-RECT-001','VENTA','2026-11-01','rect bat rep',
    '[{"categoria":"ACT_EFECTIVO_CUP","sentido":"debito","amount":20},{"categoria":"ACT_EFECTIVO_CUP","sentido":"credito","amount":20}]'::jsonb,
    NULL,'efeb3464-18ef-402c-b908-9a22793bff0b',true) INTO v_out;
  IF (v_out->>'status') IS DISTINCT FROM 'reparada' THEN RAISE EXCEPTION 'F4-r2 FAILED: %', v_out; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE action='FIN_MAINTENANCE_ENTRY_RECTIFIED') THEN
    RAISE EXCEPTION 'F4-r3 FAILED: sin auditoría del bypass de entrada'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE action='FIN_MAINTENANCE_MOVEMENTS_REPLACED') THEN
    RAISE EXCEPTION 'F4-r4 FAILED: sin auditoría del bypass de movimientos'; END IF;
END $f4r$;
-- Bypass manual (FRENO, no candado — documentado): asiento equivocado o columna
-- equivocada NO pasan; asiento correcto + columnas permitidas SÍ pasa (y audita).
SET LOCAL costpro.fin_maintenance='on';
SET LOCAL costpro.fin_rectification_entry='0dd5d10b-b880-4e44-aad9-471d0603d441';

DO $f4s$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    UPDATE public.fin_entries SET economic_date='2026-01-01' WHERE id='0dd5d10b-b880-4e44-aad9-471d0603d441';
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('ERR_FIN_INMUTABLE' in v_err) = 0 AND coalesce(v_state,'') <> 'ERR_FIN_INMUTABLE') THEN
    RAISE EXCEPTION 'CASE f4s FAILED: se esperaba ERR_FIN_INMUTABLE, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $f4s$;
SET LOCAL costpro.fin_rectification_entry='0e33aba4-a79f-408b-ae68-4c3b790f90cc';

DO $f4t$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    UPDATE public.fin_entries SET description='otro-asiento' WHERE id='0dd5d10b-b880-4e44-aad9-471d0603d441';
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('ERR_FIN_INMUTABLE' in v_err) = 0 AND coalesce(v_state,'') <> 'ERR_FIN_INMUTABLE') THEN
    RAISE EXCEPTION 'CASE f4t FAILED: se esperaba ERR_FIN_INMUTABLE, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $f4t$;

DO $f4u$
BEGIN
  UPDATE public.fin_entries SET description='manual-permitido' WHERE id='0e33aba4-a79f-408b-ae68-4c3b790f90cc';
  IF NOT FOUND THEN RAISE EXCEPTION 'F4-u FAILED'; END IF;
END $f4u$;
SET LOCAL costpro.fin_maintenance='off';
SET LOCAL costpro.fin_rectification_entry='';
-- Cascada de borrado duro de tienda: bloqueada por FK de audit_logs
-- (barrera PREEXISTENTE que actúa ANTES que el trigger F4); la barrera propia
-- del libro se demuestra directamente en f4v2 (DELETE del asiento de S3).

DO $f4v$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    DELETE FROM public.stores WHERE id='7d773d03-8171-4e66-8846-378057691aa2';
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('23503' in v_err) = 0 AND coalesce(v_state,'') <> '23503') THEN
    RAISE EXCEPTION 'CASE f4v FAILED: se esperaba 23503, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $f4v$;

DO $f4v2$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    DELETE FROM public.fin_entries WHERE id='e48a0251-8f33-4191-8126-eabf1dc85e53';
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('ERR_FIN_INMUTABLE' in v_err) = 0 AND coalesce(v_state,'') <> 'ERR_FIN_INMUTABLE') THEN
    RAISE EXCEPTION 'CASE f4v2 FAILED: se esperaba ERR_FIN_INMUTABLE, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $f4v2$;

DO $f4w$
BEGIN
  PERFORM public.soft_delete_store('7d773d03-8171-4e66-8846-378057691aa2','efeb3464-18ef-402c-b908-9a22793bff0b');
  
END $f4w$;

-- F5: residual en CUP + T12 por generación activa
DO $f5a$
DECLARE v_r numeric;
BEGIN
  SELECT public.fin_entry_reversal_residual('664cc579-d6a3-44ae-9c65-6cff711288b2') INTO v_r;
  IF v_r <> 120 THEN RAISE EXCEPTION 'F5-1 FAILED: esperaba 120 CUP, obtuve %', v_r; END IF;
  SELECT public.fin_entry_reversal_residual('b3620925-6291-4c35-9a0e-a3ff4eb8ae16') INTO v_r;
  IF v_r <> 167 THEN RAISE EXCEPTION 'F5-2 FAILED: multimoneda esperaba 167, obtuve %', v_r; END IF;
END $f5a$;

DO $f5b$
BEGIN
  UPDATE public.receipts SET status='voided' WHERE id='f6d5de22-7015-47fe-a91e-bf9d1c956da5';
  IF NOT FOUND THEN RAISE EXCEPTION 'F5-3 FAILED'; END IF;
END $f5b$;

DO $f5c$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    UPDATE public.receipts SET status='voided' WHERE id='aab2041a-a164-49c9-b32e-60b375b451a0';
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('ERR_PARTIAL_REVERSAL_PENDING' in v_err) = 0 AND coalesce(v_state,'') <> 'ERR_PARTIAL_REVERSAL_PENDING') THEN
    RAISE EXCEPTION 'CASE f5c FAILED: se esperaba ERR_PARTIAL_REVERSAL_PENDING, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $f5c$;

-- TR: freno de TRUNCATE

DO $tr1$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    TRUNCATE public.fin_posting_errors;
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('ERR_TRUNCATE_BLOQUEADO' in v_err) = 0 AND coalesce(v_state,'') <> 'ERR_TRUNCATE_BLOQUEADO') THEN
    RAISE EXCEPTION 'CASE tr1 FAILED: se esperaba ERR_TRUNCATE_BLOQUEADO, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $tr1$;
SET LOCAL costpro.allow_truncate='on';

DO $tr2$
BEGIN
  TRUNCATE public.fin_posting_errors;
  
END $tr2$;
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
-- ============================================================================
-- Rollback: 20261128153500_rollback_cp_infra_021.sql
-- Retira el freno de TRUNCATE de las 16 tablas fin_*/nómina (CP-INFRA-021)
-- NO borra asientos ni movimientos; NO toca tablas comerciales. Solo restaura
-- políticas, funciones, privilegios y triggers al estado previo del 2026-11-28.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_account_mapping;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_categories;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_document_types;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_entries;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_metric_catalog;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_movements;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_opening_balances;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_posting_errors;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_posting_generations;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_reconciliation_config;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_reconciliation_snapshots;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.fin_rule_versions;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.payroll_item_concepts;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.payroll_items;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.payrolls;
DROP TRIGGER IF EXISTS trg_cp_infra_020_block_truncate ON public.worker_salary_rates;

-- ============================================================================
-- Rollback: 20261128153400_rollback_cp_fin_f5.sql
-- Restaura fin_entry_reversal_residual (sum m.amount) y fin_t12 sin filtro de generación
-- NO borra asientos ni movimientos; NO toca tablas comerciales. Solo restaura
-- políticas, funciones, privilegios y triggers al estado previo del 2026-11-28.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fin_entry_reversal_residual(p_entry_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT GREATEST(
    abs(coalesce((SELECT sum(m.amount) FROM public.fin_movements m
                   WHERE m.entry_id = p_entry_id AND m.sense = 'debito'), 0)
      - coalesce((SELECT sum(rm.amount) FROM public.fin_entries r
                   JOIN public.fin_movements rm ON rm.entry_id = r.id
                  WHERE r.reversal_of = p_entry_id AND rm.sense = 'credito'), 0)),
    abs(coalesce((SELECT sum(m.amount) FROM public.fin_movements m
                   WHERE m.entry_id = p_entry_id AND m.sense = 'credito'), 0)
      - coalesce((SELECT sum(rm.amount) FROM public.fin_entries r
                   JOIN public.fin_movements rm ON rm.entry_id = r.id
                  WHERE r.reversal_of = p_entry_id AND rm.sense = 'debito'), 0))
  );
$function$;

CREATE OR REPLACE FUNCTION public.fin_t12_block_receipt_annulment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_entry uuid;
  v_residual numeric;
BEGIN
  -- Solo transiciones de anulación (estado previo vivo → voided/reversed).
  IF NEW.status NOT IN ('voided', 'reversed') OR OLD.status IN ('voided', 'reversed') THEN
    RETURN NEW;
  END IF;
  -- ¿Algún asiento posted (reconocimiento/pago) con reversión parcial enlazada?
  -- (las recepciones pending no tienen asientos → flujo ordinario intacto)
  SELECT e.id, public.fin_entry_reversal_residual(e.id)
    INTO v_entry, v_residual
  FROM public.fin_entries e
  WHERE e.document_type = 'RECEPCION' AND e.document_id = NEW.id
    AND e.status = 'posted' AND e.event IN ('reconocimiento', 'pago')
    AND EXISTS (SELECT 1 FROM public.fin_entries r WHERE r.reversal_of = e.id)
    AND public.fin_entry_reversal_residual(e.id) > 0.01
  LIMIT 1;
  IF v_entry IS NOT NULL THEN
    RAISE WARNING 'ERR_PARTIAL_REVERSAL_PENDING (intento bloqueado): recepción % con asiento % en reversión parcial y residual % CUP pendiente. Regularice el residual contable antes de anular (runbook RECT004 §regularización).',
      NEW.id, v_entry, v_residual;
    RAISE EXCEPTION 'ERR_PARTIAL_REVERSAL_PENDING: la recepción % tiene el asiento % con reversión parcial enlazada (residual % CUP sin compensar). Regularice primero el residual contable con un asiento explícito documentado (runbook RECT004 §regularización); después la anulación funcionará por el cauce ordinario.',
      NEW.id, v_entry, v_residual;
  END IF;
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- Rollback: 20261128153300_rollback_cp_fin_f4.sql
-- Retira fin_trg_*_immutable y restaura fin_rectification_apply sin ventana de mantenimiento
-- NO borra asientos ni movimientos; NO toca tablas comerciales. Solo restaura
-- políticas, funciones, privilegios y triggers al estado previo del 2026-11-28.
-- ============================================================================

DROP TRIGGER IF EXISTS fin_trg_entries_immutable ON public.fin_entries;
DROP TRIGGER IF EXISTS fin_trg_movements_immutable ON public.fin_movements;
DROP FUNCTION IF EXISTS public.fin_entries_immutable_guard();
DROP FUNCTION IF EXISTS public.fin_movements_immutable_guard();

CREATE OR REPLACE FUNCTION public.fin_rectification_apply(p_store_id uuid, p_document_number text, p_document_type text, p_economic_date date, p_description text, p_movements jsonb, p_generation_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_repair boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_gen uuid := coalesce(p_generation_id, public.fin_active_generation(p_store_id));
  v_entry_id uuid;
  v_expected int := jsonb_array_length(p_movements);
  v_debit numeric := 0; v_credit numeric := 0;
  v_n_mov int := 0; v_saldo numeric := 0;
  v_m jsonb; t jsonb; r record;
  v_audit uuid;
  v_count int;
  v_coherente boolean;
  v_antes int := 0;
BEGIN
  -- ACL pura (patrón fin_generation_build / fin_rectify_*): el canal de
  -- ejecución se restringe por GRANT a service_role (§4); sin chequeo interno
  -- de auth.role() — mismo diseño que el resto del motor.
  IF p_store_id IS NULL OR p_document_number IS NULL OR p_document_type IS NULL
     OR p_economic_date IS NULL OR p_movements IS NULL
     OR jsonb_typeof(p_movements) <> 'array' OR v_expected = 0 THEN
    RAISE EXCEPTION 'ERR_RECT_PARAMS_INVALIDOS: store/document_number/type/date/movements[] no vacíos';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_store_id) THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: tienda %', p_store_id;
  END IF;
  IF v_gen IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.fin_posting_generations g
       WHERE g.id = v_gen AND g.store_id = p_store_id
         AND g.status IN ('active', 'building', 'candidate')) THEN
    RAISE EXCEPTION 'ERR_GENERACION_NO_ENCONTRADA: generación destino % inválida para la tienda', v_gen;
  END IF;

  -- Serialización por (tienda, documento): idempotencia bajo concurrencia.
  PERFORM pg_advisory_xact_lock(hashtext('fin_rect:' || p_store_id::text || ':' || p_document_number));

  -- Validación estructural de movements — fail-closed ANTES de escribir nada.
  FOR v_m IN SELECT * FROM jsonb_array_elements(p_movements) LOOP
    IF v_m ->> 'categoria' IS NULL OR NOT EXISTS (
         SELECT 1 FROM public.fin_categories c
         WHERE c.code = v_m ->> 'categoria' AND c.is_active) THEN
      RAISE EXCEPTION 'ERR_CATEGORIA_INVALIDA: %', v_m ->> 'categoria';
    END IF;
    IF (v_m ->> 'sentido') NOT IN ('debito', 'credito') THEN
      RAISE EXCEPTION 'ERR_SENTIDO_INVALIDO: %', v_m ->> 'sentido';
    END IF;
    IF coalesce((v_m ->> 'amount')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'ERR_MONTO_INVALIDO: % (el motor prohíbe movimientos <= 0)', v_m ->> 'amount';
    END IF;
  END LOOP;

  -- Partida doble EXIGIDA para toda rectificación (validación previa).
  SELECT coalesce(sum(CASE WHEN m ->> 'sentido' = 'debito'  THEN round((m ->> 'amount')::numeric, 2) ELSE 0 END), 0),
         coalesce(sum(CASE WHEN m ->> 'sentido' = 'credito' THEN round((m ->> 'amount')::numeric, 2) ELSE 0 END), 0)
    INTO v_debit, v_credit
  FROM jsonb_array_elements(p_movements) m;
  IF abs(v_debit - v_credit) > 0.005 THEN
    RAISE EXCEPTION 'ERR_RECTIFICACION_DESQUILIBRADA: débitos=% créditos=%', v_debit, v_credit;
  END IF;

  -- Idempotencia completa: asiento previo en la generación destino.
  SELECT count(*) INTO v_count
  FROM public.fin_entries e
  WHERE e.store_id = p_store_id AND e.generation_id = v_gen
    AND e.document_number = p_document_number AND e.event = 'ajuste_manual';
  IF v_count > 1 THEN
    RAISE EXCEPTION 'ERR_RECTIFICACION_AMBIGUA: % asientos % en la generación %', v_count, p_document_number, v_gen;
  END IF;

  IF v_count = 1 THEN
    SELECT e.id INTO v_entry_id
    FROM public.fin_entries e
    WHERE e.store_id = p_store_id AND e.generation_id = v_gen
      AND e.document_number = p_document_number AND e.event = 'ajuste_manual';

    SELECT count(*),
           coalesce(round(sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END), 2), 0)
      INTO v_n_mov, v_saldo
    FROM public.fin_movements m WHERE m.entry_id = v_entry_id;
    v_antes := v_n_mov;

    -- Coherencia EXACTA: multiconjunto de movimientos (categoría|sentido|moneda|tasa|importe,
    -- serializado y ordenado) idéntico al esperado. NOTA: paréntesis explícitos —
    -- en PostgreSQL || enlaza más fuerte que ->>, y la cadena sin paréntesis
    -- se parsea como ((... || x) ->> 'sentido') → error text ->> unknown.
    -- P2-review 111: la moneda y la tasa ENTRAN en la firma — un reintento con
    -- mismos importes nominales pero distinta moneda/tasa NO es ya_completa
    -- (el saldo CUP real difiere; sin esto un par equilibrado conservaría el
    -- valor CUP equivocado sin reparación).
    SELECT
      (SELECT string_agg(m.category_code || '|' || m.sense || '|' || m.currency || '|' || round(m.exchange_rate, 6)::text || '|' || round(m.amount, 2)::text, ';'
               ORDER BY m.category_code, m.sense, m.currency, round(m.exchange_rate, 6), round(m.amount, 2))
         FROM public.fin_movements m WHERE m.entry_id = v_entry_id)
      =
      (SELECT string_agg((x ->> 'categoria') || '|' || (x ->> 'sentido') || '|' || coalesce(x ->> 'currency', 'CUP') || '|' || round(coalesce((x ->> 'exchange_rate')::numeric, 1), 6)::text || '|' || round((x ->> 'amount')::numeric, 2)::text, ';'
               ORDER BY x ->> 'categoria', x ->> 'sentido', coalesce(x ->> 'currency', 'CUP'), round(coalesce((x ->> 'exchange_rate')::numeric, 1), 6), round((x ->> 'amount')::numeric, 2))
         FROM jsonb_array_elements(p_movements) AS je(x))
    INTO v_coherente;

    IF v_n_mov >= 1 AND v_coherente AND abs(v_saldo) <= 0.005 THEN
      RETURN jsonb_build_object('status', 'ya_completa', 'entry_id', v_entry_id,
        'generation_id', v_gen, 'movimientos', v_n_mov, 'saldo', v_saldo);
    END IF;

    IF NOT coalesce(p_repair, false) THEN
      RAISE EXCEPTION 'ERR_RECTIFICACION_PARCIAL: asiento % con % movimientos (esperados %, saldo %) — complete o repare con p_repair = true', v_entry_id, v_n_mov, v_expected, v_saldo;
    END IF;

    -- Reparación CONTROLADA (misma transacción): movimientos reemplazados por
    -- los esperados; snapshot actualizado; traza de auditoría obligatoria.
    DELETE FROM public.fin_movements WHERE entry_id = v_entry_id;
    UPDATE public.fin_entries
       SET movements_snapshot = p_movements, description = coalesce(p_description, description)
     WHERE id = v_entry_id;
    FOR t IN SELECT * FROM jsonb_array_elements(p_movements) LOOP
      INSERT INTO public.fin_movements (
        entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
        economic_date, document_number, description, currency_origin, amount_origin, traza)
      VALUES (
        v_entry_id, p_store_id, t ->> 'categoria', t ->> 'sentido', (t ->> 'amount')::numeric,
        coalesce(t ->> 'currency', 'CUP'), coalesce((t ->> 'exchange_rate')::numeric, 1),
        p_economic_date, p_document_number, coalesce(t ->> 'description', p_description),
        t ->> 'currency_origin', (t ->> 'amount_origin')::numeric, coalesce(t -> 'traza', '{}'::jsonb));
    END LOOP;
    SELECT count(*),
           coalesce(round(sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END), 2), 0)
      INTO v_n_mov, v_saldo
    FROM public.fin_movements m WHERE m.entry_id = v_entry_id;
    IF v_n_mov <> v_expected OR abs(v_saldo) > 0.005 THEN
      RAISE EXCEPTION 'ERR_RECTIFICACION_VERIFICACION: tras reparar quedan %/% movimientos (saldo %)', v_n_mov, v_expected, v_saldo;
    END IF;
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
    VALUES (p_user_id, 'SYSTEM_RECTIFICATION_REPAIRED', 'fin_entries', v_entry_id,
            jsonb_build_object('entrada', v_entry_id, 'movimientos_antes', v_antes),
            jsonb_build_object('entry_id', v_entry_id, 'documento', p_document_number,
                               'movimientos', v_expected, 'saldo', v_saldo),
            p_store_id) RETURNING id INTO v_audit;
    RETURN jsonb_build_object('status', 'reparada', 'entry_id', v_entry_id,
      'generation_id', v_gen, 'movimientos', v_n_mov, 'saldo', v_saldo, 'audit_id', v_audit);
  END IF;

  -- Creación ATÓMICA: asiento + TODOS los movimientos en la misma transacción.
  INSERT INTO public.fin_entries (
    store_id, document_type, document_id, document_number, event, payment_ref,
    economic_date, rule_version_id, movements_snapshot, description, created_by, generation_id)
  VALUES (
    p_store_id, p_document_type, NULL, p_document_number, 'ajuste_manual', NULL,
    p_economic_date, NULL, p_movements, p_description, p_user_id, v_gen)
  RETURNING id INTO v_entry_id;

  FOR t IN SELECT * FROM jsonb_array_elements(p_movements) LOOP
    INSERT INTO public.fin_movements (
      entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
      economic_date, document_number, description, currency_origin, amount_origin, traza)
    VALUES (
      v_entry_id, p_store_id, t ->> 'categoria', t ->> 'sentido', (t ->> 'amount')::numeric,
      coalesce(t ->> 'currency', 'CUP'), coalesce((t ->> 'exchange_rate')::numeric, 1),
      p_economic_date, p_document_number, coalesce(t ->> 'description', p_description),
      t ->> 'currency_origin', (t ->> 'amount_origin')::numeric, coalesce(t -> 'traza', '{}'::jsonb));
  END LOOP;

  -- Verificación de partida doble POST-inserción (fallo → revierte TODO).
  SELECT count(*),
         coalesce(round(sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END), 2), 0)
    INTO v_n_mov, v_saldo
  FROM public.fin_movements m WHERE m.entry_id = v_entry_id;
  IF v_n_mov <> v_expected OR abs(v_saldo) > 0.005 THEN
    RAISE EXCEPTION 'ERR_RECTIFICACION_VERIFICACION: %/% movimientos (saldo %) — transacción revertida', v_n_mov, v_expected, v_saldo;
  END IF;

  -- Documento de auditoría + verificación (misma transacción).
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
  VALUES (p_user_id, 'SYSTEM_RECTIFICATION_APPLIED', 'fin_entries', v_entry_id,
          jsonb_build_object('entrada', NULL),
          jsonb_build_object('entry_id', v_entry_id, 'documento', p_document_number,
                             'tipo', p_document_type, 'fecha_economica', p_economic_date,
                             'movimientos', v_expected, 'debitos', v_debit, 'creditos', v_credit),
          p_store_id) RETURNING id INTO v_audit;
  IF v_audit IS NULL THEN
    RAISE EXCEPTION 'ERR_AUDITORIA_FALTANTE: documento de auditoría no insertado';
  END IF;

  RETURN jsonb_build_object('status', 'creada', 'entry_id', v_entry_id,
    'generation_id', v_gen, 'movimientos', v_n_mov, 'saldo', v_saldo, 'audit_id', v_audit);
END $function$;

-- ============================================================================
-- Rollback: 20261128153200_rollback_cp_fin_f3.sql
-- Restaura fin_rules_update amplio y retira fin_rule_scope_guard
-- NO borra asientos ni movimientos; NO toca tablas comerciales. Solo restaura
-- políticas, funciones, privilegios y triggers al estado previo del 2026-11-28.
-- ============================================================================

DROP POLICY IF EXISTS fin_rules_update ON public.fin_rule_versions;
CREATE POLICY fin_rules_update ON public.fin_rule_versions
  FOR UPDATE TO authenticated
  USING (store_id IS NULL OR has_store_access(store_id))
  WITH CHECK ((store_id IS NULL AND is_admin()) OR (store_id IS NOT NULL AND has_store_role(store_id, ARRAY['admin'])));

DROP TRIGGER IF EXISTS fin_rule_scope_immutable ON public.fin_rule_versions;
DROP FUNCTION IF EXISTS public.fin_rule_scope_guard();

-- ============================================================================
-- Rollback: 20261128153100_rollback_cp_fin_f2_rpc.sql
-- Restaura las 6 RPC fin_get_* con has_store_access_as y el patrón v_caller IS NOT NULL
-- NO borra asientos ni movimientos; NO toca tablas comerciales. Solo restaura
-- políticas, funciones, privilegios y triggers al estado previo del 2026-11-28.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fin_get_balance_sheet(p_store_id uuid, p_as_of date, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_rows jsonb; v_activos numeric := 0; v_pasivos numeric := 0; v_patrim numeric := 0;
  v_ing numeric := 0; v_gas numeric := 0;
  v_primer_doc date; v_primera_apertura date; v_resultado numeric;
  v_gen uuid := public.fin_active_generation(p_store_id);
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.sort_order), '[]'::jsonb),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'activo'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'pasivo'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'patrimonio'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'ingreso'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'gasto'), 0)
    INTO v_rows, v_activos, v_pasivos, v_patrim, v_ing, v_gas
  FROM (
    SELECT c.code, c.name, c.clase, c.grupo, c.sort_order,
           round(CASE WHEN c.clase IN ('activo', 'gasto')
                 THEN sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END)
                 ELSE sum(CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END)
               END, 2) AS saldo,
           count(DISTINCT m.entry_id) AS movimientos
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    JOIN public.fin_categories c ON c.code = m.category_code
    WHERE m.store_id = p_store_id AND m.economic_date <= p_as_of
      AND e.generation_id IS NOT DISTINCT FROM v_gen
    GROUP BY c.code, c.name, c.clase, c.grupo, c.sort_order
    HAVING round(CASE WHEN c.clase IN ('activo', 'gasto')
                 THEN sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END)
                 ELSE sum(CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END)
               END, 2) <> 0
  ) s;

  v_resultado := round(v_ing - v_gas, 2);
  SELECT min(economic_date) INTO v_primer_doc
  FROM public.fin_entries
  WHERE store_id = p_store_id AND event <> 'apertura'
    AND generation_id IS NOT DISTINCT FROM v_gen;
  SELECT min(economic_date) INTO v_primera_apertura
  FROM public.fin_entries
  WHERE store_id = p_store_id AND event = 'apertura'
    AND generation_id IS NOT DISTINCT FROM v_gen;

  RETURN jsonb_build_object(
    'as_of', p_as_of,
    'generacion', (SELECT jsonb_build_object('id', id, 'code', code)
                   FROM public.fin_posting_generations WHERE id = v_gen),
    'categorias', v_rows,
    'total_activos', round(v_activos, 2),
    'total_pasivos', round(v_pasivos, 2),
    'patrimonio_movimientos', round(v_patrim, 2),
    'resultado_acumulado', v_resultado,
    'patrimonio_total', round(v_patrim + v_resultado, 2),
    'ecuacion', jsonb_build_object(
      'activos', round(v_activos, 2),
      'pasivos_mas_patrimonio', round(v_pasivos + v_patrim + v_resultado, 2),
      'diferencia', round(v_activos - (v_pasivos + v_patrim + v_resultado), 2),
      'equilibrado', abs(v_activos - (v_pasivos + v_patrim + v_resultado)) <= 0.01),
    'completitud', jsonb_build_object(
      'sin_apertura', v_primer_doc IS NOT NULL AND v_primera_apertura IS NULL,
      'apertura_tardia', v_primer_doc IS NOT NULL AND v_primera_apertura IS NOT NULL
                         AND v_primer_doc < v_primera_apertura,
      'primer_documento', v_primer_doc,
      'primera_apertura', v_primera_apertura));
END $function$;

REVOKE ALL ON FUNCTION public.fin_get_balance_sheet(p_store_id uuid, p_as_of date, p_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_get_balance_sheet(p_store_id uuid, p_as_of date, p_user_id uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fin_get_income_statement(p_store_id uuid, p_from date, p_to date, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_rows jsonb;
  v_ing_op numeric := 0; v_ing_aj numeric := 0; v_costo numeric := 0;
  v_gastos numeric := 0; v_ing_noop numeric := 0; v_gas_noop numeric := 0;
  v_gen uuid := public.fin_active_generation(p_store_id);
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.sort_order), '[]'::jsonb),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'ingreso_operacional'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'ajuste_ingreso'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'costo_venta'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'gasto_operacional'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'ingreso_no_operacional'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'gasto_no_operacional'), 0)
    INTO v_rows, v_ing_op, v_ing_aj, v_costo, v_gastos, v_ing_noop, v_gas_noop
  FROM (
    SELECT c.code, c.name, c.grupo, c.sort_order,
           round(sum(CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END), 2) AS saldo,
           count(DISTINCT m.entry_id) AS documentos
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    JOIN public.fin_categories c ON c.code = m.category_code
    WHERE m.store_id = p_store_id AND m.economic_date BETWEEN p_from AND p_to
      AND c.clase IN ('ingreso', 'gasto')
      AND e.generation_id IS NOT DISTINCT FROM v_gen
    GROUP BY c.code, c.name, c.grupo, c.sort_order
    HAVING round(sum(CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END), 2) <> 0
  ) s;

  RETURN jsonb_build_object(
    'desde', p_from, 'hasta', p_to,
    'categorias', v_rows,
    'ingresos_operacionales', round(v_ing_op, 2),
    'ajustes_ingresos', round(v_ing_aj, 2),
    'ingresos_netos', round(v_ing_op + v_ing_aj, 2),
    'costo_ventas', round(v_costo, 2),
    'utilidad_bruta', round(v_ing_op + v_ing_aj + v_costo, 2),
    'gastos_operacionales', round(v_gastos, 2),
    'resultado_operativo', round(v_ing_op + v_ing_aj + v_costo + v_gastos, 2),
    'ingresos_no_operacionales', round(v_ing_noop, 2),
    'gastos_no_operacionales', round(v_gas_noop, 2),
    'resultado_neto', round(v_ing_op + v_ing_aj + v_costo + v_gastos + v_ing_noop + v_gas_noop, 2));
END $function$;

REVOKE ALL ON FUNCTION public.fin_get_income_statement(p_store_id uuid, p_from date, p_to date, p_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_get_income_statement(p_store_id uuid, p_from date, p_to date, p_user_id uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fin_get_dashboard(p_store_id uuid, p_from date, p_to date, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_ings numeric := 0; v_costo numeric := 0; v_gastos numeric := 0;
  v_efectivo_cup numeric := 0; v_efectivo_usd numeric := 0; v_bancos numeric := 0;
  v_exterior numeric := 0;
  v_cxc numeric := 0; v_cxp numeric := 0; v_nomina numeric := 0; v_retenc numeric := 0;
  v_inv numeric := 0; v_series jsonb; v_top jsonb;
  v_sin_cfg int; v_errores int; v_desbalance numeric;
  v_gen uuid := public.fin_active_generation(p_store_id);
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Resultado del período
  SELECT
    coalesce(sum(CASE WHEN c.clase = 'ingreso'
      THEN CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN c.grupo = 'costo_venta'
      THEN CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN c.clase = 'gasto' AND c.grupo <> 'costo_venta'
      THEN CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0)
    INTO v_ings, v_costo, v_gastos
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  JOIN public.fin_categories c ON c.code = m.category_code
  WHERE m.store_id = p_store_id AND m.economic_date BETWEEN p_from AND p_to
    AND e.generation_id IS NOT DISTINCT FROM v_gen;

  -- Saldos de balance a la fecha final
  SELECT
    coalesce(sum(CASE WHEN m.category_code = 'ACT_EFECTIVO_CUP' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'ACT_EFECTIVO_USD' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'ACT_BANCOS' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'ACT_TRANSF_EXTERIOR' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'ACT_CXC' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code IN ('PAS_CXP_PROV', 'PAS_SERV_PEND') THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'PAS_NOMINA_PEND' THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'PAS_RETENCIONES' THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0)
    INTO v_efectivo_cup, v_efectivo_usd, v_bancos, v_exterior, v_cxc, v_cxp, v_nomina, v_retenc
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE m.store_id = p_store_id AND m.economic_date <= p_to
    AND e.generation_id IS NOT DISTINCT FROM v_gen;

  -- Valor de inventario (en vivo, del motor de valoración real)
  SELECT coalesce(round(sum(p.stock_current * coalesce(p.cost_average, 0)), 2), 0) INTO v_inv
  FROM public.products p WHERE p.store_id = p_store_id;

  -- Series mensuales
  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.mes), '[]'::jsonb) INTO v_series
  FROM (
    SELECT to_char(date_trunc('month', m.economic_date), 'YYYY-MM') AS mes,
           round(sum(CASE WHEN c.clase = 'ingreso' THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 2) AS ingresos,
           round(sum(CASE WHEN c.clase = 'gasto' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 2) AS gastos
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    JOIN public.fin_categories c ON c.code = m.category_code
    WHERE m.store_id = p_store_id AND m.economic_date BETWEEN p_from AND p_to
      AND e.generation_id IS NOT DISTINCT FROM v_gen
    GROUP BY 1
  ) s;

  -- Top gastos
  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.total DESC), '[]'::jsonb) INTO v_top
  FROM (
    SELECT c.code, c.name, round(sum(m.amount_cup), 2) AS total
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    JOIN public.fin_categories c ON c.code = m.category_code
    WHERE m.store_id = p_store_id AND m.economic_date BETWEEN p_from AND p_to
      AND c.clase = 'gasto' AND m.sense = 'debito'
      AND e.generation_id IS NOT DISTINCT FROM v_gen
    GROUP BY c.code, c.name
    HAVING sum(m.amount_cup) > 0
    LIMIT 8
  ) s;

  SELECT count(*) INTO v_sin_cfg
  FROM public.fin_document_types dt
  WHERE dt.is_postable AND dt.is_active AND NOT EXISTS (
    SELECT 1 FROM public.fin_rule_versions rv
    WHERE rv.document_type = dt.code AND rv.status = 'active'
      AND (rv.store_id = p_store_id OR rv.store_id IS NULL));
  SELECT count(*) INTO v_errores
  FROM public.fin_posting_errors WHERE store_id = p_store_id AND resolved_at IS NULL;

  -- Identidad pura de partida doble (CP-FIN-002) sobre la generación activa
  SELECT coalesce(round(sum(
    CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END), 0), 0)
    INTO v_desbalance
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE m.store_id = p_store_id AND m.economic_date <= p_to
    AND e.generation_id IS NOT DISTINCT FROM v_gen;

  RETURN jsonb_build_object(
    'desde', p_from, 'hasta', p_to,
    'generacion', (SELECT jsonb_build_object('id', id, 'code', code)
                   FROM public.fin_posting_generations WHERE id = v_gen),
    'kpis', jsonb_build_object(
      'ingresos', round(v_ings, 2), 'costo_ventas', round(v_costo, 2),
      'gastos', round(v_gastos, 2),
      'utilidad_bruta', round(v_ings - v_costo, 2),
      'resultado_neto', round(v_ings - v_costo - v_gastos, 2),
      'efectivo_cup', round(v_efectivo_cup, 2), 'efectivo_usd', round(v_efectivo_usd, 2),
      'bancos', round(v_bancos, 2),
      'transfer_exterior', round(v_exterior, 2),
      'cuentas_por_cobrar', round(v_cxc, 2), 'cuentas_por_pagar', round(v_cxp, 2),
      'nomina_pendiente', round(v_nomina, 2), 'retenciones_pendientes', round(v_retenc, 2),
      'inventario_valor', v_inv),
    'series_mensuales', v_series,
    'top_gastos', v_top,
    'alertas', jsonb_build_object(
      'gastos_mayores_que_ingresos', v_gastos + v_costo > v_ings AND v_ings > 0,
      'desequilibrio_balance', abs(v_desbalance) > 0.01,
      'desequilibrio_monto', round(v_desbalance, 2),
      'tipos_sin_configurar', v_sin_cfg,
      'errores_contabilizacion', v_errores));
END $function$;

REVOKE ALL ON FUNCTION public.fin_get_dashboard(p_store_id uuid, p_from date, p_to date, p_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_get_dashboard(p_store_id uuid, p_from date, p_to date, p_user_id uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fin_get_category_detail(p_store_id uuid, p_category text, p_from date, p_to date, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_rows jsonb; v_total int;
  v_saldo_inicial numeric := 0; v_clase text;
  v_gen uuid := public.fin_active_generation(p_store_id);
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT c.clase INTO v_clase FROM public.fin_categories c WHERE c.code = p_category;

  -- Saldo acumulado anterior al rango (naturaleza-aware, misma convención
  -- del mayor: activo/gasto → débito−crédito; resto → crédito−débito).
  SELECT round(coalesce(sum(
           CASE WHEN v_clase IN ('activo', 'gasto')
             THEN CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END
             ELSE CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END
           END), 0), 2)
    INTO v_saldo_inicial
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE m.store_id = p_store_id AND m.category_code = p_category
    AND m.economic_date < p_from
    AND e.generation_id IS NOT DISTINCT FROM v_gen;

  SELECT count(*) INTO v_total
  FROM public.fin_movements m JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE m.store_id = p_store_id AND m.category_code = p_category
    AND m.economic_date BETWEEN p_from AND p_to
    AND e.generation_id IS NOT DISTINCT FROM v_gen;
  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.economic_date DESC, s.posted_at DESC), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT m.id, m.entry_id, e.document_type, e.document_id, m.document_number,
           m.economic_date, e.event, m.sense, m.amount, m.amount_cup,
           m.currency, m.currency_origin, m.amount_origin, m.exchange_rate,
           m.description, e.posted_at
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    WHERE m.store_id = p_store_id AND m.category_code = p_category
      AND m.economic_date BETWEEN p_from AND p_to
      AND e.generation_id IS NOT DISTINCT FROM v_gen
    ORDER BY m.economic_date DESC, e.posted_at DESC
    LIMIT greatest(coalesce(p_limit, 50), 1) OFFSET greatest(coalesce(p_offset, 0), 0)
  ) s;
  RETURN jsonb_build_object(
    'categoria', p_category, 'total', v_total,
    'desde', p_from, 'hasta', p_to, 'movimientos', v_rows,
    'generacion', (SELECT jsonb_build_object('id', id, 'code', code)
                   FROM public.fin_posting_generations WHERE id = v_gen),
    'saldo_inicial', v_saldo_inicial,
    'clase', v_clase);
END $function$;

REVOKE ALL ON FUNCTION public.fin_get_category_detail(p_store_id uuid, p_category text, p_from date, p_to date, p_limit integer, p_offset integer, p_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_get_category_detail(p_store_id uuid, p_category text, p_from date, p_to date, p_limit integer, p_offset integer, p_user_id uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fin_get_document_types_status(p_store_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_gen uuid := public.fin_active_generation(p_store_id);
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(s) ORDER BY s.sort_order)
    FROM (
      SELECT dt.code, dt.name, dt.module, dt.source_table, dt.description,
             dt.trigger_status, dt.is_postable, dt.sort_order,
             (rv.id IS NOT NULL) AS configurado,
             rv.id AS rule_version_id, rv.version, rv.movements, rv.effective_from,
             (SELECT count(*) FROM public.fin_entries e
              WHERE e.document_type = dt.code AND e.store_id = p_store_id
                AND e.generation_id IS NOT DISTINCT FROM v_gen) AS asientos,
             (SELECT count(*) FROM public.fin_posting_errors pe
              WHERE pe.document_type = dt.code AND pe.store_id = p_store_id
                AND pe.resolved_at IS NULL) AS errores
      FROM public.fin_document_types dt
      LEFT JOIN public.fin_rule_versions rv
        ON rv.document_type = dt.code AND rv.status = 'active'
       AND rv.effective_from <= CURRENT_DATE
       AND (rv.store_id = p_store_id
            OR (rv.store_id IS NULL AND NOT EXISTS (
                  SELECT 1 FROM public.fin_rule_versions x
                  WHERE x.document_type = dt.code AND x.status = 'active'
                    AND x.store_id = p_store_id)))
      WHERE dt.is_active
    ) s
  ), '[]'::jsonb);
END $function$;

REVOKE ALL ON FUNCTION public.fin_get_document_types_status(p_store_id uuid, p_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_get_document_types_status(p_store_id uuid, p_user_id uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fin_get_reconciliation(p_store_id uuid, p_as_of date, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_gen uuid := public.fin_active_generation(p_store_id);
  v_hist date := '1900-01-01';
  -- CP-FIN-REC-001/v2 (misión CP-FIN-110): cambios documentados frente a v1 —
  --   (a) detector de vales sin asiento excluye los de costo cero (sin efecto
  --       contable material: el motor prohíbe movimientos con importe <= 0);
  --   (b) detector de fallback USD restringido a ventas SIN filas en el riel
  --       de pagos (riel-primacía CP-FIN-002; el motor ya no puede divergir);
  --   (c) GAS_COSTO_VENTAS operacional redondea POR VENTA (misma convención
  --       de decimales del motor: round por documento, no global del período);
  --   (d) ACT_CXC restringido a órdenes COMPLETADAS con saldo (las draft no
  --       generan derecho de cobro contable);
  --   (e) PAS_ANTICIPOS_CLI pasa a CONCILIABLE (crédito de tienda + anticipos
  --       de órdenes no completadas);
  --   (f) ING_SERVICIOS_PREST pasa a CONCILIABLE (órdenes completadas del
  --       período — regla ORDEN_TRABAJO v1 del motor);
  --   (g) fuente production_orders en fuentes_actualizadas.
  -- Impacto histórico: ninguno sobre saldos; mejora exactitud de los puentes.
  -- CP-FIN-REC-001/v3 (misión POSTREVIEW-HARDENING-111, PR que resuelve la
  --   revisión de #1682) — cambios frente a v2:
  --   (h) órdenes RECONOCIBLES = status 'completed' O 'closed' CON
  --       completion_date (evidencia documental de finalización real): ACT_CXC,
  --       ING_SERVICIOS_PREST y PAS_ANTICIPOS_CLI usan el MISMO predicado que el
  --       pase 5 del build (P0-1); voided/reversed/closed-sin-evidencia siguen
  --       fuera y sus anticipos permanecen en el pasivo;
  --   (i) ACT_CXC: presupuesto convertido a CUP (budget_total × tasa
  --       documental) ANTES de restar los pagos acumulados en CUP (P0-2) y
  --       filtro de corte por coalesce(completion_date, order_date);
  --   (j) detector de fallback: mismo criterio semántico que fin_compute_metrics
  --       — sin cobro de EFECTIVO canónico (suma 0 por moneda), una fila de
  --       transferencia NO suprime el hallazgo (P0-3);
  --   (k) docs_pend/sin_resp cubren ORDEN_TRABAJO (reconocimiento y pagos).
  v_met_ver text := 'CP-FIN-REC-001/v3';
  v_res jsonb;
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  WITH
  -- ── Inventario: estadísticas del maestro (valoración WAC del sistema) ──
  inv AS (
    SELECT count(*) AS productos_total,
           count(*) FILTER (WHERE p.stock_current > 0) AS con_stock,
           count(*) FILTER (WHERE p.stock_current = 0) AS stock_cero,
           count(*) FILTER (WHERE p.stock_current < 0) AS stock_negativo,
           round(coalesce(sum(p.stock_current), 0), 2) AS cantidad_total,
           round(coalesce(sum(p.stock_current * coalesce(p.cost_average, 0)), 0), 2) AS valor_wac,
           round(coalesce(sum(p.stock_current * coalesce(p.cost_price, 0)), 0), 2) AS valor_cost_price,
           CASE WHEN coalesce(sum(p.stock_current), 0) <> 0
             THEN round(coalesce(sum(p.stock_current * coalesce(p.cost_average, 0)), 0)
                        / sum(p.stock_current), 4) END AS costo_promedio_ponderado,
           count(*) FILTER (WHERE p.stock_current <> 0 AND coalesce(p.cost_average, 0) = 0) AS sin_costo,
           (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'sku', x.sku, 'nombre', x.name, 'existencia', x.stock_current,
                     'costo_promedio', x.cost_average, 'valor', x.valor) ORDER BY x.valor DESC), '[]'::jsonb)
            FROM (SELECT p2.sku, p2.name, p2.stock_current, p2.cost_average,
                         round(p2.stock_current * coalesce(p2.cost_average, 0), 2) AS valor
                  FROM public.products p2
                  WHERE p2.store_id = p_store_id AND p2.stock_current <> 0
                  ORDER BY valor DESC LIMIT 15) x) AS top_productos,
           (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'sku', x.sku, 'nombre', x.name, 'existencia', x.stock_current)
                    ORDER BY x.sku), '[]'::jsonb)
            FROM (SELECT p3.sku, p3.name, p3.stock_current
                  FROM public.products p3
                  WHERE p3.store_id = p_store_id AND p3.stock_current <> 0
                    AND coalesce(p3.cost_average, 0) = 0
                  ORDER BY p3.sku LIMIT 10) x) AS sin_costo_detalle
    FROM public.products p WHERE p.store_id = p_store_id
  ),
  -- Kardex: valor del último saldo por producto al corte (reconstrucción histórica)
  krd AS (
    SELECT round(coalesce(sum(k.balance_total_value), 0), 2) AS valor_kardex,
           count(*) AS productos_con_kardex,
           max(k.ultimo)::date AS ultima_fecha
    FROM (
      SELECT DISTINCT ON (ke.product_id) ke.product_id, ke.balance_total_value,
             max(ke.created_at) OVER () AS ultimo
      FROM public.kardex_entries ke
      WHERE ke.store_id = p_store_id AND ke.created_at::date <= p_as_of
      ORDER BY ke.product_id, ke.created_at DESC
    ) k
  ),
  -- Detector de ventas con fallback de liquidación USD (settlement/carve):
  -- su cobro contable (cob_cash_cup/cob_cash_usd_cup reescritos por el motor)
  -- puede divergir del riel de payment_transactions → calidad PARCIAL en cajas.
  fb AS (
    -- v2: SOLO ventas sin NINGUNA fila en el riel de pagos (era pre-riel) cuya
    -- reconstrucción física (settlement/carve) contenga USD: son las únicas que
    -- el motor contabiliza con fuente distinta del riel y pueden divergir de él.
    SELECT count(*) AS n FROM public.transactions t
    WHERE t.store_id = p_store_id AND t.status = 'completed'
      AND t.created_at::date <= p_as_of
      -- CP-FIN-111 (P0-3): exactamente el criterio del fallback del motor —
      -- el fallback aplica cuando la venta NO tiene cobro de EFECTIVO en las
      -- monedas canónicas (suma por grupo = 0). La mera existencia de una fila
      -- de transferencia/zelle NO suprime el hallazgo (venta legacy con
      -- liquidación de efectivo + solo transferencia en el riel sigue
      -- detectándose); con cobro efectivo REAL en el riel no se detecta.
      AND NOT EXISTS (
        SELECT 1 FROM public.payment_transactions pt
        WHERE pt.ref_type = 'sale' AND pt.ref_id = t.id
          AND pt.payment_method = 'cash'
          AND coalesce(pt.direction, 'in') = 'in'
          AND lower(coalesce(pt.currency, 'cup')) IN ('cup', 'usd', 'eur', 'mlc')
        GROUP BY lower(coalesce(pt.currency, 'cup'))
        HAVING sum(pt.amount_cup) <> 0)
      AND (
        coalesce(t.cash_received_usd, 0) - coalesce(t.change_given_usd, 0) > 0
        OR EXISTS (
          SELECT 1 FROM public.transaction_items ti
          WHERE ti.transaction_id = t.id AND ti.cash_currency = 'USD'
            AND ti.currency = 'USD' AND coalesce(ti.cash_paid, 0) > 0))
  ),
  -- Cuentas financieras: flujos operacionales por (medios × moneda)
  cash AS (
    SELECT cur.*, (f ->> 'apertura')::numeric AS apertura, (f ->> 'flujos')::numeric AS flujos,
           (f ->> 'n_flujos')::bigint AS n_flujos, f -> 'desglose' AS desglose
    FROM (
      SELECT 'CUP' AS cur, public.fin_cash_flows_operacional(p_store_id, ARRAY['cash'], 'CUP', p_as_of) AS f
      UNION ALL SELECT 'USD', public.fin_cash_flows_operacional(p_store_id, ARRAY['cash'], 'USD', p_as_of)
      UNION ALL SELECT 'EUR', public.fin_cash_flows_operacional(p_store_id, ARRAY['cash'], 'EUR', p_as_of)
      UNION ALL SELECT 'MLC', public.fin_cash_flows_operacional(p_store_id, ARRAY['cash'], 'MLC', p_as_of)
      UNION ALL SELECT 'BANCOS', public.fin_cash_flows_operacional(p_store_id, ARRAY['transfer'], NULL, p_as_of)
      UNION ALL SELECT 'EXTERIOR', public.fin_cash_flows_operacional(p_store_id, ARRAY['external_transfer', 'zelle'], NULL, p_as_of)
    ) cur(cur, f)
  ),
  -- Documentos operacionales postables SIN asiento en la generación activa
  docs_pend AS (
    SELECT 'VENTA' AS tipo, count(*) AS n FROM public.transactions t
    WHERE t.store_id = p_store_id AND t.status = 'completed' AND t.created_at::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'VENTA'
                        AND e.document_id = t.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'DEVOLUCION_VENTA', count(*) FROM public.devolutions d
    WHERE d.store_id = p_store_id AND d.status = 'completed' AND d.processed_at::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'DEVOLUCION_VENTA'
                        AND e.document_id = d.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'RECEPCION', count(*) FROM public.receipts r
    WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'RECEPCION'
                        AND e.document_id = r.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'SERVICIO_RECIBIDO', count(*) FROM public.received_services s
    WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'SERVICIO_RECIBIDO'
                        AND e.document_id = s.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    -- v2: los vales de costo 0.00 no tienen efecto contable material (el motor
    -- prohíbe movimientos <= 0): no son documentos pendientes, son sin-asiento
    -- legítimo (clasificación CP-FIN-110 D5: 34 vales históricos costo cero).
    SELECT 'VALE_SALIDA', count(*) FROM public.issue_slips i
    WHERE i.store_id = p_store_id AND i.status = 'completed' AND i.created_at::date <= p_as_of
      AND coalesce(i.total_cost, 0) > 0
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'VALE_SALIDA'
                        AND e.document_id = i.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'AJUSTE_INVENTARIO', count(*) FROM public.inventory_adjustments a
    WHERE a.store_id = p_store_id AND a.status = 'confirmed' AND a.confirmed_at::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'AJUSTE_INVENTARIO'
                        AND e.document_id = a.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'COMISION', count(*) FROM public.commission_payments c
    WHERE c.store_id = p_store_id AND c.status = 'paid' AND c.paid_at::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'COMISION'
                        AND e.document_id = c.id AND e.event = 'pago'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'NOMINA', count(*) FROM public.payrolls n
    WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid') AND n.period_end <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'NOMINA'
                        AND e.document_id = n.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'FLUJO_CAJA', count(*) FROM public.cash_flow_documents cfd
    WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado' AND cfd.operation_date::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'FLUJO_CAJA'
                        AND e.document_id = cfd.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    -- CP-FIN-111 (P0-1/k): reconocimientos faltantes de órdenes RECONOCIBLES
    -- (mismo predicado que el pase 5 del build: completed, o closed con
    -- completion_date; voided/closed-sin-evidencia NO se exigen).
    SELECT 'ORDEN_TRABAJO', count(*) FROM public.production_orders o
    WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
      AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
      AND coalesce(o.completion_date, o.order_date) <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'ORDEN_TRABAJO'
                        AND e.document_id = o.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    -- Anticipos (pagos de órdenes service/work) sin asiento en la generación.
    SELECT 'ORDEN_TRABAJO', count(*) FROM public.payment_transactions pt
    JOIN public.production_orders po ON po.id = pt.ref_id
    WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
      AND coalesce(pt.direction, 'in') = 'in' AND po.order_type IN ('service', 'work')
      AND pt.payment_date::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'ORDEN_TRABAJO'
                        AND e.document_id = pt.ref_id AND e.event = 'pago'
                        AND e.payment_ref = pt.id
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
  ),
  -- Asientos cuyo documento de origen YA NO EXISTE en la tabla fuente
  sin_resp AS (
    SELECT e.document_type AS tipo, count(*) AS n
    FROM public.fin_entries e
    WHERE e.store_id = p_store_id AND e.generation_id IS NOT DISTINCT FROM v_gen
      AND e.document_id IS NOT NULL AND e.economic_date <= p_as_of
      AND (e.document_type = 'VENTA' AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = e.document_id)
        OR e.document_type = 'DEVOLUCION_VENTA' AND NOT EXISTS (SELECT 1 FROM public.devolutions d WHERE d.id = e.document_id)
        OR e.document_type = 'RECEPCION' AND NOT EXISTS (SELECT 1 FROM public.receipts r WHERE r.id = e.document_id)
        OR e.document_type = 'SERVICIO_RECIBIDO' AND NOT EXISTS (SELECT 1 FROM public.received_services s WHERE s.id = e.document_id)
        OR e.document_type = 'VALE_SALIDA' AND NOT EXISTS (SELECT 1 FROM public.issue_slips i WHERE i.id = e.document_id)
        OR e.document_type = 'AJUSTE_INVENTARIO' AND NOT EXISTS (SELECT 1 FROM public.inventory_adjustments a WHERE a.id = e.document_id)
        OR e.document_type = 'COMISION' AND NOT EXISTS (SELECT 1 FROM public.commission_payments c WHERE c.id = e.document_id)
        OR e.document_type = 'NOMINA' AND NOT EXISTS (SELECT 1 FROM public.payrolls n WHERE n.id = e.document_id)
        OR e.document_type = 'FLUJO_CAJA' AND NOT EXISTS (SELECT 1 FROM public.cash_flow_documents cfd WHERE cfd.id = e.document_id)
        OR e.document_type = 'ORDEN_TRABAJO' AND NOT EXISTS (SELECT 1 FROM public.production_orders o WHERE o.id = e.document_id))
    GROUP BY e.document_type
  ),
  -- ── Lado OPERACIONAL por cuenta (UNION: una fila por cuenta conciliable) ──
  op AS (
    -- ACT_INVENTARIO · valoración WAC del sistema (hoy) o kardex al corte (histórico)
    SELECT 'ACT_INVENTARIO' AS cuenta, false AS es_periodo, 10::int AS orden,
           CASE WHEN p_as_of < CURRENT_DATE THEN krd.valor_kardex ELSE inv.valor_wac END AS valor_op,
           inv.con_stock AS docs_op,
           (SELECT max(sm.created_at)::date FROM public.stock_movements sm WHERE sm.store_id = p_store_id) AS ultima_op,
           CASE WHEN inv.sin_costo > 0
                 OR inv.con_stock <> krd.productos_con_kardex
                 OR p_as_of < CURRENT_DATE
                THEN 'PARCIAL' ELSE 'COMPLETA' END::text AS calidad,
           CASE WHEN p_as_of < CURRENT_DATE
             THEN 'Valor según Kardex al corte (último saldo por producto): reconstrucción histórica documental.'
             ELSE 'Σ products.stock_current × cost_average (WAC — método de valoración del sistema). Fuente viva del maestro de productos.' END AS metodologia,
           ARRAY['products', 'kardex_entries', 'stock_movements']::text[] AS fuentes,
           jsonb_build_object(
             'productos_total', inv.productos_total, 'con_stock_positivo', inv.con_stock,
             'stock_cero', inv.stock_cero, 'stock_negativo', inv.stock_negativo,
             'cantidad_total', inv.cantidad_total, 'valor_wac', inv.valor_wac,
             'valor_cost_price', inv.valor_cost_price, 'valor_kardex', krd.valor_kardex,
             'costo_promedio_ponderado', inv.costo_promedio_ponderado,
             'productos_sin_costo', inv.sin_costo, 'sin_costo_detalle', inv.sin_costo_detalle,
             'top_productos', inv.top_productos,
             'diferencia_wac_kardex', round(inv.valor_wac - krd.valor_kardex, 2),
             'documentos_pendientes', coalesce((SELECT jsonb_object_agg(tipo, n) FROM (SELECT tipo, n FROM docs_pend WHERE n > 0 AND tipo IN ('VENTA','DEVOLUCION_VENTA','RECEPCION','VALE_SALIDA','AJUSTE_INVENTARIO')) z), '{}'::jsonb),
             'movimientos_sin_respaldo', coalesce((SELECT jsonb_object_agg(tipo, n) FROM (SELECT tipo, n FROM sin_resp WHERE tipo IN ('VENTA','DEVOLUCION_VENTA','RECEPCION','VALE_SALIDA','AJUSTE_INVENTARIO')) z), '{}'::jsonb),
             'nota_corte', CASE WHEN p_as_of < CURRENT_DATE THEN 'Corte histórico: el valor vivo del maestro refleja HOY; se usa el Kardex al corte como fuente primaria.' END) AS detalle
    FROM inv CROSS JOIN krd
    -- Cajas por moneda (medio = efectivo físico)
    UNION ALL
    SELECT 'ACT_EFECTIVO_' || c.cur, false, 11,
           c.apertura + c.flujos, c.n_flujos,
           (SELECT max(pt.payment_date)::date FROM public.payment_transactions pt
             WHERE pt.store_id = p_store_id AND pt.payment_method = 'cash'
               AND pt.currency = c.cur AND pt.payment_date::date <= p_as_of),
           CASE WHEN (c.cur IN ('CUP', 'USD') AND fb.n > 0) THEN 'PARCIAL' ELSE 'COMPLETA' END,
           'Apertura declarada + flujos operacionales de payment_transactions/comisiones/nóminas por (efectivo × ' || c.cur || '), en equivalente CUP (amount_cup). Réplica de la semántica de fechas del motor.',
           ARRAY['payment_transactions', 'cash_flow_documents', 'commission_payments', 'payrolls', 'fin_opening_balances']::text[],
           jsonb_build_object('apertura', c.apertura, 'flujos', c.flujos, 'desglose', c.desglose,
             'ventas_con_fallback_usd', fb.n,
             'documentos_pendientes', coalesce((SELECT jsonb_object_agg(tipo, n) FROM (SELECT tipo, n FROM docs_pend WHERE n > 0 AND tipo IN ('VENTA','DEVOLUCION_VENTA','FLUJO_CAJA','COMISION','NOMINA','RECEPCION','SERVICIO_RECIBIDO')) z), '{}'::jsonb))
    FROM cash c CROSS JOIN fb WHERE c.cur IN ('CUP', 'USD', 'EUR', 'MLC')
    -- Bancos (transferencias, cualquier moneda)
    UNION ALL
    SELECT 'ACT_BANCOS', false, 12,
           c.apertura + c.flujos, c.n_flujos,
           (SELECT max(pt.payment_date)::date FROM public.payment_transactions pt
             WHERE pt.store_id = p_store_id AND pt.payment_method = 'transfer'
               AND pt.payment_date::date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + flujos por transferencia (cualquier moneda) según mapeo canónico fin_account_mapping (transfer × * → ACT_BANCOS).',
           ARRAY['payment_transactions', 'fin_opening_balances']::text[],
           jsonb_build_object('apertura', c.apertura, 'flujos', c.flujos, 'desglose', c.desglose)
    FROM cash c WHERE c.cur = 'BANCOS'
    -- Transferencias del exterior (external_transfer + zelle heredado)
    UNION ALL
    SELECT 'ACT_TRANSF_EXTERIOR', false, 13,
           c.apertura + c.flujos, c.n_flujos,
           (SELECT max(pt.payment_date)::date FROM public.payment_transactions pt
             WHERE pt.store_id = p_store_id AND pt.payment_method IN ('external_transfer', 'zelle')
               AND pt.payment_date::date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + flujos Transf. Exterior (external_transfer canónico + zelle heredado normalizado), equivalente CUP.',
           ARRAY['payment_transactions', 'fin_opening_balances']::text[],
           jsonb_build_object('apertura', c.apertura, 'flujos', c.flujos, 'desglose', c.desglose)
    FROM cash c WHERE c.cur = 'EXTERIOR'
    -- Cuentas por cobrar: órdenes service/work RECONOCIBLES con saldo
    UNION ALL
    SELECT 'ACT_CXC', false, 14,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'ACT_CXC' AND ob.as_of_date <= p_as_of), 0)
           -- CP-FIN-111 (P0-2): unidades homogéneas — el presupuesto se
           -- convierte a CUP (budget_total × tasa documental) ANTES de restar
           -- los pagos acumulados en CUP (paid_amount). Ejemplo obligatorio:
           -- 100 USD @ 800 con 10 USD pagado (8.000 CUP) → CxC 72.000 CUP
           -- (la fórmula v2 restaba monedas distintas: daba 0).
           + coalesce((SELECT round(sum(greatest(o.budget_total
                * CASE WHEN coalesce(o.budget_currency, 'CUP') = 'CUP'
                            OR coalesce(o.budget_exchange_rate, 0) <= 0 THEN 1
                       ELSE o.budget_exchange_rate END
                - o.paid_amount, 0)), 2)
              FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
               AND coalesce(o.completion_date, o.order_date) <= p_as_of), 0),
           (SELECT count(*) FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
               AND coalesce(o.completion_date, o.order_date) <= p_as_of
               AND greatest(o.budget_total * CASE WHEN coalesce(o.budget_currency, 'CUP') = 'CUP'
                            OR coalesce(o.budget_exchange_rate, 0) <= 0 THEN 1
                       ELSE o.budget_exchange_rate END
                     - o.paid_amount, 0) > 0.01),
           (SELECT max(coalesce(o.completion_date, o.order_date)) FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
               AND coalesce(o.completion_date, o.order_date) <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ (budget_total × tasa documental − paid_amount) de órdenes service/work RECONOCIBLES (completed, o closed con completion_date — v3 P0-1), con el presupuesto convertido ANTES de restar los pagos (v3 P0-2: misma unidades CUP). Las draft/voided/closed-sin-evidencia no generan derecho contable; su anticipo vive en PAS_ANTICIPOS_CLI. Contrapartida del motor: regla ORDEN_TRABAJO v1 (línea ow-rec-cxc-d).',
           ARRAY['production_orders', 'fin_opening_balances']::text[],
           jsonb_build_object(
             'ordenes_pendientes', (SELECT count(*) FROM public.production_orders o
               WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
                 AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
                 AND coalesce(o.completion_date, o.order_date) <= p_as_of
                 AND greatest(o.budget_total * CASE WHEN coalesce(o.budget_currency, 'CUP') = 'CUP'
                            OR coalesce(o.budget_exchange_rate, 0) <= 0 THEN 1
                       ELSE o.budget_exchange_rate END
                     - o.paid_amount, 0) > 0.01),
             'anticipos_cobrados', coalesce((SELECT round(sum(pt.amount_cup), 2) FROM public.payment_transactions pt
               WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
                 AND coalesce(pt.direction, 'in') = 'in' AND pt.payment_date::date <= p_as_of), 0))
    -- Entregas de efectivo para depósito (ACT_OTROS_CORR · FLUJO_CAJA v2)
    UNION ALL
    SELECT 'ACT_OTROS_CORR', false, 15,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'ACT_OTROS_CORR' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(cfd.amount_cup), 2) FROM public.cash_flow_documents cfd
              WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
                AND cfd.doc_type = 'egreso' AND cfd.concept = 'entrega_efectivo'
                AND cfd.operation_date::date <= p_as_of), 0),
           (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept = 'entrega_efectivo'
               AND cfd.operation_date::date <= p_as_of),
           (SELECT max(cfd.operation_date)::date FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept = 'entrega_efectivo'
               AND cfd.operation_date::date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ entregas de efectivo confirmadas (cash_flow_documents egreso/entrega_efectivo → ACT_OTROS_CORR, regla FLUJO_CAJA v2).',
           ARRAY['cash_flow_documents', 'fin_opening_balances']::text[],
           jsonb_build_object('entregas_confirmadas', (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept = 'entrega_efectivo'
               AND cfd.operation_date::date <= p_as_of))
    -- Cuentas por pagar a proveedores: recepciones activas − pagos
    UNION ALL
    SELECT 'PAS_CXP_PROV', false, 30,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_CXP_PROV' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(x.total - x.pagos), 2) FROM (
                SELECT r.id,
                       (SELECT coalesce(sum(ri.quantity * ri.unit_cost * coalesce(NULLIF(ri.tasa_cambio_recepcion, 0), 1)), 0)
                          FROM public.receipt_items ri WHERE ri.receipt_id = r.id) AS total,
                       (SELECT coalesce(sum(pt.amount_cup), 0) FROM public.payment_transactions pt
                         WHERE pt.ref_type = 'receipt' AND pt.ref_id = r.id
                           AND coalesce(pt.direction, 'in') = 'in') AS pagos
                FROM public.receipts r
                WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of) x), 0),
           (SELECT count(*) FROM public.receipts r
             WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of),
           (SELECT max(r.reception_date) FROM public.receipts r
             WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ recepciones activas (Σ receipt_items qty×unit_cost×tasa) − pagos registrados (payment_transactions). Misma semántica de fecha del motor: el asiento de pago lleva la fecha del documento.',
           ARRAY['receipts', 'receipt_items', 'payment_transactions', 'fin_opening_balances']::text[],
           jsonb_build_object('recepciones_activas', (SELECT count(*) FROM public.receipts r
             WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of))
    -- Servicios pendientes de pago
    UNION ALL
    SELECT 'PAS_SERV_PEND', false, 31,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_SERV_PEND' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(x.total - x.pagos), 2) FROM (
                SELECT s.id,
                       CASE WHEN coalesce(s.currency, 'CUP') = 'CUP' OR coalesce(s.exchange_rate, 0) <= 0
                            THEN coalesce(s.total_amount, 0)
                            ELSE coalesce(s.total_amount, 0) * s.exchange_rate END AS total,
                       (SELECT coalesce(sum(pt.amount_cup), 0) FROM public.payment_transactions pt
                         WHERE pt.ref_type = 'service' AND pt.ref_id = s.id
                           AND coalesce(pt.direction, 'in') = 'in') AS pagos
                FROM public.received_services s
                WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of) x), 0),
           (SELECT count(*) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of),
           (SELECT max(s.service_date) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ servicios activos (total × tasa documental) − pagos registrados. Misma métrica del motor (fin_compute_metrics SERVICIO_RECIBIDO).',
           ARRAY['received_services', 'payment_transactions', 'fin_opening_balances']::text[],
           jsonb_build_object('servicios_activos', (SELECT count(*) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of))
    -- Nómina pendiente (confirmada, no pagada: neto)
    UNION ALL
    SELECT 'PAS_NOMINA_PEND', false, 32,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_NOMINA_PEND' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(n.total_net), 2) FROM public.payrolls n
              WHERE n.store_id = p_store_id AND n.status = 'confirmed' AND n.currency = 'CUP'
                AND n.period_end <= p_as_of), 0),
           (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status = 'confirmed' AND n.period_end <= p_as_of),
           (SELECT max(n.period_end) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status = 'confirmed' AND n.period_end <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ total_net de nóminas confirmadas (devengadas) no pagadas. El pago cancela la obligación (regla NOMINA v1: np-neto-d).',
           ARRAY['payrolls', 'fin_opening_balances']::text[],
           jsonb_build_object('nominas_confirmadas', (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status = 'confirmed' AND n.period_end <= p_as_of))
    -- Retenciones de nómina (pendientes de liquidación)
    UNION ALL
    SELECT 'PAS_RETENCIONES', false, 33,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_RETENCIONES' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(n.total_deductions), 2) FROM public.payrolls n
              WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
                AND n.currency = 'CUP' AND n.period_end <= p_as_of), 0),
           (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid') AND n.period_end <= p_as_of),
           (SELECT max(n.period_end) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid') AND n.period_end <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ total_deductions de nóminas confirmadas/pagadas (las retenciones permanecen hasta su liquidación — regla NOMINA v1).',
           ARRAY['payrolls', 'fin_opening_balances']::text[],
           jsonb_build_object('nominas_con_retenciones', (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid') AND n.period_end <= p_as_of))
    -- Crédito de tienda (store credit)
    UNION ALL
    SELECT 'PAS_ANTICIPOS_CLI', false, 36,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_ANTICIPOS_CLI' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(scl.amount), 2) FROM public.store_credit_ledger scl
              WHERE scl.store_id = p_store_id AND scl.created_at::date <= p_as_of), 0)
           -- v2: anticipos cobrados por órdenes service/work NO completadas (el
           -- dinero del cliente por trabajos aún no ejecutados: pasivo real). Las
           -- órdenes completadas consumen su anticipo en el reconocimiento
           -- (ow-rec-ant-d); un exceso sobre el presupuesto queda aquí.
           + coalesce((SELECT round(sum(pt.amount_cup), 2) FROM public.payment_transactions pt
              JOIN public.production_orders o ON o.id = pt.ref_id
              WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
                AND coalesce(pt.direction, 'in') = 'in'
                AND o.order_type IN ('service', 'work')
                AND NOT (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
                AND pt.payment_date::date <= p_as_of), 0)
           + coalesce((SELECT round(coalesce(sum(x.exc), 0), 2) FROM (
                SELECT greatest(sum(pt.amount_cup) - CASE WHEN coalesce(o.budget_currency, 'CUP') = 'CUP'
                            OR coalesce(o.budget_exchange_rate, 0) <= 0
                       THEN coalesce(o.budget_total, 0) ELSE o.budget_total * o.budget_exchange_rate END, 0) AS exc
                FROM public.production_orders o
                JOIN public.payment_transactions pt ON pt.ref_id = o.id
                     AND pt.ref_type IN ('production_order', 'work') AND coalesce(pt.direction, 'in') = 'in'
                WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
                  AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
                  AND coalesce(o.completion_date, o.order_date) <= p_as_of
                GROUP BY o.id) x), 0),
           (SELECT count(*) FROM public.store_credit_ledger scl
             WHERE scl.store_id = p_store_id AND scl.created_at::date <= p_as_of)
           + (SELECT count(*) FROM public.payment_transactions pt
              JOIN public.production_orders o ON o.id = pt.ref_id
              WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
                AND coalesce(pt.direction, 'in') = 'in'
                AND o.order_type IN ('service', 'work')
                AND NOT (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
                AND pt.payment_date::date <= p_as_of),
           (SELECT max(pt.payment_date)::date FROM public.payment_transactions pt
              JOIN public.production_orders o ON o.id = pt.ref_id
              WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
                AND coalesce(pt.direction, 'in') = 'in'
                AND o.order_type IN ('service', 'work')
                AND NOT (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
                AND pt.payment_date::date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ store_credit_ledger (crédito de tienda) + Σ anticipos de órdenes service/work NO completadas + excesos de anticipos sobre presupuesto de órdenes completadas (v2). Contrapartida del motor: regla ORDEN_TRABAJO v1 (anticipos → PAS_ANTICIPOS_CLI).',
           ARRAY['store_credit_ledger', 'payment_transactions', 'production_orders', 'fin_opening_balances']::text[],
           jsonb_build_object('creditos_emitidos', (SELECT count(*) FROM public.store_credit_ledger scl
             WHERE scl.store_id = p_store_id AND scl.amount > 0 AND scl.created_at::date <= p_as_of),
             'anticipos_pendientes', (SELECT coalesce(round(sum(pt.amount_cup), 2), 0) FROM public.payment_transactions pt
              JOIN public.production_orders o ON o.id = pt.ref_id
              WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
                AND coalesce(pt.direction, 'in') = 'in'
                AND o.order_type IN ('service', 'work')
                AND NOT (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
                AND pt.payment_date::date <= p_as_of),
             'ordenes_no_reconocibles', (SELECT count(*) FROM public.production_orders o
              WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
                AND NOT (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
                AND o.order_date <= p_as_of))
    -- ══ Cuentas de PERÍODO (mismo rango que el Estado de Rendimiento) ══
    -- Ingresos por ventas (neteo canónico v4: ventas − devoluciones)
    UNION ALL
    SELECT 'ING_VENTAS', true, 60,
           round(coalesce((SELECT sum(t.total_amount) FROM public.transactions t
               WHERE t.store_id = p_store_id AND t.status = 'completed'
                 AND t.created_at::date BETWEEN p_from AND p_to), 0)
               - coalesce((SELECT sum(d.total_amount) FROM public.devolutions d
               WHERE d.store_id = p_store_id AND d.status = 'completed'
                 AND d.processed_at::date BETWEEN p_from AND p_to), 0), 2),
           (SELECT count(*) FROM public.transactions t
             WHERE t.store_id = p_store_id AND t.status = 'completed'
               AND t.created_at::date BETWEEN p_from AND p_to)
           + (SELECT count(*) FROM public.devolutions d
             WHERE d.store_id = p_store_id AND d.status = 'completed'
               AND d.processed_at::date BETWEEN p_from AND p_to),
           (SELECT max(d.processed_at)::date FROM public.devolutions d
             WHERE d.store_id = p_store_id AND d.status = 'completed'
               AND d.processed_at::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ total_amount de ventas completadas − Σ devoluciones completadas del período (neteo canónico de la regla VENTA v4: d-ing-d debita ING_VENTAS).',
           ARRAY['transactions', 'devolutions']::text[],
           jsonb_build_object(
             'ventas_completadas', (SELECT count(*) FROM public.transactions t
               WHERE t.store_id = p_store_id AND t.status = 'completed'
                 AND t.created_at::date BETWEEN p_from AND p_to),
             'devoluciones', (SELECT count(*) FROM public.devolutions d
               WHERE d.store_id = p_store_id AND d.status = 'completed'
                 AND d.processed_at::date BETWEEN p_from AND p_to))
    -- Descuentos / diferencias de cobro
    UNION ALL
    -- Ingresos por servicios prestados (órdenes service/work completadas) — v2
    SELECT 'ING_SERVICIOS_PREST', true, 61,
           coalesce((SELECT round(sum(CASE WHEN coalesce(o.budget_currency, 'CUP') = 'CUP'
                            OR coalesce(o.budget_exchange_rate, 0) <= 0
                       THEN coalesce(o.budget_total, 0) ELSE o.budget_total * o.budget_exchange_rate END), 2)
              FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
               AND coalesce(o.completion_date, o.order_date) BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
               AND coalesce(o.completion_date, o.order_date) BETWEEN p_from AND p_to),
           (SELECT max(coalesce(o.completion_date, o.order_date)) FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
               AND coalesce(o.completion_date, o.order_date) BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ budget_total × tasa documental de órdenes service/work RECONOCIBLES del período, por fecha real de finalización (v3 P0-1: completed, o closed con completion_date — mismas que reconoce el pase 5 del build). Contrapartida del motor: regla ORDEN_TRABAJO v1 (línea ow-rec-ing-c).',
           ARRAY['production_orders']::text[],
           jsonb_build_object('ordenes_completadas', (SELECT count(*) FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND (o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))
               AND coalesce(o.completion_date, o.order_date) BETWEEN p_from AND p_to))
    -- Descuentos / diferencias de cobro
    UNION ALL
    SELECT 'ING_DESCUENTOS', true, 66,
           round(coalesce((SELECT sum(pt.amount_cup)
               FROM public.payment_transactions pt
               JOIN public.transactions t ON t.id = pt.ref_id
              WHERE pt.store_id = p_store_id AND pt.ref_type = 'sale'
                AND coalesce(pt.direction, 'in') = 'in'
                AND t.status = 'completed'
                AND t.created_at::date BETWEEN p_from AND p_to), 0)
             - coalesce((SELECT sum(t.total_amount) FROM public.transactions t
               WHERE t.store_id = p_store_id AND t.status = 'completed'
                 AND t.created_at::date BETWEEN p_from AND p_to), 0), 2),
           (SELECT count(*) FROM public.transactions t
             WHERE t.store_id = p_store_id AND t.status = 'completed'
               AND t.created_at::date BETWEEN p_from AND p_to),
           NULL::date,
           CASE WHEN (SELECT fb2.n FROM fb fb2) > 0 THEN 'PARCIAL' ELSE 'COMPLETA' END,
           'Σ (cobrado − facturado) de las ventas del período (diferencia_cobro de la métrica del motor; presentación crédito−débito). Las ventas con fallback de liquidación USD pueden divergir del riel de pagos.',
           ARRAY['transactions', 'payment_transactions']::text[],
           jsonb_build_object('ventas_con_fallback_usd', (SELECT fb2.n FROM fb fb2))
    -- Costo de ventas (WAC congelado a la venta − costo devuelto)
    UNION ALL
    SELECT 'GAS_COSTO_VENTAS', true, 70,
           -- v2: redondeo POR VENTA/DEVOLUCIÓN (round por documento, idéntico al
           -- motor) — elimina la diferencia de precisión 0.01 del redondeo global
           -- del período sin ocultarla: ambas fuentes aplican la MISMA política.
           round(coalesce((SELECT sum(x.s)
               FROM (SELECT round(sum(ti.quantity * coalesce(NULLIF(ti.cost_at_sale, 0), p.cost_average, 0)), 2) AS s
                     FROM public.transaction_items ti
                     JOIN public.transactions t ON t.id = ti.transaction_id
                     LEFT JOIN public.products p ON p.id = ti.product_id
                    WHERE t.store_id = p_store_id AND t.status = 'completed'
                      AND t.created_at::date BETWEEN p_from AND p_to
                    GROUP BY t.id) x), 0)
             - coalesce((SELECT sum(x.s)
               FROM (SELECT round(sum(di.quantity * coalesce(NULLIF(oti.cost_at_sale, 0), p.cost_average, 0)), 2) AS s
                     FROM public.devolution_items di
                     JOIN public.devolutions d ON d.id = di.devolution_id
                     LEFT JOIN public.transaction_items oti
                       ON oti.transaction_id = d.original_transaction_id AND oti.product_id = di.product_id
                     LEFT JOIN public.products p ON p.id = di.product_id
                    WHERE d.store_id = p_store_id AND d.status = 'completed'
                      AND d.processed_at::date BETWEEN p_from AND p_to
                    GROUP BY d.id) x), 0), 2),
           (SELECT count(*) FROM public.transactions t
             WHERE t.store_id = p_store_id AND t.status = 'completed'
               AND t.created_at::date BETWEEN p_from AND p_to),
           NULL::date,
           'COMPLETA',
           'Σ qty×COALESCE(cost_at_sale, cost_average) de ventas completadas − costo devuelto de devoluciones (misma fórmula de fin_compute_metrics v5: costo_productos_cup y costo_devuelto_cup). El costo queda CONGELADO a la venta (DF-02): no se recalcula.',
           ARRAY['transaction_items', 'devolution_items', 'products']::text[],
           jsonb_build_object(
             'nota', 'COGS histórico congelado (cost_at_sale de la era de cada venta). La brecha frente al inventario vivo de la era FAC-VITALLCONS-001 está documentada en el expediente CP-FIN-003 §5.1.')
    -- Vales de salida (consumo interno)
    UNION ALL
    SELECT 'GAS_VALES', true, 74,
           coalesce((SELECT round(sum(i.total_cost), 2) FROM public.issue_slips i
              WHERE i.store_id = p_store_id AND i.status = 'completed'
                AND i.created_at::date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.issue_slips i
             WHERE i.store_id = p_store_id AND i.status = 'completed'
               AND i.created_at::date BETWEEN p_from AND p_to),
           (SELECT max(i.created_at)::date FROM public.issue_slips i
             WHERE i.store_id = p_store_id AND i.status = 'completed'
               AND i.created_at::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ total_cost de vales completados del período (métrica costo_cup del motor).',
           ARRAY['issue_slips']::text[],
           jsonb_build_object('vales_completados', (SELECT count(*) FROM public.issue_slips i
             WHERE i.store_id = p_store_id AND i.status = 'completed'
               AND i.created_at::date BETWEEN p_from AND p_to))
    -- Servicios recibidos (gasto)
    UNION ALL
    SELECT 'GAS_SERVICIOS', true, 71,
           coalesce((SELECT round(sum(CASE WHEN coalesce(s.currency, 'CUP') = 'CUP' OR coalesce(s.exchange_rate, 0) <= 0
                        THEN coalesce(s.total_amount, 0)
                        ELSE coalesce(s.total_amount, 0) * s.exchange_rate END), 2)
              FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active'
               AND s.service_date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active'
               AND s.service_date BETWEEN p_from AND p_to),
           (SELECT max(s.service_date) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active'
               AND s.service_date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ total×tasa de servicios recibidos activos del período (métrica total_cup del motor).',
           ARRAY['received_services']::text[],
           jsonb_build_object('servicios_activos', (SELECT count(*) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active'
               AND s.service_date BETWEEN p_from AND p_to))
    -- Comisiones pagadas
    UNION ALL
    SELECT 'GAS_COMISIONES', true, 73,
           coalesce((SELECT round(sum(CASE WHEN coalesce(c.currency, 'CUP') = 'CUP' OR coalesce(c.exchange_rate, 0) <= 0
                        THEN coalesce(c.final_amount, 0)
                        ELSE coalesce(c.final_amount, 0) * c.exchange_rate END), 2)
              FROM public.commission_payments c
             WHERE c.store_id = p_store_id AND c.status = 'paid'
               AND c.paid_at::date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.commission_payments c
             WHERE c.store_id = p_store_id AND c.status = 'paid'
               AND c.paid_at::date BETWEEN p_from AND p_to),
           (SELECT max(c.paid_at)::date FROM public.commission_payments c
             WHERE c.store_id = p_store_id AND c.status = 'paid'
               AND c.paid_at::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ final_amount×tasa de comisiones pagadas del período (métrica total_cup del motor; gasto y pago en el mismo evento).',
           ARRAY['commission_payments']::text[],
           jsonb_build_object('comisiones_pagadas', (SELECT count(*) FROM public.commission_payments c
             WHERE c.store_id = p_store_id AND c.status = 'paid'
               AND c.paid_at::date BETWEEN p_from AND p_to))
    -- Nóminas (gasto devengado)
    UNION ALL
    SELECT 'GAS_NOMINAS', true, 72,
           coalesce((SELECT round(sum(n.total_gross), 2) FROM public.payrolls n
              WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
                AND n.currency = 'CUP' AND n.period_end BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
               AND n.period_end BETWEEN p_from AND p_to),
           (SELECT max(n.period_end) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
               AND n.period_end BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ total_gross de nóminas confirmadas/pagadas del período (métrica total_gross_cup del motor).',
           ARRAY['payrolls']::text[],
           jsonb_build_object('nominas', (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
               AND n.period_end BETWEEN p_from AND p_to))
    -- Pérdidas de inventario (faltantes confirmados, valorados al WAC del momento)
    UNION ALL
    SELECT 'GAS_PERDIDA_INV', true, 75,
           coalesce((SELECT round(sum((-i.difference) * coalesce(NULLIF(w.wac, 0), p.cost_average, 0))
                 FILTER (WHERE i.difference < 0), 2)
              FROM public.inventory_adjustments a
              JOIN public.inventory_adjustment_items i ON i.adjustment_id = a.id
              JOIN public.products p ON p.id = i.product_id
              LEFT JOIN LATERAL (
                SELECT wcl.wac_after AS wac FROM public.wac_change_log wcl
                WHERE wcl.product_id = i.product_id AND wcl.store_id = a.store_id
                  AND wcl.created_at <= a.confirmed_at
                ORDER BY wcl.created_at DESC LIMIT 1) w ON true
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.inventory_adjustments a
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to),
           (SELECT max(a.confirmed_at)::date FROM public.inventory_adjustments a
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ faltantes (difference<0 × WAC del momento del ajuste según wac_change_log, fallback cost_average) de ajustes confirmados — métrica valor_faltante_cup del motor.',
           ARRAY['inventory_adjustments', 'inventory_adjustment_items', 'wac_change_log', 'products']::text[],
           jsonb_build_object('ajustes_confirmados', (SELECT count(*) FROM public.inventory_adjustments a
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to))
    -- Otros ingresos operacionales (sobrantes + ingresos de caja)
    UNION ALL
    SELECT 'ING_OTROS_OPER', true, 62,
           round(coalesce((SELECT sum(i.difference * coalesce(NULLIF(w.wac, 0), p.cost_average, 0))
                 FILTER (WHERE i.difference > 0)
              FROM public.inventory_adjustments a
              JOIN public.inventory_adjustment_items i ON i.adjustment_id = a.id
              JOIN public.products p ON p.id = i.product_id
              LEFT JOIN LATERAL (
                SELECT wcl.wac_after AS wac FROM public.wac_change_log wcl
                WHERE wcl.product_id = i.product_id AND wcl.store_id = a.store_id
                  AND wcl.created_at <= a.confirmed_at
                ORDER BY wcl.created_at DESC LIMIT 1) w ON true
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to), 0)
             + coalesce((SELECT sum(cfd.amount_cup) FROM public.cash_flow_documents cfd
              WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
                AND cfd.doc_type = 'ingreso'
                AND cfd.operation_date::date BETWEEN p_from AND p_to), 0), 2),
           (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'ingreso'
               AND cfd.operation_date::date BETWEEN p_from AND p_to),
           (SELECT max(cfd.operation_date)::date FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'ingreso'
               AND cfd.operation_date::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ sobrantes de inventario (WAC del momento) + ingresos de caja documentados del período (reglas AJUSTE_INVENTARIO v1 y FLUJO_CAJA v2: fc-in-c).',
           ARRAY['inventory_adjustments', 'inventory_adjustment_items', 'wac_change_log', 'cash_flow_documents']::text[],
           jsonb_build_object('ingresos_caja', coalesce((SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'ingreso'
               AND cfd.operation_date::date BETWEEN p_from AND p_to), 0))
    -- Otros gastos operacionales (egresos de caja ordinarios ≠ entrega_efectivo)
    UNION ALL
    SELECT 'GAS_OTROS_OPER', true, 81,
           coalesce((SELECT round(sum(cfd.amount_cup), 2) FROM public.cash_flow_documents cfd
              WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
                AND cfd.doc_type = 'egreso' AND cfd.concept <> 'entrega_efectivo'
                AND cfd.operation_date::date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept <> 'entrega_efectivo'
               AND cfd.operation_date::date BETWEEN p_from AND p_to),
           (SELECT max(cfd.operation_date)::date FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept <> 'entrega_efectivo'
               AND cfd.operation_date::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ egresos de caja ordinarios confirmados (concepto ≠ entrega_efectivo) del período — regla FLUJO_CAJA v2: fc-eg-d.',
           ARRAY['cash_flow_documents']::text[],
           jsonb_build_object('egresos_confirmados', (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept <> 'entrega_efectivo'
               AND cfd.operation_date::date BETWEEN p_from AND p_to))
  ),
  -- ── Lado CONTABLE (mayor de la generación activa, ventana por naturaleza) ──
  led AS (
    SELECT o.cuenta, o.es_periodo, o.orden, o.valor_op, o.docs_op, o.ultima_op,
           o.calidad, o.metodologia, o.fuentes, o.detalle,
           c.name AS nombre, c.clase, c.grupo, c.sort_order,
           CASE WHEN o.es_periodo THEN lper.saldo ELSE lcut.saldo END AS valor_contable,
           CASE WHEN o.es_periodo THEN lper.movimientos ELSE lcut.movimientos END AS movs,
           CASE WHEN o.es_periodo THEN lper.ultima_fecha ELSE lcut.ultima_fecha END AS ultima_cont
    FROM op o
    JOIN public.fin_categories c ON c.code = o.cuenta
    LEFT JOIN LATERAL (SELECT ls.saldo, ls.movimientos, ls.ultima_fecha
                         FROM public.fin_ledger_saldo(p_store_id, o.cuenta, v_gen, v_hist, p_as_of) ls) lcut ON true
    LEFT JOIN LATERAL (SELECT ls.saldo, ls.movimientos, ls.ultima_fecha
                         FROM public.fin_ledger_saldo(p_store_id, o.cuenta, v_gen, p_from, p_to) ls) lper ON true
  ),
  calc AS (
    SELECT l.*,
           round(l.valor_op - l.valor_contable, 2) AS diferencia,
           round(coalesce(cf.tolerancia, 0.01), 2) AS tolerancia,
           greatest(coalesce(cf.materialidad_min, 1), round(coalesce(cf.materialidad_pct, 0)
                 * greatest(abs(l.valor_op), abs(l.valor_contable)), 2)) AS materialidad
    FROM led l LEFT JOIN public.fin_reconciliation_config cf ON cf.category_code = l.cuenta
  ),
  final_rows AS (
    SELECT calc.cuenta, calc.nombre, calc.clase, calc.grupo, calc.sort_order,
           calc.es_periodo,
           CASE WHEN calc.es_periodo AND (p_from IS NULL OR p_to IS NULL) THEN NULL
                ELSE calc.valor_op END AS valor_operacional,
           calc.valor_contable,
           CASE WHEN calc.es_periodo AND (p_from IS NULL OR p_to IS NULL) THEN NULL
                ELSE calc.diferencia END AS diferencia,
           CASE WHEN abs(calc.valor_contable) > 0.005
             THEN round(abs(calc.valor_op - calc.valor_contable) / abs(calc.valor_contable) * 100, 2) END AS diferencia_pct,
           CASE
             WHEN calc.es_periodo AND (p_from IS NULL OR p_to IS NULL) THEN 'PENDIENTE'
             WHEN calc.calidad = 'SIN_FUENTE' THEN 'INCOMPLETO'
             WHEN abs(calc.diferencia) <= calc.tolerancia
               THEN CASE WHEN calc.calidad = 'PARCIAL' THEN 'INCOMPLETO' ELSE 'CONCILIADO' END
             WHEN abs(calc.diferencia) > calc.materialidad THEN 'ALERTA'
             ELSE 'DIFERENCIA'
           END AS estado,
           calc.tolerancia, calc.materialidad,
           calc.docs_op AS documentos_operacionales, calc.movs AS movimientos_contables,
           calc.ultima_op AS ultima_fecha_operacional, calc.ultima_cont AS ultima_fecha_contable,
           calc.calidad, calc.metodologia, calc.fuentes, calc.detalle,
           calc.orden
    FROM calc
    UNION ALL
    -- Resto del catálogo: SIN fuente operacional independiente (misión §5.3)
    SELECT c.code, c.name, c.clase, c.grupo, c.sort_order,
           (c.clase IN ('ingreso', 'gasto')) AS es_periodo,
           NULL::numeric AS valor_operacional,
           CASE WHEN c.clase IN ('ingreso', 'gasto') AND (p_from IS NULL OR p_to IS NULL) THEN NULL
                ELSE CASE WHEN c.clase IN ('ingreso', 'gasto')
                     THEN lper.saldo ELSE lcut.saldo END END AS valor_contable,
           NULL::numeric AS diferencia, NULL::numeric AS diferencia_pct,
           CASE WHEN c.clase IN ('ingreso', 'gasto') AND (p_from IS NULL OR p_to IS NULL)
             THEN 'PENDIENTE' ELSE 'NO_CONCILIABLE' END AS estado,
           NULL::numeric AS tolerancia, NULL::numeric AS materialidad,
           NULL::bigint AS documentos_operacionales,
           CASE WHEN c.clase IN ('ingreso', 'gasto') THEN lper.movimientos ELSE lcut.movimientos END AS movimientos_contables,
           NULL::date AS ultima_fecha_operacional,
           CASE WHEN c.clase IN ('ingreso', 'gasto') THEN lper.ultima_fecha ELSE lcut.ultima_fecha END AS ultima_fecha_contable,
           'SIN_FUENTE' AS calidad,
           'NO CONCILIABLE — FALTA FUENTE OPERACIONAL: ninguna tabla operativa independiente respalda esta cuenta (sin módulo documental que la genere).' AS metodologia,
           ARRAY[]::text[] AS fuentes,
           NULL::jsonb AS detalle,
           c.sort_order AS orden
    FROM public.fin_categories c
    LEFT JOIN LATERAL (SELECT ls.saldo, ls.movimientos, ls.ultima_fecha
                         FROM public.fin_ledger_saldo(p_store_id, c.code, v_gen, v_hist, p_as_of) ls) lcut ON true
    LEFT JOIN LATERAL (SELECT ls.saldo, ls.movimientos, ls.ultima_fecha
                         FROM public.fin_ledger_saldo(p_store_id, c.code, v_gen, p_from, p_to) ls) lper ON true
    WHERE c.is_active AND NOT EXISTS (SELECT 1 FROM op o WHERE o.cuenta = c.code)
  )
  SELECT jsonb_build_object(
    'ejecucion', jsonb_build_object(
      'calculado_en', now(),
      'fecha_corte', p_as_of,
      'desde', p_from, 'hasta', p_to,
      'generacion', (SELECT jsonb_build_object('id', id, 'code', code)
                     FROM public.fin_posting_generations WHERE id = v_gen),
      'metodologia_version', v_met_ver,
      'fuentes_actualizadas', jsonb_build_object(
        'products', (SELECT max(updated_at)::text FROM public.products WHERE store_id = p_store_id),
        'inventory', (SELECT max(updated_at)::text FROM public.inventory WHERE store_id = p_store_id),
        'stock_movements', (SELECT max(created_at)::text FROM public.stock_movements WHERE store_id = p_store_id),
        'kardex_entries', (SELECT max(created_at)::text FROM public.kardex_entries WHERE store_id = p_store_id),
        'payment_transactions', (SELECT max(created_at)::text FROM public.payment_transactions WHERE store_id = p_store_id),
        'transactions', (SELECT max(created_at)::text FROM public.transactions WHERE store_id = p_store_id),
        'receipts', (SELECT max(created_at)::text FROM public.receipts WHERE store_id = p_store_id),
        'received_services', (SELECT max(created_at)::text FROM public.received_services WHERE store_id = p_store_id),
        'issue_slips', (SELECT max(created_at)::text FROM public.issue_slips WHERE store_id = p_store_id),
        'production_orders', (SELECT max(updated_at)::text FROM public.production_orders WHERE store_id = p_store_id),
        'fin_entries', (SELECT max(posted_at)::text FROM public.fin_entries
                         WHERE store_id = p_store_id AND generation_id IS NOT DISTINCT FROM v_gen)),
      'convention', 'Diferencia = valor operacional − valor contable (naturaleza-aware).'),
    'resumen', jsonb_build_object(
      'conciliadas', count(*) FILTER (WHERE r.estado = 'CONCILIADO'),
      'diferencias', count(*) FILTER (WHERE r.estado = 'DIFERENCIA'),
      'alertas', count(*) FILTER (WHERE r.estado = 'ALERTA'),
      'incompletas', count(*) FILTER (WHERE r.estado = 'INCOMPLETO'),
      'no_conciliables', count(*) FILTER (WHERE r.estado = 'NO_CONCILIABLE'),
      'pendientes', count(*) FILTER (WHERE r.estado = 'PENDIENTE'),
      'documentos_pendientes', coalesce((SELECT sum(n) FROM docs_pend), 0),
      'movimientos_sin_respaldo', coalesce((SELECT sum(n) FROM sin_resp), 0)),
    'hallazgos', jsonb_build_object(
      'documentos_pendientes', coalesce((SELECT jsonb_agg(jsonb_build_object('tipo', tipo, 'pendientes', n)
                          ORDER BY tipo) FROM docs_pend WHERE n > 0), '[]'::jsonb),
      'movimientos_sin_respaldo', coalesce((SELECT jsonb_agg(jsonb_build_object('tipo', tipo, 'n', n)
                          ORDER BY tipo) FROM sin_resp), '[]'::jsonb),
      'ventas_con_fallback_usd', max(fb.n)),
    'cuentas', coalesce(jsonb_agg(row_to_json(r) ORDER BY r.orden), '[]'::jsonb))
  INTO v_res
  FROM final_rows r, fb;

  RETURN v_res;
END $function$;

REVOKE ALL ON FUNCTION public.fin_get_reconciliation(p_store_id uuid, p_as_of date, p_from date, p_to date, p_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_get_reconciliation(p_store_id uuid, p_as_of date, p_from date, p_to date, p_user_id uuid) TO service_role;

-- ============================================================================
-- Rollback: 20261128153000_rollback_cp_fin_f2.sql
-- Restaura SELECT amplio (has_store_access) en fin_entries/fin_movements/fin_opening_balances y fin_posting_errors
-- NO borra asientos ni movimientos; NO toca tablas comerciales. Solo restaura
-- políticas, funciones, privilegios y triggers al estado previo del 2026-11-28.
-- ============================================================================

DROP POLICY IF EXISTS fin_entries_select ON public.fin_entries;
CREATE POLICY fin_entries_select ON public.fin_entries
  FOR SELECT TO authenticated USING (is_admin() OR has_store_access(store_id));

DROP POLICY IF EXISTS fin_movements_select ON public.fin_movements;
CREATE POLICY fin_movements_select ON public.fin_movements
  FOR SELECT TO authenticated USING (is_admin() OR has_store_access(store_id));

DROP POLICY IF EXISTS fin_opening_select ON public.fin_opening_balances;
CREATE POLICY fin_opening_select ON public.fin_opening_balances
  FOR SELECT TO authenticated USING (is_admin() OR has_store_access(store_id));

DROP POLICY IF EXISTS fin_post_err_select ON public.fin_posting_errors;
CREATE POLICY fin_post_err_select ON public.fin_posting_errors
  FOR SELECT TO authenticated USING ((store_id IS NULL) OR is_admin() OR has_store_access(store_id));

DROP POLICY IF EXISTS fin_post_err_update ON public.fin_posting_errors;
CREATE POLICY fin_post_err_update ON public.fin_posting_errors
  FOR UPDATE TO authenticated
  USING ((store_id IS NULL) OR is_admin() OR has_store_role(store_id, ARRAY['admin']))
  WITH CHECK ((store_id IS NULL) OR is_admin() OR has_store_role(store_id, ARRAY['admin']));

-- ═══ ASERCIONES RESTORE (estado vulnerable de vuelta = rollback correcto) ══
SET LOCAL ROLE postgres;
SET LOCAL request.jwt.claims TO '{}';
DO $rs1$
DECLARE v text; v_r numeric;
BEGIN
  SELECT qual INTO v FROM pg_policies WHERE policyname='fin_entries_select';
  IF position('has_store_access' in coalesce(v,'')) = 0 THEN RAISE EXCEPTION 'RS-1 FAILED: política no restaurada'; END IF;
  SELECT prosrc INTO v FROM pg_proc WHERE proname='fin_get_balance_sheet';
  IF position('has_store_access_as' in v) = 0 THEN RAISE EXCEPTION 'RS-2 FAILED: RPC sin patrón previo'; END IF;
  SELECT public.fin_entry_reversal_residual('664cc579-d6a3-44ae-9c65-6cff711288b2') INTO v_r;
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

DO $rs6$
DECLARE v_err text; v_state text;
BEGIN
  BEGIN
    UPDATE public.receipts SET status='voided' WHERE id='aab2041a-a164-49c9-b32e-60b375b451a0';
  EXCEPTION WHEN others THEN v_err := SQLERRM; v_state := SQLSTATE; END;
  IF v_err IS NULL OR (position('ERR_PARTIAL_REVERSAL_PENDING' in v_err) = 0 AND coalesce(v_state,'') <> 'ERR_PARTIAL_REVERSAL_PENDING') THEN
    RAISE EXCEPTION 'CASE rs6 FAILED: se esperaba ERR_PARTIAL_REVERSAL_PENDING, obtuve [%] %', v_state, coalesce(v_err, 'SIN ERROR');
  END IF;
END $rs6$;
-- (RC1 fue anulada en f5b; RC2 sigue pending: bajo el estado previo la
-- reversión parcial de la generación ACTIVA bloquea — comportamiento viejo restaurado)
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"08b08515-be1a-49f8-ab92-884d55eec42d","role":"authenticated"}';
DO $rs7$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.fin_entries WHERE store_id='83ad8cc2-e75a-443f-a61d-9ee6a5020107';
  IF v < 1 THEN RAISE EXCEPTION 'RS-7 FAILED: la política amplia no volvió'; END IF;
END $rs7$;

SELECT 'BATTERY-PASS' AS verdict;

ROLLBACK;
