# FASE E-SEC — 09 IDEMPOTENCIA (GATE E9)

## Fecha
2026-09-26 · pre y post fix (comportamiento IDÉNTICO en ambas fases — el fix no tocó
la lógica de idempotencia).

## Comando
Matriz A21/A22 (`scripts/esec-matrix.py`): replay exacto y replay con payload
manipulado, misma `idempotency_key`, mismo `store_id`.

## Resultado (post-fix)

| Prueba | Resultado | Evidencia |
|---|---|---|
| A3 venta inicial (key `esec-post-{RUN}-A3`) | 200 success, tx 8608beb2 | resultados-post.json |
| A21 replay EXACTO (misma key, mismo payload) | **200 `status=idempotent`, misma tx 8608beb2** — NO se creó segunda venta, NO se duplicó movimiento, NO se aplicó doble descuento | recon: 3 entradas de A3/A21/A22 apuntan a la MISMA tx |
| A22 misma key + payload DIFERENTE (490→1) | **200 `idempotent`, misma tx 8608beb2 (la de 490)** — la política "primera gana" evita que el replay sea un vector de manipulación | ídem |
| payment_transactions | creadas una sola vez (idempotency `pay-cash-<tx>`) | diseño v2 preexistente |

## Política observada (documentada, no inventada)
```text
CREATE_SALE_V2: idempotencia por (idempotency_key, store_id) sobre transactions.
Misma key → devuelve {status: 'idempotent', transaction_id} sin re-ejecutar nada.
No existe detección de "misma key con payload diferente": el replay con cuerpo
distinto devuelve la venta ORIGINAL (primera gana) — seguro contra manipulación,
aunque no alerta al cliente del conflicto.
```
DECISIÓN DE NEGOCIO PENDIENTE (registrada, no decidida): ¿desea el propietario un
error explícito (p.ej. 409 IDEMPOTENCY_CONFLICT) cuando la key se reutilice con un
payload diferente? El comportamiento actual es seguro; el cambio sería UX.

## Interpretación
E9 cumple: una solicitud repetida es la MISMA transacción; el replay con precio
manipulado NO crea una segunda venta ni doble salida de inventario.
