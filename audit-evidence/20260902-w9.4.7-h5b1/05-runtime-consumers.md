# W9.4.7 — H5-B1 · FASE 5 — Mapa completo de consumidores

Fecha: 2026-09-03 · Fuentes: git grep (G1), grep multilinea RPC, lectura de código.

## Tabla de consumidores

| Consumidor | Tipo | Estado | ¿Requiere V1? | Detalle |
|---|---|---|---|---|
| `/api/reverse` (src/app/api/reverse/route.ts) | runtime | activo | **NO con flag ON** | Línea 78: `rpcMap = FEATURES.USE_V2_REVERSE ? RPC_MAP_V2 : RPC_MAP_V1`. Producción `.env`: `NEXT_PUBLIC_USE_V2_REVERSE=true` → siempre `RPC_MAP_V2` → `reverse_transaction_v2`. Con flag OFF llamaría V1 (fallback latente — tratado en FASE 6/15) |
| `useReverseDocument` hook | runtime | activo | NO | Llama `POST /api/reverse` (apiFetch); solo JSDoc menciona V1 (línea 14, comentario desactualizado) |
| `scripts/test_reverse_e2e_full.mjs` | ops manual | latente | **SÍ** (línea 69) | `.rpc('reverse_transaction', {p_transaction_id, p_reason, p_user_id:null})`. NO está en package.json ni en CI. Ejecución manual ad-hoc |
| `scripts/test_reverse_all_live.mjs` | ops manual | latente | **SÍ** (línea 98) | Igual patrón. Fuera de package.json/CI |
| `scripts/test_e2e_http_real.mjs` | ops manual | latente | NO | Prueba `POST /api/reverse` HTTP (nombre local `testReverseTransaction`) |
| `src/__tests__/integration/*` (vitest) | test | activo en CI | NO | Aserciones de contenido de archivos; ninguna llama a la RPC V1 (ver FASE 8) |
| `supabase/tests/test_v2_3_reversal_cycle.sql` | test DB | histórico | NO | Mención solo en comentario (línea 3); cuerpo = SELECT read-only |
| `supabase/migrations/*` (8 archivos) | DB | histórico | NO | CREATE/OR REPLACE/GRANT/REVOKE/COMMENT; ninguna llamada runtime; ninguna DROP |
| `docs/audits/audit_h1_h7_spoofing_validation.md` | docs | histórico | NO | Inventario enumerado de un audit anterior |
| Clientes externos (PostgREST directo) | externo | desconocido→auditado | posible | ACL desde 20260902200923: solo postgres+service_role tienen EXECUTE. W9.4.6 F8-F12 ya demostró anon/authenticated DENIED. Único caller con EXECUTE posible = service_role del backend (usado solo por /api/reverse) |

## Verificación de ausencia de patrones dinámicos

- `rpc(\`reverse_transaction` / `.rpc("reverse_transaction"` / `.rpc('reverse_transaction'` en src/, app/, pages/: **0 ocurrencias**.
- Construcción dinámica de nombre RPC: solo `mapping.rpc` (tabla estática de route.ts). No hay variables de entorno, ni input de usuario, ni constantes externas que alimenten el nombre de la RPC de reversión.
- Server Actions con reverse: `src/app/api/vale-salida/[id]/reverse/route.ts` usa RPC `reverse_vale_salida` (objeto distinto, fuera de scope).

## Conclusión

Con `USE_V2_REVERSE=true` (estado productivo), **el único consumidor potencial de V1 es el fallback muerto de route.ts y 2 scripts manuales fuera del pipeline de CI**. Ningún consumidor runtime activo requiere V1.
