# W9.4.9 — H5-B3 — GATE 7: PRUEBA DE IDEMPOTENCIA CONCURRENTE

Fecha: 2026-09-04 | Fuente: TEST A + B2 de 05-race-test.md; verificación de estado en 07/13.

## Diseño exigido por el protocolo

```text
CALL A ───────────────┐
                      ├── misma transacción (…0101)
CALL B ───────────────┘
(simultáneos, sesiones PostgreSQL independientes vía PostgREST)
```

## Resultado exacto obtenido

```text
CALL A (A-session-1): HTTP 200  {"status":"idempotent", …}   ← perdedor del lock
CALL B (A-session-2): HTTP 200  {"status":"success", units_restored:5}  ← ganador
```

- `one winner` ✔ (exactamente un `success`)
- `one safe rejection/idempotent result` ✔ (el otro respondió `status:'idempotent'`)
- `final state = voided` ✔
- `sin doble impacto económico` ✔ (1 stock_movement, 1 evento audit REVERSE_TRANSACTION_V2,
  0 filas nuevas en payment_transactions)

## Refuerzo (B2): bloqueo real observado + idempotencia post-lock

Con el lock retenido externamente, la segunda sesión:
1. se BLOQUEÓ físicamente (`wait_event_type='Lock'`, `wait_event='transactionid'`),
2. devolvió `idempotent` tras liberarse el lock (4229 ms),
3. dejó **0** movimientos, **0** audit, **0** efectos.

## Conclusión

El segundo caller concurrente NO duplica la reversión: o espera y sale por idempotencia
(caso carrera), o es rechazado con ERR_ALREADY_VOIDED (caso cruzado con void_transaction).
El comportamiento es el "Caso seguro" del protocolo, demostrado con dos sesiones reales.
