════════════════════════════════════════════════════════════════════
W9.5 — B-2 · 04-code-trace.md
GATE 3 + GATE 4 — Trazabilidad completa de consumers + legitimidad de la ruta
════════════════════════════════════════════════════════════════════

## GATE 3 — Búsqueda total (rg, globales sobre el repo, sin node_modules/audit-evidence)

`rg -n "void_transaction"` (fuera de supabase/migrations y docs históricos):
  - src/hooks/api/useDocumentActions.ts:74   → ÚNICO consumer ejecutivo (client-side RPC)
  - src/lib/supabase-traced.ts:44            → map de tracing ('args:p_transaction_id')
  - Tests de NO-modificación (contratos): iteration-rls.test.ts:271-274,
    iteration-11-5.test.ts:175, iteration-11-3.test.ts:85-87, iteration-11-1.test.ts:93-110
  - supabase/migrations/* (historia, no ejecución)
  - docs/audits/* (referencias históricas)
  - NO hay llamada a void_transaction en src/app/api/** (ninguna API route la invoca)
  - NO hay scripts server-side, cron, workers ni e2e que la invoquen

`rg -n "useInvertDocument|invertDocument"`:
  - Definición: src/hooks/api/useDocumentActions.ts:21 (useInvertDocument)
  - Consumers activos:
      · src/components/views/terminal/views/sales/useSalesHistoryView.ts:82
        (botón "Invertir/Anular" — gating de UI: ROLE_PERMISSIONS.canVoidTransactions)
      · src/components/views/terminal/views/pos/usePOSCheckout.ts:60,316
        (toast "Deshacer" 30s tras checkout — SIN gating de rol por diseño)
      · src/components/views/terminal/views/receptions/useReceptionsHistoryView.ts:32
        (SOLO type='reception' → perform_inventory_adjustment; NO pasa por void_transaction)

`rg -n "useReverseDocument"` (ruta canónica, para contraste):
  - src/components/ui/ReverseDocumentModal.tsx:63 (sin gating de rol)
  - → POST /api/reverse (withAuth + CSRF + rate-limit) → service_role → reverse_transaction_v2

## Cadena completa (Ruta legacy/directa de B-2)

UI POS "Deshacer" (30s) / SalesHistory "Invertir"
  ↓
useInvertDocument (src/hooks/api/useDocumentActions.ts)
  ↓ fetch doc (RLS del cliente) + guard status voided
supabase.rpc('void_transaction', { p_transaction_id, p_reason, p_operation_date })
  ↓ (JWT del usuario autenticado; NO envía p_user_id)
PostgREST /rest/v1/rpc/void_transaction (ACL: PUBLIC/authenticated)
  ↓
void_transaction (SECURITY DEFINER) → auth.uid() + has_store_access_as → mutación + audit

## GATE 4 — Las 10 preguntas

1. ¿Qué operación realiza exactamente?
   Anula (void) una transacción-venta: status→'voided' + void_reason/cancelled_at,
   restaura stock por ítem (sale_void, conversion_factor), dispara triggers de
   comisiones/auditoría/validación de transición, inserta audit VOID_SALE.
2. ¿Es equivalente a reverse_transaction_v2?
   NO al 100%. Núcleo autorizacional idéntico (auth.uid()+has_store_access_as+FOR UPDATE),
   diferencias: (a) V2 exige status='completed'; void acepta cualquier status ≠ 'voided';
   (b) V2 es idempotente-gracioso (retorna 'idempotent'); void lanza ERR_ALREADY_VOIDED;
   (c) void maneja conversion_factor de variantes; V2 no; (d) V2 no setea void_reason/
   cancelled_at; (e) ACL de superficie distinta (ver 10-vs-reverse-v2.md).
3. ¿Devuelve el mismo resultado?
   JSONB {status:'success', transaction_id} en ambos; V2 añade units_restored.
4. ¿Afecta stock? SÍ (restauración por ítem) — ambos.
5. ¿Afecta pagos? NO (ninguno de los dos toca payment_transactions).
6. ¿Afecta WAC? NO recalcula cost_average (ruta de venta) — ambos (H5-B3 + probe P1).
7. ¿Genera audit? SÍ: VOID_SALE (void) vs REVERSE_TRANSACTION_V2 (V2). Ambos con
   user_id = identidad real del caller.
8. ¿Es necesaria para POS? SÍ — el flujo "Deshacer" del POS (MM-9, ventana 30s)
   depende de useInvertDocument → void_transaction. Es el caso de uso legítimo que
   impone que un cajero/clerk pueda anular SU venta sin rol de manager.
9. ¿Existe diferencia funcional legítima? SÍ — POS-undo (venta propia inmediata)
   y SalesHistory-invert (anulación con fecha de operación efectiva). No es un
   duplicado muerto: es la ruta activa de esos 2 flujos.
10. ¿Debe retirarse o endurecerse?
    NI retirarse NI endurecerse EN ESTE CHECKPOINT: su autorización server-side
    existe y es correcta a nivel tienda/identidad (ver matriz). El gap de ROL
    (frontend-only) es sistémico (afecta también a la ruta canónica) → BACKLOG B-8.
    El gap de status-guard (pending→voided) → BACKLOG B-9.

## Veredicto de legitimidad (opciones A/B/C/D del GATE 11)

  A. Implementación legítima diferente        ← ✔ ESTA (POS-undo + SalesHistory, con
     locking, autorización server-side y audit; diferencias funcionales reales)
  B. Implementación legacy equivalente        ✗ (difiere en guards/stock-detail)
  C. Bypass de seguridad                      ✗ (mismo modelo autorizacional que la
     ruta canónica; identidad real; cross-store y forged bloqueados — probado)
  D. Ruta a retirar                           ✗ (2 consumers activos dependen de ella)
