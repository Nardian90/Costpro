# W9.4.7 — H5-B1 · FASES 11 y 12 — Pipeline de reversión y seguridad

Fecha: 2026-09-03 · Raw probes: `probes-f11-f12-raw.json`

## FASE 11 — Validación del pipeline POST /api/reverse

### Cadena estática (código)

```
POST /api/reverse
  → withAuth (session obligatoria; probe sin auth → 401 confirmado localmente)
  → validateOrigin + rateLimit(5/min)
  → getSupabaseAdminSafe()  [service_role]
  → FEATURES.USE_V2_REVERSE = (process.env.NEXT_PUBLIC_USE_V2_REVERSE === 'true') = TRUE (.env:15, ecosystem.config.js:84)
  → rpcMap = RPC_MAP_V2
  → type=transaction → { rpc: 'reverse_transaction_v2', idParam: 'p_transaction_id' }
  → p_user_id: session.user.id   (actor real, nunca forjado por cliente)
```

**No existe fallback silencioso**: la selección es la línea 78; con flag=true la rama V1 no se evalúa. `p_user_id` viene SIEMPRE de `session.user.id` (route.ts:88) — el cliente no puede suplantar actor.

### Cadena dinámica (probes en vivo, UUID inexistente — cero persistencia)

| Llamada | Resultado | Prueba |
|---|---|---|
| service_role → `rpc/reverse_transaction` | HTTP 400 `P0001 ERR_TX_NOT_FOUND` | V1 viva pre-DROP y **distinta de la que atiende la API** |
| service_role → `rpc/reverse_transaction_v2` | HTTP 400 `P0001 ERR_TRANSACTION_NOT_FOUND` | V2 ejecutable y activa |
| anon → ambas | HTTP 401 `42501 permission denied` | ACL bloquea sin credencial |

El discriminador de error (`ERR_TX_NOT_FOUND` vs `ERR_TRANSACTION_NOT_FOUND`) demuestra que son funciones distintas y permite verificar en FASE 21 que la ruta productiva post-DROP sigue emitiendo `ERR_TRANSACTION_NOT_FOUND` (= V2).

## FASE 12 — Validación de seguridad

### ACL (catálogo, FASE 1 — `01-live-v1-catalog.json`)

- V1: `postgres=X/postgres,service_role=X/postgres` — sin grants a anon/authenticated/PUBLIC (hardening 20260902200923 W9 F06-C2 `[C2-A]`).
- V2: idéntica ACL (`[C2-B]`).

### Verificación en vivo

- anon → V1: `42501 permission denied for function reverse_transaction` ✓
- anon → V2: `42501 permission denied for function reverse_transaction_v2` ✓
- authenticated → V1/V2: sin grant EXECUTE en proacl → PostgREST deniega (catalog state determinístico; probes con JWT real ya ejecutados en W9.4.6 F8 con resultado DENIED; la ACL no cambió desde entonces — última migración que la toca: 20260902200923).
- service_role → V1: ejecuta (pre-DROP). Tras DROP: "function not found" (pérdida de V1, objetivo del checkpoint).

### ¿Eliminar V1 reduce seguridad de V2 / crea fallback / cambia permisos?

- **No**: la migración ejecuta solo `DROP FUNCTION IF EXISTS public.reverse_transaction(uuid,text,uuid)` + guard. No toca `pg_proc[138188]`, ni ACLs de V2, ni grants, ni triggers, ni RLS.
- Fallback: tras corrección R1 (route.ts), con flag OFF el tipo transaction también resuelve a `reverse_transaction_v2` → ningún camino llega a V1 (que además ya no existirá).
- SECURITY DEFINER de V2, su search_path `public, pg_temp`, owner y proacl quedan intactos (verificados en FASE 20 post-audit OID por OID).
