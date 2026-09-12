# 11 — RETIREMENT DIFF (PHASE 11 — quirúrgico)

Clasificación §23: TODOS los archivos = **REQUIRED BY REM-V2-3**. Cero UNRELATED.

## Código de aplicación (retiro de caminos V1)

1. **`src/app/api/reverse/route.ts`** (+9/−5):
   - `RPC_MAP_V1.receipt`: `reverse_receipt` → **`reverse_receipt_v2`** (comentario REM-V2-3, misma firma)
   - `RPC_MAP_V1.adjustment`: `reverse_adjustment` → **`reverse_inventory_adjustment_v2`** (ídem, B-10)
   - Header doc: notas REM-V2-3 (0 callers de app alcanzan V1; retiro DB diferido)
   - `RPC_MAP_V2`, features, flags, boundary B-10, resto de la ruta: **SIN CAMBIOS**

2. **`src/hooks/api/useReverseDocument.ts`** (+1/−1): comentario de documentación
   (`receipt → reverse_receipt_v2 [REM-V2-3: V1 retirada del path]`). Sin cambios de código.

## Scripts legacy migrados a V2 (patrón R2 de H5-B1)

3. **`scripts/test_reverse_all_live.mjs`** (+9/−6): TEST 2 → `reverse_receipt_v2` (select status
   only — V2 no escribe reversed_at en receipts); TEST 5 → `reverse_inventory_adjustment_v2`.
4. **`scripts/test_reverse_e2e_full.mjs`** (+2/−2): receipt → `reverse_receipt_v2`.
5. **`scripts/test_adjustments_e2e.mjs`** (+2/−1): → `reverse_inventory_adjustment_v2`.

## Regresión contractual añadida

6. **`scripts/v2-only-contract-test.cjs`** (+9/−0): 4 pins nuevos —
   RPC_MAP_V1.receipt → reverse_receipt_v2 · RPC_MAP_V1.adjustment → reverse_inventory_adjustment_v2 ·
   ningún entry resuelve a `reverse_receipt` V1 · ninguno a `reverse_adjustment` V1.
7. **`src/__tests__/api/reverse-route-v1-retirement.test.ts`** (nuevo, 6 casos): interceptación
   dinámica permanente — receipt/adjustment → V2 en AMBOS estados del flag; pin H5-B1 transaction;
   boundary B-10 precede al dispatch.

## Lo que NO se tocó (verificado con git diff)

- `src/config/features.ts` (defaults fail-closed intactos) · flags/env · `RPC_MAP_V2` ·
- `void_transaction` (REQUIRED, sin cambios) · `useTransactions.ts` (allow-list create_sale intacto) ·
- `supabase/` (0 migraciones nuevas, 0 DROP, 0 REVOKE) · tests existentes (0 modificados) ·
- `package.json` / `ecosystem*` / `.env*` / docs históricos.
