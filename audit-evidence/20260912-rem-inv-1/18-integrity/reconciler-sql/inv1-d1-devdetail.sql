-- D1: detalle de las devoluciones sospechosas en TIENDA CENTRAL (producción)
SELECT d.id::text, d.devolution_number, d.status, d.total_amount, d.currency,
       d.created_at, d.processed_at, d.original_transaction_id::text, d.reason, d.payment_method
FROM devolutions d JOIN stores s ON s.id=d.store_id
WHERE s.name='TIENDA CENTRAL COSTPRO'
  AND d.devolution_number IN ('NC-000008-2026','NC-000007-2026')
ORDER BY d.devolution_number;
