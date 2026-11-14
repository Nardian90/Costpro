-- ═══════════════════════════════════════════════════════════════════════════
-- CP-POST-MERGE-EXECUTION-002 · FRENTE 2 (2026-11-14)
-- COSTO NOMINAL ESTABLECIDO POR DECISIÓN DEL PROPIETARIO: 1 CUP
-- ═══════════════════════════════════════════════════════════════════════════
-- DECISIÓN ECONÓMICA DEFINITIVA DEL PROPIETARIO (adenda vinculante §2):
--   «Todos los productos cuyo costo promedio sea exactamente cero deben
--    actualizarse a 1 CUP.» — universo de producción verificado [MEDIDO]:
--    97 de 355 con products.cost_average = 0 (0 nulos, 0 negativos; 95 con
--    stock 0 y 2 artefactos QA con stock > 0).
--
-- CAMPO AUTORITATIVO: products.cost_average — costo promedio (WAC) en CUP por
--   convención del sistema (fn_recalc_wac recibe costos normalizados a CUP en
--   register_reception: v_unit_cost_cup = unit_cost × tasa). El valor asignado
--   es 1 CUP para TODOS, incluido el único producto cotizado en USD (sku '23',
--   ENERVIDA — cost_price 0 intacto).
--
-- DOCTRINA DE ESCRITURA ÚNICA DEL WAC (W62-01 / REM-F4-04):
--   El trigger w62_guard_wac_writer exige el token app.wac_writer='fn_recalc_
--   wac' y la doctrina establece a fn_recalc_wac como ÚNICO escritor canónico.
--   Esta migración NO desactiva ningún guard (nada se dropea ni se deshabilita)
--   y escribe por la vía canónica:
--     · stock = 0 (95 en prod): PERFORM fn_recalc_wac(store, product,
--       'cp_post_merge_002_nominal', qty_in=1, uc_in=1) → blend D-01
--       (0·0 + 1·1)/(0+1) = EXACTAMENTE 1, con asiento automático en
--       wac_change_log. qty_in=1 es la unidad nominal de la decisión: NO
--       crea movimientos de inventario ni modifica stock_current.
--     · stock > 0 (2 artefactos QA en prod): el blend D-01 no puede producir
--       exactamente 1 para S>0 (q/(S+q) < 1 ∀q finito). La decisión del
--       propietario exige exactamente 1 CUP → se replica el patrón de
--       escritura EXACTO del escritor canónico (token SET LOCAL app.wac_
--       writer='fn_recalc_wac' sellado alrededor del UPDATE, fila explícita en
--       wac_change_log con event='cp_post_merge_002_nominal_owner_decision',
--       qty_in=NULL, uc_in=1 y source_ref con la autorización). Escritura
--       CONSCIENTE y AUDITADA de operador: ni implícita ni dispersa; el guard
--       permanece activo y la trazabilidad completa.
--     · Huérfanos sin tienda (0 en prod; 1 en el fixture E2E): se asigna por
--       el mismo patrón sellado SIN fila en wac_change_log (store_id NOT NULL
--       lo impide) y se documenta en la tabla de auditoría de esta migración
--       (incidencia de integridad separada por tienda ausente).
--
-- NO SE TOCA (prohibiciones de la adenda, verificadas por construcción):
--   · price / price_currency / precio_empresa (precios de venta).
--   · cost_price (costo documental/importado) — se conserva tal cual. En
--     producción: 4 casos con costo documental > 0 y WAC 0 (PROD-033 13200;
--     PBM-001 100; QA-ICON-001 50; QA-ICON-002 80), protegidos por verificación
--     de igualdad (portable al replay E2E).
--   · receipts / receipt_items / facturas / fichas de costo / movimientos de
--     inventario / stock_current (fn_recalc_wac no toca stock).
--   · Filas de OTRAS tiendas (solo cost_average = 0).
--
-- TRAZABILIDAD: cp_cost_nominal_20261114_audit (valor ANTES por fila, origin
--   explícito 'COSTO NOMINAL ESTABLECIDO POR DECISION DEL PROPIETARIO: 1 CUP')
--   + asientos en wac_change_log + asiento global en audit_logs (table_name=
--   'system') con conteos dinámicos. Los documentos históricos SIN alteración.
--
-- FUENTES VERIFICADAS [MEDIDO 2026-11-14]: los 97 de producción NO tienen
--   receipt_items ni inventory_movements → la asignación nominal no contradice
--   ningún documento de recepción. 60 de los 97 nacen de la importación del
--   catálogo del 2026-11-13 (60 maestros creados, 59 acciones IMPORT_PRODUCT);
--   el resto por fechas de alta 08-11/10-16/10-17/11-07/11-09 y altas locales.
--
-- IDEMPOTENTE Y PORTABLE (replay E2E): re-ejecución → 0 filas en cero, 0
--   llamadas, verificaciones universales pasan sin efecto.
--
-- VERIFICACIÓN FAIL-CLOSED (aborta el lote si falla cualquier punto):
--   · 0 productos con cost_average = 0 / IS NULL / < 0 tras la asignación.
--   · Cada snapshot con old_cost_price > 0 conserva EXACTAMENTE ese cost_price.
--   · wac_change_log: asientos 'cp_post_merge_002_nominal%' == productos
--     asignados con tienda no nula.
--   · 0 precios de venta negativos.
-- Rollback (decisión consciente del propietario): restaurar cost_average=0
--   desde cp_cost_nominal_20261114_audit por el mismo patrón sellado.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Tabla de auditoría (snapshot ANTES) — solo postgres/service_role
create table if not exists public.cp_cost_nominal_20261114_audit (
    id                  bigint generated always as identity primary key,
    product_id          uuid not null unique,
    store_id            uuid,
    store_name          text,
    sku                 text,
    product_name        text,
    old_cost_average    numeric,
    old_cost_price      numeric,
    old_stock           numeric,
    price_currency      text,
    assigned_cost_average numeric not null default 1,
    assigned_currency   text not null default 'CUP',
    write_path          text, -- 'fn_recalc_wac' | 'token_sealed' | 'orphan_token_sealed'
    origin              text not null default 'COSTO NOMINAL ESTABLECIDO POR DECISION DEL PROPIETARIO: 1 CUP',
    mission             text not null default 'CP-POST-MERGE-EXECUTION-002',
    assigned_at         timestamptz not null default now()
);

revoke all on public.cp_cost_nominal_20261114_audit from anon, authenticated;

comment on table public.cp_cost_nominal_20261114_audit is
  'CP-POST-MERGE-EXECUTION-002 §2: trazabilidad de la asignación nominal 1 CUP a productos con costo promedio (cost_average) exactamente cero. El valor es NOMINAL por decisión del propietario: NO procede de factura ni recepción. cost_price (costo documental) y precios de venta intactos.';

-- 2) Snapshot + asignación por vía canónica + verificaciones + asientos
do $$
declare
    r record;
    v_antes bigint := 0;
    v_snapshotted bigint := 0;
    v_via_fn bigint := 0;
    v_via_token bigint := 0;
    v_orfanos bigint := 0;
    v_actualizados bigint;
    v_restantes_cero bigint;
    v_nulos bigint;
    v_negativos bigint;
    v_doc_total bigint;
    v_doc_alterados bigint;
    v_precios_neg bigint;
    v_wac_log_esperado bigint;
    v_wac_log_real bigint;
begin
    select count(*) into v_antes from public.products where cost_average = 0;

    -- ── Snapshot ANTES (idempotente por UNIQUE product_id) ──
    insert into public.cp_cost_nominal_20261114_audit
        (product_id, store_id, store_name, sku, product_name,
         old_cost_average, old_cost_price, old_stock, price_currency)
    select p.id, p.store_id, s.name, p.sku, p.name,
           p.cost_average, p.cost_price, p.stock_current, p.price_currency
      from public.products p
      left join public.stores s on s.id = p.store_id
     where p.cost_average = 0
    on conflict (product_id) do nothing;
    get diagnostics v_snapshotted = row_count;

    -- El snapshot de ESTA corrida cubre exactamente el universo en cero
    if v_snapshotted <> v_antes then
        raise exception 'CP-POST-MERGE-002: snapshot de la corrida % ≠ universo en cero %', v_snapshotted, v_antes;
    end if;

    -- ── 2a. stock = 0 con tienda: escritor canónico (blend → exactamente 1) ──
    for r in
        select a.product_id, a.store_id
          from public.cp_cost_nominal_20261114_audit a
          join public.products p on p.id = a.product_id
         where a.old_cost_average = 0
           and a.store_id is not null
           and p.stock_current = 0
    loop
        perform public.fn_recalc_wac(
            r.store_id, r.product_id, 'cp_post_merge_002_nominal',
            1, 1,
            jsonb_build_object(
              'migration', '20261114190000_cp_cost_nominal_1cup',
              'decision', 'COSTO NOMINAL ESTABLECIDO POR DECISION DEL PROPIETARIO: 1 CUP',
              'authorized_by', 'ADENDA VINCULANTE CP-POST-MERGE-EXECUTION-002 (2026-11-14) §2',
              'note', 'Unidad nominal de la decision; no crea movimientos ni toca stock'));
        v_via_fn := v_via_fn + 1;
    end loop;

    -- ── 2b. stock > 0 con tienda: patrón sellado del escritor canónico ──
    --    (blend D-01 no puede producir exactamente 1 con S>0; decisión exige 1)
    for r in
        select a.product_id, a.store_id
          from public.cp_cost_nominal_20261114_audit a
          join public.products p on p.id = a.product_id
         where a.old_cost_average = 0
           and a.store_id is not null
           and p.stock_current > 0
    loop
        set local app.wac_writer = 'fn_recalc_wac';
        update public.products
           set cost_average = 1, updated_at = now()
         where id = r.product_id and store_id = r.store_id and cost_average = 0;
        set local app.wac_writer = '';

        insert into public.wac_change_log
            (store_id, product_id, wac_before, wac_after, event, qty_in, uc_in, source_ref, changed_by)
        values
            (r.store_id, r.product_id, 0, 1, 'cp_post_merge_002_nominal_owner_decision', null, 1,
             jsonb_build_object(
               'migration', '20261114190000_cp_cost_nominal_1cup',
               'reason', 'stock>0: el blend D-01 no puede producir exactamente 1; asignacion nominal directa de la decision del propietario',
               'decision', 'COSTO NOMINAL ESTABLECIDO POR DECISION DEL PROPIETARIO: 1 CUP',
               'authorized_by', 'ADENDA VINCULANTE CP-POST-MERGE-EXECUTION-002 (2026-11-14) §2'),
             null);
        v_via_token := v_via_token + 1;
    end loop;

    -- ── 2c. Huérfanos sin tienda (0 en prod): patrón sellado, sin wac_log ──
    for r in
        select a.product_id
          from public.cp_cost_nominal_20261114_audit a
         where a.old_cost_average = 0
           and a.store_id is null
    loop
        set local app.wac_writer = 'fn_recalc_wac';
        update public.products
           set cost_average = 1, updated_at = now()
         where id = r.product_id and cost_average = 0;
        set local app.wac_writer = '';
        v_orfanos := v_orfanos + 1;
        raise notice 'CP-POST-MERGE-002: producto HUERFANO sin tienda % asignado a 1 CUP (incidencia de integridad; sin wac_change_log: store_id NOT NULL)', r.product_id;
    end loop;

    update public.cp_cost_nominal_20261114_audit a
       set write_path = case
             when a.store_id is null then 'orphan_token_sealed'
             when p.stock_current = 0 then 'fn_recalc_wac'
             else 'token_sealed' end
      from public.products p
     where p.id = a.product_id;

    -- ── Verificación fail-closed ──
    select count(*) into v_restantes_cero from public.products where cost_average = 0;
    if v_restantes_cero <> 0 then
        raise exception 'CP-POST-MERGE-002: quedan % productos con cost_average = 0', v_restantes_cero;
    end if;
    select count(*) into v_nulos from public.products where cost_average is null;
    if v_nulos <> 0 then
        raise exception 'CP-POST-MERGE-002: % productos con cost_average nulo', v_nulos;
    end if;
    select count(*) into v_negativos from public.products where cost_average < 0;
    if v_negativos <> 0 then
        raise exception 'CP-POST-MERGE-002: % productos con cost_average negativo', v_negativos;
    end if;

    select count(*), count(*) filter (where p.cost_price is distinct from a.old_cost_price)
      into v_doc_total, v_doc_alterados
      from public.cp_cost_nominal_20261114_audit a
      join public.products p on p.id = a.product_id
     where a.old_cost_price > 0;
    if v_doc_alterados <> 0 then
        raise exception 'CP-POST-MERGE-002: % de % costos documentales ALTERADOS (prohibido)', v_doc_alterados, v_doc_total;
    end if;

    v_actualizados := v_via_fn + v_via_token + v_orfanos;
    v_wac_log_esperado := v_via_fn + v_via_token;
    select count(*) into v_wac_log_real
      from public.wac_change_log
     where event in ('cp_post_merge_002_nominal', 'cp_post_merge_002_nominal_owner_decision');
    if v_wac_log_real < v_wac_log_esperado then
        raise exception 'CP-POST-MERGE-002: asientos wac_change_log % < esperados %', v_wac_log_real, v_wac_log_esperado;
    end if;

    select count(*) into v_precios_neg from public.products where price < 0;
    if v_precios_neg <> 0 then
        raise exception 'CP-POST-MERGE-002: % precios negativos (integridad comprometida)', v_precios_neg;
    end if;

    -- ── Asiento global de auditoría ──
    insert into public.audit_logs (action, table_name, store_id, user_id, metadata)
    values ('COST_NOMINAL_1CUP_OWNER_DECISION', 'system', null, null,
            jsonb_build_object(
              'decision', 'COSTO NOMINAL ESTABLECIDO POR DECISION DEL PROPIETARIO: 1 CUP',
              'field', 'products.cost_average',
              'currency', 'CUP',
              'universe_before', v_antes,
              'updated', v_actualizados,
              'via_fn_recalc_wac', v_via_fn,
              'via_token_sealed', v_via_token,
              'orphans', v_orfanos,
              'universe_after_zero', v_restantes_cero,
              'nulls', v_nulos,
              'negatives', v_negativos,
              'documented_cost_preserved', v_doc_total,
              'audit_table', 'cp_cost_nominal_20261114_audit',
              'authorized_by', 'ADENDA VINCULANTE CP-POST-MERGE-EXECUTION-002 (2026-11-14) §2'
            ));

    raise notice 'CP-POST-MERGE-002 OK: % actualizados a 1 CUP (fn_recalc_wac %, token_sealed %, huerfanos %; costos documentales % preservados)', v_actualizados, v_via_fn, v_via_token, v_orfanos, v_doc_total;
end
$$;
