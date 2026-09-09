# 08 — CANONICAL PATH REGRESSION (Path B: confirm_pending_reception)

## Objetivo

Demostrar que la remediación NO rompió el camino que ya funcionaba
(`confirm_pending_reception → fn_recalc_wac`) y que no existe doble cálculo
cuando ambos caminos coexisten.

## Estado ANTES (RECON, preservado)

```
Path B canónico: confirm_pending_reception → WAC 800 → 802.0000 exacto ✅
```

## Después (suite F4-04 P4)

Fixture `Canon` = `f42fbc65-ea9a-4e90-b495-df8dfc9e3a97`:

| Paso | Verificación | Resultado |
|---|---|---|
| Seed vía recepción HTTP real 99@800 | PASS | HTTP 2xx |
| Estado intermedio | stock=99, wac=800 | PASS |
| Pending receipt creado (harness documentado, patrón RECON) | 1 receipt pendiente | — |
| `confirm_pending_reception` | HTTP **204** | PASS |
| Stock 99 → 100 | PASS | stock=100 |
| **WAC == 802 exacto** por camino canónico | tol 1e-6 | **PASS** |
| `wac_change_log` == 2 eventos | PASS | no double update |
| Ambos eventos `reception_in` | PASS | `["reception_in","reception_in"]` |

## Interpretación

- El camino canónico produce **exactamente el mismo oráculo (802)** que antes
  de la remediación → `confirm_pending_reception` no fue alterado.
- Los 2 eventos del ledger corresponden a las 2 recepciones lógicas (seed +
  confirmación), **no** a un doble cálculo del mismo ítem.
- Ambos caminos (A y B) convergen en el **mismo escritor único**
  (`fn_recalc_wac`) con la **misma fórmula** y el **mismo evento de ledger**
  (`reception_in`) — arquitectura de escritor único demostrada en la práctica.

## Veredicto

**CANONICAL PATH REGRESSION = PASS** — sin regresión, sin duplicación.
