-- FASE 1c: la fórmula del desequilibrio por partes (LIVE, sin llamadas de escritura)
WITH bal AS (
  SELECT
    coalesce(round(sum(CASE WHEN c.clase = 'activo' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 2), 0) AS activo_neto,
    coalesce(round(sum(CASE WHEN c.clase IN ('pasivo','patrimonio') THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 2), 0) AS pas_pat_neto,
    coalesce(round(sum(CASE WHEN c.clase = 'ingreso' THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 2), 0) AS ingreso_neto,
    coalesce(round(sum(CASE WHEN c.clase = 'gasto' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 2), 0) AS gasto_neto
  FROM fin_movements m
  JOIN fin_entries e ON e.id = m.entry_id
  JOIN fin_categories c ON c.code = m.category_code
  WHERE m.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND m.economic_date <= '2026-11-19'
)
SELECT activo_neto, pas_pat_neto, ingreso_neto, gasto_neto,
       activo_neto - pas_pat_neto - ingreso_neto AS desequilibrio_formula_actual,
       activo_neto - pas_pat_neto - (ingreso_neto - gasto_neto) AS desequilibrio_correcto,
       gasto_neto AS menos_gastos
FROM bal
