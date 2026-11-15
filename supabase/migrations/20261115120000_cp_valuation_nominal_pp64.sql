-- ═══════════════════════════════════════════════════════════════════════════
-- CP-VALUATION-NOMINAL-ACTIVATION-004 · PARTE 1 (2026-11-15)
-- NORMALIZACIÓN NOMINAL DE LOS 64 PRODUCTOS PUERTO PADRE (cost_average = 0)
-- ═══════════════════════════════════════════════════════════════════════════
-- DECISIÓN VINCULANTE DEL PROPIETARIO (adenda CP-VALUATION-NOMINAL-ACTIVATION-
-- 004, 2026-11-15): «Todo producto con costo promedio cost_average igual a
-- cero debe recibir un costo promedio nominal de 1 CUP.» Autorización YA
-- otorgada para los 64 de PUERTO PADRE (hallazgo H-1 de la verificación
-- CP-POST-MERGE-VERIFICATION-003: activaciones vía ACTIVATE_MASTER_PRODUCT del
-- 2026-11-14 19:56–19:58 UTC que no recibieron el nominal del 1 CUP por ser
-- posteriores a la migración 20261114190000).
--
-- CAMPO AUTORITATIVO: products.cost_average (WAC en CUP). La decisión afecta
--   SOLO al costo promedio: NO al precio de venta ni al costo documental.
--
-- UNIVERSO [MEDIDO 2026-11-15 en producción]: 64 productos, TODOS PUERTO
--   PADRE, TODOS con stock_current = 0, cost_price = 0, price = 0, moneda CUP,
--   maestro activo, 0 receipt_items y 0 stock_movements. La política es
--   GLOBAL (cualquier producto en cero queda cubierto), no una lista fija: la
--   migración identifica el universo en el momento de ejecución y el snapshot
--   auditable registra los IDENTIFICADORES EXACTOS por corrida.
--
-- DOCTRINA DE ESCRITURA ÚNICA DEL WAC (W62-01 / REM-F4-04) — ídem
--   20261114190000, que ya normalizó a los 97 del 2026-11-14:
--     · stock = 0 (los 64 en producción): PERFORM fn_recalc_wac(store,
--       product, 'cp_valuation_004_nominal', qty_in=1, uc_in=1) → blend D-01
--       (0·0 + 1·1)/(0+1) = EXACTAMENTE 1, con asiento automático en
--       wac_change_log. qty_in=1 es la unidad nominal de la decisión: NO crea
--       movimientos de inventario ni modifica stock_current.
--     · stock > 0 (posible en replay E2E; 0 en producción hoy): patrón
--       sellado del escritor canónico (token SET LOCAL app.wac_writer=
--       'fn_recalc_wac' alrededor del UPDATE + fila explícita en
--       wac_change_log, event='cp_valuation_004_nominal_owner_decision').
--     · Huérfanos sin tienda (0 en producción): patrón sellado sin fila en
--       wac_change_log (store_id NOT NULL lo impide), documentados en la
--       tabla de auditoría.
--
-- NO SE TOCA (verificado por construcción + verificación fail-closed):
--   · price / price_currency (precios de venta).
--   · cost_price (costo documental).
--   · stock_current, SKU, name, description, master_product_id, imagen,
--     clasificación operativa.
--   · receipts / receipt_items / stock_movements / fin_* (cero documentos
--     ficticios).
--   · Catálogo maestro (master_products) — sin escrituras globales.
--
-- TRAZABILIDAD: cp_cost_nominal_pp64_20261115_audit (identificadores exactos,
--   valores ANTES por fila, write_path, origen y misión) + asientos en
--   wac_change_log + asiento global en audit_logs (table_name='system') con
--   conteos dinámicos. RLS habilitado deny-all DESDE LA CREACIÓN (lección de
--   20261114190300: la tabla de auditoría nace protegida).
--
-- IDEMPOTENTE Y PORTABLE (replay E2E): re-ejecución → 0 filas nuevas en el
--   snapshot (ON CONFLICT DO NOTHING), 0 asignaciones y 0 asientos nuevos en
--   wac_change_log (los bucles solo procesan filas TODAVÍA en cost_average=0:
--   el snapshot histórico no se reprocesa), verificaciones universales pasan
--   sin efecto. En la BD E2E aislada la migración es no-op (0 productos en
--   cero [MEDIDO]).
--
-- VERIFICACIÓN FAIL-CLOSED (aborta el lote si falla cualquier punto):
--   · 0 productos con cost_average = 0 / IS NULL / < 0 tras la asignación.
--   · stock_current, price, cost_price, sku, name y master_product_id
--     EXACTAMENTE iguales para cada fila del snapshot.
--   · wac_change_log: asientos 'cp_valuation_004_nominal%' ≥ asignados con
--     tienda.
--   · receipts, receipt_items y stock_movements SIN incremento neto (cero
--     documentos ficticios).
--   · 0 precios de venta negativos.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Tabla de auditoría (snapshot ANTES, identificadores exactos) — protegida
--    desde la creación: RLS habilitado sin políticas = deny-all para roles no
--    propietarios; sin grants a anon/authenticated (solo owner/service_role).
create table if not exists public.cp_cost_nominal_pp64_20261115_audit (
    id                    bigint generated always as identity primary key,
    product_id            uuid not null unique,
    store_id              uuid,
    store_name            text,
    sku                   text,
    product_name          text,
    master_product_id     uuid,
    old_cost_average      numeric,
    old_cost_price        numeric,
    old_price             numeric,
    old_stock             numeric,
    old_sku               text,
    old_name              text,
    price_currency        text,
    assigned_cost_average numeric not null default 1,
    assigned_currency     text not null default 'CUP',
    write_path            text, -- 'fn_recalc_wac' | 'token_sealed' | 'orphan_token_sealed'
    origin                text not null default 'COSTO NOMINAL ESTABLECIDO POR DECISION DEL PROPIETARIO: 1 CUP (CP-VALUATION-NOMINAL-ACTIVATION-004)',
    mission               text not null default 'CP-VALUATION-NOMINAL-ACTIVATION-004',
    assigned_at           timestamptz not null default now()
);

alter table public.cp_cost_nominal_pp64_20261115_audit enable row level security;

revoke all on public.cp_cost_nominal_pp64_20261115_audit from anon, authenticated;

comment on table public.cp_cost_nominal_pp64_20261115_audit is
  'CP-VALUATION-NOMINAL-ACTIVATION-004: trazabilidad de la normalización nominal 1 CUP de los 64 productos PUERTO PADRE con cost_average=0 (activaciones ACTIVATE_MASTER_PRODUCT del 2026-11-14 posteriores a 20261114190000). El valor es NOMINAL por decisión del propietario: NO procede de factura ni recepción. cost_price documental, precios de venta, existencias y catálogo maestro intactos. RLS deny-all: lectura solo owner/service_role.';

-- 2) Snapshot + asignación por vía canónica + verificaciones + asientos
do $$
declare
    r record;
    v_antes bigint := 0;
    v_snapshotted bigint := 0;
    v_via_fn bigint := 0;
    v_via_token bigint := 0;
    v_orfanos bigint := 0;
    v_restantes_cero bigint;
    v_nulos bigint;
    v_negativos bigint;
    v_doc_total bigint;
    v_doc_alterados bigint;
    v_precios_neg bigint;
    v_wac_log_esperado bigint;
    v_wac_log_real bigint;
    v_integridad_alterada bigint;
    v_receipts_antes bigint;
    v_receipts_despues bigint;
    v_ri_antes bigint;
    v_ri_despues bigint;
    v_sm_antes bigint;
    v_sm_despues bigint;
begin
    select count(*) into v_antes from public.products where cost_average = 0;

    -- Conteo de documentos ANTES (prohibido generar documentos ficticios)
    select count(*) into v_receipts_antes from public.receipts;
    select count(*) into v_ri_antes from public.receipt_items;
    select count(*) into v_sm_antes from public.stock_movements;

    -- ── Snapshot ANTES con identificadores y situación completa (idempotente
    --    por UNIQUE product_id) ──
    insert into public.cp_cost_nominal_pp64_20261115_audit
        (product_id, store_id, store_name, sku, product_name, master_product_id,
         old_cost_average, old_cost_price, old_price, old_stock, old_sku, old_name,
         price_currency)
    select p.id, p.store_id, s.name, p.sku, p.name, p.master_product_id,
           p.cost_average, p.cost_price, p.price, p.stock_current, p.sku, p.name,
           p.price_currency
      from public.products p
      left join public.stores s on s.id = p.store_id
     where p.cost_average = 0
    on conflict (product_id) do nothing;
    get diagnostics v_snapshotted = row_count;

    -- El snapshot de ESTA corrida cubre exactamente el universo en cero
    if v_snapshotted <> v_antes then
        raise exception 'CP-VALUATION-004: snapshot de la corrida % ≠ universo en cero %', v_snapshotted, v_antes;
    end if;

    -- ── 2a. stock = 0 con tienda: escritor canónico (blend → exactamente 1) ──
    --    Filtro p.cost_average = 0: solo filas TODAVÍA en cero (la reejecución
    --    no reprocesa el snapshot histórico ni genera asientos redundantes 1→1).
    for r in
        select a.product_id, a.store_id
          from public.cp_cost_nominal_pp64_20261115_audit a
          join public.products p on p.id = a.product_id
         where a.old_cost_average = 0
           and a.store_id is not null
           and p.stock_current = 0
           and p.cost_average = 0
    loop
        perform public.fn_recalc_wac(
            r.store_id, r.product_id, 'cp_valuation_004_nominal',
            1, 1,
            jsonb_build_object(
              'migration', '20261115120000_cp_valuation_nominal_pp64',
              'decision', 'COSTO NOMINAL ESTABLECIDO POR DECISION DEL PROPIETARIO: 1 CUP',
              'authorized_by', 'ADENDA CP-VALUATION-NOMINAL-ACTIVATION-004 (2026-11-15)',
              'note', 'Unidad nominal de la decision; no crea movimientos ni toca stock'));
        v_via_fn := v_via_fn + 1;
    end loop;

    -- ── 2b. stock > 0 con tienda: patrón sellado del escritor canónico ──
    --    (blend D-01 no puede producir exactamente 1 con S>0; decisión exige 1)
    --    Mismo filtro p.cost_average = 0 (idempotencia estricta).
    for r in
        select a.product_id, a.store_id
          from public.cp_cost_nominal_pp64_20261115_audit a
          join public.products p on p.id = a.product_id
         where a.old_cost_average = 0
           and a.store_id is not null
           and p.stock_current > 0
           and p.cost_average = 0
    loop
        set local app.wac_writer = 'fn_recalc_wac';
        update public.products
           set cost_average = 1, updated_at = now()
         where id = r.product_id and store_id = r.store_id and cost_average = 0;
        set local app.wac_writer = '';

        insert into public.wac_change_log
            (store_id, product_id, wac_before, wac_after, event, qty_in, uc_in, source_ref, changed_by)
        values
            (r.store_id, r.product_id, 0, 1, 'cp_valuation_004_nominal_owner_decision', null, 1,
             jsonb_build_object(
               'migration', '20261115120000_cp_valuation_nominal_pp64',
               'reason', 'stock>0: el blend D-01 no puede producir exactamente 1; asignacion nominal directa de la decision del propietario',
               'decision', 'COSTO NOMINAL ESTABLECIDO POR DECISION DEL PROPIETARIO: 1 CUP',
               'authorized_by', 'ADENDA CP-VALUATION-NOMINAL-ACTIVATION-004 (2026-11-15)'),
             null);
        v_via_token := v_via_token + 1;
    end loop;

    -- ── 2c. Huérfanos sin tienda (0 en producción): patrón sellado, sin log ──
    --    Mismo filtro p.cost_average = 0 (idempotencia estricta).
    for r in
        select a.product_id
          from public.cp_cost_nominal_pp64_20261115_audit a
          join public.products p on p.id = a.product_id
         where a.old_cost_average = 0
           and a.store_id is null
           and p.cost_average = 0
    loop
        set local app.wac_writer = 'fn_recalc_wac';
        update public.products
           set cost_average = 1, updated_at = now()
         where id = r.product_id and cost_average = 0;
        set local app.wac_writer = '';
        v_orfanos := v_orfanos + 1;
        raise notice 'CP-VALUATION-004: producto HUERFANO sin tienda % asignado a 1 CUP (incidencia de integridad; sin wac_change_log: store_id NOT NULL)', r.product_id;
    end loop;

    update public.cp_cost_nominal_pp64_20261115_audit a
       set write_path = case
             when a.store_id is null then 'orphan_token_sealed'
             when p.stock_current = 0 then 'fn_recalc_wac'
             else 'token_sealed' end
      from public.products p
     where p.id = a.product_id
       and a.write_path is null;

    -- ── Verificación fail-closed: cero universal tras la política ──
    select count(*) into v_restantes_cero from public.products where cost_average = 0;
    if v_restantes_cero <> 0 then
        raise exception 'CP-VALUATION-004: quedan % productos con cost_average = 0', v_restantes_cero;
    end if;
    select count(*) into v_nulos from public.products where cost_average is null;
    if v_nulos <> 0 then
        raise exception 'CP-VALUATION-004: % productos con cost_average nulo', v_nulos;
    end if;
    select count(*) into v_negativos from public.products where cost_average < 0;
    if v_negativos <> 0 then
        raise exception 'CP-VALUATION-004: % productos con cost_average negativo', v_negativos;
    end if;

    -- ── Verificación fail-closed: costos documentales preservados ──
    select count(*), count(*) filter (where p.cost_price is distinct from a.old_cost_price)
      into v_doc_total, v_doc_alterados
      from public.cp_cost_nominal_pp64_20261115_audit a
      join public.products p on p.id = a.product_id
     where a.old_cost_price > 0;
    if v_doc_alterados <> 0 then
        raise exception 'CP-VALUATION-004: % de % costos documentales ALTERADOS (prohibido)', v_doc_alterados, v_doc_total;
    end if;

    -- ── Verificación fail-closed: integridad de la situación (stock, precio,
    --    sku, name, maestro EXACTAMENTE iguales tras la escritura) ──
    select count(*) into v_integridad_alterada
      from public.cp_cost_nominal_pp64_20261115_audit a
      join public.products p on p.id = a.product_id
     where p.stock_current  is distinct from a.old_stock
        or p.price          is distinct from a.old_price
        or p.sku            is distinct from a.old_sku
        or p.name           is distinct from a.old_name
        or p.master_product_id is distinct from a.master_product_id;
    if v_integridad_alterada <> 0 then
        raise exception 'CP-VALUATION-004: % filas del snapshot con stock/precio/sku/nombre/maestro ALTERADOS (prohibido)', v_integridad_alterada;
    end if;

    -- ── Verificación fail-closed: cero documentos ficticios ──
    select count(*) into v_receipts_despues from public.receipts;
    select count(*) into v_ri_despues from public.receipt_items;
    select count(*) into v_sm_despues from public.stock_movements;
    if v_receipts_despues <> v_receipts_antes
       or v_ri_despues <> v_ri_antes
       or v_sm_despues <> v_sm_antes then
        raise exception 'CP-VALUATION-004: documentos alterados (receipts %→%, items %→%, movimientos %→%) — prohibido', v_receipts_antes, v_receipts_despues, v_ri_antes, v_ri_despues, v_sm_antes, v_sm_despues;
    end if;

    v_wac_log_esperado := v_via_fn + v_via_token;
    select count(*) into v_wac_log_real
      from public.wac_change_log
     where event in ('cp_valuation_004_nominal', 'cp_valuation_004_nominal_owner_decision');
    if v_wac_log_real < v_wac_log_esperado then
        raise exception 'CP-VALUATION-004: asientos wac_change_log % < esperados %', v_wac_log_real, v_wac_log_esperado;
    end if;

    select count(*) into v_precios_neg from public.products where price < 0;
    if v_precios_neg <> 0 then
        raise exception 'CP-VALUATION-004: % precios negativos (integridad comprometida)', v_precios_neg;
    end if;

    -- ── Asiento global de auditoría ──
    insert into public.audit_logs (action, table_name, store_id, user_id, metadata)
    values ('COST_NOMINAL_PP64_OWNER_DECISION', 'system', null, null,
            jsonb_build_object(
              'decision', 'COSTO NOMINAL ESTABLECIDO POR DECISION DEL PROPIETARIO: 1 CUP',
              'mission', 'CP-VALUATION-NOMINAL-ACTIVATION-004',
              'field', 'products.cost_average',
              'currency', 'CUP',
              'universe_before', v_antes,
              'updated', v_via_fn + v_via_token + v_orfanos,
              'via_fn_recalc_wac', v_via_fn,
              'via_token_sealed', v_via_token,
              'orphans', v_orfanos,
              'universe_after_zero', v_restantes_cero,
              'nulls', v_nulos,
              'negatives', v_negativos,
              'documented_cost_preserved', v_doc_total,
              'integrity_checked', true,
              'audit_table', 'cp_cost_nominal_pp64_20261115_audit',
              'authorized_by', 'ADENDA CP-VALUATION-NOMINAL-ACTIVATION-004 (2026-11-15): decision ya autorizada, sin nueva autorización'
            ));

    raise notice 'CP-VALUATION-004 OK: % actualizados a 1 CUP (fn_recalc_wac %, token_sealed %, huerfanos %; costos documentales % preservados; stock/precio/sku/nombre/maestro intactos)', v_via_fn + v_via_token + v_orfanos, v_via_fn, v_via_token, v_orfanos, v_doc_total;
end
$$;
