# CONCILIACIÓN DEL ESTADO DE SITUACIÓN — mandato §13.D/§7

| Concepto | CUP |
|---|---:|
| Activo neto (post-rectificación) | 36,397,903.22 |
| Pasivo neto | 2,961,795.90 |
| Patrimonio (apertura M-015 §E) | 0.00 |
| Resultado acumulado (I 35,862,094.99 − G 2,425,987.67) | 33,436,107.32 |
| **Ecuación A − P − Patrimonio − Resultado** | **0.00** |
| Identidad Σ débitos − Σ créditos | 0.00 |
| Desequilibrio ANTES del fix (fórmula v1) | −2,425,986.00 |
| Desequilibrio DESPUÉS del fix (identidad completa) | 0.00 |
| Diferencia residual explicada | 0.00 (residual de caja USD documentado en CONCILIACION-EFECTIVO-BANCOS.md) |

Puente (§7.4): desequilibrio mostrado −2,425,986.00 = −(gastos netos 2,425,985.79 redondeado) → la fórmula v1 omitía la clase gasto. Corrección = fórmula v2 (`fin_get_dashboard` v2). Las rectificaciones mueven activo↔activo: ecuación intacta.
Evidencia: `cpfin002-fase1c-partes.sql` (descomposición pre-fix), `cpfin002-postverificacion.sql` (post), `out_balance_situacion.json`.
