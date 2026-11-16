#!/usr/bin/env python3
# ============================================================================
# M076 — CP-FIN-RECEIPT-UNIT-COST-1-CUP-011 · GENERADOR DE LOTES SQL GOBERNADOS
# Genera 4 lotes idempotentes con guards fail-closed a partir del análisis
# m074 (matriz 1 CUP). Cada lote = 1 transacción atómica (BEGIN…COMMIT en una
# sola llamada a la Management API, patrón m061/RECT-1):
#   LOTE-A  líneas de la recepción → 1,00 CUP · cabecera → 5.861,50
#   LOTE-B  capas de compra (stock_movements purchase) → uc 1
#   LOTE-C  WAC por producto (escape hatch w62) + wac_change_log
#   LOTE-D  asiento de ajuste (DR PAS_CXP_PROV / CR INV·COGS·VALES·PÉRDIDA)
# Estados aceptados por los guards: PRISTINO (pre-misión) o YA-APLICADO
# (reanudación/idempotencia → 0 cambios). Cualquier otro estado → ABORT.
# Uso:
#   python3 scripts/m076-receipt-1cup-batches.py \
#     --analysis scripts/out/m074-matriz-1cup.json \
#     --config scripts/out/m011/config-prod.json \
#     --outdir scripts/out/m011/sql-prod
# ============================================================================
import json, argparse, os

ap = argparse.ArgumentParser()
ap.add_argument('--analysis', default='scripts/out/m074-matriz-1cup.json')
ap.add_argument('--config', required=True)
ap.add_argument('--outdir', required=True)
a = ap.parse_args()

an = json.load(open(a.analysis))
cfg = json.load(open(a.config))

FVC = cfg['receipt_id']
STORE = cfg['store_id']
ORIG = cfg['orig_entry_id']
SEG = cfg['segment']              # p.ej. 7ec9000b-0000-4000-8000 (producción 011)
TRACE = cfg.get('trace', 'RECT011-PROD')
MISION = cfg.get('mision', 'CP-FIN-RECEIPT-UNIT-COST-1-CUP-011')
ECO_DATE = cfg.get('economic_date', '2026-07-01')
DOC_NUM = cfg.get('doc_number', 'FAC-VITALLCONS-001-VAL1CUP')
# (type, event) del asiento: la restricción única uq_fin_entries_doc_event impone
# una sola entrada por (document_type, document_id, event). RECT-1 ocupa
# (RECEPCION, FVC, ajuste_manual) y RECT-2 (AJUSTE_INVENTARIO, FVC, ajuste_manual);
# la combinación libre para RECT-011 es (AJUSTE_INVENTARIO, FVC, reconocimiento)
# — reconocimiento de ajuste de inventario por revalorización a 1 CUP/u.
ENTRY_TYPE = cfg.get('entry_document_type', 'AJUSTE_INVENTARIO')
ENTRY_EVENT = cfg.get('entry_event', 'reconocimiento')
E011 = f"{SEG}-{cfg['entry_suffix']}"          # …-d11300000001
FMS = {k: f"{SEG}-{v}" for k, v in {
    'cxp': cfg['fm_cxp'], 'inv': cfg['fm_inv'], 'cogs': cfg['fm_cogs'],
    'vales': cfg['fm_vales'], 'perd': cfg['fm_perd']}.items()}

c = an['controles']
N_LINES = c['lineas']                       # 101 (producción) / n (fixture E2E)
SUM_QTY = c['sum_qty']                      # 5861.5000
VAL_OLD = c['sum_val_old_cup']              # 40739585.00…
VAL_NEW = c['sum_val_new_cup']              # 5861.5000
N_OK = c['n_ya_ok']                         # 23
N_CAMBIO = c['n_cambio_valor']              # 78
CXP_ANTES = an['asiento']['cxp_debito']     # 40733723.50
CXP_NETO_ANTES = c['cxp_neto_antes']        # 40739585.00
q = an['asiento']['creditos_centavos']
INV_CR, COGS_CR, VALES_CR, PERD_CR = q['inv'], q['cogs'], q['vales'], q['perdida']
TOTAL = an['asiento']['importe_total']

META = ('{"mision":"' + MISION + '","autorizacion":"propietario §1/§11 (regla 1,00 CUP/u)",'
        '"metodo":"governed_admin_write (escape hatches M021/w62)"}')

os.makedirs(a.outdir, exist_ok=True)

# ─────────────────────────── LOTE A · líneas + cabecera ───────────────────────
loteA = f"""-- LOTE-A · m011 · líneas → 1,00 CUP y cabecera → {VAL_NEW}
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('fin:RECEIPCION:'||'{FVC}'));
SET LOCAL app.allow_receipt_item_edit = 'on';
CREATE TEMP TABLE m011a(paso text, payload jsonb);
DO $do$
DECLARE
  v_n int; v_s numeric; v_t numeric; v_ok int; v_rc record; v_camb int; v_hab boolean;
BEGIN
  -- A-1 · freeze de alcance (101 líneas, Σqty, Σvalor; estados prístino o ya-aplicado)
  SELECT count(*)::int, coalesce(sum(quantity),0), coalesce(sum(unit_cost*tasa_cambio_recepcion*quantity),0),
         count(*) FILTER (WHERE unit_cost=1 AND moneda_recepcion='CUP' AND tasa_cambio_recepcion=1)::int
    INTO v_n, v_s, v_t, v_ok FROM public.receipt_items WHERE receipt_id='{FVC}';
  IF v_n<>{N_LINES} OR v_s<>{SUM_QTY} THEN RAISE EXCEPTION 'ABORTO-A1a: líneas=% Σqty=%', v_n, v_s; END IF;
  IF NOT ((v_t={VAL_OLD} AND v_ok={N_OK}) OR (v_t={VAL_NEW} AND v_ok={N_LINES})) THEN
    RAISE EXCEPTION 'ABORTO-A1b: estado no reconocido Σvalor=% ya_ok=%', v_t, v_ok; END IF;
  SELECT total_cost, payment_status, coalesce(paid_amount,0) AS paid_amount, status INTO v_rc FROM public.receipts WHERE id='{FVC}';
  IF NOT FOUND THEN RAISE EXCEPTION 'ABORTO-A1c: recepción inexistente'; END IF;
  IF v_rc.payment_status<>'unpaid' OR v_rc.paid_amount>0 OR v_rc.status IN ('voided','reversed') THEN
    RAISE EXCEPTION 'ABORTO-A1d: deuda/estado cambió: %', to_jsonb(v_rc); END IF;
  v_hab := (v_t={VAL_NEW} AND v_ok={N_LINES} AND v_rc.total_cost={VAL_NEW});
  IF NOT (v_rc.total_cost={VAL_OLD} OR v_rc.total_cost={VAL_NEW}) THEN
    RAISE EXCEPTION 'ABORTO-A1e: total_cost=%', v_rc.total_cost; END IF;
  IF v_hab AND v_t<>{VAL_NEW} THEN RAISE EXCEPTION 'ABORTO-A1f: inconsistencia cabecera/líneas'; END IF;
END $do$;

-- S1 · captura de ANTES + actualización de las líneas no conformes a 1 CUP
CREATE TEMP TABLE m011_lineas AS
SELECT ri.id, ri.product_id, ri.quantity AS qty, ri.unit_cost AS uc_old,
       ri.moneda_recepcion AS mon_old, ri.tasa_cambio_recepcion AS tasa_old
FROM public.receipt_items ri
WHERE ri.receipt_id='{FVC}'
  AND (ri.unit_cost<>1 OR ri.moneda_recepcion<>'CUP' OR ri.tasa_cambio_recepcion<>1);
DO $do$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM m011_lineas;
  INSERT INTO m011a VALUES ('S1_previas', to_jsonb(v_n));
  IF v_n<>{N_CAMBIO} AND v_n<>0 THEN RAISE EXCEPTION 'A-5: S1 filas % no esperadas (0 o {N_CAMBIO})', v_n; END IF;
  IF v_n={N_CAMBIO} AND (SELECT coalesce(sum(unit_cost*tasa_cambio_recepcion*quantity),0) FROM public.receipt_items WHERE receipt_id='{FVC}')<>{VAL_OLD} THEN
    RAISE EXCEPTION 'A-5: S1 con estado no prístino'; END IF;
END $do$;
UPDATE public.receipt_items ri
SET unit_cost=1, moneda_recepcion='CUP', tasa_cambio_recepcion=1, updated_at=now()
FROM m011_lineas v WHERE ri.id=v.id;
DO $do$
DECLARE v_n int; v_t numeric; v_ok int;
BEGIN
  SELECT count(*)::int, coalesce(sum(unit_cost*tasa_cambio_recepcion*quantity),0),
         count(*) FILTER (WHERE unit_cost=1 AND moneda_recepcion='CUP' AND tasa_cambio_recepcion=1)::int
    INTO v_n, v_t, v_ok FROM public.receipt_items WHERE receipt_id='{FVC}';
  IF v_n<>{N_LINES} OR v_t<>{VAL_NEW} OR v_ok<>{N_LINES} THEN RAISE EXCEPTION 'A-6: post-S1 líneas=% Σvalor=% ok=%', v_n, v_t, v_ok; END IF;
  INSERT INTO m011a VALUES ('S1_post', jsonb_build_object('lineas',{N_LINES},'ya_ok',{N_LINES},'subtotal_total',v_t));
END $do$;

-- S2 · cabecera → total de líneas
DO $do$
DECLARE v_rc record;
BEGIN
  SELECT total_cost INTO v_rc FROM public.receipts WHERE id='{FVC}';
  IF v_rc.total_cost<>{VAL_NEW} THEN
    UPDATE public.receipts SET total_cost={VAL_NEW}, updated_at=now() WHERE id='{FVC}' AND total_cost<>{VAL_NEW};
  END IF;
END $do$;
DO $do$
DECLARE v_t numeric;
BEGIN
  SELECT total_cost INTO v_t FROM public.receipts WHERE id='{FVC}';
  IF v_t<>{VAL_NEW} THEN RAISE EXCEPTION 'A-6: S2 total_cost=%', v_t; END IF;
  INSERT INTO m011a VALUES ('S2_post', jsonb_build_object('total_cost', v_t));
END $do$;

-- S3 · auditoría por línea (ids deterministas; idempotente)
INSERT INTO public.audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id)
SELECT ('{SEG}-' || substr(md5('m011-line-'||v.id),1,12))::uuid, now(), 'receipt_items', v.id, 'SYSTEM_RECT011_VALUATION',
  jsonb_build_object('uc', v.uc_old, 'moneda', v.mon_old, 'tasa', v.tasa_old, 'qty', v.qty),
  jsonb_build_object('uc', 1, 'moneda', 'CUP', 'tasa', 1, 'qty', v.qty, 'subtotal', v.qty),
  '{META}'::jsonb, '{STORE}', '{TRACE}'
FROM m011_lineas v ON CONFLICT (id) DO NOTHING;
-- S4 · auditoría de cabecera
INSERT INTO public.audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id)
VALUES ('{SEG}-{cfg["aud_total"]}', now(), 'receipts', '{FVC}', 'SYSTEM_RECT011_TOTAL',
  jsonb_build_object('total_cost', {VAL_OLD}), jsonb_build_object('total_cost', {VAL_NEW}),
  '{META}'::jsonb, '{STORE}', '{TRACE}')
ON CONFLICT (id) DO NOTHING;
SELECT paso, payload FROM m011a ORDER BY paso;
COMMIT;"""

# ─────────────────────────── LOTE B · capas de compra ────────────────────────
loteB = f"""-- LOTE-B · m011 · capas de compra de la recepción → uc 1
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('fin:RECEPCION:'||'{FVC}'));
CREATE TEMP TABLE m011b(paso text, payload jsonb);
DO $do$
DECLARE v_n int; v_t numeric; v_ok int;
BEGIN
  -- B-1 · freeze: 101 capas 1:1; Σ(qty×uc) prístino o ya-aplicado
  SELECT count(*)::int, coalesce(sum(quantity_change*unit_cost),0), count(*) FILTER (WHERE unit_cost<>1)::int
    INTO v_n, v_t, v_ok FROM public.stock_movements
   WHERE reference_id='{FVC}' AND movement_type='purchase';
  IF v_n<>{N_LINES} THEN RAISE EXCEPTION 'ABORTO-B1a: capas=%', v_n; END IF;
  IF NOT (v_t={VAL_OLD} OR v_t={VAL_NEW}) THEN RAISE EXCEPTION 'ABORTO-B1b: Σcapas=%', v_t; END IF;
  IF v_t={VAL_OLD} AND v_ok<>{N_CAMBIO} THEN RAISE EXCEPTION 'ABORTO-B1c: capas por corregir=% (esperado {N_CAMBIO})', v_ok; END IF;
  IF v_t={VAL_NEW} AND v_ok<>0 THEN RAISE EXCEPTION 'ABORTO-B1d: estado ya-aplicado con capas sucias=%', v_ok; END IF;
END $do$;
-- S1 · ANTES + actualización
CREATE TEMP TABLE m011_capas AS
SELECT sm.id, sm.product_id, sm.quantity_change AS qty, sm.unit_cost AS uc_old
FROM public.stock_movements sm
WHERE sm.reference_id='{FVC}' AND sm.movement_type='purchase' AND sm.unit_cost<>1;
UPDATE public.stock_movements sm SET unit_cost=1
FROM m011_capas v WHERE sm.id=v.id;
DO $do$
DECLARE v_n int; v_t numeric; v_ok int;
BEGIN
  SELECT count(*)::int, coalesce(sum(quantity_change*unit_cost),0), count(*) FILTER (WHERE unit_cost<>1)::int
    INTO v_n, v_t, v_ok FROM public.stock_movements
   WHERE reference_id='{FVC}' AND movement_type='purchase';
  IF v_n<>{N_LINES} OR v_t<>{VAL_NEW} OR v_ok<>0 THEN RAISE EXCEPTION 'B-6: post capas=% Σ=% sucias=%', v_n, v_t, v_ok; END IF;
  INSERT INTO m011b VALUES ('S1_post', jsonb_build_object('capas',{N_LINES},'sucias',0,'valor_total',v_t));
  SELECT count(*) INTO v_n FROM m011_capas;
  INSERT INTO m011b VALUES ('S1_previas', to_jsonb(v_n));
END $do$;
-- S2 · auditoría por capa
INSERT INTO public.audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id)
SELECT ('{SEG}-' || substr(md5('m011-capa-'||v.id),1,12))::uuid, now(), 'stock_movements', v.id, 'SYSTEM_RECT011_MOV_UC',
  jsonb_build_object('uc', v.uc_old, 'qty', v.qty), jsonb_build_object('uc', 1, 'qty', v.qty),
  '{META}'::jsonb, '{STORE}', '{TRACE}'
FROM m011_capas v ON CONFLICT (id) DO NOTHING;
SELECT paso, payload FROM m011b ORDER BY paso;
COMMIT;"""

# ─────────────────────────── LOTE C · WAC + wac_change_log ───────────────────
vals_wac = ",\n  ".join(
    f"('{w['product_id']}'::uuid, {w['wac_new']}::numeric, {w['stock']}::numeric, {w['wac_old']}::numeric)"
    for w in an['wac_updates'])
n_wac = len(an['wac_updates'])
fvc_rem_by_pid = {r['product_id']: r['fvc_restante'] for r in an['matriz']}
vals_wcl = ",\n  ".join(
    f"(('{SEG}-' || substr(md5('m011-wac-'||'{w['product_id']}'),1,12))::uuid, '{STORE}', '{w['product_id']}'::uuid, "
    f"{w['wac_old']}::numeric, {w['wac_new']}::numeric, 'rectificacion', {fvc_rem_by_pid.get(w['product_id'], '0')}::numeric, 1::numeric, "
    f"'{json.dumps({'mision': MISION, 'metodo': 'revalorización capa FVC a 1 CUP; consistente con asiento RECT-011', 'documento': DOC_NUM}, ensure_ascii=False)}'::jsonb, now())"
    for w in an['wac_updates'])

loteC = f"""-- LOTE-C · m011 · WAC recalculado (escape hatch w62 single-writer) + wac_change_log
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('fin:RECEPCION:'||'{FVC}'));
SET LOCAL app.wac_writer = 'fn_recalc_wac';
CREATE TEMP TABLE m011c(paso text, payload jsonb);
CREATE TEMP TABLE m011_wac AS
WITH datos(product_id, wac_new, stock_esp, wac_old_esp) AS (VALUES
  {vals_wac})
SELECT d.product_id, d.wac_new, d.stock_esp, d.wac_old_esp, p.cost_average AS wac_actual, p.stock_current
FROM datos d JOIN public.products p ON p.id=d.product_id;
DO $do$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM m011_wac;
  IF v_n<>{n_wac} THEN RAISE EXCEPTION 'ABORTO-C1: productos WAC=% (esperado {n_wac})', v_n; END IF;
  IF EXISTS (SELECT 1 FROM m011_wac WHERE stock_current<>stock_esp) THEN
    RAISE EXCEPTION 'ABORTO-C2: stock congelado divergió (venta posterior) — regenerar análisis'; END IF;
  IF EXISTS (SELECT 1 FROM m011_wac WHERE wac_actual NOT IN (wac_old_esp, wac_new)) THEN
    RAISE EXCEPTION 'ABORTO-C3: WAC actual no es ni el congelado ni el objetivo — reanudación imposible'; END IF;
END $do$;
UPDATE public.products p SET cost_average=m.wac_new, updated_at=now()
FROM m011_wac m WHERE p.id=m.product_id AND p.cost_average<>m.wac_new;
DO $do$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM m011_wac m JOIN public.products p ON p.id=m.product_id WHERE p.cost_average=m.wac_new;
  IF v_n<>{n_wac} THEN RAISE EXCEPTION 'C-6: WAC conformes=% de {n_wac}', v_n; END IF;
  INSERT INTO m011c VALUES ('S1_post', jsonb_build_object('wac_conformes', v_n));
END $do$;
INSERT INTO public.wac_change_log (id, store_id, product_id, wac_before, wac_after, event, qty_in, uc_in, source_ref, created_at)
VALUES
  {vals_wcl}
ON CONFLICT (id) DO NOTHING;
DO $do$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.wac_change_log
   WHERE id::text LIKE '{SEG}-%' AND source_ref->>'mision' = '{MISION}';
  IF v_n<>{n_wac} THEN RAISE EXCEPTION 'C-7: wac_change_log=% de {n_wac}', v_n; END IF;
  INSERT INTO m011c VALUES ('S2_wcl', to_jsonb(v_n));
END $do$;
-- auditoría por producto
INSERT INTO public.audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id)
SELECT ('{SEG}-' || substr(md5('m011-wacaud-'||v.product_id),1,12))::uuid, now(), 'products', v.product_id, 'SYSTEM_RECT011_WAC',
  jsonb_build_object('wac', v.wac_actual, 'stock', v.stock_current),
  jsonb_build_object('wac', v.wac_new, 'stock', v.stock_current),
  '{META}'::jsonb, '{STORE}', '{TRACE}'
FROM m011_wac v ON CONFLICT (id) DO NOTHING;
SELECT paso, payload FROM m011c ORDER BY paso;
COMMIT;"""

# ─────────────────────────── LOTE D · asiento de ajuste ──────────────────────
desc_entry = (f"Rectificación {MISION}: valoración de las 101 líneas a 1,00 CUP/u "
              f"(regla del propietario). DR PAS_CXP_PROV {TOTAL} / CR ACT_INVENTARIO+GAS_COSTO_VENTAS+GAS_VALES+GAS_PERDIDA_INV")
snap_movs = json.dumps([
    {"traza": {"mision": MISION, "regla": "rect011-cxp-d"}, "amount": TOTAL, "sentido": "debito", "currency": "CUP", "categoria": "PAS_CXP_PROV"},
    {"traza": {"mision": MISION, "regla": "rect011-inv-c"}, "amount": INV_CR, "sentido": "credito", "currency": "CUP", "categoria": "ACT_INVENTARIO"},
    {"traza": {"mision": MISION, "regla": "rect011-cogs-c"}, "amount": COGS_CR, "sentido": "credito", "currency": "CUP", "categoria": "GAS_COSTO_VENTAS"},
    {"traza": {"mision": MISION, "regla": "rect011-vales-c"}, "amount": VALES_CR, "sentido": "credito", "currency": "CUP", "categoria": "GAS_VALES"},
    {"traza": {"mision": MISION, "regla": "rect011-perd-c"}, "amount": PERD_CR, "sentido": "credito", "currency": "CUP", "categoria": "GAS_PERDIDA_INV"},
], ensure_ascii=False)

loteD = f"""-- LOTE-D · m011 · asiento de ajuste RECT-011 (idempotente, ids deterministas)
-- Combinación única: ({ENTRY_TYPE}, FVC, {ENTRY_EVENT}) — libres (RECT-1/RECT-2 ocupan las demás)
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('fin:RECEPCION:'||'{FVC}'));
CREATE TEMP TABLE m011d(paso text, payload jsonb);
DO $do$
DECLARE
  v_n int; v_t numeric; v_ok int; v_h numeric; v_cxp numeric; v_e int;
BEGIN
  -- D-1 · prerrequisitos: lotes A y B aplicados íntegros
  SELECT count(*)::int, coalesce(sum(unit_cost*tasa_cambio_recepcion*quantity),0),
         count(*) FILTER (WHERE unit_cost=1 AND moneda_recepcion='CUP' AND tasa_cambio_recepcion=1)::int
    INTO v_n, v_t, v_ok FROM public.receipt_items WHERE receipt_id='{FVC}';
  IF v_n<>{N_LINES} OR v_t<>{VAL_NEW} OR v_ok<>{N_LINES} THEN RAISE EXCEPTION 'ABORTO-D1a: líneas no conformes (%/%/%)', v_n, v_t, v_ok; END IF;
  SELECT count(*)::int INTO v_n FROM public.stock_movements WHERE reference_id='{FVC}' AND movement_type='purchase' AND unit_cost<>1;
  IF v_n<>0 THEN RAISE EXCEPTION 'ABORTO-D1b: capas no conformes=%', v_n; END IF;
  SELECT total_cost INTO v_h FROM public.receipts WHERE id='{FVC}';
  IF v_h<>{VAL_NEW} THEN RAISE EXCEPTION 'ABORTO-D1c: total_cost=%', v_h; END IF;
  -- D-2 · CXP neta del documento: prístina post-A/B o ya con RECT-011
  SELECT coalesce(sum(CASE WHEN fm.sense='credito' THEN fm.amount ELSE -fm.amount END),0) INTO v_cxp
    FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
   WHERE fe.document_id='{FVC}' AND fm.category_code='PAS_CXP_PROV';
  IF NOT (v_cxp={CXP_NETO_ANTES} OR v_cxp={VAL_NEW}) THEN RAISE EXCEPTION 'ABORTO-D2: CXP neta=%', v_cxp; END IF;
  SELECT count(*) INTO v_e FROM public.fin_entries WHERE id='{E011}';
  IF v_e>1 THEN RAISE EXCEPTION 'ABORTO-D3: entrada duplicada %', v_e; END IF;
  INSERT INTO m011d VALUES ('preflight', jsonb_build_object('cxp_neta', v_cxp, 'entry_existe', v_e));
END $do$;
INSERT INTO public.fin_entries (id, store_id, document_type, document_id, document_number, event,
  reversal_of, economic_date, posted_at, status, description, movements_snapshot)
VALUES ('{E011}','{STORE}','{ENTRY_TYPE}','{FVC}','{DOC_NUM}','{ENTRY_EVENT}',
  '{ORIG}','{ECO_DATE}',now(),'posted',
  '{desc_entry}',
  '{snap_movs}'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.fin_movements (id, entry_id, store_id, category_code, sense, amount, currency,
  exchange_rate, economic_date, description, traza)
VALUES
  ('{FMS['cxp']}','{E011}','{STORE}','PAS_CXP_PROV','debito',{TOTAL},'CUP',1,'{ECO_DATE}',
   'RECT-011 {DOC_NUM}: reducción de la obligación a valor 1 CUP/u (101 líneas)','{{"mision":"{MISION}","regla":"rect011-cxp-d"}}'::jsonb),
  ('{FMS['inv']}','{E011}','{STORE}','ACT_INVENTARIO','credito',{INV_CR},'CUP',1,'{ECO_DATE}',
   'RECT-011 {DOC_NUM}: desvalorización de existencias aún en capa FVC','{{"mision":"{MISION}","regla":"rect011-inv-c"}}'::jsonb),
  ('{FMS['cogs']}','{E011}','{STORE}','GAS_COSTO_VENTAS','credito',{COGS_CR},'CUP',1,'{ECO_DATE}',
   'RECT-011 {DOC_NUM}: corrección de COGS por unidades vendidas de la capa FVC','{{"mision":"{MISION}","regla":"rect011-cogs-c"}}'::jsonb),
  ('{FMS['vales']}','{E011}','{STORE}','GAS_VALES','credito',{VALES_CR},'CUP',1,'{ECO_DATE}',
   'RECT-011 {DOC_NUM}: corrección por unidades retiradas con vales de la capa FVC','{{"mision":"{MISION}","regla":"rect011-vales-c"}}'::jsonb),
  ('{FMS['perd']}','{E011}','{STORE}','GAS_PERDIDA_INV','credito',{PERD_CR},'CUP',1,'{ECO_DATE}',
   'RECT-011 {DOC_NUM}: corrección por pérdidas/ajustes de la capa FVC','{{"mision":"{MISION}","regla":"rect011-perd-c"}}'::jsonb)
ON CONFLICT (id) DO NOTHING;
DO $do$
DECLARE v_d numeric; v_cxp numeric; v_n int;
BEGIN
  SELECT sum(CASE WHEN sense='debito' THEN amount ELSE -amount END) INTO v_d
    FROM public.fin_movements WHERE entry_id='{E011}';
  IF v_d IS NULL OR v_d<>0 THEN RAISE EXCEPTION 'D-6: D=C=% — ROLLBACK', v_d; END IF;
  SELECT coalesce(sum(CASE WHEN fm.sense='credito' THEN fm.amount ELSE -fm.amount END),0) INTO v_cxp
    FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
   WHERE fe.document_id='{FVC}' AND fm.category_code='PAS_CXP_PROV';
  IF v_cxp<>{VAL_NEW} THEN RAISE EXCEPTION 'D-7: CXP neta post=% (esperado {VAL_NEW})', v_cxp; END IF;
  SELECT count(*) INTO v_n FROM public.fin_movements WHERE entry_id='{E011}';
  INSERT INTO m011d VALUES ('post', jsonb_build_object('balance', v_d, 'cxp_neta', v_cxp, 'movimientos', v_n));
END $do$;
INSERT INTO public.audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id)
VALUES ('{SEG}-{cfg["aud_entry"]}', now(), 'fin_entries', '{E011}', 'SYSTEM_RECT011_ENTRY',
  jsonb_build_object('cxp_neta_antes', {CXP_NETO_ANTES}, 'total_lineas_antes', {VAL_OLD}),
  jsonb_build_object('asiento','RECT-011','reversal_of','{ORIG}',
    'debito', jsonb_build_object('PAS_CXP_PROV', {TOTAL}),
    'credito', jsonb_build_object('ACT_INVENTARIO', {INV_CR}, 'GAS_COSTO_VENTAS', {COGS_CR}, 'GAS_VALES', {VALES_CR}, 'GAS_PERDIDA_INV', {PERD_CR})),
  '{META}'::jsonb, '{STORE}', '{TRACE}')
ON CONFLICT (id) DO NOTHING;
SELECT paso, payload FROM m011d ORDER BY paso;
COMMIT;"""

files = {'loteA_lineas.sql': loteA, 'loteB_capas.sql': loteB, 'loteC_wac.sql': loteC, 'loteD_asiento.sql': loteD}
for name, sql in files.items():
    with open(os.path.join(a.outdir, name), 'w') as f:
        f.write(sql)
    print(f'generado {a.outdir}/{name} ({len(sql)} bytes)')

expected = {
    'mision': MISION, 'segmento': SEG, 'receipt_id': FVC, 'entry_id': E011,
    'lotes': {
        'A': {'arch': 'loteA_lineas.sql', 'estado_post': {'lineas': 101, 'ya_ok': 101, 'subtotal_total': VAL_NEW, 'total_cost': VAL_NEW}},
        'B': {'arch': 'loteB_capas.sql', 'estado_post': {'capas': 101, 'sucias': 0, 'valor_total': VAL_NEW}},
        'C': {'arch': 'loteC_wac.sql', 'estado_post': {'wac_conformes': n_wac, 'wcl': n_wac}},
        'D': {'arch': 'loteD_asiento.sql', 'estado_post': {'balance': '0', 'cxp_neta': VAL_NEW, 'movimientos': 5}},
    },
    'importes': {'total': TOTAL, 'inv': INV_CR, 'cogs': COGS_CR, 'vales': VALES_CR, 'perdida': PERD_CR},
}
json.dump(expected, open(os.path.join(a.outdir, 'expected.json'), 'w'), ensure_ascii=False, indent=1)
print(f'generado {a.outdir}/expected.json')
print(f"importes: DR CXP {TOTAL} / CR INV {INV_CR} · COGS {COGS_CR} · VALES {VALES_CR} · PÉRDIDA {PERD_CR}")
