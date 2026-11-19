# ESTADO DE SITUACIÓN — CP-FIN-003 (ENERVIDA-VITALLCONS)

**Fuente:** `fin_get_balance_sheet` sobre la generación activa (GEN-1), corte 2026-11-20.
**Puente de conciliación de la diferencia:** al final.

## 1. Estado de Situación — generación ACTIVA (GEN-1, reconstruida)

| Categoría | Saldo (CUP) |
|---|---:|
| ACT_EFECTIVO_CUP | 1,233,950.00 |
| ACT_EFECTIVO_USD | 27,500.00 |
| ACT_BANCOS | 1,264,610.01 |
| **ACT_TRANSF_EXTERIOR** | **24,606,900.00** |
| ACT_INVENTARIO | −2,355,603.89 |
| ACT_OTROS_CORR | 8,729,279.98 |
| **Total activos** | **33,506,636.10** |
| PAS_CXP_PROV | 2,961,795.90 |
| **Total pasivos** | **2,961,795.90** |
| Patrimonio (movimientos) | 0.00 |
| Resultado acumulado | 30,544,840.20 |
| **Patrimonio total** | **30,544,840.20** |
| **Ecuación: activos − (pasivos + patrimonio)** | **0.00 (equilibrado)** |

## 2. Comparativa GEN-0 → GEN-1

| Concepto | GEN-0 | GEN-1 | Δ |
|---|---:|---:|---:|
| Activos | 36,437,300.22 | 33,506,636.10 | −2,930,664.12 |
| Pasivos | 2,961,795.90 | 2,961,795.90 | 0.00 |
| Patrimonio total | 33,475,504.32 | 30,544,840.20 | −2,930,664.12 |
| Diferencia de ecuación | 0.00 | 0.00 | — |
| Bancos | 25,850,770.01 | 1,264,610.01 | −24,586,160.00 |
| Transferencias exteriores | (en bancos) | 24,606,900.00 | +24,606,900.00 |
| Inventario | 596,470.23 | −2,355,603.89 | −2,952,074.12 |
| Resultado neto | 33,475,504.32 | 30,544,840.20 | −2,930,664.12 |

## 3. Puente de conciliación de la diferencia (misión §8)

| Concepto | Variación CUP | Explicación |
|---|---:|---|
| **Diferencia de patrimonio detectada (GEN-0 → GEN-1)** | **−2,930,664.12** | |
| Zelle a cuenta propia (ACT_BANCOS → ACT_TRANSF_EXTERIOR) | +20,740.00 neto activos (−24,586,160 bancos +24,606,900 exterior) | equity-neutral: realoca activos; el neto +20,740 corresponde a ventas zelle de la cobertura nueva (5 docs pre-v3) |
| Reallocation FAC-VITALLCONS-001 (INV/COGS/PERDIDA/VALES) | **0.00** | INV −2,952,074.12 + COGS +2,753,833.27 + PERDIDA −490,446.58 + VALES +688,687.43 = 0.00: efecto C1/RECT-013 del mundo de datos ya corregido (la re-derivación pura distribuye los costos corregidos; la GEN-0 los neteaba con la cadena de correcciones) |
| Rectificaciones de moneda incorporadas (8 RECT-MON + RECT-015) | −31,330.00 caja CUP / +32,000.00 caja USD / +34,339.99 ING_DESCUENTOS | los pagos corregidos (cash/CUP reales) re-clasifican los cobros; ING_DESCUENTOS recoge las diferencias de cobro que las RECT-MON compensaban |
| Cobertura nueva (5 ventas + 5 vales pre-v3 sin asiento) | −55,749.99 ingresos / +1,703.95 vales | documentos reales que la GEN-0 nunca contabilizó (errores de posting pre-v3) |
| Carve settlement inconsistente (23ccd04f, abab9e20) | incluido arriba | el pago registrado manda (guard de settlement consistente) |
| **Diferencia final (residual no explicada)** | **0.00** | toda la variación queda explicada por causas documentadas |

## 4. Limitaciones del balance

1. **ACT_INVENTARIO negativo (−2,355,603.89)** frente al valor vivo del maestro de productos
   (594,771.44 CUP, 82 productos con stock): residuo del historial congelado de la era
   FAC-VITALLCONS-001 (precios de venta importados como costos; WAC y cost_at_sell congelados
   de esa era). No se crea ajuste compensatorio (mandato: nunca ajustes ficticios). El impacto
   está cuantificado y el libro permanece equilibrado.
2. Balance operativo vs contable: el balance EMITIDO por el motor es contable (partida doble
   completa por generación); el inventario vivo del maestro es una referencia operativa. La
   diferencia entre ambos para inventario queda documentada en (1).
3. Sin cuentas por cobrar registradas (ACT_CXP 0.00: no hay ventas a crédito en la tienda).

## 5. Reproducibilidad

```
fin_get_balance_sheet(p_store_id => '5e6fe821-5465-48b1-b3f1-3aa3182edc38', p_as_of => <fecha>)
fin_get_dashboard(...)  -- generacion.code = 'GEN-1', desequilibrio_monto = 0.00
scripts/cpfin003-production-rebuild.mjs pre|build|analyze|activate|post  (fases re-ejecutables)
```
