-- ============================================================================
-- CP-RECEIPT-INTEGRITY-001 — CONSULTAS SQL INDEPENDIENTES
-- Auditoría forense de recepciones: FAC-VITALLCONS-001 (fd9d6c88) + alcance
-- general. Producción wthkddeleylijmonclxg — EXCLUSIVAMENTE LECTURA.
--
-- NOTA DE EJECUCIÓN: en el sandbox de auditoría no había ruta IPv4 al host
-- db.wthkddeleylijmonclxg.supabase.co (solo IPv6, sin salida) ni contraseña
-- de BD de producción, por lo que cada consulta se ejecutó de FORMA
-- EQUIVALENTE vía REST PostgREST (service_role) + agregación en JS puro
-- (scripts/forensic-extract-fd9d6c88.mjs y scripts/matriz-recepciones.mjs,
-- persistidos en el expediente). Estos SQL reproducen exactamente las mismas
-- magnitudes para poder re-verificarlos con psql o la Management API.
-- ============================================================================

-- ─── FASE 1: la recepción tal cual está en la BD ───────────────────────────
-- 1.1 Cabecera completa (estado REAL, no el de la interfaz)
SELECT * FROM public.receipts WHERE id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';

-- 1.2 Todas sus líneas (101) con la identidad del producto
SELECT ri.id, ri.product_id, p.name, p.sku, p.price_currency AS moneda_producto,
       ri.quantity, ri.unit_cost, ri.moneda_recepcion, ri.tasa_cambio_recepcion,
       ri.quantity * ri.unit_cost                          AS subtotal_moneda_original,
       ri.quantity * ri.unit_cost * ri.tasa_cambio_recepcion AS equivalente_cup
FROM public.receipt_items ri
LEFT JOIN public.products p ON p.id = ri.product_id
WHERE ri.receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
ORDER BY ri.created_at;

-- ─── FASE 2: recomputo INDEPENDIENTE del total (sin usar la UI) ─────────────
-- 2.1 Suma de subtotales por MONEDA ORIGINAL (la «suma comunicada» 5.404.573,25
--     es 5.129.706 CUP + 274.867,25 USD SUMADOS SIN CONVERTIR)
SELECT ri.moneda_recepcion,
       SUM(ri.quantity * ri.unit_cost)             AS subtotal_moneda_original,
       COUNT(*)                                     AS lineas
FROM public.receipt_items ri
WHERE ri.receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
GROUP BY ri.moneda_recepcion;

-- 2.2 Equivalente CUP (una sola conversión por línea) vs cabecera
SELECT r.total_cost                                   AS total_cabecera,
       SUM(ri.quantity * ri.unit_cost * ri.tasa_cambio_recepcion) AS suma_cup_lineas,
       r.total_cost - SUM(ri.quantity * ri.unit_cost * ri.tasa_cambio_recepcion) AS diferencia,
       SUM(ri.quantity * ri.unit_cost)               AS suma_mezcla_sin_convertir,
       r.total_cost - SUM(ri.quantity * ri.unit_cost) AS diferencia_vs_mezcla
FROM public.receipts r
JOIN public.receipt_items ri ON ri.receipt_id = r.id
WHERE r.id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
GROUP BY r.id;
-- Resultado esperado: diferencia = 0,00 · diferencia_vs_mezcla = 186.634.862,75
-- (= 274.867,25 USD × (680 − 1) → la conversión FX, exactamente UNA vez)

-- 2.3 Autoridad del servidor (RPC SELECT puro — solo lectura)
SELECT public.calculate_receipt_total_cup('fd9d6c88-5db8-49ea-b185-8bc96cc93e63') AS total_autoritario;

-- 2.4 Verificación F-21 de coherencia por línea del caso
SELECT COUNT(*) AS lineas_incoherentes
FROM public.receipt_items ri
WHERE ri.receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
  AND ((ri.moneda_recepcion = 'CUP' AND ri.tasa_cambio_recepcion IS DISTINCT FROM 1.0)
    OR (ri.moneda_recepcion <> 'CUP' AND (ri.tasa_cambio_recepcion IS NULL OR ri.tasa_cambio_recepcion <= 1.5)));

-- ─── FASE 3: monedas y tasas — dónde vive cada magnitud ─────────────────────
-- 3.1 Moneda/tasa del PRODUCTO (venta) vs moneda/tasa de cada LÍNEA (costo)
SELECT p.sku, p.name, p.price_currency AS moneda_producto,
       ri.moneda_recepcion AS moneda_linea, ri.tasa_cambio_recepcion AS tasa_linea,
       ri.unit_cost
FROM public.receipt_items ri
JOIN public.products p ON p.id = ri.product_id
WHERE ri.receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
  AND p.price_currency IS DISTINCT FROM ri.moneda_recepcion;
-- 5 líneas (2 USD-línea/CUP-producto + 3 CUP-línea/USD-producto)

-- 3.2 Tasas oficiales disponibles en la fecha del documento y en la real
SELECT rate_date, source, segment, rate
FROM public.exchange_rates
WHERE currency = 'USD' AND segment = '3'
  AND rate_date BETWEEN '2026-06-28' AND '2026-07-03'
ORDER BY rate_date, source;

-- 3.3 Tasa de la tienda (solo POS/ventas — las recepciones NO la usan)
SELECT * FROM public.store_exchange_rates
WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

-- ─── FASE 4: ciclo de vida, trazabilidad y mutabilidad ──────────────────────
-- 4.1 Timeline de auditoría del documento (solo 1 evento: pending→active)
SELECT created_at, action, table_name, record_id, old_data, new_data
FROM public.audit_logs
WHERE record_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
ORDER BY created_at;

-- 4.2 Mutaciones de tasas sobre SUS líneas (la de HOY 2026-11-14T12:15Z)
SELECT a.*
FROM public.receipt_tasa_audit a
JOIN public.receipt_items ri ON ri.id = a.receipt_item_id
WHERE ri.receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
ORDER BY a.modificado_at;

-- 4.3 Movimientos de inventario de sus productos SIN vínculo (trazabilidad rota)
SELECT m.id, m.product_id, m.quantity_change, m.unit_cost, m.movement_date,
       m.reference_id, m.reference_doc, m.notes
FROM public.stock_movements m
JOIN public.receipt_items ri ON ri.product_id = m.product_id
WHERE ri.receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
  AND m.movement_type = 'purchase'
  AND m.movement_date BETWEEN '2026-06-25' AND '2026-08-20'
  AND m.reference_id IS NULL
ORDER BY m.movement_date;

-- 4.4 Contabilización CP-FIN del documento (asiento emitido HOY por m020)
SELECT id, event, economic_date, posted_at, status,
       (movements_snapshot -> 0 ->> 'amount') AS importe,
       (movements_snapshot -> 0 -> 'traza')   AS traza
FROM public.fin_entries
WHERE document_type = 'RECEPCION'
  AND document_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';

-- ─── FASE 5: alcance general — matriz completa de recepciones ───────────────
-- 5.1 Recomputo independiente de TODAS las recepciones (0 esperadas con dif > 1)
SELECT r.id, r.reference_doc, s.name AS tienda, r.reception_date, r.status,
       r.total_cost AS total_cabecera,
       SUM(ri.quantity * ri.unit_cost * ri.tasa_cambio_recepcion) AS suma_cup,
       ROUND(r.total_cost - SUM(ri.quantity * ri.unit_cost * ri.tasa_cambio_recepcion), 2) AS diferencia,
       COUNT(DISTINCT ri.moneda_recepcion) AS monedas,
       COUNT(*) AS lineas
FROM public.receipts r
JOIN public.receipt_items ri ON ri.receipt_id = r.id
JOIN public.stores s ON s.id = r.store_id
GROUP BY r.id, r.reference_doc, s.name, r.reception_date, r.status, r.total_cost
HAVING ABS(r.total_cost - SUM(ri.quantity * ri.unit_cost * ri.tasa_cambio_recepcion)) > 1
ORDER BY diferencia DESC;
-- Resultado esperado: 0 filas (98/98 consistentes)

-- 5.2 Recepciones con líneas en divisa (expuestas al defecto de presentación)
SELECT r.id, r.reference_doc, s.name AS tienda, r.reception_date, r.status,
       ri.moneda_recepcion, ri.tasa_cambio_recepcion, COUNT(*) AS lineas,
       SUM(ri.quantity * ri.unit_cost) AS subtotal_moneda_original
FROM public.receipts r
JOIN public.receipt_items ri ON ri.receipt_id = r.id
JOIN public.stores s ON s.id = r.store_id
WHERE ri.moneda_recepcion <> 'CUP'
GROUP BY r.id, r.reference_doc, s.name, r.reception_date, r.status, ri.moneda_recepcion, ri.tasa_cambio_recepcion
ORDER BY r.reception_date;
-- 5 recepciones: fd9d6c88 (USD@680) + 4 del 2026-10-26 (USD@835/840/845)

-- 5.3 Sin contabilizar (backfill m020 pendiente fuera de ENERVIDA)
SELECT r.id, r.reference_doc, s.name AS tienda, r.reception_date, r.status, r.total_cost
FROM public.receipts r
JOIN public.stores s ON s.id = r.store_id
WHERE NOT EXISTS (SELECT 1 FROM public.fin_entries fe WHERE fe.document_id = r.id AND fe.document_type = 'RECEPCION')
ORDER BY s.name, r.reception_date;
-- 9 recepciones (5 PUERTO PADRE + 4 COSTPRO-Prueba, incluida 1 revertida)

-- 5.4 Mutaciones post-confirmación en TODO el dominio (hoy: 1 sobre fd9d6c88)
SELECT a.receipt_item_id, a.valor_anterior, a.valor_nuevo, a.moneda_anterior,
       a.moneda_nueva, a.modificado_por, a.modificado_at, a.motivo
FROM public.receipt_tasa_audit a
JOIN public.receipt_items ri ON ri.id = a.receipt_item_id
JOIN public.receipts r ON r.id = ri.receipt_id
WHERE r.status <> 'pending'
ORDER BY a.modificado_at;

-- 5.5 Contabilidad vs líneas (0 divergencias esperadas de las 89 contabilizadas)
SELECT fe.document_id, (fe.movements_snapshot -> 0 ->> 'amount')::numeric AS importe_cpfin,
       SUM(ri.quantity * ri.unit_cost * ri.tasa_cambio_recepcion)          AS suma_cup
FROM public.fin_entries fe
JOIN public.receipt_items ri ON ri.receipt_id = fe.document_id
WHERE fe.document_type = 'RECEPCION' AND fe.event = 'reconocimiento'
GROUP BY fe.document_id, fe.movements_snapshot
HAVING ABS((fe.movements_snapshot -> 0 ->> 'amount')::numeric - SUM(ri.quantity * ri.unit_cost * ri.tasa_cambio_recepcion)) > 0.01;

-- ─── VERIFICACIÓN POST-CORRECCIÓN (tras aplicar el PR de la misión) ─────────
-- 6.1 El trigger de inmutabilidad está instalado
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.receipt_items'::regclass AND NOT tgisinternal;
-- 6.2 Una línea confirmada ya NO se puede mutar directamente (debe lanzar
--     ERR_RECEIPT_ITEM_IMMUTABLE salvo escape hatch gobernado):
-- UPDATE public.receipt_items SET tasa_cambio_recepcion = 999
-- WHERE id = '<línea de una recepción active>';  -- PROHIBIDO ejecutar en prod
