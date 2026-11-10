-- =====================================================================
-- 20261110120000_cp_infra_020_truncate_breaker.sql — CP-INFRA-020 T4 (D4.1)
-- DESTRUCTIVE-OK: CP-INFRA-020 (la única 'sentencia' destructiva posible es
-- el DROP TRIGGER IF EXISTS idempotente de la propia reinstalación; el
-- archivo NO ejecuta TRUNCATE/DROP de datos: los PREVIENE. Mencionar
-- session_replication_role en comentarios no es una sentencia.)
-- Freno de TRUNCATE: un TRUNCATE accidental sobre tablas críticas FALLA
-- incluso con session_replication_role='replica' (trigger ENABLE ALWAYS).
--
-- ESTADO: PREPARADA — NO APLICADA a producción. Su aplicación exige la
-- compuerta literal `AUTORIZO BREAKER PROD` del propietario (D4.6/G) y debe
-- registrarse como fila en public.production_migration_ledger.
--
-- Prerrequisitos verificados [MEDIDO 2026-11-10, solo lectura]:
--   · 0 funciones public con TRUNCATE en prosrc (pg_proc);
--   · 0 triggers BEFORE TRUNCATE previos (pg_trigger);
--   · 0 usos de TRUNCATE en la app y en scripts operativos (grep);
--   · ningún job programado usa TRUNCATE (sin pg_cron; Vercel cron usa
--     purge_old_reset_snapshots = DELETE acotado);
--   · los REVOKE TRUNCATE existentes (audit_logs, stock_movements; tenants
--     para anon) se MANTIENEN — este freno los complementa, no los reemplaza.
--
-- Lista de tablas (D4.2): (tablas que los scripts demo truncan) ∩ (existentes
-- en producción) ∩ (negocio y auditoría) + tenants. 33 tablas. Ver
-- docs/OPERATIONS/SUPERFICIE_DESTRUCTIVA.md.
--
-- Bypass documentado (D4.5): BEGIN; SET LOCAL costpro.allow_truncate='on';
-- TRUNCATE ...; COMMIT; — solo para mantenimiento consciente del propietario,
-- registrado en el ledger. El bypass NO queda activado por defecto.
-- Rollback (D4.6): ver bloque final del archivo.
--
-- Idempotente y fail-closed: si una tabla crítica no existe, el DO lo
-- REPORTA con RAISE y NO instala su trigger (una tabla ausente no se
-- protege en silencio). Re-ejecutar tras crear la tabla.
-- =====================================================================

-- 1) Función del freno. SECURITY INVOKER + search_path fijo: sin elevación,
--    sin invocación directa desde la app (no se le hace GRANT a anon/auth).
create or replace function public.block_truncate()
returns trigger
language plpgsql
security invoker
set search_path = 'public', 'pg_temp'
as $$
begin
    -- Único bypass: GUC de sesión/transacción explícita. current_setting(..., true)
    -- devuelve NULL si no está definida (fail-closed: cualquier error → bloquea).
    if coalesce(current_setting('costpro.allow_truncate', true), 'off') <> 'on' then
        raise exception 'ERR_TRUNCATE_BLOQUEADO: TRUNCATE sobre % está bloqueado por CP-INFRA-020 (freno anti-borrado-masivo). Si es mantenimiento consciente: BEGIN; SET LOCAL costpro.allow_truncate = ''on''; TRUNCATE ...; COMMIT; y registra el acto en production_migration_ledger o en un acta.',
            tg_table_name
            using errcode = 'P0001';
    end if;
    return null;  -- BEFORE TRUNCATE ... FOR EACH STATEMENT: el valor se ignora
end;
$$;

comment on function public.block_truncate() is
    'CP-INFRA-020 freno de TRUNCATE: bloquea TRUNCATE en tablas críticas salvo SET costpro.allow_truncate=on. Trigger ENABLE ALWAYS: dispara también con session_replication_role=replica.';

-- 2) Un trigger BEFORE TRUNCATE FOR EACH STATEMENT por tabla, ENABLE ALWAYS
--    (dispara incluso con triggers deshabilitados / modo replica).
do $$
declare
    v_tabla text;
    v_faltan text[];
    v_tablas text[] := array[
        -- identidad y tenencia
        'tenants', 'stores', 'profiles', 'user_store_memberships',
        -- catálogo
        'products', 'product_variants', 'categories', 'suppliers', 'units_of_measure',
        -- ventas y líneas
        'transactions', 'transaction_items', 'sales', 'sale_items',
        -- inventario
        'inventory', 'inventory_movements', 'inventory_batches', 'inventory_snapshots',
        'inventory_adjustments', 'inventory_adjustment_items',
        'stock_movements',
        -- caja
        'cash_closures', 'cash_movements', 'cash_register_sessions',
        -- compras y recepciones
        'purchase_orders', 'purchase_items', 'receipts', 'receipt_items',
        -- transferencias
        'transfers', 'transfer_items',
        -- auditoría e integridad
        'audit_logs', 'business_events',
        -- operativas (sin caché/temporales: solo persistidas de negocio)
        'commission_rules', 'idempotency_keys', 'sync_log'
    ];
begin
    foreach v_tabla in array v_tablas
    loop
        if to_regclass('public.' || v_tabla) is null then
            v_faltan := array_append(v_faltan, v_tabla);
        else
            execute format(
                'drop trigger if exists trg_cp_infra_020_block_truncate on public.%I;',
                v_tabla);
            execute format(
                'create trigger trg_cp_infra_020_block_truncate
                    before truncate on public.%I
                    for each statement
                    execute function public.block_truncate();',
                v_tabla);
            -- ENABLE ALWAYS: dispara también con session_replication_role='replica'
            -- y con ALTER TABLE ... DISABLE TRIGGER USER.
            execute format(
                'alter table public.%I enable always trigger trg_cp_infra_020_block_truncate;',
                v_tabla);
        end if;
    end loop;

    if array_length(v_faltan, 1) is not null then
        raise warning 'CP-INFRA-020: tablas del freno AUSENTES (sin proteger, revisar): %', array_to_string(v_faltan, ', ');
    end if;
end;
$$;

-- =====================================================================
-- ROLLBACK (D4.6) — ejecutar solo como parte de una decisión consciente:
--   do $$
--   declare r record;
--   begin
--     for r in select event_object_table as t from information_schema.triggers
--              where trigger_name = 'trg_cp_infra_020_block_truncate'
--     loop
--       execute format('drop trigger if exists trg_cp_infra_020_block_truncate on public.%I;', r.t);
--     end loop;
--   end $$;
--   drop function if exists public.block_truncate();
-- Verificación posterior (catálogo, solo lectura):
--   select count(*) from information_schema.triggers
--    where trigger_name = 'trg_cp_infra_020_block_truncate';          -- esperado: 33
--   select tgrelid::regclass, tgenabled from pg_trigger
--    where tgname = 'trg_cp_infra_020_block_truncate';                -- esperado: 'O' (always)
-- =====================================================================
