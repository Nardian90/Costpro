# 05 — PRUEBA MATEMÁTICA (GATE 3)

## Convención del sistema (demonstrada en 03-financial-contract.md)

```
total_amount = CUP siempre (aun cuando sale_currency = 'USD')
sale_exchange_rate = CUP por 1 USD (ej: 680)
Equivalente CUP de una venta = total_amount   (la conversión USD→CUP ocurrió en ESCRITURA)
```

## Fórmula actual en get_cash_report (2 ocurrencias)

```sql
CASE WHEN sale_currency = 'CUP' THEN total_amount
     ELSE total_amount * COALESCE(sale_exchange_rate, 1) END
```

## Fórmula correcta

```sql
total_amount
```

(es equivalente, para grupos no-CUP, a `(total_amount / rate) * rate` — reconstrucción del nativo + única reconversión — pero bajo el contrato actual el valor ya está normalizado: toda reconversión es defecto.)

## Casos A–D — ejecutados en la BD real el 2026-09-04 (salida cruda en 08-regression-tests.txt §0)

| Caso | Entrada | Fórmula actual | Esperado | Error |
|---|---|---:|---:|---:|
| A: CUP 1000 | amount=1000, currency=CUP | 1000 | 1000 | 0 ✓ |
| B: USD total 4000 CUP, rate 400 | amount=4000, currency=USD | **1,600,000** | 4000 | **+1,596,000** ✗ |
| C: USD rate=1 | amount=10, currency=USD | 10 | 10 | 0 (enmascarado) ✓ |
| D1: USD 5000 CUP, rate 680 | amount=5000, currency=USD | **3,400,000** | 5000 | **+3,395,000** ✗ |
| D2: CUP 2000 | amount=2000, currency=CUP | 2000 | 2000 | 0 ✓ |

## Lecturas clave

1. **Caso B es el hipotético del prompt en términos reales**: una venta de 10 USD se guarda como `total_amount = 4000` (CUP). La fórmula actual produce 4000×400 = 1,600,000 CUP en vez de 4000 CUP. Es exactamente `USD × tasa × tasa` con el primer ×tasa ya aplicado en escritura.
2. **Caso C explica la latencia del defecto**: con rate=1 la fórmula es identidad ⇒ cualquier entorno sin ventas USD reales (o con rate=1) no revela el bug. Solo se manifiesta con ventas USD a tasa > 1 (aquí: 680).
3. **Caso D (múltiples pagos/grupos)**: el error es aditivo por grupo USD: ΣUSD × (rate − 1). Verificado empíricamente en agosto-2026: (1,164,440 + 191,080) × 679 = 920,398,080 CUP fantasma — coincide al centavo con la diferencia entre lo reportado (926,861,999.9994) y lo esperado (6,463,919.9994).

## Cierre matemático

Para grupo no-CUP: `error = total_amount × (rate − 1) > 0` si `rate > 1`. Con rate=680 la inflación es ×680 del valor correcto en filas USD. QED.
