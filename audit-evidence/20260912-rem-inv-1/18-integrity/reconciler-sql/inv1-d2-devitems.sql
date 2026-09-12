-- D2: items de esas devoluciones + movimientos del mismo producto/tienda ±7 días
WITH suspect AS (
  SELECT d.id AS dev_id, d.store_id, d.devolution_number
  FROM devolutions d JOIN stores s ON s.id=d.store_id
  WHERE s.name='TIENDA CENTRAL COSTPRO' AND d.devolution_number IN ('NC-000008-2026','NC-000007-2026')
)
SELECT sus.devolution_number, p.sku, di.quantity AS returned_qty, di.unit_price, di.total,
       (SELECT COUNT(*) FROM stock_movements sm
         WHERE sm.store_id=sus.store_id AND sm.product_id=di.product_id
           AND sm.movement_type IN ('return','devolution_reverse')) AS n_return_movs,
       (SELECT COALESCE(SUM(sm.quantity_change),0) FROM stock_movements sm
         WHERE sm.store_id=sus.store_id AND sm.product_id=di.product_id
           AND sm.movement_type IN ('return','devolution_reverse')) AS net_return_qty
FROM suspect sus
JOIN devolution_items di ON di.devolution_id=sus.dev_id
JOIN products p ON p.id=di.product_id;
