# 03 — DYNAMIC RUNTIME (PHASE 6)

## Método (interceptación a nivel aplicación, sin tocar DB)

Se ejercitó el handler REAL `POST /api/reverse` (`src/app/api/reverse/route.ts`) en el proceso
de test (Vitest 4.1.10) con mock de captura del cliente admin (`getSupabaseAdminSafe`) y de la
sesión (`withAuth` passthrough), grabando CADA llamada `.rpc(name, args)` emitida. El flag
`FEATURES.USE_V2_REVERSE` se conmutó por getter. Instrumento temporal (patrón de mocks idéntico
a `src/__tests__/api/stores-bulk.test.ts`); archivo permanece como test de regresión permanente:
`src/__tests__/api/reverse-route-v1-retirement.test.ts`.

## Resultados PRE-retiro (6/6 PASS)

| # | Caso | RPC observada | Veredicto |
|---|---|---|---|
| 1 | flag=true, receipt | `reverse_receipt_v2` (params exactos p_receipt_id/p_reason/p_user_id) | PASS — V2 exacto |
| 2 | flag=true, adjustment | `reverse_inventory_adjustment_v2` | PASS — V2 exacto |
| 3 | flag=false, receipt | `reverse_receipt` | **V1 REACHABLE** (fallback fail-closed) — el gate NO podía certificar retiro sin neutralizar el map |
| 4 | flag=false, adjustment | `reverse_adjustment` | **V1 REACHABLE** |
| 5 | transaction, ambos flags | `reverse_transaction_v2` (nunca V1) | PASS — pin H5-B1 intacto |
| 6 | boundary B-10 | `can_reverse_document` precede a todo dispatch | PASS |

Conclusión PRE: los caminos sustituidos usan V2 con P-1 activo (observado 0 llamadas V1); los
entries V1 del mapa eran alcanzables SOLO bajo flag=false → retirada requiere neutralización del
map (patrón H5-B1), no simple borrado de referencias muertas.

## Resultados POST-retiro (6/6 PASS)

Casos 1,2,5,6 idénticos; casos 3-4 ahora: flag=false → `reverse_receipt_v2` /
`reverse_inventory_adjustment_v2` (V2 en AMBOS estados del flag; 0 apariciones de V1).

## Runs de checkout/undo (herencia válida — árbol idéntico)

`git diff --stat 224ba6f4..a1c01847 -- src/ supabase/ scripts/ package.json` = VACÍO → los
proofs efímeros PG de REM-V2-2/2.1 siguen vigentes para este árbol:
- Checkout: cash/transfer/zelle/offline-replay/double-submit → **create_sale_v2** (S-01..S-06 PASS)
- Reverse normal/repeat/unauthorized → **reverse_receipt_v2 / reverse_inventory_adjustment_v2** (V-01/V-02 PASS)
- Undo 30s → **void_transaction** (activo; pipeline canónico create_sale_v2 → void_transaction)

**V1 calls observed en caminos V2: 0.** V2 calls observed: create_sale_v2, reverse_receipt_v2,
reverse_inventory_adjustment_v2, reverse_transaction_v2, void_transaction (undo).
