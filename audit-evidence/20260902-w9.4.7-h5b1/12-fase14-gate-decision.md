# W9.4.7 — H5-B1 · FASE 14 — Decisión GO / NO-GO

Fecha: 2026-09-03 · Entradas: FASE 0–13 · Raw probes: `probes-f11-f12-raw.json`

## Tabla de gates (obligatoria)

| # | Gate | Resultado | Evidencia |
|---|------|-----------|-----------|
| 1 | DB dependencies = 0 | **PASS** | FASE 2: pg_depend solo internal (language/namespace); triggers=0, views=0, policies=0, funciones con V1 en cuerpo=0 |
| 2 | Runtime consumers = 0 | **PASS** (con flag ON, estado productivo) | FASE 5: único path es route.ts:78 → con `USE_V2_REVERSE=true` siempre RPC_MAP_V2. Probe: `/api/reverse` sin auth → 401 (ruta viva); discriminador de error confirma que la API resuelve a V2 |
| 3 | Dynamic consumers = 0 | **PASS** | FASE 4/5: única resolución dinámica = `mapping.rpc` de tablas estáticas; 0 construcciones dinámicas |
| 4 | Operational consumers = 0 | **FAIL → PASS tras corrección R2** | 2 scripts manuales (test_reverse_all_live.mjs:98, test_reverse_e2e_full.mjs:69) llaman V1 directo; fuera de package.json/CI; se migran a V2 en FASE 15 |
| 5 | Production flag = V2 | **PASS** | .env:15 `NEXT_PUBLIC_USE_V2_REVERSE=true`; ecosystem.config.js lo pasa al proceso; vercel.json sin overrides |
| 6 | Fallback V1 = none | **FAIL → PASS tras corrección R1** | route.ts RPC_MAP_V1.transaction es fallback vivo si flag OFF; se neutraliza en FASE 15 apuntando el entry a `reverse_transaction_v2` (un solo sentido, sin tocar otros tipos) |
| 7 | Tests require V1 = no | **PASS** | FASE 8: 0 tests vitest llaman V1; PT-11.3.7/PT-11.3.9/PT-RLS.6.3 verificados verdes con el diseño (sin cambios de tests) |
| 8 | V2 contract complete | **PASS** | FASE 9: firma idéntica, autorización idéntica, inventario/WAC/kardex vía pipeline W7, audit_logs, idempotencia, locking FOR UPDATE |
| 9 | Functional gaps = none | **PASS** | FASE 10: 0 FUNCTIONAL GAP, 0 REGRESSION; capacidades exclusivas de V1 sin consumidores ni lectores |
| 10 | Security gaps = none | **PASS** | FASE 12: ACL V1=V2={postgres,service_role}; anon denegado en vivo; DROP no toca V2 ni crea fallback (R1 cierra la única rama) |
| 11 | Rollback plan | **PASS** (diseño; prueba obligatoria en FASE 17) | rollback: (a) transaccional — DROP dentro de BEGIN/ROLLBACK restaura V1 byte-a-byte; (b) git revert de la migración; (c) la definición completa de V1 queda archivada en `14-pre-apply-snapshot/` |
| 12 | Migration reproducible | **PASS** (diseño) | migración versionada con guard de 5 propiedades (firma/owner/secdef/ACL/def-hash); DROP por firma exacta `(uuid, text, uuid)` |

## Criterio y decisión

Estado crudo pre-corrección: gates 4 y 6 = FAIL (fallback de código + 2 scripts manuales). Ambos son **eliminables dentro del scope declarado de este checkpoint** (retirar V1 implica retirar sus últimos callers); FASE 6 establece el camino: *"NO-GO hasta determinar cómo eliminarlo"* → diseñado y autorizado como correcciones R1/R2 de la fase de retiro.

**DECISIÓN: GO CONDICIONAL** — condicionado a ejecutar, ANTES del DROP aplicado:
- R1 (route.ts): RPC_MAP_V1.transaction → `reverse_transaction_v2`. Un solo sentido; no cambia receipt/transfer/adjustment/devolution/production_order.
- R2 (scripts): 2 scripts manuales → `reverse_transaction_v2`.
- Verificación post-corrección re-ejecutada (grep: cero referencias a `rpc('reverse_transaction'` V1 y cero entries de mapa apuntando a V1).

Si la verificación post-corrección no cierra, decisión final = **NO-GO** y V1 permanece intacta.

## Doble verificación anti-falso-GO

- pg_depend=0 NO se usó como única prueba (REGLA 5): catálogo + git + migraciones + runtime + flags + scripts + tests + RPC dinámico + deployment config (ecosystem/vercel) — todos cubiertos en FASE 2–8.
- V1 NO se asume retirable "porque V2 existe": el retiro se soporta en el discriminador de errores en vivo (probes FASE 11) y en 0 consumidores tras correcciones.
