# W9.5 — B-10b-OBS-2-R2 · 25-zero-mutation.md
# GATE 25 — ZERO MUTATION FINAL · PASS

Comparación POST final contra PRE para todo lo que las pruebas debían dejar intacto. Las únicas diferencias permanentes permitidas (y presentes) son las del R1, que PREDATAN esta fase y están dentro del baseline PRE de R2: 98 initial movements · 98 inventory rows · 98 kardex rows · 98 business events · 1 reconciliation audit · idempotency record (reference_doc prefijo). Es decir: contra el POST de R1, **R2 añadió 0 filas**.

## Comprobación por dominio (PRE GATE 1 == POST tras master == POST tras races)

| Dominio | Estado | OK |
|---|---|---|
| historical transactions | 520 / 520 / 520 | ✓ |
| historical payments | 366 / 366 / 366 | ✓ |
| historical commissions | 0 / 0 / 0 | ✓ |
| transaction_items | 555 / 555 / 555 | ✓ |
| other stores (inv/mov/kar) | 141 / 702 / 702 — triplicado | ✓ |
| Test products | 10 intactos, Σ126 u, 0 filas batch | ✓ |
| repair batch (98/6427/98/98/98/1 + valor exacto) | bit a bit igual, fingerprints 98/98 | ✓ |
| audit history previa | 7.377 / 366 — sin nuevas filas | ✓ |
| wac_change_log | 14 / 0 | ✓ |
| products (counts, Σstock, Σcost) | idénticos (6553 / 6.132.624,960555917) | ✓ |
| devolutions / receipts / transfers | 13 / 0 / 0 | ✓ |
| business_events_all | 10.651 | ✓ |

## Mutación permanente derivada de las pruebas

```text
0 filas · 0 campos · 0 secuencias — verificada dos veces (post-master y post-races)
```

Los cambios observados durante el sandbox (movements/kardex/BE/payments/audit de las 5 ventas sintéticas, transiciones de estado de las 5 transacciones, flags de comisiones=0) existieron exclusivamente dentro de `BEGIN … ROLLBACK` y no dejaron trazo.

## Veredicto GATE 25

```text
PASS — PRE == POST para todos los dominios protegidos; diferencias permanentes = solo R1
```
