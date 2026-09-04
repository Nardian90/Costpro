# 04 — REPRODUCCIÓN (GATE 3 + GATE 5, 100% read-only)

## Método

Cero mutaciones. Dos vías de reproducción independientes:

1. **Datos reales**: llamada directa al RPC en vivo (`SELECT get_cash_report(...)`) — lectura pura — comparada con un cálculo SQL independiente sobre el mismo período.
2. **Cálculo independiente**: replica las fórmulas (actual vs esperada) en `SELECT ... FROM (VALUES ...)`, sin tocar tablas.

## Reproducción en vivo (tienda 5e6fe821, 2026-08-01 → 2026-08-31 23:59:59+00)

### Esperado independiente (SQL directo sobre `transactions`)

| payment_method | currency | n | expected_total_cup (Σ total_amount) |
|---|---|---:|---:|
| cash | CUP | 89 | 1,659,799.9994 |
| transfer | CUP | 5 | 51,760.00 |
| mixed | CUP | 13 | 476,580.00 |
| **mixed** | **USD** | **7** | **1,164,440.00** |
| zelle | CUP | 52 | 2,920,260.00 |
| **zelle** | **USD** | **7** | **191,080.00** |
| **TOTAL esperado sales_total_cup** | | | **6,463,919.9994** |

### Reportado por get_cash_report (PRE-FIX)

| Grupo | total | total_cup reportado | Fórmula aplicada |
|---|---:|---:|---|
| mixed/USD | 1,164,440 | **791,819,200** | 1,164,440 × 680 ✗ |
| zelle/USD | 191,080 | **129,934,400** | 191,080 × 680 ✗ |
| mixed/USD | 1,164,440 | 1,164,440 | — |
| zelle/CUP, cash/CUP, transfer/CUP, mixed/CUP | (idénticos al esperado) | ✓ | rama CUP correcta |

- `totals.sales_total_cup` reportado: **926,861,999.9994**
- Esperado: **6,463,919.9994**
- Exceso: 926,861,999.9994 − 6,463,919.9994 = **920,398,080** = (1,164,440 + 191,080) × (680 − 1) ✓ exacto
- `balance_cup` inflado idénticamente (payments/commissions/production = 0 en el período).

**REPRODUCIDO: SÍ** — la inflación es exactamente la doble aplicación de la tasa sobre importes ya en CUP.

## Casos sintéticos mínimos (GATE 3, fórmulas sobre VALUES — sin escrituras)

Ver 05-mathematical-proof.md casos A–D (incluye ejecución SQL con salida capturada).
