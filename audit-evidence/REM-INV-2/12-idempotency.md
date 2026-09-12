# REM-INV-2 — 12: IDEMPOTENCIA (staging aislado)

Protocolo: determinar si existe idempotency key / reference / unique constraint / document state guard / transaction lock; probar `same request × 2`, `× 5` y concurrente; esperado ONE EFFECT.

## 1. Verificación de mecanismos (definición verbatim + esquema)

| Mecanismo | Presente en la V1 |
|---|---|
| Idempotency key | NO (la firma ni siquiera acepta uno) |
| Unique constraint utilizable como guard | NO (`purchase_items` no tiene unique por documento+producto) |
| Document state guard | NO (el UPDATE final no filtra por status — ver 07) |
| Transaction lock (`FOR UPDATE`) | NO |

## 2. Resultados de staging

```text
[FAIL (stock applied 5 times — no idempotency key/guard/unique)] same request x5 :: p2_stock cumulative=23, movements for PO_ID=5 (each call = full re-application)
[FAIL (5 rows, 1 effective reception expected)] movement rows for 5 identical calls :: rows=5
```

- ×2 (06): stock aplicado 2 veces, movimientos 2→4.
- ×5: la recepción de qty 3 se aplicó **cinco veces** — cada llamada re-iteró el loop completo e insertó un movimiento nuevo; 5 filas de kardex para UNA recepción efectiva.

## 3. Análisis

La V1 es **no-idempotente por construcción**: "una segunda llamada falla" NO se cumple ni siquiera débilmente — la segunda llamada **triunfa y duplica**. El protocolo exige ONE EFFECT y rechaza explícitamente el argumento débil; aquí no hay nada que discutir: cada request produce un efecto completo acumulativo.

## 4. Contraste

La canónica obtiene ONE EFFECT por guard de estado: `receive_against_po` bloquea re-recepción vía estados terminales + cap `ERR_OVER_RECEIVE` por item; `confirm_pending_reception` exige `status='pending'` bajo `FOR UPDATE` (la segunda confirmación explota con `ERR_RECEIPT_ALREADY_CONFIRMED` SIN efectos). Control IDEMPOTENCIA V1: **FAIL**.
