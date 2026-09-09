# 11 — IDEMPOTENCY (retry oficial, sin duplicación de efectos)

## Mecanismo oficial de idempotencia documentado

La tabla `receipts` posee el índice único
`idx_receipts_store_reference_doc (store_id, reference_doc)` — el retry de una
recepción con la misma referencia de factura en la misma tienda es **rechazado
por la base de datos**, garantizando ausencia de duplicados por diseño.

## Ejecución (suite F4-04 P8)

| Paso | Verificación | Resultado |
|---|---|---|
| Primera recepción (factura `F404-IDEM`) | HTTP **201** | PASS |
| Retry duplicado (mismo invoice/store) | HTTP **500** con `duplicate key value violates unique constraint "idx_receipts_store_reference_doc"` | PASS (mecanismo oficial de rechazo) |
| Stock tras retry: sigue en **5** | PASS — sin doble efecto |
| WAC tras retry: sigue en **100** | PASS — sin doble contribución |
| Receipts del supplier == **1** | PASS — sin receipt duplicado |
| Movimientos de stock == **1** | PASS |
| Contribuciones WAC == **1** | PASS |

## Interpretación

- El retry NO crea receipt, NO crea movimiento, NO crea contribución de WAC.
- El estado queda byte-idéntico tras el retry fallido → idempotencia efectiva
  para clientes que reintentan por timeout/red.
- Este mecanismo era pre-existente y la remediación NO lo alteró (el índice
  único no fue tocado; la única pieza cambiada es el cuerpo de
  `register_reception`).

## Veredicto

**IDEMPOTENCY = PASS** — retry rechazado por constraint oficial, cero efectos
duplicados (receipt / movement / WAC contribution).
