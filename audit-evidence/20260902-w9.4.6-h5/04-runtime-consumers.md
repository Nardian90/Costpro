# W9.4.6 — H-5 · FASE 6 · Mapa de consumidores runtime

## Cadena de invocación (runtime, flag ON = estado actual)

```text
UI: ReverseDocumentModal (src/components/ui/ReverseDocumentModal.tsx)
  └─ usado por SalesHistoryView.tsx (type='transaction'), ReceptionsHistoryView (receipt), etc.
      └─ useReverseDocument() (src/hooks/api/useReverseDocument.ts) → apiFetch('/api/reverse')
          └─ POST /api/reverse (src/app/api/reverse/route.ts)
              ├─ withAuth → session.user.id REAL del JWT (no del body)
              ├─ validateOrigin (CSRF) + rateLimit 5/min
              ├─ FEATURES.USE_V2_REVERSE ← NEXT_PUBLIC_USE_V2_REVERSE (env=true)
              ├─ getSupabaseAdminSafe() → CLIENTE SERVICE_ROLE (server-side)
              └─ rpc('reverse_transaction_v2', { p_transaction_id, p_reason, p_user_id: session.user.id })
```

- **El navegador NUNCA llama a la RPC directamente** (y no podría: sin GRANT a authenticated/anon, PostgREST devuelve denial).
- `p_user_id` lo fija el servidor desde la sesión autenticada; el cliente solo envía `{type,id,reason}`.
- Flag OFF → `RPC_MAP_V1.transaction = 'reverse_transaction'` (V1). Consumidor actual: flag=true ⇒ **V2 es la canónica en runtime**.

## Clasificación de consumidores

| Consumidor | Tipo | Función | Notas |
|---|---|---|---|
| `POST /api/reverse` (`route.ts:33,43`) | server + authenticated (service_role subyacente) | v1 (flag OFF) / v2 (flag ON) | único consumidor runtime; CSRF+rate-limit+withAuth |
| `scripts/test_reverse_all_live.mjs:98` | test-only (service key) | v1 | ops script |
| `scripts/test_reverse_e2e_full.mjs:69` | test-only (service key) | v1 | ops script |
| `src/__tests__/integration/iteration-11-3.test.ts` | test estático (lee migración, no ejecuta) | v2 | contract test |
| `src/__tests__/integration/iteration-rls.test.ts:257` | test estático | v2 | verifica "no se modifica" |
| `src/lib/supabase-traced.ts:42` | instrumentación (mapping param) | v2 | no invoca |
| DB interno (pg_depend/triggers/views/funciones) | **0 consumidores** | ambas | ver 03-db-dependencies |

## Verificación ACL ↔ consumidores (coherencia)

- ACL final (W9 C2, migración `20260902200923`): REVOKE authenticated/anon/PUBLIC + GRANT service_role en ambas.
- Consumidor runtime usa service_role server-side ✔ coherente.
- V1 quedó con GRANT service_role aunque su único consumidor runtime es el flag OFF de la misma ruta ✔ (misma ruta, mismo cliente admin).

## Conclusión

Exposición de ataque browser→PostgREST: **nula** para ambas funciones (ACL). La autorización efectiva recae en: (a) `withAuth` de la ruta, (b) guard interno `has_store_access_as(v_uid, v_tx.store_id)` con `v_uid` derivado de `auth.uid()`/`p_user_id` inyectado por el servidor.
