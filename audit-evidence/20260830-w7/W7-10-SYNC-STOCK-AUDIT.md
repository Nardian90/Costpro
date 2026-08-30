# W7-10 — AUDITORÍA ESPECÍFICA `sync_product_stock` (FASE 20)

Defecto auditado: la caché `products.stock_current` (trigger `fn_sync_inventory_on_movement`) depende del orden de aplicación cuando dos movimientos del mismo producto comparten `created_at` idéntico dentro de una transacción. **Defecto de flujo, no de valoración: `sync_product_stock` no toca el WAC.** Clasificado como hallazgo propio de W7 (no se diluye como «preexisting»).

## 20.1 Evidencia (clon post-migración, `tmp/W7-f20.out` — 7/7 asserts PASS)

Escenario A — dos entradas del mismo SKU con `created_at` idéntico en una TX:

| Assert | Verificación | Resultado |
|---|---|---|
| F20-1 | `inventory` (ledger incremental) = 11 **EXACTO** — inmune al orden | PASS |
| F20-2 | `balance_after` del ledger: A=12, B=11 — el kardex sí registra la secuencia real | PASS |
| F20-3 | **divergencia caché↔ledger POSIBLE con tie**: `stock_current` ∈ {11, 12} (observado 12 = STALE) vs `inventory` = 11 | PASS (divergencia reproducida) |

Escenario B — la única ruta de la aplicación (RPC `create_sale_v2` → `register_stock_movement`, 2 líneas mismo SKU):

| Assert | Verificación | Resultado |
|---|---|---|
| F20-4 | `stock_final` CORRECTO = 5 — `register_stock_movement` re-ancla la caché con `balance_after` tras cada INSERT | PASS |
| F20-5 | `inventory` = 5 (ledger exacto) | PASS |
| F20-6 | **WAC invariante** (100) — `sync_product_stock` jamás toca costo | PASS |
| F20-7 | INV-01/02 sin violación: caché==ledger al final de la ruta RPC | PASS |

## 20.2 Clasificación (exigida por el gate)

```text
SEVERIDAD = MEDIUM  (no BLOCKER, no HIGH)
```

Justificación precisa:

1. **La divergencia existe y es real** (F20-3: reproducida, no teórica) — negarla sería inválido.
2. **Impacto financiero: NULO** — el defecto vive en la caché de cantidad; la valoración (WAC, COGS, kardex, `inventory`) es inmune al orden (F20-1, F20-6). INV-15 no se ve afectada.
3. **La ruta de la aplicación es inmune**: el único emisor real es `register_stock_movement`, que re-ancla la caché con `balance_after` después de cada INSERT (F20-4/7). La ventana stale queda cerrada en cada operación RPC.
4. **Superficie residual**: escrituras directas a `stock_movements` (vías admin/restore, no RPC) pueden dejar `stock_current` stale hasta el siguiente movimiento. Fail-safe: la divergencia se autocorrige en el siguiente movimiento y es detectable con una reconciliación `stock_current` vs `inventory` (query trivial, recomendada como check periódico).

## 20.3 Recomendación para el dueño (fuera del alcance W7 — no se modifica código)

- **W8+**: hacer determinista la resolución del tie (p. ej. desempate por `id` del movement, o re-ancla final al COMMIT de la TX).
- **Inmediato (operativo)**: job de reconciliación `SELECT` que compare `products.stock_current` contra el ledger; alertar en divergencia. Costo marginal, cubre el período hasta W8.
- Este hallazgo se hereda documentado; el despliegue W7 no lo agrava (los paquetes 01..09 no modifican `fn_sync_inventory_on_movement` ni el trigger).

## 20.4 Veredicto FASE 20

```text
SYNC-STOCK GATE = PASS (auditoría completa) — hallazgo MEDIUM documentado con repro, sin impacto financiero, ruta RPC inmune, recomendación operativa emitida
```
