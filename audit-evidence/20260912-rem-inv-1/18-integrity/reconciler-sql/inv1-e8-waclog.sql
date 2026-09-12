-- E8: log de cambios de WAC — qué eventos lo recalculan en la práctica
SELECT event, COUNT(*) AS n,
       COUNT(DISTINCT store_id) AS stores,
       MIN(created_at)::date AS first_seen, MAX(created_at)::date AS last_seen
FROM wac_change_log
GROUP BY event ORDER BY n DESC;
