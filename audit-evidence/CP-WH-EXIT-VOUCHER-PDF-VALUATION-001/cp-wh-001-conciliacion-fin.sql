-- CP-WH-001 — profundización VALE_SALIDA contable (solo lectura)
-- 1. Distinción entradas por evento y documentos distintos
SELECT e.event, count(*) AS entradas, count(DISTINCT e.document_id) AS documentos_distintos
FROM public.fin_entries e WHERE e.document_type = 'VALE_SALIDA'
GROUP BY e.event;

-- 2. Los 37 completados sin asiento: antigüedad y tienda
SELECT s.name AS tienda, min(i.created_at::date) AS desde, max(i.created_at::date) AS hasta,
       count(*) AS vales, sum(i.total_cost) AS costo_total_cup
FROM public.issue_slips i JOIN public.stores s ON s.id = i.store_id
WHERE i.status = 'completed'
  AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type='VALE_SALIDA' AND e.document_id = i.id)
GROUP BY s.name ORDER BY vales DESC;

-- 3. Detalle por mes de los vales sin asiento (¿previos al motor 2026-11-13?)
SELECT date_trunc('month', i.created_at)::date AS mes, count(*) AS vales, sum(i.total_cost) AS costo
FROM public.issue_slips i
WHERE i.status = 'completed'
  AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type='VALE_SALIDA' AND e.document_id = i.id)
GROUP BY 1 ORDER BY 1;

-- 4. Vales CON asiento: suma por evento (reconciliar contra universo 240)
SELECT e.event, count(*) AS entradas
FROM public.fin_entries e WHERE e.document_type='VALE_SALIDA'
GROUP BY e.event;

-- 5. Anulaciones/devoluciones: entradas de anulación por estado del vale
SELECT i.status, e.event, count(*) AS entradas
FROM public.fin_entries e JOIN public.issue_slips i ON i.id = e.document_id
WHERE e.document_type = 'VALE_SALIDA'
GROUP BY i.status, e.event ORDER BY i.status, e.event;
