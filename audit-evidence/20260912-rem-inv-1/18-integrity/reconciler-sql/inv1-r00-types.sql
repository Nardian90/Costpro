-- R0: taxonomía de movement_type (todos los tipos y volúmenes)
SELECT movement_type, COUNT(*) AS n, SUM(quantity_change) AS total_qty,
       SUM(cost_value_change) AS total_cost_delta
FROM stock_movements
GROUP BY movement_type
ORDER BY n DESC;
