-- Integridad misión anterior: RECT-FIN-E2614F36
SELECT id, store_id, document_type, document_number, event, economic_date, status, posted_at
FROM fin_entries WHERE document_number LIKE '%E2614F36%' OR document_type='RECTIFICACION_FIN'
