-- DECLARED FINAL STATE (Git) de lock_fiscal_period
-- fuente: 20260909000004_rem_f4_06c_fiscal_close_rpc_contract.sql stmt#3

CREATE OR REPLACE FUNCTION public.lock_fiscal_period(
    p_store_id UUID,
    p_year INTEGER,
    p_month INTEGER,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_role TEXT;
    -- Patrón canónico anti-spoofing v2_12_9: bajo service_role la identidad la
    -- provee el código servidor (route.ts ← sesión NextAuth); bajo authenticated,
    -- el JWT del propio usuario. Nunca confianza en identidad enviada por cliente.
    v_admin_id UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid())
                            ELSE auth.uid() END;
BEGIN
    -- REM-F4-06c (§19): puente de identidad transaccional para que la auditoría
    -- por trigger (audit_fiscal_closings_changes → auth.uid()) registre el ACTOR
    -- real también en la vía HTTP service_role (canónico del codebase:
    -- CREATE_SALE_V2 audit 100% con actor). Valor SOLO server-side; local a la txn.
    IF v_admin_id IS NOT NULL THEN
        PERFORM set_config('request.jwt.claims',
            json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_admin_id;
    IF v_role != 'admin' THEN
        RAISE EXCEPTION 'ERR_ADMIN_ONLY: Solo admin puede bloquear periodos fiscales';
    END IF;

    UPDATE public.fiscal_closings
    SET status = 'locked', locked_by = v_admin_id, locked_at = now(), updated_at = now()
    WHERE store_id = p_store_id AND period_year = p_year AND period_month = p_month AND status = 'closed';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_NOT_CLOSED: El periodo debe estar cerrado antes de bloquearse';
    END IF;

    RETURN jsonb_build_object('status', 'success', 'message', 'Periodo bloqueado');
END;
$function$
