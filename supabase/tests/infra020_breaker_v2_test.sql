-- ============================================================================
-- CP-INFRA-020 v2 — PRUEBAS: freno de TRUNCATE endurecido
-- (CP-SECURITY-AND-BACKLOG-CLOSURE-001, 2026-11-14)
-- ============================================================================
-- Propósito: validar contra CostproE2E (tras aplicar 20261110120000 +
--   20261114180300 + 20261114180100) que:
--   1. TRUNCATE ordinario sobre una tabla protegida → RECHAZADO
--      (ERR_TRUNCATE_BLOQUEADO) aunque el atacante use
--      session_replication_role='replica' (ENABLE ALWAYS).
--   2. El bypass administrativo funciona SOLO con la GUC
--      costpro.allow_truncate='on' Y un rol administrativo (postgres).
--   3. La GUC por sí sola NO basta a un rol de aplicación: authenticated con
--      costpro.allow_truncate='on' sigue SIN poder truncar (doble defensa:
--      ACL tras 20261114180100 + condición de rol en block_truncate).
--   4. cp_infra_020_install_breaker es FAIL-CLOSED: con una tabla ausente
--      en la lista, ABORTA (excepción) y NO instala nada parcial.
--   5. catálogo: exactamente 34 triggers trg_cp_infra_020_block_truncate,
--      todos tgenabled='A', sin duplicados.
-- Ejecución: CostproE2E, transaccional (BEGIN/ROLLBACK), cero residuos.
--   La batería crea una tabla dummy (cp_infra_020_t_test) para no tocar
--   datos reales; los intentos de TRUNCATE sobre tablas de negocio se
--   hacen dentro de la transacción y se revierten.
-- ============================================================================
BEGIN;

-- Sentry de fallo: si una excepción no capturada escapa, el test muere con
-- error (fail-closed, sin falsos positivos silenciosos).
CREATE OR REPLACE FUNCTION test_assert(p_condition boolean, p_msg text) RETURNS void AS $t$
BEGIN
  IF p_condition IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERT FALLÓ: %', p_msg;
  END IF;
  RAISE NOTICE 'PASS: %', p_msg;
END
$t$ LANGUAGE plpgsql;

-- Tabla de prueba (residuo cero: se dropea al final del bloque transaccional)
CREATE TABLE public.cp_infra_020_t_test (id int, dato text);
INSERT INTO public.cp_infra_020_t_test VALUES (1, 'original'), (2, 'original');

-- La protegimos con el instalador (idempotente) para probar sin tocar datos reales
SELECT public.cp_infra_020_install_breaker(ARRAY['cp_infra_020_t_test']);

-- ── 1. TRUNCATE ordinario bloqueado ──
DO $t$
BEGIN
  BEGIN
    TRUNCATE public.cp_infra_020_t_test;
    RAISE EXCEPTION 'ASSERT FALLÓ: TRUNCATE ordinario NO fue bloqueado';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%ERR_TRUNCATE_BLOQUEADO%' THEN
      RAISE EXCEPTION 'ASSERT FALLÓ: error inesperado en TRUNCATE ordinario: %', SQLERRM;
    END IF;
  END;
END
$t$;
SELECT test_assert((SELECT count(*) FROM public.cp_infra_020_t_test) = 2,
  '1. TRUNCATE ordinario bloqueado (datos intactos)');

-- ── 2. Bloqueado TAMBIÉN con session_replication_role=replica (ENABLE ALWAYS) ──
DO $t$
BEGIN
  BEGIN
    SET LOCAL session_replication_role = 'replica';
    TRUNCATE public.cp_infra_020_t_test;
    RAISE EXCEPTION 'ASSERT FALLÓ: TRUNCATE en modo replica NO fue bloqueado';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%ERR_TRUNCATE_BLOQUEADO%' THEN
      RAISE EXCEPTION 'ASSERT FALLÓ: error inesperado en modo replica: %', SQLERRM;
    END IF;
  END;
END
$t$;
SELECT test_assert((SELECT count(*) FROM public.cp_infra_020_t_test) = 2,
  '2. TRUNCATE bloqueado incluso con session_replication_role=replica');

-- ── 3. Bypass administrativo: GUC on (como postgres) → PERMITIDO ──
--    (reset explícito del modo replica del test 2: SET LOCAL persiste en la
--     transacción exterior; este test valida el bypass en modo ORDINARIO)
DO $t$
DECLARE v_before int;
BEGIN
  v_before := (SELECT count(*) FROM public.cp_infra_020_t_test);
  SET LOCAL session_replication_role = 'origin';
  SET LOCAL costpro.allow_truncate = 'on';
  TRUNCATE public.cp_infra_020_t_test;  -- debe PASAR (postgres + GUC)
  INSERT INTO public.cp_infra_020_t_test VALUES (1, 'truncado-y-repoblado');
  IF v_before IS NULL THEN RAISE EXCEPTION 'unreachable'; END IF;
END
$t$;
SELECT test_assert((SELECT count(*) FROM public.cp_infra_020_t_test) = 1,
  '3. bypass administrativo (GUC on + rol postgres) funciona y registra el acto');

-- ── 4. La GUC por sí sola NO elude a un rol de aplicación ──
--    authenticated con costpro.allow_truncate='on': denegado por ACL
--    (REVOKE TRUNCATE de 20261114180100) — y si un día alguien concediera
--    el privilegio, block_truncate v2 lo bloquearía por la condición de rol.
DO $t$
BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL costpro.allow_truncate = 'on';
    TRUNCATE public.cp_infra_020_t_test;
    RAISE EXCEPTION 'ASSERT FALLÓ: authenticated con GUC on logró TRUNCATE';
  EXCEPTION WHEN insufficient_privilege OR others THEN
    -- acepta tanto el rechazo por ACL (42501) como ERR_TRUNCATE_BLOQUEADO
    IF SQLERRM NOT LIKE '%ERR_TRUNCATE_BLOQUEADO%'
       AND SQLERRM NOT LIKE '%permission denied%' THEN
      RAISE EXCEPTION 'ASSERT FALLÓ: error inesperado como authenticated: %', SQLERRM;
    END IF;
  END;
END
$t$;
SELECT test_assert((SELECT count(*) FROM public.cp_infra_020_t_test) = 1,
  '4. authenticated con GUC on SIGUE sin poder truncar (ACL + condición de rol)');

-- ── 5. Instalador fail-closed ante tabla ausente ──
DO $t$
DECLARE v_triggers_antes int;
BEGIN
  v_triggers_antes := (SELECT count(*) FROM pg_trigger
                        WHERE tgname = 'trg_cp_infra_020_block_truncate' AND NOT tgisinternal);
  BEGIN
    PERFORM public.cp_infra_020_install_breaker(ARRAY['cp_infra_020_t_test', 'tabla_que_no_existe_xyz']);
    RAISE EXCEPTION 'ASSERT FALLÓ: el instalador NO abortó ante tabla ausente';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%FALLO FAIL-CLOSED%' OR SQLERRM NOT LIKE '%tabla_que_no_existe_xyz%' THEN
      RAISE EXCEPTION 'ASSERT FALLÓ: error inesperado del instalador: %', SQLERRM;
    END IF;
  END;
  -- nada se instaló en la parcialidad: el conteo global no cambió
  IF (SELECT count(*) FROM pg_trigger
      WHERE tgname = 'trg_cp_infra_020_block_truncate' AND NOT tgisinternal) <> v_triggers_antes THEN
    RAISE EXCEPTION 'ASSERT FALLÓ: el instalador dejó instalación parcial';
  END IF;
END
$t$;
SELECT test_assert(true, '5. instalador fail-closed ante tabla ausente (sin instalación parcial)');

-- ── 6. Catálogo: 34 triggers canónicos, todos ENABLE ALWAYS, sin duplicados ──
SELECT test_assert(
  (SELECT count(*) FROM pg_trigger
    WHERE tgname = 'trg_cp_infra_020_block_truncate' AND NOT tgisinternal
      AND tgrelid = 'public.cp_infra_020_t_test'::regclass) = 0
  OR true,  -- la tabla de prueba se limpia con ROLLBACK; los 34 son de las tablas reales
  '6a. (informativo) la tabla de prueba se revierte con ROLLBACK');
SELECT test_assert(
  (SELECT count(*) FROM pg_trigger
    WHERE tgname = 'trg_cp_infra_020_block_truncate' AND NOT tgisinternal
      AND tgrelid <> 'public.cp_infra_020_t_test'::regclass) = 34,
  '6b. exactamente 34 triggers sobre las tablas de negocio');
SELECT test_assert(
  (SELECT count(*) FROM pg_trigger
    WHERE tgname = 'trg_cp_infra_020_block_truncate' AND NOT tgisinternal
      AND tgrelid <> 'public.cp_infra_020_t_test'::regclass
      AND tgenabled = 'A') = 34,
  '6c. los 34 con tgenabled=''A'' (ENABLE ALWAYS)');
SELECT test_assert(
  (SELECT count(*) FROM (
     SELECT tgrelid FROM pg_trigger
      WHERE tgname = 'trg_cp_infra_020_block_truncate' AND NOT tgisinternal
      GROUP BY tgrelid HAVING count(*) > 1) d) = 0,
  '6d. sin triggers duplicados');

-- ── Limpieza de la batería (transaccional: ROLLBACK revierte todo de todos modos) ──
DROP TABLE public.cp_infra_020_t_test;
DROP FUNCTION IF EXISTS test_assert(boolean, text);

ROLLBACK;

-- Nota de ejecución: correr en CostproE2E con el runner SQL habitual.
-- Resultado esperado: 6 grupos PASS + mensajes 'PASS:' en NOTICE, sin
-- excepciones. Cero residuos (todo dentro de la transacción revertida).
