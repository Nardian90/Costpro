-- CP-WH-001 — hallazgo: 604 entradas VALE_SALIDA para 203 documentos (solo lectura)
-- 1. Distribución de entradas por documento
SELECT entradas_por_doc, count(*) AS documentos
FROM (
  SELECT e.document_id, count(*) AS entradas_por_doc
  FROM public.fin_entries e WHERE e.document_type = 'VALE_SALIDA'
  GROUP BY e.document_id
) t GROUP BY entradas_por_doc ORDER BY entradas_por_doc;

-- 2. Ejemplo de vales duplicados: número, fechas de creación de cada entrada
SELECT i.slip_number, i.created_at::date AS fecha_vale, e.posted_at AS fecha_entrada,
       em.amount, em.economic_date, e.event, em.traza
FROM public.fin_entries e
JOIN public.fin_movements em ON em.entry_id = e.id
JOIN public.issue_slips i ON i.id = e.document_id
WHERE e.document_type = 'VALE_SALIDA' AND em.sense = 'debito'
  AND e.document_id IN (
    SELECT document_id FROM public.fin_entries WHERE document_type='VALE_SALIDA'
    GROUP BY document_id HAVING count(*) > 1
  )
ORDER BY i.slip_number, e.posted_at LIMIT 12;

-- 3. ¿Hay constraint de unicidad/idempotencia en fin_entries?
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'fin_entries';

-- 4. created_at de las entradas duplicadas (¿cuándo se multiplicaron?)
SELECT date_trunc('day', e.posted_at) AS dia, count(*) AS entradas,
       count(DISTINCT e.document_id) AS documentos
FROM public.fin_entries e WHERE e.document_type = 'VALE_SALIDA'
GROUP BY 1 ORDER BY 1;

-- 5. Impacto económico de la duplicación (exceso vs costo real de los vales)
SELECT sum(i.total_cost) AS costo_real_203_vales,
       (SELECT sum(em.amount) FROM public.fin_entries e
        JOIN public.fin_movements em ON em.entry_id = e.id
        WHERE e.document_type='VALE_SALIDA' AND em.sense='debito') AS debito_contabilizado
FROM public.issue_slips i
WHERE i.status = 'completed'
  AND EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type='VALE_SALIDA' AND e.document_id = i.id);

-- 6. ¿Entradas huérfanas? document_id que ya no existe en issue_slips
SELECT count(*) AS entradas_huerfanas, count(DISTINCT e.document_id) AS docs_huerfanos
FROM public.fin_entries e
WHERE e.document_type = 'VALE_SALIDA'
  AND NOT EXISTS (SELECT 1 FROM public.issue_slips i WHERE i.id = e.document_id);

-- 7. Entradas válidas (document_id existe): conteo real por documento
SELECT entradas_por_doc, count(*) AS documentos
FROM (
  SELECT e.document_id, count(*) AS entradas_por_doc
  FROM public.fin_entries e
  WHERE e.document_type = 'VALE_SALIDA'
    AND EXISTS (SELECT 1 FROM public.issue_slips i WHERE i.id = e.document_id)
  GROUP BY e.document_id
) t GROUP BY entradas_por_doc ORDER BY entradas_por_doc;
