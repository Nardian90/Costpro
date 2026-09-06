# W9.5 — B-10b-OBS-2-R1 · 08-financial-neutrality.md
# §19 neutralidad financiera — PASS

## Verificación (PRE → POST, counts globales y de tienda)

| Dominio | Tabla | PRE | POST | Δ |
|---|---|---:|---:|---:|
| Pagos | payment_transactions | 366 | 366 | **0** |
| Ventas | transactions (global) | 520 | 520 | **0** |
| Ventas | transactions (tienda) | 0 | 0 | **0** |
| Líneas de venta | transaction_items | 555 | 555 | **0** |
| Comisiones | commission_payments | 0 | 0 | **0** |
| Compras | receipts (tienda) | 0 | 0 | **0** |
| Devoluciones | devolutions (tienda) | 13 | 13 | **0** |
| Devoluciones | devolution_items | 13 | 13 | **0** |
| Traspasos | transfers | 0 | 0 | **0** |
| WAC log | wac_change_log | 14 / 0 tienda | 14 / 0 tienda | **0** |

Chequeo también ejecutado DENTRO de la transacción (DO block `$r1_post$`, §19) antes
del COMMIT: cualquier desviación habría disparado `ERR_FINANCIAL_*` → ROLLBACK.

## Separación valor de inventario vs caja

```text
VALOR DE INVENTARIO RECONOCIDO (ESTIMATED, base WAC):
   6.427 u × WAC = 9.932.216,938816005 (exacto) — en inventory/kardex (activos)
IMPACTO DE CAJA HISTÓRICO:      0,00
IMPACTO EN P&L DEL SISTEMA:     0,00
```

La apertura es puramente inventarial: materializa en el ledger una posición física
demostrada. No crea operación comercial, no toca caja, ingresos ni comisiones. El valor
reconocido NO es riqueza nueva: es el reconocimiento contable de una posición
preexistente (decisión contable firmada — 14-financial-neutrality.md del diseño).

## Nota de doble valoración (verificada)

Antes: inventory = 0 → valor de ledger 0. Después: ledger = 6.427 u → 9.932.216,94.
La base era CERO: no existe doble conteo por construcción. El «declarado» 6.553
incluye 126 u Test que permanecen FUERA de libros de ledger (residuo clasificado).
