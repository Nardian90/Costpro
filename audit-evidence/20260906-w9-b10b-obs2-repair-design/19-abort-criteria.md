# W9.5 — B-10b-OBS-2 · REPAIR DESIGN · 19-abort-criteria.md
# Criterios de aborto (GATE 19)

Ante CUALQUIERA de estas condiciones, la fase de ejecución debe:
`ABORT` (detener el procedimiento) → `ROLLBACK` (transacción completa, nunca parcial) →
`NO REPAIR` (no reintentar sin nuevo diagnóstico y nueva firma). El aborto NUNCA deja
estado intermedio: la transacción única (12-atomicity.md) lo garantiza estructuralmente.

## Catálogo de aborto (hard)

| # | Condición | Detección |
|---|---|---|
| A1 | El universo cambia: cualquier fila products de la tienda difiere del pack (creada/borrada/renombre/status/stock_current/cost_average) | re-consulta vs raw/frozen_universe.json en PRE y en-transacción |
| A2 | Cualquier checksum PRE ≠ congelado (stock, WAC, counts) | 20-zero-mutation.md §PRE |
| A3 | Aparece inventory (≥1 fila) para la tienda | count > 0 |
| A4 | Aparece stock_movements (≥1 fila) para la tienda | count > 0 |
| A5 | Aparece transactions (o items) para la tienda | count > 0 |
| A6 | Aparece kardex para la tienda | count > 0 |
| A7 | WAC desconocido: cost_average NULL/≤0 en alguna fila de la apertura | V5/V8 por fila |
| A8 | Producto inesperado: id en DB que no está en el pack, o viceversa | set difference |
| A9 | Cantidad inesperada: stock_current ≠ opening_qty de alguna fila (drift entre diseño y ejecución) | assert por fila |
| A10 | Trigger inesperado: pg_triggerdef ≠ congelado; o error de trigger durante el RPC | comparación + excepción |
| A11 | Función cambia: pg_get_functiondef ≠ congelado (escritores canónicos o funciones prohibidas) | comparación PRE |
| A12 | Actor no identificable: auth.uid() NULL en la sesión, sin has_store_access, o p_user_id ≠ firmante firmado | check de sesión |
| A13 | Constraint falla / excepción PostgreSQL cualquiera durante el batch | excepción → ROLLBACK total |
| A14 | Barrera de idempotencia activa (apertura ya presente) | 11-idempotency.md B1 |
| A15 | Cualquier diferencia no explicada entre estado esperado y observado, aunque «parezca mejor» (más inventario, más filas, valores «redondeados») | regla general |
| A16 | Desviación en escritura: el conteo de filas creadas tras COMMIT ≠ +98/+98/+98/+98/+1 | POST inmediato |
| A17 | Pendiente de descarga: se detecta operación concurrente en la tienda durante la ventana (nueva venta/ajuste) | locks timeout / observación |

## Comportamiento esperado por fase

```text
PRE fallido        → NO iniciar transacción. Reportar. Volver a diseño con nueva evidencia.
DURANTE fallido    → EXCEPTION → ROLLBACK completo automático. Reportar con el mensaje
                     exacto del error. Prohibido «arreglar en caliente».
POST fallido       → COMMIT ya ocurrió: NO intentar «reparar la reparación» ad-hoc.
                     Ejecutar rollback formal (17-rollback-design.md) con firma, y abrir
                     investigación nueva (BACKLOG).
```

## Regla de oro

> La reparación reconoce una posición demostrada; si la demostración deja de sostenerse
> en un solo punto, no hay posición que reconocer y el procedimiento entero sobra.
> Cero mutaciones bajo duda.
