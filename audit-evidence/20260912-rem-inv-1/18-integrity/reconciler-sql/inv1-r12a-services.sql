-- R12a: prorrateo de servicios — suma distribuida vs total del servicio (Fase 5)
SELECT rs.service_number, st.name AS store, rs.status, rs.total_amount,
       COALESCE(SUM(scd.distribution_amount),0) AS distributed,
       rs.total_amount - COALESCE(SUM(scd.distribution_amount),0) AS residual,
       COUNT(scd.id) AS n_distributions,
       MIN(scd.distribution_amount) AS min_amt,
       SUM(CASE WHEN scd.distribution_amount < 0 THEN 1 ELSE 0 END) AS negative_dists
FROM received_services rs
JOIN stores st ON st.id=rs.store_id
LEFT JOIN service_cost_distributions scd ON scd.service_id=rs.id
GROUP BY rs.service_number, st.name, rs.status, rs.total_amount
ORDER BY ABS(rs.total_amount - COALESCE(SUM(scd.distribution_amount),0)) DESC LIMIT 30;
