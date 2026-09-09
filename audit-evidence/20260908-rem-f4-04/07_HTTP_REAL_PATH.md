# 07 — HTTP REAL PATH (Path A: el camino que estaba roto)

## Antes (RECON 04d4f062 — evidencia original, preservada)

```
Path A (HTTP real):
  POST /api/inventory/receptions → HTTP 201
  stock: 0 → 10
  WAC:   0 → 0          ← DEFECTO CONFIRMADO P1
```

## Después (suite F4-04 P1, mismo escenario por el mismo camino)

Fixture `Arena2` = `da654886-30b7-4d16-97fc-e116b0cca43a`, estado inicial
`stock=0, wac=0`, recepción HTTP real de 10 @ 100:

| Verificación | Resultado |
|---|---|
| HTTP 2xx en recepción | PASS — status **201** |
| receipt id devuelto | PASS |
| Stock 0 → 10 | PASS — stock=10 |
| **WAC 0 → 100** (antes: 0 → 0) | PASS — wac=100 |
| Movimiento creado (purchase) | PASS — `quantity_change=10.0000, unit_cost=100` |
| movement qty == 10 | PASS |
| movement unit_cost == 100 | PASS |
| receipt activo (`active`) | PASS |
| receipt total_cost == 1000 | PASS |
| `wac_change_log` == 1 evento | PASS (single contribution) |
| evento `reception_in` 0→100 | PASS |

## Cadena completa del camino real post-fix

```
POST /api/inventory/receptions (HTTP 201)
  → register_reception (RPC SECURITY DEFINER, transacción atómica)
      → receipts INSERT
      → receipt_items INSERT (unit_cost > 0 validado)
      → fn_recalc_wac('reception_in', qty, uc_base)   ← NUEVO (escritor canónico)
      → register_stock_movement('purchase')            ← kardex ve ca_new
      → receipts.total_cost UPDATE
      → audit_logs INSERT ('REGISTER_RECEPTION')
```

## Conclusión

El camino que los usuarios reales usan desde la UI de recepción termina ahora
en el escritor canónico `fn_recalc_wac`. El defecto de flujo F4-04 está
cerrado **en el camino HTTP real**, no solo en un harness.
