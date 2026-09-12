# REM-INV-2 — 11: ATOMICIDAD (staging aislado)

Protocolo: forzar errores en distintos puntos (before movement / after movement / during WAC / during audit / during document status update); esperado ALL OR NOTHING — nunca `stock updated but document not received` ni el inverso.

## 1. Diseño de la prueba

PO_AT con dos items (qty 10 válido + qty 150 que violará una CHECK introducida ad-hoc `stg_qty_cap CHECK (quantity_change < 100)` sobre `stock_movements`). La violación ocurre **a mitad del loop** (item 2 después de haber procesado el item 1): replica un fallo "during movement" entre las dos escrituras de inventario/kardex.

## 2. Resultado

```text
[PASS (all-or-nothing)] atomicity: mid-loop failure rolls back stock AND status :: inventory/movements unchanged=True, po status after failure=draft (single plpgsql block = single transaction)
```

Lectura: tras el error a mitad de loop, `inventory` y `stock_movements` quedaron **byte-idénticos al estado previo** (sin rastro del item 1 ya procesado) y la OC permaneció `draft` (jamás llegó al `UPDATE … status='received'`).

## 3. Análisis

`receive_purchase` es un bloque `plpgsql` único: PostgreSQL ejecuta cada invocación dentro de UNA transacción implícita, y cualquier error no capturado hace rollback de TODAS las escrituras previas del bloque. La atomicidad es la **única** propiedad que la V1 cumple (el rollback es una garantía del motor, no un diseño de la función — no hay SAVEPOINT, ni orden de operaciones deliberado, ni validación previa antes de mutar).

## 4. Contraste

La canónica comparte la garantía transaccional y además ordena deliberadamente sus escrituras (WAC primero → movimiento después, validación íntegra antes de mutar, locks `FOR UPDATE`); su atomicidad es de diseño, no accidental. Control ATOMICIDAD V1: **PASS** (all-or-nothing se sostiene).

---
Nota de metodología: la primera corrida del instrumento usó qty=50 que NO violaba la CHECK (`50 < 100`) y reportó "unexpected success" — defecto del test, no de la función. Se corrigió el fixture (qty=150) y se re-ejecutó el staging completo desde datadir limpio; el resultado del fallo forzado es el aquí documentado.
