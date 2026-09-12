# REM-V2-1 — 07 SECURITY CONTRACT (estado y extensiones propuestas)

## Estado actual (evidencia)

1. **PUBLIC EXECUTE live en 3 RPCs del dominio** (r13 @ baseline): `create_sale_v2`,
   `reverse_receipt_v2`, `void_transaction` (`=X/postgres`). Guards internos auth-pinned mitigan,
   pero viola least-privilege (heredado como F-06 REM-INV-1 — REMEDIACIÓN PENDIENTE de decisión humana).
2. **Callers RPC directos del navegador** (fuera del boundary API):
   - `useVoidReception` → `reverse_receipt_v2` / `void_pending_reception`: la DB valida tienda
     (`has_store_access_as`) pero **no rol normativo** (`can_reverse_document` se evalúa solo en
     `/api/reverse`) ⇒ cualquier miembro autenticado de la tienda puede revertir una recepción
     activa. Bypass del rate-limit y CSRF del API. **Gap de security contract REAL** (hallazgo V2-1).
   - `useInvertDocument` → `void_transaction`: la política completa sí vive en DB (`can_pos_undo_transaction`)
     ⇒ seguridad equivalente; el gap es de boundary/observabilidad, no de autorización.
   - `useInvertDocument` (recepción) → N×`perform_inventory_adjustment` + `UPDATE receipts.status`
     desde el cliente: composición **no atómica**; un fallo a mitad deja recepción activa con ajustes
     parciales. `perform_inventory_adjustment` carece de política de rol normativa. **Gap REAL.**
3. Boundary API `/api/reverse` y `/api/pos/checkout`: withAuth + CSRF + rate-limit + Zod + políticas
   normativas DB (`can_admin_reverse_transaction`, `can_reverse_document`, supervisor ≥15%) — V2 correcto.
4. `receive_purchase`: grant `authenticated` live, sin guardas (F-01) — camino V1 huérfano en repo,
   DANGEROUSLY-REACHABLE. REVOKE recomendado (FASE 10).

## Extensiones de contract test propuestas (FASE 14) — nuevas aserciones

Añadir a `scripts/security-contract-test.cjs` (sin cambiar runtime):
1. `RPC_MAP_V1.receipt` debe resolver a `reverse_receipt_v2` o el flag OFF debe estar prohibido en
   producción (detección de "V1 fallback still reachable").
2. Prohibir nuevas llamadas `supabase.rpc('create_sale'` fuera de useTransactions (detección de
   "V1 client import still active" en checkout).
3. `useSalesCatalog` no debe llamar `create_sale` cuando USE_V2_CHECKOUT=true (test condicional
   que falla si la vista V1 sigue viva sin guard de flag).
4. reverse_receipt_v2/void_transaction/create_sale_v2 NO deben aparecer con EXECUTE PUBLIC en el
   catálogo (test de grants, requiere credenciales live — marcado SKIP sin entorno).

Estado de ejecución de los tests 1-3: ver `15-regression`.
