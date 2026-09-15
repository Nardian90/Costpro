# R2 SECDEF-READ SURFACE — FINAL REPORT (POST-R1 CLOSURE REVIEW)

## 1. Commit integrity

```text
fa0a3b22 → f81fafca
Application changes:        0 / 8 archivos
Evidence changes:           8 / 8 (7 audit-evidence/* nuevos + contract-surface.sql regenerado,
                            cuyo único delta SQL es normalización CRLF→LF, sin semántica)
DATABASE APPLICATION CHANGES: 0
EVIDENCE-ONLY CHANGES:      8
```

## 2. R1

```text
Status:   REMEDIATED AND VERIFIED (re-verificado en esta fase, sin cambios)
Evidence: get_batch_store_daily_kpis body BYTE-IGUAL a 20260916000004 (guard + 42501);
          6 objetos de 000003 byte-iguales/service_role-only; helper has_store_access intacto
LIVE direct evidence: anon→42501 (401) · service_role→200 · catalog defs/ACLs read-only
Structural evidence:  byte-equality con el cuerpo probado en staging 14/14 (A6R/L4)
```

## 3. Service-role trust boundary (get_batch_store_daily_kpis)

| Caller | Identity source | Client | Role | Params | Authz |
|---|---|---|---|---|---|
| useMultiStoreDashboard.ts (browser, 2 vistas) | sesión Supabase del usuario (JWT) | supabaseClient.ts = **anon key + sesión** | authenticated | p_store_ids del cliente | **guard DB 000004** (has_store_access por elemento) |
| scripts de verificación/auditoría (operador) | SUPABASE_SERVICE_ROLE_KEY (server, no expuesto) | service client | service_role | store ids operador | capability interna (A) |
| API routes / cron / edge / server actions | — | — | — | — | **NINGUNO existe** (grep total del repo: 0 referencias al RPC fuera del hook, tests, migraciones y evidencias) |

Flujo `authenticated→API→service_role→KPI`: **NO EXISTE**. Clasificación FASE 4: A
(capacidad legítima); no se encontró B ni C para esta función.

## 4. R2 inventory

246 SECDEF censados: 141 WRITE (contract) · 3 WRITE-MIXED (service_role-only) ·
60 READ · 42 UTILITY. 22 READ/MIXED alcanzables por authenticated analizados uno a uno
(tabla completa en 00_INVENTORY.md). 13 protegidos (helpers/guards/binding) · 9 sin guard
con datos store-scoped → findings.

## 5. Findings (detalle completo con plantilla FASE 7 en 01_FINDINGS.md)

```text
F1  get_cash_closures            HIGH   — cierres de caja fila-a-fila, NULL=todas las tiendas
F2  get_transfers                HIGH   — transferencias+items+personal, NULL=todas; filtra store UUIDs (habilita F3)
F3  5 lecturas por-tienda sin guard (analytics/sales/products/kardex/reception)  MEDIUM
F4  2 agregados globales (expenses diarios, low-stock count)                    LOW
```

Ninguna función fue marcada por SECDEF per se: solo con (SECDEF + authenticated +
datos store-scoped + ausencia total de identidad en body), verificado en catálogo LIVE.

## 6. Tests

```text
Layer A: 141/141 · 0 violaciones
Layer B: 188 · CONTRATO OK · mismos 9 LOW
Layer C: 141/141 · 0 divergencias
Existing contract: 141 · New R2 coverage: 63 analizados (22 authenticated-reachables) · Total: 246 censados
```

## 7. Residuales

```text
Confirmed security findings: R2-F1 (HIGH), R2-F2 (HIGH), R2-F3 (MEDIUM ×5), R2-F4 (LOW ×2)
Coverage gaps:               SECDEF-READ fuera del contract automatizado (R2) — la clase
                             completa queda ahora inventariada; incorporación al contract
                             = fase futura
Informational:               flujo authenticated→API→service_role→KPI inexistente;
                             3 WRITE-MIXED service_role-only; atribución p_user_id en
                             process_bulk_import (P3 preexistente, sin cambio)
Pre-existing LOW:            9 SEARCH_PATH_NOT_SET — sin cambios (NO ACTION REQUIRED)
```

## 8. Decisión final

```text
R1: REMEDIATED AND VERIFIED
R2: FINDING
REM-INV-6R: ORIGINAL CERTIFICATION INTACT
PRODUCTION CHANGES IN THIS PHASE: 0
```

Recomendación (sin ejecutar): extender el patrón guard 000004 (has_store_access por
elemento para no-service_role, con NULL rechazado o acotado a tiendas propias) a las 9
funciones finding, priorizando F1/F2; considerarlo insumo de una fase de remediación
futura con su propio ciclo de aprobación.
