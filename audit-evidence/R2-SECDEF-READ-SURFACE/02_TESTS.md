# R2 — TESTS Y CLASIFICACIÓN DE EVIDENCIA (FASE 8/9)

## Tests ejecutados (no destructivos, sin cambios de baseline)

```text
Layer A (LIVE contract):   141 verificadas · 0 violaciones · PIN REM-INV-2R OK
Layer B (estático, PR):    188 SECDEF-write · CONTRATO OK · mismos 9 LOW (sin allowlist)
Layer C (reconciliación):  141/141 representadas · 0 divergencias
Existing contract: 141 (SECDEF-write)
New R2 coverage:   63 (SECDEF READ/MIXED inventariados + 22 alcanzables por authenticated
                   analizados uno a uno — cobertura analítica, NO incorporada al contract)
Total:             141 write + 63 read/mixed analizados (246 SECDEF totales censados)
```

El baseline histórico 141/141 NO se alteró. La cobertura R2 es de análisis (inventario +
clasificación + findings), no una nueva superficie certificada.

## Clasificación de evidencia (FASE 9)

| Evidencia | Tipo |
|---|---|
| Censo 246 SECDEF, defs, ACLs, volatility, search_path (pg_proc/pg_get_functiondef) | **LIVE DIRECT** (read-only) |
| Guard KPI byte-igual a migración 000004 + helper has_store_access | **LIVE DIRECT** |
| anon → RPC KPI → HTTP 401 42501 (permission denied) | **LIVE DIRECT** |
| service_role → RPC KPI → HTTP 200 (capability operativa) | **LIVE DIRECT** |
| Ausencia de identidad en bodies de F1-F4 (análisis línea a línea) | **LIVE DIRECT** (cuerpos) + **STATIC** (razonamiento) |
| Explotabilidad del patrón estructural (SECDEF + authenticated + param store + sin guard) | **STAGING** (REM-INV-6R 14/14: A6 reproducido, A6R denegado con guard, L4 legítimo PASS) |
| Cadena F2→F3 (obtención de store UUIDs vía dump) | **STATIC** |
| Callers de aplicación (hooks/vistas/API routes) | **STATIC** (grep completo del repo) |

NINGUNA prueba de staging fue presentada como LIVE. Los casos dinámicos authenticated
cross-store de F1-F4 NO fueron ejecutados en LIVE (requerirían JWT de no-miembro; crear
usuarios en PROD está prohibido por el mandato) — su explotabilidad se sostiene en la
igualdad estructural con A6 (staging) + cuerpos LIVE DIRECT.

## Producción

Cambios en producción en esta fase: **0** (solo consultas read-only). Sin usuarios,
tiendas, registros, migraciones, policies, funciones ni datos de prueba creados.
