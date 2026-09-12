# 12 — POST-RETIREMENT VALIDATION

## Dynamic re-validation (interceptación, 6/6 PASS)

| # | Caso | RPC observada POST-retiro | Veredicto |
|---|---|---|---|
| 1 | flag=true, receipt | `reverse_receipt_v2` | PASS |
| 2 | flag=true, adjustment | `reverse_inventory_adjustment_v2` | PASS |
| 3 | flag=false, receipt | `reverse_receipt_v2` (V1 inalcanzable) | PASS |
| 4 | flag=false, adjustment | `reverse_inventory_adjustment_v2` (V1 inalcanzable) | PASS |
| 5 | transaction ambos flags | `reverse_transaction_v2` (pin H5-B1) | PASS |
| 6 | B-10 precede dispatch | `can_reverse_document` primero | PASS |

Aserciones de ausencia: `rpcCalls.some(name === 'reverse_receipt'|'reverse_adjustment')` = **false**
en todos los casos (incl. fallback flag=false).

## Validación estática (contract 16/16 PASS)

Incluye los 4 pins nuevos REM-V2-3 + los 12 previos (H5-B1 anti-resurrección, allow-list
create_sale, sync offline V2-only, gates por flag, P-2/P-3 paths).

## Suite completa

- `tsc --noEmit` exit 0 · `eslint` exit 0 · `vitest` 2064/24/0 · build 137 (INFRA LIMITATION, no PASS).

## Zero-touch re-verificación (post-commit pendiente en 12-git)

- Fingerprints post del retiro: bitwise identical a pre (ver 09). El snapshot POST se tomó con
  el retiro ya aplicado en el worktree y el dev server corriendo el código nuevo.

## Conclusión

Los caminos V1 `reverse_receipt`/`reverse_adjustment` quedan **inalcanzables desde la
aplicación en CUALQUIER estado del flag**, con paridad/superioridad V2 demostrada, sin
dependencias internas, y sin mutación de producción. `void_transaction` permanece REQUIRED
(KEEP, §28). El `create_sale` fail-closed permanece en su allow-list (fuera de alcance).
