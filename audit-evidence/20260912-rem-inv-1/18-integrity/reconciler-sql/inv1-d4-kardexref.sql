-- D4: linkage del kardex (reference_type/reference_id) por tipo
SELECT k.reference_type, COUNT(*) AS n,
       SUM(CASE WHEN k.reference_id IS NULL THEN 1 ELSE 0 END) AS null_refs
FROM kardex_entries k
GROUP BY k.reference_type ORDER BY n DESC;
