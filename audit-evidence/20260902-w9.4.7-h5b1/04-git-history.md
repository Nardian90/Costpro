# W9.4.7 — H5-B1 · FASE 4 — Forensia Git

Fecha: 2026-09-03 · HEAD 24f89e44 · Raw: `04-git-history-raw.txt` + `04-git-history-tree-scan.txt` (G1 en `g1_files.txt`)

## A. Pickaxe (log --all)

| Consulta | Commits |
|---|---|
| `git log --all -- '*reverse_transaction*'` | 24f89e4 (audit H-5), 5e2fa2a (inventory fix) |
| `log -S"reverse_transaction" --all` | 24f89e4, e7959b4, 033e05d, 7b1bafc, 1c204d1, b125152, f628e5e, 5e2fa2a |
| `log -S"reverse_transaction_v2" --all` | mismos 8 (los commits de auditoría/hardening tocan ambas) |
| `log -G"DROP FUNCTION.*reverse_transaction" --all` | 24f89e4, 5e2fa2a (solo en evidencias/migraciones no-V1; **ningún commit retiró V1**) |

Interpretación: la historia de V1 es **creación/evolución (V2.2→V2.12.12), hardening ACL (W9 F06-C2) y auditoría**. Nunca un DROP.

## B. Árbol actual — archivos que mencionan `reverse_transaction` (G1, 21 archivos, excl. audit-evidence)

| Archivo | Tipo | ¿Consumidor real de V1? |
|---|---|---|
| `src/app/api/reverse/route.ts:33` | runtime | **SÍ (gated)** — `RPC_MAP_V1.transaction`, alcanzable solo si `USE_V2_REVERSE!==true`. Ver FASE 5/6 |
| `src/hooks/api/useReverseDocument.ts:14` | runtime (doc) | NO — JSDoc menciona V1; el hook llama `/api/reverse` vía HTTP |
| `src/lib/supabase-traced.ts:41-42` | runtime | NO — solo mapea `reverse_transaction_v2` |
| `src/config/features.ts:38` | config | NO — comentario del flag |
| `src/app/api/devolutions/route.ts` | runtime | NO — usa create_devolution/create_devolution_v2 |
| `scripts/test_reverse_e2e_full.mjs:69` | ops manual | **SÍ** — `.rpc('reverse_transaction')` directo (script manual, fuera de package.json y CI) |
| `scripts/test_reverse_all_live.mjs:98` | ops manual | **SÍ** — `.rpc('reverse_transaction')` directo (idem) |
| `scripts/test_e2e_http_real.mjs:302` | ops manual | NO — llama `POST /api/reverse` (HTTP); nombre de función local `testReverseTransaction` |
| `src/__tests__/integration/iteration-11-3.test.ts` | test | NO (aserciones sobre contenido de archivos; ver FASE 8) |
| `src/__tests__/integration/iteration-11-5.test.ts` | test | NO — aserción sobre migración 20260811000002 |
| `src/__tests__/integration/iteration-rls.test.ts` | test | NO — lista fija de 8 migraciones RLS 20260807* |
| `supabase/migrations/*.sql` (8) | DB histórico | NO — CREATE/GRANT/REVOKE; ver FASE 3 |
| `supabase/tests/test_v2_3_reversal_cycle.sql:3` | test DB | NO — mención solo en comentario; el SQL es un SELECT |
| `docs/audits/audit_h1_h7_spoofing_validation.md:55` | docs histórico | NO — inventario de un audit pasado |

## C. Llamadas RPC dinámicas / construidas

- Único patrón dinámico: `route.ts:91` `supabase.rpc(mapping.rpc, rpcParams)` donde `mapping.rpc` proviene EXCLUSIVAMENTE de las tablas estáticas `RPC_MAP_V1`/`RPC_MAP_V2` (líneas 32-49). No existe construcción de nombres por concatenación, variables de entorno ni input de usuario en ninguna llamada RPC de reversión.
- Búsqueda multilinea `rpc\(\s*[\`'\"]reverse_transaction[^_]` en src/app/pages/scripts/supabase: solo los 2 scripts manuales citados.

## D. Clasificación final de V1 en el árbol

`historical` (migraciones + docs de audit) + `test-only/manual` (2 scripts .mjs) + `gated-fallback runtime` (route.ts, flag OFF en producción). **Cero consumidores V1 activos con flag ON.**
