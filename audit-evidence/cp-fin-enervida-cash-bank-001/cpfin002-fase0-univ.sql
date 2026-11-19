-- Universo de movimientos financieros ENERVIDA por categoría/moneda/evento
SELECT category_code, sense, currency, count(*) AS n, sum(amount) AS sum_amount, sum(amount_cup) AS sum_cup,
       sum(CASE WHEN amount_origin IS NULL THEN 1 ELSE 0 END) AS null_origin
FROM fin_movements
WHERE store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38'
GROUP BY category_code, sense, currency ORDER BY category_code, sense, currency
