# 14 — IDEMPOTENCY (directiva §19)

## Contrato oficial (sin infraestructura nueva — usa el registry existente)

`_v3` integra el mecanismo estándar del proyecto (`idempotency_registry` +
helpers `check_idempotency`/`register_idempotency`, migración
`20260810000012_v2_26_hotfix3_idempotency_registry.sql`):

- El cliente puede enviar `idempotency_key` en el body (la ruta la pasa
  tal cual).
- `param_hash = md5(item_id | qty | store_id | reference_id | reference_doc)`
  — detecta reutilización de key con PARÁMETROS DIFERENTES.
- Primer uso: ejecuta y registra resultado en el registry (scope `withdraw_v3`).
  Retry con misma key + mismos parámetros: **replay del resultado registrado**
  sin re-ejecutar efectos.
- Sin key: la validación de overconsumption + `FOR UPDATE` evitan dobles
  efectos (verificado en P11/P12).

## Verificación empírica (P10)

| Paso | Resultado |
|---|---|
| Retiro 1 con `idempotency_key=F403-…-IDEM-KEY-1` | HTTP 200 |
| `idempotency_registry` fila registrada (key + operation `withdraw_v3`) | PASS (== 1) |
| Retry con MISMA key | HTTP 200 (replay) |
| Resultado del replay == resultado original (JSON idéntico) | PASS |
| Stock: sin doble decremento | PASS |
| Movimientos: +0 nuevos | PASS |
| Item `actual_qty`: sigue 1 (sin doble consumo) | PASS |
| Registry: sigue exactamente 1 fila para la key | PASS |

## Conclusión

**IDEMPOTENCY = PASS** — el mecanismo oficial del proyecto opera
correctamente sobre el camino real HTTP; el retry no produce ni
double withdrawal, ni double stock decrement, ni double accounting entry.
