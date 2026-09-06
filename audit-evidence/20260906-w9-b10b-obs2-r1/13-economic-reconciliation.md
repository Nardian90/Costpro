# W9.5 — B-10b-OBS-2-R1 · 13-economic-reconciliation.md
# §28 RECONCILIACIÓN ECONÓMICA — exacta, sin redondeos silenciosos

## Las tres cifras (todas registradas, ninguna sustituye a otra)

```text
1) Σ(quantity × approved_wac) a nivel movement — EXACTO:
     9,932,216.938816005
   (stock_movements.quantity_change × stock_movements.unit_cost, numeric sin límite;
   coincide Δ=0 con la simulación del diseño raw/simulation_result.json)

2) Cifra publicada en el diseño y en la orden humana:
     9,932,216.94
   → |exacto − publicada| = 0.0011839941 — redondeo a 2 decimales de la cifra
   publicada; diferencia EXACTA documentada (no hay redondeo silencioso: el valor
   exacto vive en las 98 filas de movement y en audit_logs.new_data.estimated_value)

3) Σ kardex_entries.total_value (columna numeric(12,2), redondeo canónico por fila):
     9,932,216.94
   → coincide EXACTAMENTE con la cifra publicada (el redondeo 2-dp por fila del
   kardex, comportamiento frozen del pipeline, reproduce el total publicado)
```

## Desglose por conjunto (autoridad: CSV congelado)

```text
Set A — frozen (94 productos):            4.961 u   9.780.688,78 ESTIMATED
Set B — delta confirmado (4 productos):   1.466 u     151.528,16 ESTIMATED
────────────────────────────────────────────────────────────────────────
APERTURA EJECUTADA:                       6.427 u   9.932.216,938816005 exacto
Excluido Test (10 productos):               126 u  (12.000.481,33 inflados FUERA)
Identidad: 6.553 declaradas = 6.427 ledger + 126 Test residue ✓
Identidad: 5.495 backup + 932 deltas confirmados = 6.427 ✓
```

## Verificación in-transacción y POST

- Report de la transacción (`raw/r1_execution_result.json`): units_opened = 6427 ·
  value_opened = 9932216.938816005
- POST (`raw/r1_post_verification.json` → batch.value_exact): 9932216.938816005 ·
  batch.kardex_value_2dp: 9932216.94
- Comparador (`r1_check_post.js`): PASS — `|Σ − 9,932,216.94| = 0.001183994`
