-- ============================================================================
-- ⚠️ ESTE SCRIPT BORRA TODOS LOS DATOS. SOLO PARA UNA BD DESECHABLE. ⚠️
-- ⚠️ NUNCA EN PRODUCCIÓN. NUNCA EN CostproBD NI EN CostproE2E.           ⚠️
-- ============================================================================
-- OBSOLETO — NO EJECUTAR.
-- DEMO_RESET_SCRIPT_V3.sql fue retirado de servicio por CP-INFRA-020.
-- Motivo: variante mínima v3.0 sin catálogo enriquecido; superseded por reset_demo_data_pro.sql
-- Se conserva solo como referencia histórica. El script mantenido es
-- supabase/scripts/reset_demo_data_pro.sql.
-- El guard de abajo bloquea su ejecución fuera de una BD desechable.
-- ============================================================================
-- COSTPRO-GUARD-DESTRUCTIVO v1
BEGIN;

DO $guard$
DECLARE
    v_centinela regprocedure;
    v_ledger regclass;
    v_es_aislada boolean;
BEGIN
    -- Fail-closed: ante cualquier duda se aborta. Comprueba, en orden:
    -- (a) existe la centinela; (b) devuelve true; (c) NO existe el libro de
    -- migraciones de producción.
    BEGIN
        v_centinela := to_regprocedure('public.e2e_is_isolated_db()');
    EXCEPTION WHEN OTHERS THEN
        v_centinela := NULL;
    END;

    IF v_centinela IS NULL THEN
        RAISE EXCEPTION 'GUARD_DESTRUCTIVO: esta BD no está marcada como desechable (no existe public.e2e_is_isolated_db). ESTE SCRIPT BORRA TODOS LOS DATOS: ejectútalo solo en una BD desechable. Cómo prepararla: supabase/scripts/README.md (sección centinela de supabase/e2e-bootstrap.sql). Producción (CostproBD) y CostproE2E quedan bloqueadas por diseño.'
            USING HINT = 'Verificar con: select to_regprocedure(''public.e2e_is_isolated_db()''); — debe devolver una función, no NULL.';
    END IF;

    BEGIN
        EXECUTE 'SELECT public.e2e_is_isolated_db()' INTO v_es_aislada;
    EXCEPTION WHEN OTHERS THEN
        v_es_aislada := NULL;
    END;

    IF v_es_aislada IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'GUARD_DESTRUCTIVO: la centinela public.e2e_is_isolated_db() no devolvió true (devolvió %). Solo una BD desechable puede ejecutar este script. Ver supabase/scripts/README.md.', v_es_aislada;
    END IF;

    BEGIN
        v_ledger := to_regclass('public.production_migration_ledger');
    EXCEPTION WHEN OTHERS THEN
        v_ledger := NULL;
    END;

    IF v_ledger IS NOT NULL THEN
        RAISE EXCEPTION 'GUARD_DESTRUCTIVO: existe public.production_migration_ledger — esta BD es PRODUCCIÓN. Abortado sin tocar una sola fila. Si crees que es un error, revisa la identidad del proyecto antes de cualquier otra cosa.'
            USING HINT = 'Producción NO es banco de pruebas: docs/OPERATIONS/REGLA_PRODUCCION_NO_ES_BANCO_DE_PRUEBAS.md';
    END IF;
END
$guard$;

-- ══════════════ CONTENIDO ORIGINAL (OBSOLETO, REFERENCIA HISTÓRICA) ════════
BEGIN;
    -- Professional Demo Reset Script v3.0
    -- Optimized for User-Store Consistency and Role-based assignments.

    SET session_replication_role = 'replica'; -- Disable triggers temporarily for bulk load

    DO $$
    DECLARE
        -- Stores
        s1 uuid := 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
        s2 uuid := 'b2c4ba0e-5767-4ba0-e576-7d1c4ba0e576';

        -- Users
        u_adm uuid := 'a1111111-1111-1111-1111-111111111111';
        u_enc uuid := 'e2222222-2222-2222-2222-222222222222';
        u_caj uuid := 'c3333333-3333-3333-3333-333333333333';
        u_alm uuid := 'b4444444-4444-4444-4444-444444444444';
        u_cos uuid := 'd5555555-5555-5555-5555-555555555555';

        pwd text;
    BEGIN
        -- 1. STORES
        INSERT INTO public.stores (id, name, address, is_active) VALUES
            (s1, 'TIENDA CENTRAL COSTPRO', 'Av. Libertad 1234, CABA', true),
            (s2, 'SUCURSAL BELGRANO', 'Av. Cabildo 2500, CABA', true)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = true;

        pwd := extensions.crypt('demo123', extensions.gen_salt('bf'));

        -- 2. AUTH USERS
        INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
        VALUES
            (u_adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@demo.com', pwd, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Admin Global"}', now(), now(), '', '', '', ''),
            (u_enc, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'encargado@demo.com', pwd, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Gerente Sucursal"}', now(), now(), '', '', '', ''),
            (u_caj, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cajero@demo.com', pwd, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Cajero Central"}', now(), now(), '', '', '', ''),
            (u_alm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'almacen@demo.com', pwd, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Almacenero Central"}', now(), now(), '', '', '', ''),
            (u_cos, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'costo@demo.com', pwd, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Especialista de Costos"}', now(), now(), '', '', '', '')
        ON CONFLICT (id) DO NOTHING;

        -- 3. PROFILES (Initial)
        INSERT INTO public.profiles (id, email, full_name, role, store_id, active_store_id, is_active)
        VALUES
            (u_adm, 'admin@demo.com', 'Admin Global', 'admin'::user_role, s1, s1, true),
            (u_enc, 'encargado@demo.com', 'Gerente Sucursal', 'encargado'::user_role, s1, s1, true),
            (u_caj, 'cajero@demo.com', 'Cajero Central', 'clerk'::user_role, s1, s1, true),
            (u_alm, 'almacen@demo.com', 'Almacenero Central', 'warehouse'::user_role, s1, s1, true),
            (u_cos, 'costo@demo.com', 'Especialista de Costos', 'costo'::user_role, NULL, NULL, true)
        ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, active_store_id = EXCLUDED.active_store_id, is_active = true;

        -- 4. MEMBERSHIPS
        INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
        VALUES
            (u_adm, s1, 'admin'::user_role, 'active'::membership_status),
            (u_adm, s2, 'admin'::user_role, 'active'::membership_status),
            (u_enc, s1, 'encargado'::user_role, 'active'::membership_status),
            (u_caj, s1, 'clerk'::user_role, 'active'::membership_status),
            (u_alm, s1, 'warehouse'::user_role, 'active'::membership_status)
        ON CONFLICT (user_id, store_id) DO UPDATE SET status = 'active';

    END $$;

    SET session_replication_role = 'origin';
    -- [CP-INFRA-020] NOTIFY extraído: no es transaccional; se ejecuta tras COMMIT si el guard pasó
COMMIT;
-- ══════════════ FIN DEL CONTENIDO ORIGINAL ═════════════════════════════════

COMMIT;
-- Recarga de caché de PostgREST (no transaccional): solo llega aquí si el guard pasó.
NOTIFY pgrst, 'reload schema';
