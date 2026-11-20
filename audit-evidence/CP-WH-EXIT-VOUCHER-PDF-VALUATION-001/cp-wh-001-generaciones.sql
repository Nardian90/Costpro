-- CP-WH-001 — arquitectura de generaciones contables (solo lectura)
-- 1. Tablas de generación
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE '%generation%';

-- 2. Generaciones registradas
SELECT * FROM public.fin_posting_generations ORDER BY 1;

-- 3. Entradas VALE_SALIDA por generación
SELECT e.generation_id, g.status, count(*) AS entradas, count(DISTINCT e.document_id) AS documentos
FROM public.fin_entries e
LEFT JOIN public.fin_posting_generations g ON g.id = e.generation_id
WHERE e.document_type='VALE_SALIDA'
GROUP BY e.generation_id, g.status ORDER BY 1;
