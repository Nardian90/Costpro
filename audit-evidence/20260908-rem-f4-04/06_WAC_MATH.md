# 06 — WAC MATH (oráculo matemático exacto)

## Oráculo de la directive

```
Estado inicial:  stock = 99, WAC = 800
Recepción:       1 unidad @ 1000

Fórmula canónica (blend D-01):
  WAC_new = (S·ca_prev + q·uc) / (S + q)
          = (99 × 800 + 1 × 1000) / 100
          = (79200 + 1000) / 100
          = 80200 / 100
          = 802  ← EXACTO, no solo > 0
```

## Ejecución real (suite F4-04, P2)

| Paso | Resultado | Assert |
|---|---|---|
| Seed HTTP 99@800 | HTTP 201, stock 99, WAC 800.000000 | PASS (tol 1e-6) |
| Recepción de prueba 1@1000 | HTTP 201 | PASS |
| Stock final | 99 → 100 | PASS (== 100) |
| **WAC final** | **802** | **PASS (== 802, tol 0.000001)** |

Fuente: `evidence/remf404-test-suite-results.json` bloque `P2`
(fixture `Probe` = `0e536acc-cd1f-46dc-b06a-2cecd074b4ab`).

## Contribución al ledger canónico (P1, trazabilidad)

`wac_change_log` registró exactamente **1 evento** por recepción:

```json
{"event":"reception_in","qty_in":"10.0","uc_in":"100.0000000000000000",
 "wac_before":"0","wac_after":"100.00000000000000000"}
```

→ WAC 0 → 100 por el camino HTTP real (ANTES del fix permanecía 0).
Single contribution verificada: sin doble cálculo, sin doble contribución.

## Camino canónico (P4) — misma matemática

`confirm_pending_reception` (intocado): 99@800 seed → pending 1@1000 →
confirm → stock 100, **WAC == 802 exacto**, `wac_change_log` = 2 eventos
ambos `reception_in` (uno por el seed HTTP, uno por la confirmación —
no double update).

## Multimoneda (P9) — normalización única a CUP

Recepción 2 unidades @ 10 USD @ tasa 120:
- WAC == 10 × 120 = **1200** (una sola conversión, sin doble aplicación)
- movement `unit_cost_cup` == 1200
- receipt `total_cost` == 2 × (10×120) = **2400 CUP**

## Invariantes verificados en toda la suite

- `COGS = qty × WAC` (P5: 1 × 1800 = 1800, server-side)
- `stock_before − qty = stock_after` (venta −1; reversa +1)
- Reversa = inversa exacta, sin doble efecto (P6)
- Ninguna contribución duplicada (P1, P4, P8)
