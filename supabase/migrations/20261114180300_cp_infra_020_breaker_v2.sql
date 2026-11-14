-- ═══════════════════════════════════════════════════════════════════════════
-- CP-INFRA-020 v2 — FRENO DE TRUNCATE: CORRECCIÓN DEL DEFECTO Y ENDURECIMIENTO
-- Misión CP-SECURITY-AND-BACKLOG-CLOSURE-001 (2026-11-14)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- DEFECTOS DE 20261110120000 CORREGIDOS AQUÍ (sin modificar aquella
-- migración: ya forma parte del replay E2E certificado):
--
--   D1 — comprobación de tablas ausentes NO era fail-closed: usaba
--        RAISE WARNING y dejaba una protección PARCIAL en silencio (el
--        comentario del propio archivo prometía lo contrario). Aquí:
--        RAISE EXCEPTION con la lista exacta de tablas faltantes. La
--        instalación NO puede dejar una protección parcial.
--   D2 — el bypass por GUC (costpro.allow_truncate) podía, en teoría, ser
--        activado por CUALQUIER sesión capaz de ejecutar SET. Aquí el
--        bypass exige ADEMÁS que current_user NO sea un rol de aplicación
--        (anon/authenticated): los usuarios de la app JAMÁS pueden eludir
--        la protección, ni hoy ni si un futuro RPC expusiera la GUC.
--        El bypass queda reservado a operaciones administrativas legítimas
--        (postgres / service_role / roles administrativos con conexión
--        directa), documentadas en docs/OPERATIONS/BYPASS_FRENO_TRUNCATE.md.
--   D3 — el comentario de la migración original decía «33 tablas» cuando
--        el array tiene 34. La verificación exige EXACTAMENTE 34 triggers.
--
-- ESTADO (2026-11-14 [MEDIDO]): ni la función block_truncate ni los
--   triggers existen en producción. La aplicación a producción de esta
--   familia (20261110120000 + este archivo) sigue pendiente de la compuerta
--   literal `AUTORIZO BREAKER PROD` del propietario. ESTE ARCHIVO NO SE
--   APLICA A PRODUCCIÓN EN ESTA MISIÓN.
--
-- CONTENIDO (autocontenido e idempotente — reinstala todo):
--   1) block_truncate() v2: SECURITY INVOKER, search_path fijo, bypass
--      restringido por rol + GUC, error con código estable y mensaje útil.
--   2) cp_infra_020_install_breaker(p_tablas): instalación testeable —
--      fall-closed si falta CUALQUIER tabla (nada se instala en ese caso),
--      idempotente (drop+create+ENABLE ALWAYS por tabla).
--   3) Invocación con la lista canónica de 34 tablas.
--   4) Verificación fail-closed: 34 triggers, todos tgenabled='A', sin
--      duplicados.
--
-- Rollback: igual que 20261110120000 (drop de los triggers + drop function
--   block_truncate + drop function cp_infra_020_install_breaker).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Función del freno (v2). SECURITY INVOKER + search_path fijo: sin
--    elevación; no se hace GRANT a anon/authenticated (y aunque alguien
--    la llamara directamente, una función trigger no ejecuta fuera de un
--    trigger).
create or replace function public.block_truncate()
returns trigger
language plpgsql
security invoker
set search_path = 'public', 'pg_temp'
as $$
begin
    -- Bypass ÚNICO y DOBLEMENTE restringido:
    --   (a) GUC explícita de sesión/transacción: costpro.allow_truncate='on'
    --   (b) current_user NO es un rol de aplicación (anon/authenticated).
    -- current_setting(..., true) devuelve NULL si no está definida
    -- (fail-closed: cualquier error → bloquea).
    if coalesce(current_setting('costpro.allow_truncate', true), 'off') <> 'on'
       or current_user in ('anon', 'authenticated') then
        raise exception 'ERR_TRUNCATE_BLOQUEADO: TRUNCATE sobre % está bloqueado por CP-INFRA-020 (freno anti-borrado-masivo; los roles de aplicación no pueden eludirlo). Mantenimiento consciente del propietario: BEGIN; SET LOCAL costpro.allow_truncate = ''on''; TRUNCATE ...; COMMIT; con rol administrativo, y registrar el acto en production_migration_ledger o en un acta.',
            tg_table_name
            using errcode = 'P0001',
            hint = 'Ver docs/OPERATIONS/BYPASS_FRENO_TRUNCATE.md';
    end if;
    return null;  -- BEFORE TRUNCATE ... FOR EACH STATEMENT: el valor se ignora
end;
$$;

comment on function public.block_truncate() is
  'CP-INFRA-020 v2 freno de TRUNCATE: bloquea TRUNCATE en las 34 tablas críticas. Bypass solo para roles administrativos (nunca anon/authenticated) con SET costpro.allow_truncate=on. Trigger ENABLE ALWAYS: dispara también con session_replication_role=replica.';

-- 2) Instalación testeable del freno (fail-closed ante tablas ausentes)
create or replace function public.cp_infra_020_install_breaker(p_tablas text[])
returns int
language plpgsql
security invoker
set search_path = 'public', 'pg_temp'
as $$
declare
    v_tabla text;
    v_faltan text[];
    v_instaladas int := 0;
begin
    -- Comprobación previa COMPLETA: nada se instala si falta una tabla
    -- (una tabla ausente no queda silenciosamente sin proteger).
    foreach v_tabla in array p_tablas
    loop
        if to_regclass('public.' || v_tabla) is null then
            v_faltan := array_append(v_faltan, v_tabla);
        end if;
    end loop;

    if array_length(v_faltan, 1) is not null then
        raise exception 'CP-INFRA-020-v2: FALLO FAIL-CLOSED — tablas requeridas AUSENTES (no se instala protección parcial): %. Crear las tablas y re-ejecutar.',
            array_to_string(v_faltan, ', ')
            using errcode = 'P0001';
    end if;

    -- Instalación idempotente (drop + create + enable always)
    foreach v_tabla in array p_tablas
    loop
        execute format('drop trigger if exists trg_cp_infra_020_block_truncate on public.%I;', v_tabla);
        execute format(
            'create trigger trg_cp_infra_020_block_truncate
                before truncate on public.%I
                for each statement
                execute function public.block_truncate();',
            v_tabla);
        execute format(
            'alter table public.%I enable always trigger trg_cp_infra_020_block_truncate;',
            v_tabla);
        v_instaladas := v_instaladas + 1;
    end loop;

    return v_instaladas;
end;
$$;

revoke execute on function public.cp_infra_020_install_breaker(text[]) from public, anon, authenticated;
comment on function public.cp_infra_020_install_breaker(text[]) is
  'CP-INFRA-020 v2: instala (idempotente) el freno de TRUNCATE sobre la lista de tablas dada. Fail-closed: si falta CUALQUIER tabla, ABORTA sin instalar nada. Solo roles administrativos.';

-- 3) Invocación con la lista canónica (34 tablas)
do $$
declare
    v_instaladas int;
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
    v_instaladas := public.cp_infra_020_install_breaker(v_tablas);
    raise notice 'CP-INFRA-020-v2: % triggers instalados con ENABLE ALWAYS', v_instaladas;
end;
$$;

-- 4) Verificación fail-closed: exactamente 34 triggers, todos tgenabled='A'
do $$
declare
    v_triggers int;
    v_always int;
    v_duplicados int;
begin
    select count(*) into v_triggers
      from pg_trigger
     where tgname = 'trg_cp_infra_020_block_truncate'
       and not tgisinternal;
    select count(*) into v_always
      from pg_trigger
     where tgname = 'trg_cp_infra_020_block_truncate'
       and not tgisinternal
       and tgenabled = 'A';
    select count(*) into v_duplicados
      from (select tgrelid from pg_trigger
             where tgname = 'trg_cp_infra_020_block_truncate' and not tgisinternal
             group by tgrelid having count(*) > 1) d;

    if v_triggers <> 34 then
        raise exception 'CP-INFRA-020-v2: % triggers (esperado 34)', v_triggers;
    end if;
    if v_always <> 34 then
        raise exception 'CP-INFRA-020-v2: % triggers con tgenabled=''A'' (esperado 34)', v_always;
    end if;
    if v_duplicados <> 0 then
        raise exception 'CP-INFRA-020-v2: % tablas con triggers duplicados', v_duplicados;
    end if;
    raise notice 'CP-INFRA-020-v2 OK: 34/34 triggers, 34/34 ENABLE ALWAYS, 0 duplicados';
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (idéntico al de 20261110120000 + la función instaladora):
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
--   drop function if exists public.cp_infra_020_install_breaker(text[]);
-- ═══════════════════════════════════════════════════════════════════════════
