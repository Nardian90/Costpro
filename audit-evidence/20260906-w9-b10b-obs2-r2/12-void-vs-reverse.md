# W9.5 — B-10b-OBS-2-R2 · 12-void-vs-reverse.md
# GATE 12 — DIFERENCIAR VOID VS REVERSE · PASS

Demostración de que `void_transaction` y `reverse_transaction_v2` **no producen doble compensación** — cuatro barreras independientes verificadas.

## Barrera 1 — segundo void sobre la misma venta (P9a)

```text
intent:  void_transaction(tx1) donde tx1.status='voided'
result:  EXCEPTION ERR_ALREADY_VOIDED   (guard explícito de estado, antes de tocar datos)
efecto:  movements_before == movements_after  →  0 movement adicional       ✓
```

## Barrera 2 — reverse sobre venta ya anulada por POS (P9b)

```text
intent:  reverse_transaction_v2(tx1) donde tx1.status='voided'
result:  {'status':'idempotent'} — no-op documentado del diseño V2
efecto:  0 movement adicional (movements_after == contador de barrera 1)    ✓
```

## Barrera 3 — void sobre venta ya revertida administrativamente (P10b)

```text
intent:  void_transaction(tx2) donde tx2.status='voided' (post-reverse)
result:  EXCEPTION ERR_ALREADY_VOIDED
efecto:  0 movement adicional                                               ✓
```

## Barrera 4 — máquina de estados del trigger (segunda barrera estructural)

```text
fn_validate_document_transition('transactions'):  completed → [voided, reversed]
                                                  voided    → []  (TERMINAL)
Cualquier nueva transición desde 'voided' es rechazada por trg_validate_tx_transition
aunque la función RPC evolucionara. El par P9b/P10b corrobora el comportamiento idempotente
de reverse y el guard de void a nivel función.
```

## Prohibiciones demostradas (combinación P9a/P9b/P10b + POST)

```text
double stock restoration    → NO (0 movements extra; netting por tx == 0)
double payment restoration  → NO (las funciones no re-escriben payments; payments_all 366→366)
double movement             → NO (movements 98+9 in-tx, sin duplicados; POST 800 == PRE 800)
```

## Genealogía por compensación (resumen)

Cada venta sintética produjo exactamente **un** movement de venta y **un** movement de compensación (`sale_void` vía POS con `notes=tx_id`, o `sale_reverse` vía admin con `reference_id=tx_id`); el segundo intento de compensación fue rechazado en las 3 variantes probadas.

## Veredicto GATE 12

```text
PASS — void y reverse son mutuamente idempotentes; sin doble compensación posible
```
